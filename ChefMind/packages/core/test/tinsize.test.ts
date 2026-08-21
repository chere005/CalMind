/**
 * A tin's size is the size of ONE tin, however the line spells it.
 *
 * Found 2026-08-12 by driving TODO §6's own claim — "the '1 x 400g tin' shape
 * is standard and still unconfirmed" — instead of re-filing it. Confirming it
 * turned up the neighbour: '1 400g tin chopped tomatoes' doubled to
 * '2 800 g tin chopped tomatoes'. That is 1600g of tomatoes for a line that
 * asked for 800 — four times, and it READS as though it were right, which is
 * the whole reason the guard it slipped past exists.
 *
 * scaleIngredient already had that guard, and its comment describes this exact
 * failure. It tested for a literal 'x' rather than for what the 'x' MEANS, so
 * of the four ways to write one tin of tomatoes, three were correct and the
 * commonest one was wrong.
 *
 * The four are pinned together here deliberately. Each alone would pass with a
 * fix that special-cased it; what makes the rule a rule is that they agree.
 *
 * The last case is the boundary and matters as much as the bug: where a word
 * DOES stand between the count and the size, the two numbers are separate
 * amounts and both must still scale. That is what stops the fix reading
 * "never scale a second number", which would be a different bug of the same
 * size in the other direction.
 */
import { describe, it, expect } from 'vitest';
import { recipeBody, scaleRecipeBody } from '../src/index';

const scaled = (line: string, factor: number): string => {
  const out = scaleRecipeBody(recipeBody([line], ['Cook.']), factor)
    .split('\n')
    .filter((l) => l.startsWith('- '));
  return out[0]!.slice(2);
};

describe('a size that belongs to one item does not grow', () => {
  it('doubles the COUNT of tins and never the tin', () => {
    // All four spellings of the same ingredient, doubled. 800g of tomatoes.
    expect(scaled('1 400g tin chopped tomatoes', 2)).toBe('2 400g tins chopped tomatoes');
    expect(scaled('1 x 400g tin chopped tomatoes', 2)).toBe('2 x 400g tins chopped tomatoes');
    expect(scaled('1 (400g) tin chopped tomatoes', 2)).toBe('2 (400g) tins chopped tomatoes');
    expect(scaled('1 tin chopped tomatoes', 2)).toBe('2 tins chopped tomatoes');
  });

  it('holds for the other containers and the spaced unit', () => {
    expect(scaled('1 400 g tin chopped tomatoes', 2)).toBe('2 400 g tins chopped tomatoes');
    expect(scaled('1 400ml can coconut milk', 2)).toBe('2 400ml cans coconut milk');
    expect(scaled('2 100g bars dark chocolate', 2)).toBe('4 100g bars dark chocolate');
  });

  it('halves the same way — the rule is not "double"', () => {
    expect(scaled('2 400g tins chopped tomatoes', 0.5)).toBe('1 400g tin chopped tomatoes');
  });

  it('leaves a line alone at factor 1', () => {
    expect(scaled('1 400g tin chopped tomatoes', 1)).toBe('1 400g tin chopped tomatoes');
  });

  it('and a mixed fraction counts tins without resizing them', () => {
    // '1 1/2' is swallowed by the number itself, so this never reaches the
    // empty-unit branch by the route the bug came in on. Pinned because that
    // is the reason the fix could keep the MEASURE guard below.
    expect(scaled('1 1/2 400g tins tomatoes', 2)).toBe('3 400g tins tomatoes');
    expect(scaled('1 1/2 cups flour', 2)).toBe('3 cups flour');
  });

  it('does NOT reach for a word that is not a container', () => {
    // The guard this pins was, on its own, a check that could not fail: with
    // it removed the whole suite above still passed, because every line in it
    // has a container word. These are the lines that need it. Dropping the
    // MEASURE test turns them into '2 400g choppeds tomatoes', '2 400g frees
    // range chicken' and '2 2kg wholes chicken' — an adjective pluralised as
    // though it were a tin, which is the Carbonara '(skinny) ors' failure the
    // bracket branch above documents.
    expect(scaled('1 400g chopped tomatoes', 2)).not.toContain('choppeds');
    expect(scaled('1 400g free range chicken', 2)).not.toContain('frees');
    expect(scaled('1 2kg whole chicken', 2)).not.toContain('wholes');

    // What they do instead, stated rather than left vague: with no container
    // word the line is not recognised as a count of sized items, so both
    // numbers scale. For '1 2kg whole chicken' that is two 4kg chickens where
    // one 4kg was wanted — the same four-times shape as the bug above, still
    // present for the no-container spelling. Left alone deliberately: the two
    // branches beside this one are equally conservative, and widening the
    // rule to every bare size is a guess about shapes that are not in Sean's
    // recipes. Recorded in TODO §6 rather than fixed on a hunch.
    expect(scaled('1 2kg whole chicken', 2)).toBe('2 4 kg whole chicken');
  });

  it('but TWO amounts still both scale, when a word separates them', () => {
    // 'eggs' stands between the count and the size, so 200g is not a tin size
    // — it is a second ingredient, and doubling the line doubles both.
    expect(scaled('3 eggs 200g flour', 2)).toBe('6 eggs 400 g flour');
    // And the plain single amount, which was never in doubt but is what the
    // per-item rule must not swallow.
    expect(scaled('400g chopped tomatoes', 2)).toBe('800 g chopped tomatoes');
    expect(scaled('2 tbsp olive oil', 2)).toBe('4 tbsp olive oil');
  });
});
