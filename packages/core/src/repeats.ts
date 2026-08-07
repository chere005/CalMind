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

/** A rule from loose input, or null when there isn't one. */
export function repeatClean(unit: unknown, n: unknown): Repeat | null {
  if (!REPEAT_UNITS.includes(unit as RepeatUnit)) return null;
  const count = Math.min(999, Math.max(1, Math.trunc(Number(n) || 1)));
  return { n: count, unit: unit as RepeatUnit };
}

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

/** Every occurrence landing in [from, to]; a one-off is itself when inside. */
export function repeatDates(start: string, rep: Repeat | null, from: string, to: string): string[] {
  if (start === '' || to < from) return [];
  if (!rep) return start >= from && start <= to ? [start] : [];
  const out: string[] = [];
  for (let i = 0; i < REPEAT_MAX; i++) {
    const d = repeatStep(start, rep, i);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** The first occurrence strictly after `after` — rolling a ticked repeat forward. */
export function repeatNext(start: string, rep: Repeat, after: string): string {
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
