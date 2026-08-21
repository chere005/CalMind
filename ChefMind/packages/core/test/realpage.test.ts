import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { recipeFromHtml, ingredientParts } from '../src/index';

/**
 * A REAL recipe page, as the deployed server actually returned it.
 *
 * The synthetic fixture in recipe.test.ts proves the rules; this proves they
 * survive a page nobody here wrote. It was captured through the real
 * `recipe_fetch` endpoint rather than hand-written, because the whole point is
 * that the parser meets the web as it is.
 *
 * WHAT IT IS AND IS NOT, since this said otherwise until 2026-08-11 and a
 * docstring that overstates a test is the same shape as a test that cannot
 * fail. The live page was 578KB; the capture is 5.7KB, TRIMMED to the JSON-LD
 * blocks — which the fixture's own first line says and this did not. What
 * genuinely survives the trim is what the parser actually reads: four separate
 * ld+json blocks, one of them a @graph wrapper, of which only one is a Recipe.
 * The analytics and the 570KB of markup are gone, and the claim that this
 * exercises entity-encoded fractions was simply wrong — there is not one
 * entity left in the file. Entities are covered by entities.test.ts instead,
 * which is where the RangeError on a malformed one was found.
 *
 * Skipped when the capture is absent so a fresh clone is not red; the
 * capture lives beside the spec.
 */
const CAPTURE = `${__dirname}/fixtures/bbcgoodfood-scones.html`;

describe('a live recipe page, parsed', () => {
  it.skipIf(!existsSync(CAPTURE))('yields its title, ingredients and steps', () => {
    const r = recipeFromHtml(readFileSync(CAPTURE, 'utf8'));
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Classic scones with jam & clotted cream');
    expect(r!.steps.length).toBeGreaterThanOrEqual(5);
    expect(r!.steps[0]).toMatch(/Heat the oven/);
    // Ingredients must be parsed, not raw — a measure badge for each.
    expect(r!.ingredients.length).toBeGreaterThanOrEqual(5);
    const withMeasure = r!.ingredients.map(ingredientParts).filter((p) => p.qty || p.unit);
    expect(withMeasure.length).toBeGreaterThanOrEqual(4);
    // And Sean's rule: no nutrition, no author story.
    expect(r!.extra).toEqual([]);
  });
});
