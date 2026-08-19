/**
 * The two lines that turn a scaled decimal back into a kitchen fraction.
 *
 * Found unwatched by mutation, 2026-08-11 — `Math.abs(frac - value) < 0.02`
 * narrowed to an exact match, and `if (frac < 0.02) return String(whole)`
 * deleted, and nothing went red. Both survive the fraction-written recipes the
 * existing tests use, because those land on the glyph values exactly: 1/3
 * doubled IS 2/3 in floating point, to the last bit.
 *
 * DECIMALS are what need them, and decimals are what the web serves — JSON-LD
 * routinely carries "0.5 cup", so an imported recipe is full of them.
 */
import { describe, it, expect } from 'vitest';
import { recipeBody, scaleRecipeBody } from '../src/index';

const scaled = (ing: string, factor: number) =>
  scaleRecipeBody(recipeBody([ing], ['Mix.']), factor)
    .split('\n').find((l) => l.startsWith('- '))!.slice(2);

describe('scaling a decimal quantity', () => {
  it('snaps to the nearest kitchen fraction rather than printing the decimal', () => {
    // 0.33 x 2 = 0.66, which is 0.0067 from two thirds. Exact matching gives
    // "0.66 cup" — accurate, and not a measurement anyone owns a cup for.
    expect(scaled('0.33 cup flour', 2)).toBe('⅔ cup flour');
    expect(scaled('0.25 cup oil', 3)).toBe('¾ cup oil');
    expect(scaled('0.67 cup milk', 2)).toBe('1 ⅓ cups milk');
  });

  it('drops a remainder too small to measure', () => {
    // 0.67 x 3 = 2.01. Without the rounding this reads "2.01 cups".
    expect(scaled('0.67 cup milk', 3)).toBe('2 cups milk');
  });

  it('and still prints a real decimal when nothing fits', () => {
    // The half that keeps the two above from being "always snap to something".
    // This used to pin a sixth as off the list; sixths joined it 2026-08-19
    // (halving ⅓ lands there, straight off Sean's Key Lime Pie), so the
    // nothing-fits value moved to a fifth-ish one no kitchen glyph names.
    expect(scaled('0.44 cup flour', 0.5)).toBe('0.22 cup flour');
  });

  it('leaves an exact fraction exact', () => {
    expect(scaled('1/3 cup flour', 2)).toBe('⅔ cup flour');
    expect(scaled('3/4 cup sugar', 2)).toBe('1 ½ cups sugar');
    expect(scaled('1 cup milk', 3)).toBe('3 cups milk');
  });
});
