import { describe, expect, it } from 'vitest';
import { shoppingLines } from '../src/shopping';

const r = (title: string, ingredients: string[]) => ({ title, ingredients });

describe('a shopping list out of chosen recipes', () => {
  it('adds up the same thing in the same unit', () => {
    expect(shoppingLines([
      r('Cake', ['2 cups flour', '1 cup sugar']),
      r('Bread', ['3 cups flour']),
    ])).toEqual(['5 cups flour', '1 cup sugar']);
  });

  it('says cup at one and cups above it', () => {
    expect(shoppingLines([r('a', ['1/2 cup milk']), r('b', ['1/4 cup milk'])])).toEqual(['¾ cup milk']);
    expect(shoppingLines([r('a', ['1/2 cup milk']), r('b', ['1 cup milk'])])).toEqual(['1 ½ cups milk']);
  });

  it('keeps different units apart rather than inventing a conversion', () => {
    // A density for butter is not core's to choose, and a list that quietly
    // makes one up is worse than one that repeats itself.
    expect(shoppingLines([
      r('a', ['1 cup butter']),
      r('b', ['2 tbsp butter']),
    ])).toEqual(['1 cup butter', '2 tbsp butter']);
  });

  it('counts unitless things', () => {
    expect(shoppingLines([r('a', ['2 large eggs']), r('b', ['3 large eggs'])])).toEqual(['5 large eggs']);
  });

  it('collapses a repeated ingredient that carries no quantity', () => {
    expect(shoppingLines([
      r('a', ['salt to taste']),
      r('b', ['salt to taste']),
    ])).toEqual(['salt to taste']);
  });

  it('drops the cook’s subheaders — they are not things to buy', () => {
    expect(shoppingLines([r('a', ['For the béchamel:', '2 cups milk'])])).toEqual(['2 cups milk']);
  });

  it('leaves a RANGE alone rather than putting a number on it nobody wrote', () => {
    const out = shoppingLines([r('a', ['2-3 cloves garlic']), r('b', ['4 cloves garlic'])]);
    expect(out).toEqual(['2-3 cloves garlic']);
  });

  it('keeps the order the recipes were picked in', () => {
    expect(shoppingLines([
      r('a', ['1 onion', '1 cup rice']),
      r('b', ['1 lemon']),
    ])).toEqual(['1 onion', '1 cup rice', '1 lemon']);
  });

  it('is empty for nothing, and for a recipe with no ingredients', () => {
    expect(shoppingLines([])).toEqual([]);
    expect(shoppingLines([r('a', [])])).toEqual([]);
    expect(shoppingLines([r('a', ['   '])])).toEqual([]);
  });
});
