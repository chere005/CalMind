/** The OCR-to-note heuristics: humble, but pinned. */
import { describe, it, expect } from 'vitest';
import { formatRecipe, parseIngredient, recipeBody, recipeFromPages , scrubLine } from '../src/recipe';

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
  it('the whole pipeline stays clean end to end', () => {
    const r = formatRecipe(['Choco Cake \u2122\nIngredients:\n\u2022 2 cups # flour\n1) Mix\u00ae well']);
    expect(r.title).toBe('Choco Cake');
    expect(r.body).not.toMatch(/[\u2122\u00ae#\u2022]/);
  });
});
