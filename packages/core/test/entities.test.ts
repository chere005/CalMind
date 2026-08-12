/**
 * A bad HTML entity must not cost the whole recipe.
 *
 * recipeFromHtml reads arbitrary pages fetched from a URL somebody typed, so
 * malformed input is the ordinary case rather than the exception.
 * String.fromCodePoint throws on anything outside 0..0x10FFFF and on the NaN a
 * malformed '&#abc;' parses to, and that RangeError came out of the whole
 * parse — RecipeEditor catches it, so the app stayed up and Sean got the
 * entire recipe refused with "Invalid code point 1114112" written across the
 * import box instead.
 */
import { describe, it, expect } from 'vitest';
import { recipeFromHtml } from '../src/index';

const page = (ing: string, name = 'Test bake') => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"${name}","recipeIngredient":["${ing}","2 eggs"],"recipeInstructions":[{"@type":"HowToStep","text":"Mix it."},{"@type":"HowToStep","text":"Bake it."}]}</script>
</head><body></body></html>`;

const first = (ing: string) => recipeFromHtml(page(ing))!.ingredients[0]!;

describe('entities that cannot be decoded', () => {
  it('do not throw the recipe away', () => {
    // Every one of these threw a RangeError before, out of the parse entirely.
    for (const bad of ['&#abc;', '&#1114112;', '&#99999999;', '&#xFFFFFF;', '&#x110000;']) {
      const r = recipeFromHtml(page(`${bad} cup flour`));
      expect(r, `${bad} still yields a recipe`).not.toBeNull();
      expect(r!.ingredients.length).toBe(2);
      expect(r!.steps.length).toBe(2);
    }
  });

  it('are left exactly as written, not silently dropped', () => {
    // Tolerate what you cannot interpret. Swallowing it would leave a
    // measurement quietly missing its number, which is worse than a visible
    // '&#1114112;' — one is wrong, the other is merely ugly.
    expect(first('&#1114112; cup flour')).toContain('&#1114112;');
  });

  it('and NUL is refused with them, rather than landing in the note', () => {
    // '&#0;' produced a real NUL in the body: not a character anyone typed,
    // and awkward everywhere downstream.
    expect(first('&#0; cup flour')).toContain('&#0;');
    expect(first('&#0; cup flour').codePointAt(0)).not.toBe(0);
  });

  it('while the ones that ARE valid still decode', () => {
    // The half that keeps the guard from swallowing everything: a version
    // that had given up on all numeric entities would pass every test above.
    expect(first('&#189; cup flour')).toContain('½');
    expect(first('&#x00BD; cup flour')).toContain('½');
    expect(first('&frac34; cup flour')).toContain('¾');
    expect(recipeFromHtml(page('1 cup flour', 'Jam &amp; cream'))!.title).toBe('Jam & cream');
    expect(recipeFromHtml(page('1 cup flour', 'Caf&#233; loaf'))!.title).toBe('Café loaf');
  });
});
