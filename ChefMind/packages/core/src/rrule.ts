/**
 * Recurrence rules, expanded over a window.
 *
 * This is the other half of reading someone else's calendar: a weekly
 * stand-up arrives as one VEVENT and has to become a row on nine different
 * days. Only the shapes calendars actually emit are handled, and anything
 * unrecognised expands to the single starting date rather than to nothing —
 * an event in the wrong pattern is a complaint, an event that vanished is a
 * missed appointment.
 *
 * One rule from RFC 5545 is worth stating because it is the opposite of what
 * date arithmetic normally does: an invalid date is SKIPPED, not clamped.
 * Monthly on the 31st happens seven times a year, not twelve, and a February
 * meeting that silently moved to the 28th would be wrong in a way nobody
 * notices until they miss it.
 */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Rrule = {
  freq: Freq;
  interval: number;
  count: number | null;
  until: string | null;          // YYYY-MM-DD, inclusive
  byday: string[];               // 'MO' | '3FR' | '-1FR'
  bymonthday: number[];          // negative counts from the end
  wkst: string;
};

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const partsOf = (s: string) => s.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 0 = Sunday. Noon-anchored so no zone can push it onto the day before. */
export function dayOfWeek(ymd: string): number {
  const [y, m, d] = partsOf(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

const addDays = (ymd: string, n: number): string => {
  const [y, m, d] = partsOf(ymd);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + n);
  return ymdOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

export function parseRrule(s: string): Rrule | null {
  const out: Rrule = {
    freq: 'DAILY', interval: 1, count: null, until: null,
    byday: [], bymonthday: [], wkst: 'MO',
  };
  let sawFreq = false;
  for (const part of s.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toUpperCase();
    const v = part.slice(eq + 1).trim();
    switch (k) {
      case 'FREQ':
        if (v.toUpperCase() === 'DAILY' || v.toUpperCase() === 'WEEKLY'
          || v.toUpperCase() === 'MONTHLY' || v.toUpperCase() === 'YEARLY') {
          out.freq = v.toUpperCase() as Freq;
          sawFreq = true;
        }
        break;
      case 'INTERVAL': out.interval = Math.max(1, Number(v) || 1); break;
      case 'COUNT': out.count = Math.max(0, Number(v) || 0); break;
      case 'UNTIL': {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
        if (m) out.until = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
      case 'BYDAY': out.byday = v.toUpperCase().split(',').map((x) => x.trim()).filter(Boolean); break;
      case 'BYMONTHDAY':
        out.bymonthday = v.split(',').map((x) => Number(x.trim())).filter((n) => n !== 0 && !Number.isNaN(n));
        break;
      case 'WKST': out.wkst = v.toUpperCase(); break;
      default: break;
    }
  }
  return sawFreq ? out : null;
}

/** '3FR' → { nth: 3, day: 5 }; 'FR' → { nth: 0, day: 5 }; '-1FR' → { nth: -1 }. */
function splitByday(token: string): { nth: number; day: number } | null {
  const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(token);
  if (!m) return null;
  const day = DAYS.indexOf(m[2]!);
  return day < 0 ? null : { nth: m[1] ? Number(m[1]) : 0, day };
}

/** Every date in the month matching a BYDAY token, in order. */
function monthByday(y: number, m: number, token: string): string[] {
  const spec = splitByday(token);
  if (!spec) return [];
  const all: string[] = [];
  const last = daysInMonth(y, m);
  for (let d = 1; d <= last; d++) {
    const s = ymdOf(y, m, d);
    if (dayOfWeek(s) === spec.day) all.push(s);
  }
  if (spec.nth === 0) return all;
  const i = spec.nth > 0 ? spec.nth - 1 : all.length + spec.nth;
  return i >= 0 && i < all.length ? [all[i]!] : [];
}

function monthDays(y: number, m: number, nums: number[]): string[] {
  const last = daysInMonth(y, m);
  const out: string[] = [];
  for (const n of nums) {
    const d = n > 0 ? n : last + n + 1;
    // Skipped, never clamped: monthly on the 31st simply does not happen in
    // a 30-day month.
    if (d >= 1 && d <= last) out.push(ymdOf(y, m, d));
  }
  return out;
}

/**
 * Occurrence dates between `from` and `to` inclusive. `cap` stops a malformed
 * rule from running forever; it bounds emitted dates, not iterations.
 */
export function expandRrule(
  start: string,
  rrule: string | null,
  exdates: string[] = [],
  from = '0000-01-01',
  to = '9999-12-31',
  cap = 1000,
): string[] {
  const skip = new Set(exdates);
  const keep = (d: string) => d >= from && d <= to && !skip.has(d);
  const r = rrule ? parseRrule(rrule) : null;
  if (!r) return keep(start) ? [start] : [];

  const out: string[] = [];
  let emitted = 0;               // counts toward COUNT, including before `from`
  const stop = () => (r.count !== null && emitted >= r.count) || out.length >= cap;
  const take = (d: string): void => {
    if (d < start) return;
    if (r.until && d > r.until) return;
    if (r.count !== null && emitted >= r.count) return;
    emitted++;
    if (keep(d)) out.push(d);
  };

  const [sy, sm, sd] = partsOf(start);

  if (r.freq === 'DAILY') {
    for (let d = start, guard = 0; d <= to && !stop() && guard < 40_000; d = addDays(d, r.interval), guard++) {
      take(d);
      if (r.until && d > r.until) break;
    }
    return out;
  }

  if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? r.byday.map(splitByday).filter(Boolean) as { day: number }[]
      : [{ day: dayOfWeek(start) }];
    // Weeks are counted from the one containing DTSTART, using WKST — which
    // only matters once INTERVAL is above 1, and then it decides which days
    // fall in the same 'week' as the start.
    const wkstIdx = Math.max(0, DAYS.indexOf(r.wkst));
    const back = (dayOfWeek(start) - wkstIdx + 7) % 7;
    let weekStart = addDays(start, -back);
    for (let guard = 0; guard < 6_000 && !stop(); guard++) {
      const week = days.map((d) => addDays(weekStart, (d.day - wkstIdx + 7) % 7)).sort();
      for (const d of week) take(d);
      weekStart = addDays(weekStart, 7 * r.interval);
      if (weekStart > to) break;
      if (r.until && weekStart > r.until) break;
    }
    return out;
  }

  // MONTHLY and YEARLY share their shape: step whole months or years, then
  // pick days inside the period.
  const stepMonths = r.freq === 'MONTHLY' ? r.interval : r.interval * 12;
  for (let i = 0, guard = 0; guard < 4_000 && !stop(); i++, guard++) {
    const total = (sy * 12 + (sm - 1)) + i * stepMonths;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    let days: string[];
    if (r.byday.length) {
      days = r.byday.flatMap((t) => monthByday(y, m, t)).sort();
    } else if (r.bymonthday.length) {
      days = monthDays(y, m, r.bymonthday);
    } else if (r.freq === 'YEARLY') {
      days = monthDays(y, m, [sd]);   // 29 Feb simply skips a common year
    } else {
      days = monthDays(y, m, [sd]);
    }
    for (const d of days) take(d);
    if (ymdOf(y, m, 1) > to) break;
    if (r.until && ymdOf(y, m, 1) > r.until) break;
  }
  return out;
}
