/**
 * byRecOrd is byOrd wherever the keys differ.
 *
 * That claim carried a 66-site sweep — every `sort((a, b) => byOrd(a.payload,
 * b.payload))` in core and the app became `sort(byRecOrd)` — on the argument
 * that no existing order could move, because the id fallback is unreachable
 * unless two keys are equal. The argument is sound and it was not tested,
 * which is the kind of thing this session has been finding in other people's
 * work all day.
 *
 * If it were wrong the damage would be quiet and everywhere: every list in the
 * app reordered slightly, with nothing to point at.
 */
import { describe, it, expect } from 'vitest';
import { byOrd, byRecOrd, ordSeq } from '../src/index';

type Row = { id: string; payload: { ord: string } };

describe('the id fallback is unreachable while keys are distinct', () => {
  it('over two thousand shuffled lists of unique keys', () => {
    let seed = 20260811;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 2000; t++) {
      const n = 1 + rnd(12);
      const keys = ordSeq(n);
      // Ids deliberately in the OPPOSITE order to the keys, so a fallback that
      // fired would visibly reverse the list rather than coincidentally agree.
      const rows: Row[] = keys.map((ord, i) => ({ id: `z${String(n - i).padStart(3, '0')}`, payload: { ord } }));
      for (let k = rows.length - 1; k > 0; k--) {
        const j = rnd(k + 1);
        [rows[k], rows[j]] = [rows[j]!, rows[k]!];
      }
      const byOld = [...rows].sort((a, b) => byOrd(a.payload, b.payload)).map((r) => r.id);
      const byNew = [...rows].sort(byRecOrd).map((r) => r.id);
      expect(byNew, `n=${n}`).toEqual(byOld);
    }
  });

  it('and the comparator itself agrees on every distinct pair', () => {
    const keys = ordSeq(40);
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        if (i === j) continue;
        const a: Row = { id: 'zzz', payload: { ord: keys[i]! } };
        const b: Row = { id: 'aaa', payload: { ord: keys[j]! } };
        // ids are deliberately the wrong way round; only the key may decide.
        expect(Math.sign(byRecOrd(a, b))).toBe(Math.sign(byOrd(a.payload, b.payload)));
      }
    }
  });

  it('…and differs ONLY when the keys are equal', () => {
    const a: Row = { id: 'aaa', payload: { ord: 'V' } };
    const b: Row = { id: 'zzz', payload: { ord: 'V' } };
    expect(byOrd(a.payload, b.payload)).toBe(0);
    expect(byRecOrd(a, b)).toBeLessThan(0);
    expect(byRecOrd(b, a)).toBeGreaterThan(0);
    expect(byRecOrd(a, a)).toBe(0);
  });
});
