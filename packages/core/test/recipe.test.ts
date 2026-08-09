/** The OCR-to-note heuristics: humble, but pinned. */
import { describe, it, expect } from 'vitest';
import { formatRecipe, parseIngredient, recipeBody, recipeFromPages, scaleIngredient, scaleRecipeBody, scrubLine } from '../src/recipe';

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
    // A parenthesised size means more tins, not a bigger tin — that is the
    // part that matters and it holds. The plural does not: '(14 oz)' sits
    // between the number and the word 'can', where nothing can see it is a
    // measure. A cosmetic wart, not a lie, and pinned so it stays that way.
    expect(scaleIngredient('1 (14 oz) can tomatoes', 2)).toBe('2 (14 oz) can tomatoes');
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
