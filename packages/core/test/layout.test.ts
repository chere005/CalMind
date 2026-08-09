/**
 * The legend's line breaking: fewest lines first, then the evenest split.
 */
import { describe, it, expect } from 'vitest';
import { balanceLines, groupedLines, minLines } from '../src/layout';

/** The shape of a split, as item counts per line — easier to read than ranges. */
const counts = (widths: number[], max: number, gap = 10) =>
  balanceLines(widths, max, gap).map(([i, j]) => j - i);

describe('balanceLines — Sean\'s rule for the legend', () => {
  it('everything on one line when it fits', () => {
    expect(counts([50, 50, 50], 400)).toEqual([3]);
  });

  it('never spends a line it does not have to', () => {
    // Five 100s with 10 gaps need 540 > 500, so two lines — and no more.
    expect(minLines([100, 100, 100, 100, 100], 500, 10)).toBe(2);
    expect(counts([100, 100, 100, 100, 100], 500).length).toBe(2);
  });

  it('splits five into three and two, not four and one', () => {
    // The orphan Sean saw: greedy crams line one and strands the remainder.
    expect(counts([100, 100, 100, 100, 100], 500)).toEqual([3, 2]);
  });

  it('balances by WIDTH, not by count', () => {
    // One fat chip and four thin ones: the fat one earns a shorter line.
    const split = counts([300, 60, 60, 60, 60], 400);
    expect(split.reduce((a, b) => a + b)).toBe(5);
    expect(split.length).toBe(2);
    expect(split[0]).toBe(1); // the 300 can only take itself on line one
  });

  it('keeps the given order, so related chips stay together', () => {
    const ranges = balanceLines([100, 100, 100, 100, 100], 500, 10);
    expect(ranges).toEqual([[0, 3], [3, 5]]);
  });

  it('an item wider than the line gets a line of its own instead of hanging', () => {
    const ranges = balanceLines([900, 100, 100], 400, 10);
    expect(ranges[0]).toEqual([0, 1]);
    expect(ranges.length).toBe(2);
  });

  it('holds at other widths and other counts', () => {
    // Seven equal chips across three lines come out 3/2/2 — never 3/3/1.
    const split = counts([100, 100, 100, 100, 100, 100, 100], 330);
    expect(split.length).toBe(3);
    expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
    // And nothing is lost or duplicated, at any width.
    for (const max of [120, 250, 400, 700, 1000]) {
      const r = balanceLines([80, 120, 60, 200, 90, 140], max, 8);
      expect(r[0]![0]).toBe(0);
      expect(r[r.length - 1]![1]).toBe(6);
      for (let k = 1; k < r.length; k++) expect(r[k]![0]).toBe(r[k - 1]![1]);
    }
  });

  it('filtering the legend down collapses two lines back into one', () => {
    // The legend only lists what actually occurs in the view, so paging to a
    // quieter month drops chips. Once they fit, the second line goes away —
    // the layout must follow the filter, not keep yesterday's shape.
    const five = [100, 100, 100, 100, 100];
    expect(counts(five, 500)).toEqual([3, 2]);
    expect(counts(five.slice(0, 3), 500)).toEqual([3]); // two dropped → one line
  });

  it('empty stays empty', () => {
    expect(balanceLines([], 400, 10)).toEqual([]);
  });
});

describe('groupedLines — the kind-aware legend split', () => {
  const gl = (w: number[], max: number, g: number[]) => groupedLines(w, max, 10, g);

  it('everything that fits one line stays one line, kinds or not', () => {
    expect(gl([100, 100, 100], 400, [0, 1, 2])).toEqual([[0, 3]]);
  });

  it('a forced wrap breaks on the kind boundary, not the balance point', () => {
    // Four chips, two kinds. balanceLines would go 2+2 through the middle of
    // a kind; the kind split is 1+3.
    expect(gl([100, 100, 100, 100], 350, [0, 1, 1, 1])).toEqual([[0, 1], [1, 4]]);
  });

  it('a kind that alone overflows balances within itself', () => {
    // Kind 1 has five chips that cannot fit its line: 3+2, never 4+1.
    expect(gl([100, 100, 100, 100, 100, 100], 340, [0, 1, 1, 1, 1, 1]))
      .toEqual([[0, 1], [1, 4], [4, 6]]);
  });

  it('empty stays empty', () => {
    expect(gl([], 400, [])).toEqual([]);
  });
});
