/**
 * The suite's text parser, ported line for line from lib/util.php (the reference)
 * and pinned by spec/parse.json. Slash-only and US-order so it can't wander into
 * other numbers; the documented limit stands — "2/3 cup" reads as Feb 3.
 * `today` is passed in ('YYYY-MM-DD') so every caller is deterministic and testable.
 */

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([apAP])\.?[mM]\.?\b/;
// No lookbehind (older Hermes lacks it): a leading (^|[^\d/]) group stands in for it.
const DATE_RE = /(^|[^\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/;

/** Remove [at, at+len) from text, then collapse doubled spaces — the PHP clean. */
function lift(text: string, at: number, len: number): string {
  return (text.slice(0, at) + text.slice(at + len)).replace(/\s{2,}/g, ' ').trim();
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Pull "2pm" / "2:30 pm" out; returns [cleanedText, 'HH:MM' | null]. */
export function parseTimeFromText(text: string): [string, string | null] {
  const m = TIME_RE.exec(text);
  if (!m) return [text, null];
  let h = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]!.toLowerCase();
  if (h < 1 || h > 12 || min >= 60) return [text, null];
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return [lift(text, m.index, m[0].length), `${pad(h)}:${pad(min)}`];
}

/** Pull m/d, m/d/yy, m/d/yyyy out; bare m/d = next occurrence from `today`. */
export function parseDateFromText(text: string, today: string): [string, string | null] {
  const m = DATE_RE.exec(text);
  if (!m) return [text, null];
  const mo = parseInt(m[2]!, 10);
  const dy = parseInt(m[3]!, 10);
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return [text, null];
  let yr: number;
  if (m[4]) {
    yr = parseInt(m[4], 10) + (m[4].length === 2 ? 2000 : 0);
  } else {
    yr = parseInt(today.slice(0, 4), 10);
    if (`${pad(yr, 4)}-${pad(mo)}-${pad(dy)}` < today) yr++;
  }
  if (!isRealDate(yr, mo, dy)) return [text, null];
  const at = m.index + m[1]!.length; // skip the boundary char the prefix group ate
  return [lift(text, at, m[0].length - m[1]!.length), `${pad(yr, 4)}-${pad(mo)}-${pad(dy)}`];
}

// ── Relative when: the words people actually type ────────────────────────────
//
// Two rules worth stating out loud, because both had a defensible other answer:
//
//  · "1 week" means one week FROM NOW, not the start of next week. "2 months"
//    and "3 days" have no natural "start of" reading, so all spans are the
//    same kind of thing — an offset — rather than one of them being special.
//  · A bare time that has ALREADY PASSED today lands on tomorrow. That is the
//    rule this parser already keeps for a bare m/d ("bare m/d = next
//    occurrence"), so a bare 3pm behaves like a bare 8/3 rather than like a
//    second, contrary convention living in the same box.
//
// Everything is arithmetic on the `today`/`now` the caller passes in, so the
// zone is the caller's business — which is the only way this stays testable,
// and the reason the server now pins America/Chicago rather than drifting on
// UTC. These lift out of the text like every other token here.

const REL_DAY_RE = /\b(yesterday|today|tomorrow)\b/i;
const REL_SPAN_RE = /\b(?:in\s+)?(an?|\d{1,3})\s*(days?|weeks?|wks?|months?|mos?|years?|yrs?)\b/i;
const REL_CLOCK_RE = /\bin\s+(an?|\d{1,3})\s*(hours?|hrs?|minutes?|mins?)\b/i;

const SPAN_UNIT = (raw: string): 'day' | 'week' | 'month' | 'year' => {
  const u = raw.toLowerCase();
  if (u.startsWith('d')) return 'day';
  if (u.startsWith('w')) return 'week';
  if (u.startsWith('y')) return 'year';
  return 'month';
};
const countOf = (raw: string): number => (/^an?$/i.test(raw) ? 1 : parseInt(raw, 10));

/** 'YYYY-MM-DD' shifted. Days anchor at NOON so a DST jump moves the clock and
 *  never the date; months and years clamp the day, as repeats already do —
 *  Jan 31 plus a month is the 28th, not the 3rd of March. */
export function shiftDate(ymd: string, n: number, unit: 'day' | 'week' | 'month' | 'year'): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  if (unit === 'day' || unit === 'week') {
    const dt = new Date(y, m - 1, d + (unit === 'week' ? n * 7 : n), 12);
    return `${pad(dt.getFullYear(), 4)}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  const total = m - 1 + (unit === 'year' ? n * 12 : n);
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${pad(ny, 4)}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

/** A clock reading moved by minutes, carrying the date over midnight. */
function shiftClock(ymd: string, hm: string, addMin: number): [string, string] {
  const [h, mi] = hm.split(':').map(Number) as [number, number];
  const raw = h * 60 + mi + addMin;
  const days = Math.floor(raw / 1440);
  const inDay = ((raw % 1440) + 1440) % 1440;
  return [shiftDate(ymd, days, 'day'), `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}`];
}

/** "tomorrow", "in 2 weeks", "3 days" → [cleanedText, date | null]. */
export function parseRelativeDate(text: string, today: string): [string, string | null] {
  const w = REL_DAY_RE.exec(text);
  if (w) {
    const by = { yesterday: -1, today: 0, tomorrow: 1 }[w[1]!.toLowerCase()] ?? 0;
    return [lift(text, w.index, w[0].length), shiftDate(today, by, 'day')];
  }
  const s = REL_SPAN_RE.exec(text);
  if (!s) return [text, null];
  const n = countOf(s[1]!);
  if (!Number.isFinite(n)) return [text, null];
  return [lift(text, s.index, s[0].length), shiftDate(today, n, SPAN_UNIT(s[2]!))];
}

/** "in an hour", "in 30mins" → [cleanedText, date, time] off the given clock. */
export function parseRelativeClock(
  text: string,
  today: string,
  now: string,
): [string, string | null, string | null] {
  const m = REL_CLOCK_RE.exec(text);
  if (!m) return [text, null, null];
  const n = countOf(m[1]!);
  if (!Number.isFinite(n)) return [text, null, null];
  const mins = /^h/i.test(m[2]!) ? n * 60 : n;
  const [date, time] = shiftClock(today, now, mins);
  return [lift(text, m.index, m[0].length), date, time];
}

/**
 * Both at once: [cleanedText, date | null, time | null]. Date lifts first, as
 * PHP does; the relative forms fill in only what the explicit ones didn't say,
 * so "8/3 tomorrow" keeps the 3rd. `now` ('HH:MM') is what lets a bare time
 * know whether it has already gone by — without it, a bare time simply means
 * today.
 */
export function parseWhenFromText(
  text: string,
  today: string,
  now?: string,
): [string, string | null, string | null] {
  const [t1, date] = parseDateFromText(text, today);
  const [t2, time] = parseTimeFromText(t1);
  let out = t2;
  let d = date;
  let t = time;
  if (t === null) {
    const [t3, rd, rt] = parseRelativeClock(out, today, now ?? '00:00');
    if (rt !== null) {
      out = t3;
      t = rt;
      d ??= rd;
    }
  }
  if (d === null) {
    const [t4, rel] = parseRelativeDate(out, today);
    if (rel !== null) {
      out = t4;
      d = rel;
    }
  }
  // A time always implies a day: the one it still belongs to, or the next.
  if (t !== null && d === null) d = now && t < now ? shiftDate(today, 1, 'day') : today;
  return [out, d, t];
}

/** Local 'HH:MM' — the `now` a caller passes so a bare time can tell whether
 *  it has already gone by. Device-local, like todayStr: on Sean's phone that
 *  IS Chicago, and the server pins Chicago for the answers it gives. */
export function nowStr(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local 'YYYY-MM-DD' — the `today` every interactive caller passes. */
export function todayStr(d = new Date()): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A stored 'HH:MM' back in the suite's spoken style: '3pm', '2:30pm'. */
export function timeLabel(t: string | null | undefined): string {
  if (!t) return '';
  const [h0, m] = t.split(':').map(Number) as [number, number];
  const ap = h0 >= 12 ? 'pm' : 'am';
  const h = h0 % 12 === 0 ? 12 : h0 % 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}
