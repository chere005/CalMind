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
 *
 * THAT LAST SENTENCE IS ONLY TRUE OF KEYS THIS FUNCTION MADE, which is every
 * key the app writes and is pinned by the fuzz in test/ordfuzz.test.ts. It is
 * not true of a key that arrives over sync from a client this build has never
 * met. Given an upper bound ending in DIGITS[0] there is no answer at all —
 * between 'A' and 'A0' no string over this alphabet exists, checked by brute
 * force, because 'A0' is already the smallest thing after 'A'.
 *
 * It used to return one anyway: 'A0V', which sorts AFTER the bound it was
 * asked to stay below. A row dragged above such a neighbour landed somewhere
 * else, and that wrong order was then written and synced to every device, for
 * good. It throws instead — the same way it already refuses lo >= hi — because
 * a drag that visibly fails writes nothing and can be tried again, while a
 * silently wrong order is the kind of loss this project keeps being bitten by.
 */
export function ordBetween(a?: string | null, b?: string | null): string {
  const lo = a ?? '';
  let hi = b ?? '';
  if (hi !== '' && lo >= hi) throw new Error(`ordBetween: ${lo} >= ${hi}`);
  let p = '';
  for (let i = 0; ; i++) {
    // Every step that gets here had db === da, so `p` is `hi` character for
    // character; running past its end means there is no room below it. The
    // adjacent case never reaches this — it releases the bound by setting
    // hi = '' — so this fires only for a bound no descent can fit under.
    if (hi !== '' && i >= hi.length) {
      throw new Error(`ordBetween: no key fits between ${lo || 'the start'} and ${hi}`);
    }
    const da = i < lo.length ? DIGITS.indexOf(lo.charAt(i)) : 0;
    const db = i < hi.length ? DIGITS.indexOf(hi.charAt(i)) : BASE;
    if (db - da > 1) return p + DIGITS.charAt((da + db) >> 1);
    p += DIGITS.charAt(da);
    if (db - da === 1) hi = ''; // adjacent: below db is unbounded above from here
  }
}

/**
 * The bounds for an insertion at index `at`, widened past any run of EQUAL
 * keys so that a gap always exists.
 *
 * Two rows can carry the same key, and not rarely: `ordBetween(null, null)` is
 * deterministic and always answers 'V', so two devices that each add the FIRST
 * row to a section while offline both write 'V'. After a sync the section holds
 * two rows with one key between them. Dragging anything to land there then
 * asked for a key between 'V' and 'V', which threw — unhandled, in the middle
 * of a gesture, with 49 call sites and nothing catching.
 *
 * There is genuinely no key between two equal ones, so the honest answer is to
 * land AFTER the run: rows that share a key have no order between them to
 * respect in the first place. With no duplicates this returns exactly the
 * neighbours it always did.
 */
export function ordGap(sorted: (string | null | undefined)[], at: number): [string | null, string | null] {
  const lo = at > 0 ? sorted[at - 1] ?? null : null;
  let j = at;
  let hi = j < sorted.length ? sorted[j] ?? null : null;
  while (lo !== null && hi !== null && lo >= hi) {
    j += 1;
    hi = j < sorted.length ? sorted[j] ?? null : null;
  }
  return [lo, hi];
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

/**
 * The same order, made TOTAL by falling back to the record id.
 *
 * byOrd alone answers 0 for two rows sharing a key, and Array.sort is stable,
 * so the tie was settled by whatever order the engine happened to hold them
 * in — which is the order each device first saw them. Device A created a row
 * and then received its twin; device B saw them the other way about; and the
 * two drew the SAME account in different orders, for good, with nothing on
 * screen to explain it.
 *
 * Sharing a key is not exotic: ordBetween(null, null) is deterministic and
 * always answers 'V', so two devices adding the FIRST row to a section while
 * offline both write it. See ordGap above, which keeps a drag through such a
 * pair from throwing.
 *
 * The id is the tiebreak because it is the one thing every device already
 * agrees on, it is unique by construction, and it never changes. Where keys
 * differ this is byOrd exactly — the fallback is unreachable.
 */
export function byRecOrd<T extends { id: string; payload: { ord: string } }>(a: T, b: T): number {
  const c = byOrd(a.payload, b.payload);
  if (c !== 0) return c;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
