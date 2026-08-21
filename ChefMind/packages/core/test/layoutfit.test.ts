/**
 * A line the balancer emits must actually FIT.
 *
 * `cost()` scores a line by its leftover squared, through
 * `Math.max(0, max - s)` — so a line that overflows scores ZERO, the cheapest
 * there is, and the search would rather overflow than leave any gap. The one
 * line stopping that is `if (s > max && j - i > 1) return Infinity`, and
 * mutation showed nothing was watching it: deleting it turned nothing red.
 *
 * Ten hand-picked inputs did not tell the two apart either. What did was
 * running the same random search against both — the real code never emits an
 * overflowing multi-item line in twenty thousand tries, and without the guard
 * it does so readily. So the property is the test, and one of the inputs the
 * search turned up is pinned beside it.
 *
 * What overflow looks like on screen is the calendar legend running past its
 * own edge, which is a thing you notice and cannot explain.
 */
import { describe, it, expect } from 'vitest';
import { balanceLines, minLines } from '../src/index';

const span = (w: number[], gap: number, i: number, j: number) =>
  w.slice(i, j).reduce((a, b) => a + b, 0) + gap * Math.max(0, j - i - 1);

describe('balanceLines never overflows a line it could have split', () => {
  it('over four thousand random layouts', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 4000; t++) {
      const n = 2 + rnd(6);
      const w = Array.from({ length: n }, () => 5 + rnd(120));
      const max = 40 + rnd(160);
      const gap = rnd(12);
      const out = balanceLines(w, max, gap);
      for (const [i, j] of out) {
        if (j - i > 1) {
          expect(
            span(w, gap, i, j),
            `w=${JSON.stringify(w)} max=${max} gap=${gap} put ${j - i} items on one line: ${JSON.stringify(out)}`,
          ).toBeLessThanOrEqual(max);
        }
      }
      // And it still covers every item exactly once, in order — a balancer
      // that dropped items would satisfy the check above perfectly.
      expect(out[0]![0]).toBe(0);
      expect(out[out.length - 1]![1]).toBe(n);
      for (let k = 1; k < out.length; k++) expect(out[k]![0]).toBe(out[k - 1]![1]);
      // …and uses no more lines than necessary.
      expect(out.length).toBe(minLines(w, max, gap));
    }
  });

  it('the case the search found, pinned', () => {
    // Without the guard this answers [[0,2],…] — 5 + 117 = 122 on a line of 104.
    const w = [5, 117, 21, 101, 45, 21];
    const out = balanceLines(w, 104, 0);
    expect(out[0]).toEqual([0, 1]);
    for (const [i, j] of out) if (j - i > 1) expect(span(w, 0, i, j)).toBeLessThanOrEqual(104);
  });

  it('a single item wider than the line is still allowed — it has nowhere to go', () => {
    expect(balanceLines([150, 20], 100, 8)).toEqual([[0, 1], [1, 2]]);
  });
});
