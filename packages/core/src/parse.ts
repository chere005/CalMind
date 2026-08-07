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

/** Both at once: [cleanedText, date | null, time | null]. Date lifts first, as PHP does. */
export function parseWhenFromText(text: string, today: string): [string, string | null, string | null] {
  const [t1, date] = parseDateFromText(text, today);
  const [t2, time] = parseTimeFromText(t1);
  return [t2, date, time];
}

/** Local 'YYYY-MM-DD' — the `today` every interactive caller passes. */
export function todayStr(d = new Date()): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
