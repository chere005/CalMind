/**
 * The ordering key's one promise, fuzzed: a key sits strictly between its
 * neighbours, always.
 *
 * Worth fuzzing rather than pinning examples because the failure is silent and
 * permanent — a row lands in the wrong place and that order is written and
 * synced — and because the interesting inputs are the ones nobody thinks to
 * write down: a bound that is a prefix of the other, a gap squeezed five
 * hundred times, a key whose descent has released its upper bound.
 */
import { describe, it, expect } from 'vitest';
import { ordBetween, ordSeq } from '../src/order';

describe('ordBetween fuzz', () => {
  it('every generated key sits strictly between its neighbours, over many random inserts', () => {
    let list = ordSeq(6);
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let step = 0; step < 4000; step++) {
      const at = rnd(list.length + 1);
      const a = at === 0 ? null : list[at - 1]!;
      const b = at === list.length ? null : list[at]!;
      const k = ordBetween(a, b);
      if (a !== null && !(a < k)) throw new Error(`step ${step}: a=${a} not < k=${k}`);
      if (b !== null && !(k < b)) throw new Error(`step ${step}: k=${k} not < b=${b}`);
      list.splice(at, 0, k);
    }
    // And the list is still sorted as a whole.
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
  });

  it('repeated inserts in the SAME gap stay ordered and terminate', () => {
    let lo = ordBetween(null, null);
    let hi = ordBetween(lo, null);
    const made: string[] = [];
    for (let i = 0; i < 500; i++) {
      const k = ordBetween(lo, hi);
      expect(lo < k && k < hi, `i=${i}: ${lo} < ${k} < ${hi}`).toBe(true);
      made.push(k);
      hi = k; // squeeze against the same lower bound
    }
    expect(made[made.length - 1]!.length).toBeLessThan(400);
  });

  it('refuses a bound nothing can fit under, rather than answering wrongly', () => {
    // No string over this alphabet lies between these — 'A0' is already the
    // smallest thing after 'A' — so there is no right answer to give. It used
    // to return 'A0V', which sorts AFTER the bound it was told to stay below.
    expect(() => ordBetween('A', 'A0')).toThrow(/no key fits/);
    expect(() => ordBetween(null, '0')).toThrow(/no key fits/);
    expect(() => ordBetween('A', 'A00')).toThrow(/no key fits/);
  });

  it('…and that refusal never fires for a key this module made', () => {
    // The half that keeps the guard from being a bug of its own. Every bound
    // below comes out of ordBetween itself, which is every ord the app writes,
    // and none of them may trip it.
    let list = ordSeq(4);
    let seed = 777;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let step = 0; step < 3000; step++) {
      const at = rnd(list.length + 1);
      const a = at === 0 ? null : list[at - 1]!;
      const b = at === list.length ? null : list[at]!;
      let k: string;
      try {
        k = ordBetween(a, b);
      } catch (e) {
        throw new Error(`step ${step}: refused a self-made gap ${a} .. ${b} — ${(e as Error).message}`);
      }
      list.splice(at, 0, k);
    }
    expect(list).toEqual([...list].sort());
  });
});
