import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { recipeFromHtml, ingredientParts } from '../src/index';

/**
 * A REAL recipe page, as the deployed server actually returned it.
 *
 * The synthetic fixture in recipe.test.ts proves the rules; this proves they
 * survive 578KB of a live site — analytics blobs, several JSON-LD blocks,
 * entity-encoded fractions, a @graph wrapper. The page was captured through
 * the real `recipe_fetch` endpoint rather than hand-written, because the
 * whole point is that the parser meets the web as it is.
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
