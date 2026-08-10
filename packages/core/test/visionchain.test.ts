import { describe, it, expect } from 'vitest';
import { recipeFromPages, ingredientParts } from '../src/index';

/**
 * The native OCR chain, on the parts this repo can actually run.
 *
 * The string below is Apple Vision's REAL output for a printed test card,
 * captured by running the exact request the native-ocr module makes —
 * .accurate, language correction, and the top-to-bottom sort of the text
 * observations. It is inlined rather than read from disk so the test needs
 * nothing but this file.
 *
 * The join it guards: Vision returns observations in NO guaranteed order,
 * and the module sorts them by bounding box. If that sort were wrong the
 * text would still look plausible line by line while the recipe became
 * nonsense — a failure that reads as a parser bug and is not one. Feeding
 * Vision's own words through the parser the app uses is the only way to see
 * it from here, since nothing in this repo runs Swift.
 */
const VISION_OUTPUT = [
  'Banana Bread',
  'Ingredients',
  '2 cups flour',
  '1 tsp baking soda',
  '1/2 cup butter',
  '3 ripe bananas',
  'Instructions',
  'Preheat oven to 350 F.',
  'Mash the bananas well.',
  'Bake for 60 minutes.'
].join('\n');

describe('a card read by Vision, parsed by core', () => {
  it('keeps the card in reading order and splits it correctly', () => {
    const r = recipeFromPages([VISION_OUTPUT]);
    expect(r.title).toBe('Banana Bread');
    expect(r.ingredients).toEqual(['2 cups flour', '1 tsp baking soda', '½ cup butter', '3 ripe bananas']);
    expect(r.steps).toEqual(['Preheat oven to 350 F.', 'Mash the bananas well.', 'Bake for 60 minutes.']);
  });

  it('every ingredient yields a measure badge', () => {
    const parts = recipeFromPages([VISION_OUTPUT]).ingredients.map(ingredientParts);
    expect(parts.map((p) => p.name)).toEqual(['flour', 'baking soda', 'butter', 'ripe bananas']);
    expect(parts.map((p) => `${p.qty ?? ''} ${p.unit ?? ''}`.trim())).toEqual(['2 cups', '1 tsp', '½ cup', '3']);
  });
});
