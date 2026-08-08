/** The OCR-to-note heuristics: humble, but pinned. */
import { describe, it, expect } from 'vitest';
import { formatRecipe } from '../src/recipe';

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
