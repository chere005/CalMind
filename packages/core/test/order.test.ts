import { describe, it, expect } from 'vitest';
import { ordBetween, ordSeq } from '../src/order';

describe('fractional order keys', () => {
  it('a fresh key sits between open ends', () => {
    const k = ordBetween(null, null);
    expect(k.length).toBe(1);
  });

  it('appending yields strictly ascending keys', () => {
    const keys = ordSeq(100);
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
  });

  it('a key always fits between adjacent neighbours, repeatedly', () => {
    // Hammer the tightest spot: keep inserting at the same gap 200 times.
    let lo = ordBetween(null, null);
    const hi = ordBetween(lo, null);
    for (let i = 0; i < 200; i++) {
      const mid = ordBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      lo = mid;
    }
  });

  it('random insertions keep the list ordered', () => {
    const keys = [ordBetween(null, null)];
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(Math.random() * (keys.length + 1));
      const lo = at > 0 ? keys[at - 1]! : null;
      const hi = at < keys.length ? keys[at]! : null;
      keys.splice(at, 0, ordBetween(lo, hi));
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
  });

  it('refuses an inverted range', () => {
    expect(() => ordBetween('b', 'a')).toThrow();
  });
});
