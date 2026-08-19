/** The OCR-to-note heuristics: humble, but pinned. */
import { describe, it, expect } from 'vitest';
import { formatRecipe, ingredientParts, isRecipeNote, isSubheader, orderIngredients, recipeFromHtml, looksLikeChrome, parseIngredient, precleanOcrLine, recipeBody, recipeFromPages, scaleIngredient, scaleRecipeBody, scrubLine, splitRecipeBody } from '../src/recipe';

describe('formatRecipe', () => {
  it('finds the obvious title, bullets the ingredients, keeps the steps', () => {
    const page = `Lemon Garlic Pasta
Serves 4

INGREDIENTS
2 cups pasta
3 cloves garlic, minced
1/4 cup olive oil

DIRECTIONS
1. Boil the pasta.
2. Saute the garlic in the oil.
3. Toss together with lemon.`;
    const r = formatRecipe([page]);
    expect(r.title).toBe('Lemon Garlic Pasta');
    expect(r.body).toContain('**INGREDIENTS**');
    expect(r.body).toContain('- 2 cups pasta');
    expect(r.body).toContain('- 3 cloves garlic, minced');
    expect(r.body).toContain('1. Boil the pasta.');
    expect(r.body).not.toContain('Lemon Garlic Pasta');
  });
  it('joins hyphen-broken words and quantity-guesses without a heading', () => {
    const r = formatRecipe(['Weeknight Curry\n2 tbsp coco-\nnut oil\n1 can chickpeas']);
    expect(r.body).toContain('- 2 tbsp coconut oil');
    expect(r.body).toContain('- 1 can chickpeas');
  });
  it('multiple pages join in order; empty pages are nothing', () => {
    const r = formatRecipe(['Soup Night\nINGREDIENTS\n1 onion', '', 'DIRECTIONS\n1. Chop.']);
    expect(r.title).toBe('Soup Night');
    expect(r.body.indexOf('onion')).toBeLessThan(r.body.indexOf('Chop'));
  });
  it('no obvious title stays null', () => {
    expect(formatRecipe(['1 cup sugar\n2 cups flour']).title).toBeNull();
  });

  it('a method that numbers NOTHING still comes out as steps', () => {
    // Plenty of cards write the method as prose, one instruction per line.
    // Those lines used to fall through as loose text, so the structured page
    // opened with an empty Instructions section and the method sitting in
    // the leftovers.
    const r = recipeFromPages([
      'Skillet Beans\nINGREDIENTS\n1 can beans\nMETHOD\nHeat the pan.\nAdd the beans.\nSimmer until thick.',
    ]);
    expect(r.ingredients).toEqual(['1 can beans']);
    expect(r.steps).toEqual(['Heat the pan.', 'Add the beans.', 'Simmer until thick.']);
    expect(r.extra).toEqual([]);
  });

  it('a title is never taken from inside the ingredient list', () => {
    // Sean's Croque Madame. The scan skipped headings but did not STOP at one,
    // so it walked past "Ingredients", over the quantities, and took the first
    // numberless ingredient as the title — "fresh cracked black pepper to
    // taste" — which then left the list entirely. A name comes before the
    // sections; once a heading has gone by there is no title left to find.
    const r = recipeFromPages([
      'Ingredients\n2 slices bread\n3 tablespoons 45 g all purpose flour\n' +
      'fresh cracked black pepper to taste\nInstructions\nHeat the oven to 425.',
    ]);
    expect(r.title).toBeNull();
    expect(r.ingredients).toEqual([
      '2 slices bread', '3 tbsp 45 g all purpose flour', 'fresh cracked black pepper to taste',
    ]);
    // A card that DOES lead with its name still gives it up.
    expect(recipeFromPages(['Lemon Garlic Pasta\nINGREDIENTS\n2 cups pasta']).title).toBe('Lemon Garlic Pasta');
  });

  it('an Ingredients heading does not swallow the rest of the note', () => {
    // Sean's Pasta all'Uovo: a heading, three ingredients, then the method as
    // plain prose with no METHOD line, then a References section with a link.
    // Nothing closed the ingredient block but another heading, so pressing
    // Recipe on it turned the instructions, the word "References" and a
    // YouTube URL into bulleted ingredients — eight of them, and no steps.
    const r = recipeFromPages([
      'Ingredients\n200 g farina 00\n2 eggs\n2 pinches of salt\n' +
      'Form a well with the flour, break the eggs in it. Add the salt.\n' +
      'Do whatever you want with it.\nReferences\n' +
      'Pasta Grannies (https://www.youtube.com/watch?v=abc_123)',
    ]);
    expect(r.ingredients).toEqual(['200 g farina 00', '2 eggs', '2 pinches of salt']);
    expect(r.extra.join(' ')).toContain('Form a well');
    expect(r.extra.join(' ')).toContain('References');
    expect(r.extra.join(' '), 'and the link is intact').toContain('https://www.youtube.com/watch?v=abc_123');
    expect(r.ingredients.join(' '), 'no prose bulleted as food').not.toContain('References');
  });

  it('a sentence only ends the list when it is not itself an ingredient', () => {
    // The guard keys on "no quantity in front of it", so the two shapes that
    // legitimately end in punctuation keep their place in the list.
    const r = recipeFromPages(['Ingredients\n300 g pasta (spaghetti is traditional.)\n2 cups flour.\n1 onion']);
    expect(r.ingredients).toEqual(['300 g pasta (spaghetti is traditional.)', '2 cups flour.', '1 onion']);
  });

  it('an ingredient with no number in front of it still counts as one', () => {
    // Straight off Sean's phone screenshot: five quantities parsed, and
    // "a pinch of salt" fell through to the leftovers under Include notes,
    // because nothing about it starts with a digit. Most typed recipes have
    // no INGREDIENTS heading at all, so the quantity run has to carry it.
    const r = recipeFromPages([
      'Pancakes\n2 cups flour\n1 cup milk\na pinch of salt\nsalt and pepper to taste',
    ]);
    expect(r.ingredients).toEqual(['2 cups flour', '1 cup milk', 'a pinch of salt', 'salt and pepper to taste']);
    expect(r.extra).toEqual([]);
  });

  it('…but the closing line of a card is prose, and stays prose', () => {
    const r = recipeFromPages([
      'Pancakes\n2 cups flour\na pinch of salt\nGrandma always doubled the butter and never once wrote that down.',
    ]);
    expect(r.ingredients).toEqual(['2 cups flour', 'a pinch of salt']);
    expect(r.extra).toEqual(['Grandma always doubled the butter and never once wrote that down.']);
  });

  it('a bare line BEFORE any quantity is not swept up either', () => {
    // Nothing has established an ingredient run yet, so the subtitle under
    // the title stays where it belongs.
    const r = recipeFromPages(['Pancakes\nServes four, generously\n2 cups flour']);
    expect(r.ingredients).toEqual(['2 cups flour']);
    expect(r.extra).toEqual(['Serves four, generously']);
  });

  it('a stray numbered line does not turn the rest of the card into steps', () => {
    // Only a heading opens the method. Without that rule the closing note on
    // a card — the bit about Grandma doubling the butter — became step two,
    // and the Recipe page's "include notes" checkbox had nothing left to
    // shed because the free text had been eaten.
    const r = recipeFromPages(['2 cups flour\n1. Mix well\nGrandma always doubled the butter.']);
    expect(r.steps).toEqual(['Mix well']);
    expect(r.extra).toEqual(['Grandma always doubled the butter.']);
  });

  it('OCR that skips and repeats step numbers is renumbered, not echoed', () => {
    const r = recipeFromPages(['Stew\nDIRECTIONS\n1. Brown it.\n3. Add stock.\n3. Simmer.']);
    expect(r.steps).toEqual(['Brown it.', 'Add stock.', 'Simmer.']);
    expect(formatRecipe(['Stew\nDIRECTIONS\n1. Brown it.\n3. Add stock.\n3. Simmer.']).body)
      .toContain('2. Add stock.');
  });
});

describe('parseIngredient — units spaced, canonical, fractions typographic', () => {
  it('normalizes the usual shapes', () => {
    expect(parseIngredient('2tbsp olive oil')).toBe('2 tbsp olive oil');
    expect(parseIngredient('100g flour')).toBe('100 g flour');
    expect(parseIngredient('1/2 CUP milk')).toBe('½ cup milk');
    expect(parseIngredient('1 1/2 cups sugar')).toBe('1 ½ cups sugar');
    expect(parseIngredient('2 eggs')).toBe('2 eggs');
    expect(parseIngredient('salt to taste')).toBe('salt to taste');
  });

  it('a RANGE keeps its shape and still finds its unit', () => {
    // Without the range, '2-3' parsed as a bare 2 and the rest of the range
    // was left sitting in the name — '2 -3 cloves garlic', worse than the
    // line went in, and the unit never found at all.
    expect(parseIngredient('2-3 cloves garlic')).toBe('2-3 cloves garlic');
    expect(parseIngredient('1-2 tsp salt')).toBe('1-2 tsp salt');
    expect(parseIngredient('1 - 2 teaspoons salt')).toBe('1-2 tsp salt');
    // 'to' is the author's word, so it survives as written.
    expect(parseIngredient('2 to 3 tablespoons water')).toBe('2 to 3 tbsp water');
    expect(parseIngredient('1 1/2 to 2 cups stock')).toBe('1 ½ to 2 cups stock');
  });

  it('a whole number and a typographic fraction read as one quantity', () => {
    expect(parseIngredient('1 ½ tablespoons butter')).toBe('1 ½ tbsp butter');
  });

  it("a sentence that merely contains 'to' is not a range", () => {
    expect(parseIngredient('Salt and pepper to taste')).toBe('Salt and pepper to taste');
    expect(parseIngredient('1 onion, chopped to order')).toBe('1 onion, chopped to order');
  });
});

describe('recipeBody + recipeFromPages — the structured round trip', () => {
  it('builds the marker body with renumbered steps', () => {
    const b = recipeBody(['2 tbsp oil'], ['3. Fry.', 'Serve.']);
    expect(b).toContain('**Ingredients**');
    expect(b).toContain('- 2 tbsp oil');
    expect(b).toContain('1. Fry.');
    expect(b).toContain('2. Serve.');
  });
  it('OCR pages come back structured', () => {
    const r = recipeFromPages(['Pan Sauce\nINGREDIENTS\n2tbsp butter\nDIRECTIONS\n1. Melt.\n2. Whisk.']);
    expect(r.title).toBe('Pan Sauce');
    expect(r.ingredients).toEqual(['2 tbsp butter']);
    expect(r.steps).toEqual(['Melt.', 'Whisk.']);
  });
});

describe('scrubLine — OCR symbol noise never reaches the note', () => {
  it('drops junk glyphs, keeps cooking punctuation and fractions', () => {
    expect(scrubLine('2 tbsp ~~olive oil\u00a9')).toBe('2 tbsp olive oil');
    expect(scrubLine('\u00bd cup | milk')).toBe('\u00bd cup milk');
    expect(scrubLine('\u2022 1 cup sugar, sifted (fine)')).toBe('1 cup sugar, sifted (fine)');
    expect(scrubLine('Bake at 350\u00b0 for 20\u201325 min\u2026')).toBe('Bake at 350\u00b0 for 20-25 min');
  });
  it('a URL survives it, because a link is not OCR noise', () => {
    // Off Sean's own Aglio Olio. Two rules that are right for a photographed
    // card are wrong for a link: the character filter dropped '_', and the
    // de-duplicator collapsed '//' to '/'. Between them the source line came
    // back as a dead link — silently, the first time Recipe was pressed on
    // that note. Several of his recipes carry a line like this.
    const line = '*From https://carlos-recipes.readthedocs.io/en/latest/Recipes/Entrees/Pasta_AglioOlioPeperoncino.html*';
    expect(scrubLine(line)).toBe(
      'From https://carlos-recipes.readthedocs.io/en/latest/Recipes/Entrees/Pasta_AglioOlioPeperoncino.html',
    );
    // The emphasis star at the end is punctuation, not part of the link.
    expect(scrubLine('see https://example.com/a_b.html.')).toContain('https://example.com/a_b.html');
    // And an underscore in ordinary text is not junk either.
    expect(scrubLine('slow_cooker beans')).toBe('slow_cooker beans');
  });

  it('the whole pipeline stays clean end to end', () => {
    const r = formatRecipe(['Choco Cake \u2122\nIngredients:\n\u2022 2 cups # flour\n1) Mix\u00ae well']);
    expect(r.title).toBe('Choco Cake');
    expect(r.body).not.toMatch(/[\u2122\u00ae#\u2022]/);
  });
});

describe('the leftovers keep their shape', () => {
  it('CONSUMES the title line — callers that do not use it must put it back', () => {
    // This is the sharp edge behind a real bug: the Recipe button sits beside
    // B/I/U, so it is one mis-tap from any note. On "Shopping list / milk /
    // eggs" the first line is taken as a title, and a note that already HAS a
    // title has no use for it — so unless the caller restores the line, Save
    // writes the note back with its first line deleted.
    const r = recipeFromPages(['Shopping list\nmilk\neggs']);
    expect(r.title).toBe('Shopping list');
    expect(r.extra).toEqual(['milk', 'eggs']);
  });
});

describe('isRecipeNote — the treatment is opt-in, not a shape', () => {
  const MARKED = '**Ingredients**\n- 2 cups flour\n\n**Directions**\n1. Mix.';
  it('the flag and the shape together are a recipe', () => {
    expect(isRecipeNote({ body: MARKED, recipe: true })).toBe(true);
  });
  it('the shape alone is NOT — Sean\'s hand-written notes carry it', () => {
    // Every one of his 19 original recipe notes matches the marker shape,
    // written by hand before the card existed (2026-08-19). They render as
    // plain notes; only the Recipe page's save mints the flag.
    expect(isRecipeNote({ body: MARKED })).toBe(false);
    expect(isRecipeNote({ body: MARKED, recipe: undefined })).toBe(false);
  });
  it('the flag alone is not either — no markers, nothing to draw a card around', () => {
    expect(isRecipeNote({ body: 'milk\neggs', recipe: true })).toBe(false);
  });
});

describe('a saved recipe read back — ours is read as ours', () => {
  const SAVED = [
    '**Ingredients**',
    '- 2 cups flour',
    '- a pinch of salt',
    '',
    '**Directions**',
    '1. Whisk it.',
    '2. Fry it.',
    '',
    'Grandma doubled the butter.',
  ].join('\n');

  it('comes back exactly as it went in', () => {
    const r = recipeFromPages([SAVED]);
    expect(r.ingredients).toEqual(['2 cups flour', 'a pinch of salt']);
    expect(r.steps).toEqual(['Whisk it.', 'Fry it.']);
    expect(r.extra).toEqual(['Grandma doubled the butter.']);
    expect(r.title, 'a saved recipe has no title to take — the note owns that').toBeNull();
  });

  it('and saving it again changes nothing at all', () => {
    // Editing a recipe twice is the most ordinary thing anyone does with one.
    // Through the heuristics it lost BOTH ingredients by the third pass: the
    // first became a "title" and was consumed, the second grew a second dash,
    // and the closing line was swallowed as another step.
    const once = recipeFromPages([SAVED]);
    const body1 = [recipeBody(once.ingredients, once.steps), once.extra.join('\n')].filter(Boolean).join('\n\n');
    const twice = recipeFromPages([body1]);
    const body2 = [recipeBody(twice.ingredients, twice.steps), twice.extra.join('\n')].filter(Boolean).join('\n\n');
    expect(body2).toBe(body1);
    expect(body2).toContain('- 2 cups flour');
    expect(body2).toContain('Grandma doubled the butter.');
    expect(body2).not.toContain('- - ');
    expect(body2).not.toContain('3. Grandma');
  });
});

describe('scaling — the one arithmetic a recipe asks of you', () => {
  it('doubles and halves the shapes a card actually uses', () => {
    expect(scaleIngredient('2 cups flour', 2)).toBe('4 cups flour');
    expect(scaleIngredient('1 ½ cups yellow cornmeal', 2)).toBe('3 cups yellow cornmeal');
    expect(scaleIngredient('¾ cup milk', 2)).toBe('1 ½ cups milk');
    expect(scaleIngredient('1 cup all-purpose flour', 0.5)).toBe('½ cup all-purpose flour');
    expect(scaleIngredient('1 tbsp baking powder', 2)).toBe('2 tbsp baking powder');
  });

  it('counts the noun as well as the number', () => {
    // '1 eggs' is the tell that a scaler was bolted on without reading the
    // line. Abbreviations are the opposite trap: 2 tbsp, never 2 tbsps.
    expect(scaleIngredient('2 eggs, beaten', 0.5)).toBe('1 egg, beaten');
    expect(scaleIngredient('1 clove garlic, minced', 2)).toBe('2 cloves garlic, minced');
    expect(scaleIngredient('1 can chickpeas', 2)).toBe('2 cans chickpeas');
    expect(scaleIngredient('2 pinches saffron', 0.5)).toBe('1 pinch saffron');
    expect(scaleIngredient('1 dash bitters', 2)).toBe('2 dashes bitters');
  });

  it('a range scales at both ends and pluralises off the top of it', () => {
    expect(scaleIngredient('2-3 tbsp sugar', 2)).toBe('4-6 tbsp sugar');
    expect(scaleIngredient('2-3 cloves garlic', 0.5)).toBe('1-1 ½ cloves garlic');
    expect(scaleIngredient('1 to 2 cups stock', 2)).toBe('2 to 4 cups stock');
  });

  it("Sean's own cards, which my invented ones never looked like", () => {
    // Read off the phone against real recipes. Both of these were wrong, and
    // neither shape existed in the test data I made up.
    // A slash range: the scaler took '200' and left '/250' stranded in the
    // name, so doubling produced the nonsense '400 /250 g'.
    expect(scaleIngredient('200/250 g guanciale', 2)).toBe('400/500 g guanciale');
    // A compound noun: 'egg' heads 'egg yolks' and must not take the count.
    expect(scaleIngredient('3 egg yolks', 2)).toBe('6 egg yolks');
    // These two were already right and must stay right.
    expect(scaleIngredient('3/4 cup grated pecorino', 2)).toBe('1 ½ cups grated pecorino');
    expect(scaleIngredient('300 g pasta (spaghetti is traditional)', 2))
      .toBe('600 g pasta (spaghetti is traditional)');
  });

  it('a dual-unit line scales BOTH measures, or it starts lying', () => {
    // Straight off Sean's Croque Madame. '3 tablespoons 45 g' is one amount
    // written twice; doubling only the first gives '6 tablespoons 45 g',
    // which contradicts itself and gives the cook no way to tell which
    // number to trust.
    expect(scaleIngredient('3 tablespoons 45 g all purpose flour', 2))
      .toBe('6 tablespoons 90 g all purpose flour');
    expect(scaleIngredient('2 cups 512 g warmed milk', 2)).toBe('4 cups 1024 g warmed milk');
    expect(scaleIngredient('4 tablespoons 70 g unsalted butter', 0.5))
      .toBe('2 tablespoons 35 g unsalted butter');
    // A number the app does not recognise as a measure is part of the name.
    expect(scaleIngredient('1 cup 2% milk', 2)).toBe('2 cups 2% milk');
    expect(scaleIngredient('1 tsp 5 spice powder', 2)).toBe('2 tsp 5 spice powder');
    // A parenthesised size means more tins, not a bigger tin — and the plural
    // now follows too. '(14 oz)' sits between the number and the word doing
    // the counting, so the unit group matched nothing and 'can' was invisible;
    // reaching past the one bracket finds it.
    expect(scaleIngredient('1 (14 oz) can tomatoes', 2)).toBe('2 (14 oz) cans tomatoes');
    expect(scaleIngredient('2 (14 oz) cans tomatoes', 0.5)).toBe('1 (14 oz) can tomatoes');
    expect(scaleIngredient('1 (400 g) tin chopped tomatoes', 3)).toBe('3 (400 g) tins chopped tomatoes');
    // The bracket still only shields ONE word. Nothing bare after it means
    // nothing to count, and the line is returned as written.
    expect(scaleIngredient('1 (14 oz)', 2)).toBe('2 (14 oz)');
    // And the word has to be one that MEASURES. Sean's Carbonara opens
    // "This makes enough for 3 (skinny) or 2 (hungry) people." — the same
    // shape exactly, and without the guard it doubles to "6 (skinny) ors".
    // It is prose and never reaches the scaler; being saved by where a line
    // sits is not the same as being right.
    expect(scaleIngredient('3 (skinny) or 2 (hungry) people.', 2))
      .toBe('6 (skinny) or 2 (hungry) people.');
  });

  it('a participle between the number and the noun does not hide it', () => {
    // '1 medium chopped onion' is off Sean's Pastitsio and doubled to
    // '2 medium chopped onion': the noun is the LAST word, and the rule only
    // ever looked at a single bare one.
    expect(scaleIngredient('1 medium chopped onion', 2)).toBe('2 medium chopped onions');
    expect(scaleIngredient('2 large diced potato', 0.5)).toBe('1 large diced potato');
    // The -ed test is the whole safety of it, and this is the case that says
    // why it is not simply "take the last word": 'handful' sits in that
    // position and is a measure, not a participle, so nothing is counted and
    // 'parsley' — which has no plural — is left exactly as written.
    expect(scaleIngredient('1 small handful parsley', 2)).toBe('2 small handful parsley');
    // Still untouched, for the same reason as ever: no bare noun to find.
    expect(scaleIngredient('600 g fresh tagliatelle (see Pasta all\u2019Uovo)', 2))
      .toBe('1200 g fresh tagliatelle (see Pasta all\u2019Uovo)');
    expect(scaleIngredient('3 egg yolks', 2)).toBe('6 egg yolks');
  });

  it('an adjective between the number and the noun does not hide it either', () => {
    // Every line here is off Sean's own cards, not invented. The participle
    // rule above let 'chopped' through but stopped at plain adjectives, so
    // 'large yellow onion' and 'free range egg' kept their singular through
    // a doubling — the quantity moved and the name did not.
    expect(scaleIngredient('1 large free range egg', 2)).toBe('2 large free range eggs');
    expect(scaleIngredient('1 finely chopped onion', 2)).toBe('2 finely chopped onions');
    expect(scaleIngredient('1 large yellow onion', 2)).toBe('2 large yellow onions');
    expect(scaleIngredient('1 finely diced garlic clove', 2)).toBe('2 finely diced garlic cloves');
    // Halving finds the singular through the same gap.
    expect(scaleIngredient('2 dried persian limes, stabbed with a fork', 0.5))
      .toBe('1 dried persian lime, stabbed with a fork');
    // What holds the line instead of the -ed test: no word on the way to the
    // noun may itself be a measure or a unit. 'handful' still blocks exactly
    // as it did above, and a participle is never a measure word, so nothing
    // the old rule protected is given up.
    expect(scaleIngredient('1 small handful parsley', 2)).toBe('2 small handful parsley');
  });

  it('a unit somebody spelled out still counts, off Sean\'s own cards', () => {
    // UNIT_MAP knows 'teaspoons' normalises to 'tsp'; MEASURE decides whether
    // a word gets recounted, and the spelled-out units were only ever in the
    // first. So these halved to a plural that cannot follow a 1. Both lines
    // are read off his Croque Madame, not invented.
    expect(scaleIngredient('2 teaspoons whole grain mustard', 0.5)).toBe('1 teaspoon whole grain mustard');
    expect(scaleIngredient('2 ounces deli ham (french is recommended)', 0.5))
      .toBe('1 ounce deli ham (french is recommended)');
    expect(scaleIngredient('1 teaspoon vanilla', 2)).toBe('2 teaspoons vanilla');
    expect(scaleIngredient('1 pound mince', 3)).toBe('3 pounds mince');
    // The abbreviations were never the problem and must not become one:
    // they take no 's' in any amount.
    expect(scaleIngredient('2 tsp salt', 0.5)).toBe('1 tsp salt');
    expect(scaleIngredient('100 g flour', 2)).toBe('200 g flour');
  });

  it('the method is prose and is never scaled, whatever it happens to contain', () => {
    // 'Cut the guanciale into 2 x 4 x .4 cm cuboids' is off his Zozzona, and
    // it reads exactly like the pack-size shape ('1 x 400g tin') that the
    // scaler now treats specially. It is a SHAPE, and doubling the recipe
    // does not make the cubes bigger. Safe because only lines under
    // Ingredients scale at all — worth pinning now that 'x' means something.
    const body = [
      '**Ingredients**', '- 300 g rigatoni', '- 3 egg yolks', '',
      'Cut the guanciale into 2 x 4 x .4 cm cuboids and take the sausage meat out of the casing.',
    ].join('\n');
    const out = scaleRecipeBody(body, 2);
    expect(out).toContain('600 g rigatoni');
    expect(out).toContain('6 egg yolks');
    expect(out, 'the method is left exactly as written').toContain('2 x 4 x .4 cm cuboids');
  });

  it('a multiplied pack size is the size of each, not a second way of saying the amount', () => {
    // '1 x 400g tin' means one 400-gram tin. Doubling it means two of those
    // tins. The dual-measure rule read the 400 g as the same amount written
    // again and scaled it too, giving '2 x 800 g' — four times the coconut
    // milk, in a line that looks entirely reasonable. The worst kind of wrong.
    expect(scaleIngredient('1 x 400g tin coconut milk', 2)).toBe('2 x 400g tins coconut milk');
    expect(scaleIngredient('2 x 400g tins coconut milk', 0.5)).toBe('1 x 400g tin coconut milk');
    expect(scaleIngredient('1 x 200 g pack feta', 3)).toBe('3 x 200 g packs feta');
    // The genuine dual measure is untouched by the exception: it has no 'x'.
    expect(scaleIngredient('3 tablespoons 45 g flour', 2)).toBe('6 tablespoons 90 g flour');
  });

  it('measure words that were missing let the count fall through to the name', () => {
    // Both found by running the scaler over ordinary shopping-list lines
    // rather than by thinking of cases, which is the only way this kind shows
    // up. 'loaf' was in the irregular-plural table but not the measure list,
    // so it was never the word being counted.
    expect(scaleIngredient('1 loaf crusty bread', 2)).toBe('2 loaves crusty bread');
    expect(scaleIngredient('2 loaves crusty bread', 0.5)).toBe('1 loaf crusty bread');
    // 'rib' was in neither, so the count fell through to the name — and the
    // name is a mass noun, which took a plural it can never have.
    expect(scaleIngredient('2 ribs celery', 2)).toBe('4 ribs celery');
    expect(scaleIngredient('2 ribs celery', 0.5)).toBe('1 rib celery');
  });

  it('the word that names the thing takes the count, wherever it sits', () => {
    // Off Sean's Tagliatelle al Ragù: '1 bay leaf' doubled to '2 bay leaf',
    // because the pluraliser only ever looked at the word after the number —
    // and there that word is 'bay'.
    expect(scaleIngredient('1 bay leaf', 2)).toBe('2 bay leaves');
    expect(scaleIngredient('1 large egg', 2)).toBe('2 large eggs');
    expect(scaleIngredient('1 red onion, diced', 2)).toBe('2 red onions, diced');
    expect(scaleIngredient('2 bay leaves', 0.5)).toBe('1 bay leaf');
    expect(scaleIngredient('1 potato', 2)).toBe('2 potatoes');
    // A measure word still takes it, and the noun after is left alone.
    expect(scaleIngredient('1 cup dry white wine', 2)).toBe('2 cups dry white wine');
    // No single bare noun to find — do not guess at one.
    expect(scaleIngredient('300 g fresh tagliatelle (see Pasta all Uovo)', 2))
      .toBe('600 g fresh tagliatelle (see Pasta all Uovo)');
    // And the compound noun that started all this still holds.
    expect(scaleIngredient('3 egg yolks', 2)).toBe('6 egg yolks');
  });

  it("the shapes read off Sean's phone, now pinned rather than eyeballed", () => {
    // Every one of these was verified by opening the real recipe on the
    // simulator and reading it. That is how four bugs were found; it is not a
    // thing that repeats itself, so the shapes belong here.
    // Fumé, halved: a range whose TOP lands exactly on one, so the unit has
    // to go singular with it.
    expect(scaleIngredient('1 ½-2 cups tomato sauce', 0.5)).toBe('¾-1 cup tomato sauce');
    expect(scaleIngredient('1 ½ onion', 0.5)).toBe('¾ onion');
    expect(scaleIngredient('200/300 g pancetta', 0.5)).toBe('100/150 g pancetta');
    // Uovo, doubled: pinch takes 'es'.
    expect(scaleIngredient('2 pinches of salt', 2)).toBe('4 pinches of salt');
    // Porro, doubled: an adjective in the unit slot and a noun already plural.
    expect(scaleIngredient('2 big leeks', 2)).toBe('4 big leeks');
    // Zozzona, doubled: a decimal range, and the onion that must gain its s.
    expect(scaleIngredient('1.5-2 cups tomato sauce', 2)).toBe('3-4 cups tomato sauce');
    expect(scaleIngredient('1 onion', 2)).toBe('2 onions');
  });

  it('a line with no number is left exactly alone', () => {
    // Half a pinch is not a quantity, and inventing one would be worse than
    // leaving the cook to judge it.
    expect(scaleIngredient('a pinch of salt', 2)).toBe('a pinch of salt');
    expect(scaleIngredient('salt and pepper to taste', 0.5)).toBe('salt and pepper to taste');
  });

  it('scales the ingredients of our body and NOTHING else', () => {
    const body = [
      '**Ingredients**',
      '- 2 cups flour',
      '- a pinch of salt',
      '',
      '**Directions**',
      '1. Bake 20-25 minutes at 425°.',
      '- 1 cup of nonsense under the method',
      '',
      'Grandma doubled the butter.',
    ].join('\n');
    const out = scaleRecipeBody(body, 2).split('\n');
    expect(out[1]).toBe('- 4 cups flour');
    expect(out[2]).toBe('- a pinch of salt');
    // The method is prose: 20-25 minutes is a time, and doubling it ruins
    // the dish rather than the arithmetic.
    expect(out[5]).toBe('1. Bake 20-25 minutes at 425°.');
    expect(out[6]).toBe('- 1 cup of nonsense under the method');
    expect(out[8]).toBe('Grandma doubled the butter.');
  });

  it('scaling by one is the identity, character for character', () => {
    const body = '**Ingredients**\n- 1 ½ cups flour\n\n**Directions**\n1. Mix.';
    expect(scaleRecipeBody(body, 1)).toBe(body);
  });
});

describe('what tesseract does to a real card — every rule chased a screenshot', () => {
  // Fixtures are short observed ingredient LINES (quantities are facts);
  // no recipe prose belongs in this repo.
  it('checkbox glyphs strip where a quantity follows, and bare J always', () => {
    expect(precleanOcrLine('J 1/2 cup plain yoghurt')).toBe('1/2 cup plain yoghurt');
    expect(precleanOcrLine('OO 2 cloves garlic')).toBe('2 cloves garlic');
    expect(precleanOcrLine('TJ 2 Tbsp olive oil')).toBe('2 Tbsp olive oil');
    expect(precleanOcrLine('J Basmati rice')).toBe('Basmati rice');
    expect(precleanOcrLine('TO SERVE')).toBe('TO SERVE'); // a pair needs a digit
  });

  it('fused tokens un-fuse: 1and, 11/4, the stray apostrophe', () => {
    expect(precleanOcrLine('1and 1/2 cups (345g) mashed bananas')).toBe('1 and 1/2 cups (345g) mashed bananas');
    expect(precleanOcrLine('11/4tspsalt')).toBe('1 1/4tspsalt');
    expect(precleanOcrLine("1'teaspoon cider vinegar")).toBe('1 teaspoon cider vinegar');
  });

  it('the fused unit gives the word back: 1/4tspsalt parses whole', () => {
    expect(parseIngredient('1 1/4tspsalt')).toBe('1 ¼ tsp salt');
    // …and the guard: ordinary words that BEGIN with a unit stay words.
    expect(parseIngredient('2 canned tomatoes')).toBe('2 canned tomatoes');
    expect(parseIngredient('3 garlic cloves')).toBe('3 garlic cloves');
  });

  it('price chatter goes, words in the same parens stay', () => {
    expect(precleanOcrLine('2 Tbsp olive oil ( 0.32)')).toBe('2 Tbsp olive oil');
    expect(precleanOcrLine('2 Tbsp olive oil ($0.32)')).toBe('2 Tbsp olive oil');
    expect(precleanOcrLine('diced tomatoes (with juices, 0.50)')).toBe('diced tomatoes (with juices)');
  });

  it('ratings and player garbage never become ingredients', () => {
    expect(looksLikeChrome('496 from 1100 votes')).toBe(true);
    expect(looksLikeChrome('Cook Mode Prevent your screen from going dark')).toBe(true);
    expect(looksLikeChrome('V7, Yi e')).toBe(true);
    expect(looksLikeChrome('2 cups (250g) all-purpose flour')).toBe(false);
    expect(looksLikeChrome('salt and pepper to taste')).toBe(false);
  });

  it('a wrapped column re-joins: the fragment starts lowercase or (', () => {
    const parts = recipeFromPages(['Ingredients\n2 cups (250g) all purpose\nflour (spooned and leveled)\n1/2 cup (8 Tbsp; 113g) unsalted\nbutter, softened to room\ntemperature']);
    expect(parts.ingredients).toEqual([
      '2 cups (250g) all purpose flour (spooned and leveled)',
      '½ cup (8 Tbsp; 113g) unsalted butter, softened to room temperature',
    ]);
  });

  it('a capitalised fragment stays split rather than gluing neighbours', () => {
    const parts = recipeFromPages(['Ingredients\n1 tsp salt\nBasmati rice']);
    expect(parts.ingredients).toEqual(['1 tsp salt', 'Basmati rice']);
  });
});

describe('ingredientParts — the measure as data, for the row badge', () => {
  it('quantity and unit lift out; the name keeps the rest', () => {
    expect(ingredientParts('2 cups (250g) all-purpose flour')).toEqual({ qty: '2', unit: 'cups', name: '(250g) all-purpose flour' });
    expect(ingredientParts('1/2 CUP milk')).toEqual({ qty: '½', unit: 'cup', name: 'milk' });
    expect(ingredientParts('2-3 cloves garlic')).toEqual({ qty: '2-3', unit: 'cloves', name: 'garlic' });
    expect(ingredientParts('1 1/4tspsalt')).toEqual({ qty: '1 ¼', unit: 'tsp', name: 'salt' });
  });
  it('no quantity, no badge — the honest rendering of not knowing', () => {
    expect(ingredientParts('a pinch of salt')).toEqual({ qty: null, unit: null, name: 'a pinch of salt' });
    expect(ingredientParts('large egg')).toEqual({ qty: null, unit: null, name: 'large egg' });
  });
  it('a quantity with no unit badges the quantity alone', () => {
    expect(ingredientParts('2 canned tomatoes')).toEqual({ qty: '2', unit: null, name: 'canned tomatoes' });
  });
});

describe('recipeFromHtml — a page that says what its recipe is', () => {
  const page = (ld: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>chatter</body></html>`;

  it('takes ingredients and steps, and NOTHING else', () => {
    const r = recipeFromHtml(page({
      '@type': 'Recipe',
      name: 'Pancakes',
      description: 'A story about my grandmother that is not a step.',
      recipeIngredient: ['2 cups flour', '1/2 cup milk'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Mix it' }, { '@type': 'HowToStep', text: 'Fry it' }],
      nutrition: { calories: '400' },
    }))!;
    expect(r.title).toBe('Pancakes');
    expect(r.ingredients).toEqual(['2 cups flour', '½ cup milk']); // parsed on the way in
    expect(r.steps).toEqual(['Mix it', 'Fry it']);
    expect(r.extra).toEqual([]);
  });

  it('finds the Recipe inside @graph, and through an array', () => {
    const inner = { '@type': 'Recipe', name: 'X', recipeIngredient: ['1 egg'], recipeInstructions: ['Beat it'] };
    expect(recipeFromHtml(page({ '@graph': [{ '@type': 'WebPage' }, inner] }))!.ingredients).toEqual(['1 egg']);
    expect(recipeFromHtml(page([{ '@type': 'Organization' }, inner]))!.ingredients).toEqual(['1 egg']);
  });

  it("unwraps HowToSection and keeps its heading as a subheader — Sean's ask, 2026-08-19", () => {
    // The name used to be dropped ("a heading is not a step"). Subheaders
    // exist now, so it arrives as one — colon and all.
    const r = recipeFromHtml(page({
      '@type': 'Recipe',
      recipeIngredient: ['1 tsp salt'],
      recipeInstructions: [{ '@type': 'HowToSection', name: 'For the sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Simmer' }] }],
    }))!;
    expect(r.steps).toEqual(['For the sauce:', 'Simmer']);
    expect(isSubheader(r.steps[0]!)).toBe(true);
  });

  it('entities and fractions survive', () => {
    const r = recipeFromHtml(page({ '@type': 'Recipe', recipeIngredient: ['&frac12; cup sugar &amp; spice'], recipeInstructions: ['Stir'] }))!;
    expect(r.ingredients).toEqual(['½ cup sugar & spice']);
  });

  it('a malformed block does not lose a good one', () => {
    const html = `<script type="application/ld+json">{oops</script>` + page({ '@type': 'Recipe', recipeIngredient: ['1 egg'], recipeInstructions: ['Beat'] });
    expect(recipeFromHtml(html)!.ingredients).toEqual(['1 egg']);
  });

  it('a page with no recipe says so rather than inventing one', () => {
    expect(recipeFromHtml('<html><body>no recipe here</body></html>')).toBeNull();
    expect(recipeFromHtml(page({ '@type': 'WebPage', name: 'Blog' }))).toBeNull();
  });
});

describe('recipeFromHtml — the shapes real sites actually ship', () => {
  const page = (body: string) => `<html><head>${body}</head><body>x</body></html>`;
  const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

  it('takes the Recipe when a page ships SEVERAL blocks', () => {
    // The captured bbcgoodfood page has four; the Recipe was not the first.
    const html = page(
      ld({ '@type': 'Organization', name: 'Big Media' }) +
      ld({ '@type': 'BreadcrumbList', itemListElement: [] }) +
      ld({ '@type': 'Recipe', name: 'Scones', recipeIngredient: ['1 tsp salt'], recipeInstructions: ['Bake'] }),
    );
    expect(recipeFromHtml(html)!.title).toBe('Scones');
  });

  it('a Recipe nested in @graph among other nodes', () => {
    const html = page(ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'site' },
        { '@type': 'ImageObject', url: 'x.jpg' },
        { '@type': ['Recipe', 'NewsArticle'], name: 'Buried', recipeIngredient: ['2 eggs'], recipeInstructions: ['Whisk'] },
      ],
    }));
    const r = recipeFromHtml(html)!;
    expect(r.title).toBe('Buried');
    expect(r.ingredients).toEqual(['2 eggs']);
  });

  it('a block that is an ARRAY at the top level', () => {
    const html = page(ld([
      { '@type': 'Person', name: 'A Cook' },
      { '@type': 'Recipe', name: 'In an array', recipeIngredient: ['1 cup rice'], recipeInstructions: ['Simmer'] },
    ]));
    expect(recipeFromHtml(html)!.title).toBe('In an array');
  });

  it('instructions given as ONE html blob, which several sites do', () => {
    const html = page(ld({
      '@type': 'Recipe', name: 'Blob',
      recipeIngredient: ['1 egg'],
      recipeInstructions: '<p>Heat the pan.</p><p>Crack the egg.</p><p>Wait.</p>',
    }));
    expect(recipeFromHtml(html)!.steps).toEqual(['Heat the pan.', 'Crack the egg.', 'Wait.']);
  });

  it('ignores a block that is valid JSON but not a page of ours', () => {
    expect(recipeFromHtml(page(ld({ '@type': 'VideoObject', name: 'A video' })))).toBeNull();
  });
});

describe('recipeFromHtml — ingredient shapes the wild produces', () => {
  const page = (o: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head><body>x</body></html>`;
  const recipe = (ings: unknown) => page({ '@type': 'Recipe', name: 'X', recipeIngredient: ings, recipeInstructions: ['Do it'] });

  it('a single ingredient given as a bare string, not an array', () => {
    expect(recipeFromHtml(recipe('2 cups flour'))!.ingredients).toEqual(['2 cups flour']);
  });

  it('drops empties and whitespace-only entries rather than listing blanks', () => {
    const r = recipeFromHtml(recipe(['1 egg', '', '   ', '2 cups flour']))!;
    expect(r.ingredients).toEqual(['1 egg', '2 cups flour']);
  });

  it('non-string entries are skipped, not stringified into [object Object]', () => {
    const r = recipeFromHtml(recipe(['1 egg', { name: 'flour' }, null, 42, '1 tsp salt']))!;
    expect(r.ingredients).toEqual(['1 egg', '1 tsp salt']);
  });

  it('a recipe with steps but NO ingredients is still a recipe', () => {
    const r = recipeFromHtml(page({ '@type': 'Recipe', name: 'Method only', recipeInstructions: ['Stir', 'Serve'] }))!;
    expect(r).not.toBeNull();
    expect(r.steps).toEqual(['Stir', 'Serve']);
    expect(r.ingredients).toEqual([]);
  });

  it('the older `ingredients` key still works — sites that never updated', () => {
    const r = recipeFromHtml(page({ '@type': 'Recipe', name: 'Old', ingredients: ['3 ripe bananas'], recipeInstructions: ['Mash'] }))!;
    expect(r.ingredients).toEqual(['3 ripe bananas']);
  });
});

describe("subheaders — Sean's Croque Madame shape (2026-08-19)", () => {
  it('knows one when it sees one, and knows what is not one', () => {
    expect(isSubheader('For the béchamel:')).toBe(true);
    expect(isSubheader('Prepare the sandwich:')).toBe(true);
    expect(isSubheader('For serving:')).toBe(true);
    expect(isSubheader('1 cup milk:')).toBe(false); // a quantity is an ingredient
    expect(isSubheader('Whisk everything together.')).toBe(false);
    expect(isSubheader(':')).toBe(false);
  });

  it('recipeBody writes them bold with the colon, and the step numbers walk past', () => {
    const body = recipeBody(
      ['For the béchamel:', '2 tbsp butter', 'For assembly:', '4 slices bread'],
      ['For the béchamel:', 'Melt the butter', 'Whisk in flour', 'Prepare the sandwich:', 'Butter the bread'],
    );
    expect(body).toBe(
      [
        '**Ingredients**',
        '**For the béchamel:**',
        '- 2 tbsp butter',
        '**For assembly:**',
        '- 4 slices bread',
        '',
        '**Directions**',
        '**For the béchamel:**',
        '1. Melt the butter',
        '2. Whisk in flour',
        '**Prepare the sandwich:**',
        '3. Butter the bread',
      ].join('\n'),
    );
  });

  it('round-trips through the editor parse without shedding or moving one', () => {
    const ings = ['For the béchamel:', '2 tbsp butter', '2 tbsp flour'];
    const steps = ['For the béchamel:', 'Melt the butter', 'Prepare the sandwich:', 'Butter the bread'];
    const r = recipeFromPages([recipeBody(ings, steps)]);
    expect(r.ingredients).toEqual(ings);
    expect(r.steps).toEqual(steps);
  });

  it('the blob keeps its subheaders — the card renders them, the prose stays out', () => {
    const body = ['My note about lunch.', '', recipeBody(['For the béchamel:', '2 tbsp butter'], ['For the béchamel:', 'Melt it']), '', 'Serve hot, says Grandma.'].join('\n');
    const split = splitRecipeBody(body)!;
    expect(split.before).toBe('My note about lunch.');
    expect(split.recipe).toContain('**For the béchamel:**');
    expect(split.recipe).toContain('1. Melt it');
    expect(split.after).toBe('Serve hot, says Grandma.');
  });

  it('scaling reaches past a subheader; the subheader itself never scales', () => {
    const body = recipeBody(['For the béchamel:', '2 tbsp butter', '1 cup milk'], ['Melt it']);
    const doubled = scaleRecipeBody(body, 2);
    expect(doubled).toContain('**For the béchamel:**');
    expect(doubled).toContain('- 4 tbsp butter');
    expect(doubled).toContain('- 2 cups milk');
  });

  it('OCR keeps a mid-list "For the…" line as a subheader instead of reopening the ingredients', () => {
    const page = [
      'Croque Madame',
      '',
      'INGREDIENTS',
      '2 tbsp butter',
      '4 slices bread',
      '',
      'DIRECTIONS',
      'For the béchamel:',
      '1. Melt the butter in a saucepan',
      'Prepare the sandwich:',
      '2. Butter the bread',
    ].join('\n');
    const r = recipeFromPages([page]);
    expect(r.steps).toEqual([
      'For the béchamel:',
      'Melt the butter in a saucepan',
      'Prepare the sandwich:',
      'Butter the bread',
    ]);
    expect(r.ingredients).toEqual(['2 tbsp butter', '4 slices bread']);
  });
});

describe("first order for a fresh list — dry, wet, the rest, unitless last (Sean's rule, 2026-08-19)", () => {
  it('groups a real card and sinks the unitless lines, stably', () => {
    expect(
      orderIngredients([
        'salt and pepper to taste',
        '2 cups milk',
        '1 large yellow onion',
        '2 cups all-purpose flour',
        '4 tbsp butter',
        '1 tsp salt',
        'fresh cracked black pepper to taste',
      ]),
    ).toEqual([
      '2 cups all-purpose flour', // dry, in card order
      '1 tsp salt',
      '2 cups milk', // wet, in card order
      '4 tbsp butter',
      '1 large yellow onion', // the rest
      'salt and pepper to taste', // unitless sink to the bottom, in card order
      'fresh cracked black pepper to taste',
    ]);
  });

  it('classifies by the noun that heads the name, not the first word it knows', () => {
    // 'milk' is in the name, but the thing is the CHIPS — dry.
    expect(orderIngredients(['1 cup milk chocolate chips', '1 cup milk'])).toEqual([
      '1 cup milk chocolate chips',
      '1 cup milk',
    ]);
  });

  it('subheaders fence the sort — each group orders within itself', () => {
    expect(
      orderIngredients([
        'For the béchamel:',
        '2 cups milk',
        '2 tbsp flour',
        'For assembly:',
        '4 slices bread',
        'dijon mustard to taste',
      ]),
    ).toEqual([
      'For the béchamel:',
      '2 tbsp flour',
      '2 cups milk',
      'For assembly:',
      '4 slices bread',
      'dijon mustard to taste',
    ]);
  });
});

describe("scaling gaps mined from Sean's own cards, 2026-08-19", () => {
  it("'2 lbs lamb shank' halves to '1 lb', not '1 lbs' — Gohrme Sabzi", () => {
    expect(scaleIngredient('2 lbs lamb shank', 0.5)).toBe('1 lb lamb shank');
    expect(scaleIngredient('2 lbs lamb shank', 2)).toBe('4 lbs lamb shank');
  });

  it("halving a third lands on a sixth, not '0.17' — Key Lime Pie's melted butter", () => {
    expect(scaleIngredient('1/3 cup melted butter', 0.5)).toBe('⅙ cup melted butter');
    // …and the glyph reads back, so the scale row can move again from it.
    expect(scaleIngredient('⅙ cup melted butter', 2)).toBe('⅓ cup melted butter');
    expect(scaleIngredient('⅜ cup water', 2)).toBe('¾ cup water');
  });

  it('a hedge word rides along and the number under it still scales', () => {
    // All four shapes are verbatim off his cards.
    expect(scaleIngredient('~4 Tbsp butter/olive oil', 2)).toBe('~8 Tbsp butter/olive oil');
    expect(scaleIngredient('about 2 cups tomato sauce (can be passata)', 2)).toBe('about 4 cups tomato sauce (can be passata)');
    expect(scaleIngredient('scant 1/4 teaspoon ground nutmeg (fresh grated is ideal)', 2)).toBe('scant ½ teaspoon ground nutmeg (fresh grated is ideal)');
    expect(scaleIngredient('optional: 1/8 cup sugar', 2)).toBe('optional: ¼ cup sugar');
    // A hedge over no quantity stays exactly as written.
    expect(scaleIngredient('about enough for everyone', 2)).toBe('about enough for everyone');
  });

  it("a bracket after a KNOWN unit restates the amount and scales with it — Basque cheesecake's sugar", () => {
    expect(scaleIngredient('1 ½ cups (300 g) sugar', 2)).toBe('3 cups (600 g) sugar');
    expect(scaleIngredient('⅓ cup (42 g) all-purpose flour', 0.5)).toBe('⅙ cup (21 g) all-purpose flour');
    // The per-item bracket keeps holding still: no unit in front, so the
    // bracket is the size of each can, not a restatement.
    expect(scaleIngredient('1 (14 oz) can tomatoes', 2)).toBe('2 (14 oz) cans tomatoes');
  });

  it("the 'or' alternative scales too — Basque cheesecake's two salts", () => {
    expect(scaleIngredient('1 tsp. Diamond Crystal or ½ tsp. Morton kosher salt', 2))
      .toBe('2 tsp. Diamond Crystal or 1 tsp. Morton kosher salt');
    // Counting things, not measuring amounts: untouched past the first number.
    expect(scaleIngredient('1 onion or 2 shallots', 2)).toBe('2 onions or 2 shallots');
  });
});

describe("the unit's abbreviation dot goes with the unit", () => {
  it("'1 lb. ground lamb' badges as [1|lb] 'ground lamb', not '. ground lamb'", () => {
    // Off Sean's Pastitsio, seen the day the Android card first rendered it.
    expect(ingredientParts('1 lb. ground lamb')).toEqual({ qty: '1', unit: 'lb', name: 'ground lamb' });
    expect(ingredientParts('1 tsp. vanilla')).toEqual({ qty: '1', unit: 'tsp', name: 'vanilla' });
    // A rest that legitimately opens with punctuation the dot rule must not
    // eat: the comma shape keeps its comma-free name exactly as before.
    expect(ingredientParts('1 onion, chopped').name).toBe('onion, chopped');
  });
});
