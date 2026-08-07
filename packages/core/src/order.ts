/**
 * Fractional order keys, so drag order lives ON each record and survives per-item
 * sync — the web suite stored order as array position in a file, which merging
 * per-item cannot preserve. Keys are plain strings compared with <, generated so
 * a key always fits between its neighbours without renumbering anything else.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

/**
 * A key strictly between a and b (null = open end). Walks the common prefix; on
 * adjacent digits it descends a level with the upper bound released. Generated
 * keys always end on a midpoint digit — never DIGITS[0] — which is what keeps
 * the descent from ever needing to squeeze below an exhausted upper bound.
 */
export function ordBetween(a?: string | null, b?: string | null): string {
  const lo = a ?? '';
  let hi = b ?? '';
  if (hi !== '' && lo >= hi) throw new Error(`ordBetween: ${lo} >= ${hi}`);
  let p = '';
  for (let i = 0; ; i++) {
    const da = i < lo.length ? DIGITS.indexOf(lo.charAt(i)) : 0;
    const db = i < hi.length ? DIGITS.indexOf(hi.charAt(i)) : BASE;
    if (db - da > 1) return p + DIGITS.charAt((da + db) >> 1);
    p += DIGITS.charAt(da);
    if (db - da === 1) hi = ''; // adjacent: below db is unbounded above from here
  }
}

/** Keys for n items appended in order onto an empty list. */
export function ordSeq(n: number): string[] {
  const out: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < n; i++) out.push((last = ordBetween(last, null)));
  return out;
}

/** Sort comparator for anything carrying an ord key. */
export function byOrd<T extends { ord: string }>(a: T, b: T): number {
  return a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0;
}
