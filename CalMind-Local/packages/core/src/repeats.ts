/**
 * Repeats, ported from lib/util.php and pinned by spec/repeats.json. One stored
 * row only: readers expand it over whatever window they draw. Month and year
 * steps keep the day of the month and clamp it (the 31st repeats as the 30th,
 * the 28th…) rather than sliding into the next month.
 */
import type { Repeat, RepeatUnit } from './types';

export const REPEAT_UNITS: readonly RepeatUnit[] = ['day', 'week', 'month', 'year'];
export const REPEAT_MAX = 400; // hard stop so a bad rule can't spin

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const fmt = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// There is deliberately NO repeatClean(unit, n) sanitiser here any more, and
// re-adding one is a mistake worth spelling out, because it looks obviously
// right: repair a malformed rule once at the boundary instead of tolerating
// it on every read.
//
// It would have to run in normalize(), which is where records already get
// repaired. normalize() runs on every refresh (apps/app/src/store.tsx) and
// its edits go back through engine.put(), so a "repair" is a LOCAL WRITE that
// syncs out and lands on every other device.
//
// Now suppose a newer client one day writes { n: 1, unit: 'fortnight' }. This
// build does not know that unit. A sanitiser would rewrite the record to
// something it does understand, put() it, and propagate that over the top of
// the newer client's data — everywhere, silently, with no way back. The
// sanitiser cannot tell "corrupt" from "newer than me"; those are the same
// bytes.
//
// So the guard lives at the READ, in repeatDates() below. It is
// non-destructive: this build draws an unfamiliar rule as a one-off, the
// record survives untouched, and the client that understands it still does.
// Tolerate what you cannot interpret; never overwrite it.

/** The occurrence `i` steps after 'YYYY-MM-DD' start. */
export function repeatStep(start: string, rep: Repeat, i: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const n = rep.n * i;
  if (rep.unit === 'day') return fmt(new Date(Date.UTC(y, m - 1, d + n)));
  if (rep.unit === 'week') return fmt(new Date(Date.UTC(y, m - 1, d + n * 7)));
  const my = rep.unit === 'month' ? m + n : m;
  const yy = rep.unit === 'year' ? y + n : y;
  const first = new Date(Date.UTC(yy, my - 1, 1)); // normalizes month overflow
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, days))));
}

/**
 * Does this rule MOVE? `{ n: 0 }` does not, nor does a unit this build has
 * never met — see the note above on why such a record is tolerated rather
 * than repaired. A negative `n` does not either, since it walks backwards.
 *
 * One predicate, asked by everything that walks a rule, because the two
 * functions below already disagreed once: repeatDates() grew this guard and
 * repeatNext() did not, so a non-advancing repeat DREW correctly as a one-off
 * while its tick rolled it to the day it was already on and left it undone —
 * a row that could not be completed, absorbing taps for ever.
 */
export function repeatAdvances(start: string, rep: Repeat | null): boolean {
  return !!rep && repeatStep(start, rep, 1) > start;
}

/** Every occurrence landing in [from, to]; a one-off is itself when inside. */
export function repeatDates(start: string, rep: Repeat | null, from: string, to: string): string[] {
  if (start === '' || to < from) return [];
  if (!rep) return start >= from && start <= to ? [start] : [];
  // A rule that does not ADVANCE is not a repeat, and the loop below cannot
  // survive one: every step returns `start`, `d > to` never trips, and the
  // same date is pushed REPEAT_MAX times — 400 identical rows on one day, in
  // the panel, the widget and the wrist alike. `{ n: 0 }` and an unrecognised
  // unit both do it. Neither can come from the app (the stepper clamps to
  // 1..999 and the units are pills) nor from the old suite, which stored the
  // same shape — but a record arrives here from sync as well, written by a
  // client this build has never met, and nothing validates it on the way in.
  // This is the whole defence, and it is deliberately at the READ: see the
  // note above on why repairing such a record instead would propagate over a
  // newer client's data.
  if (!repeatAdvances(start, rep)) return start >= from && start <= to ? [start] : [];
  const out: string[] = [];
  for (let i = 0; i < REPEAT_MAX; i++) {
    const d = repeatStep(start, rep, i);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/**
 * The first occurrence strictly after `after` — rolling a ticked repeat
 * forward — or `start` when the rule has no next occurrence to offer.
 *
 * That fallback is NOT an answer, and a caller must not treat it as one:
 * reminderToggle read it as a roll and wrote the reminder back onto the day it
 * was already on, still undone, so the row could never be ticked off. Ask
 * repeatAdvances() first; rules.ts does, and that is where the fix lives.
 *
 * The early return below changes NO result — with it or without it this
 * returns `start`, for every input — so no test can tell the two apart, and
 * none pretends to. It is a fast path that skips 399 pointless date
 * constructions, and it puts the same question in both walkers so they cannot
 * silently disagree again, which is how this bug happened.
 */
export function repeatNext(start: string, rep: Repeat, after: string): string {
  if (!repeatAdvances(start, rep)) return start;
  for (let i = 1; i < REPEAT_MAX; i++) {
    const d = repeatStep(start, rep, i);
    if (d > after) return d;
  }
  return start;
}

/** "Every 2 weeks" / "Every day", for a row's chip. */
export function repeatLabel(rep: Repeat | null): string {
  if (!rep) return '';
  return rep.n === 1 ? `Every ${rep.unit}` : `Every ${rep.n} ${rep.unit}s`;
}
