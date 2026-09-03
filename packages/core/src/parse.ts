/**
 * The suite's text parser, ported line for line from lib/util.php (the reference)
 * and pinned by spec/parse.json. Slash-only and US-order so it can't wander into
 * other numbers; the documented limit stands — "2/3 cup" reads as Feb 3.
 * `today` is passed in ('YYYY-MM-DD') so every caller is deterministic and testable.
 */

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([apAP])\.?[mM]\.?\b/;
// No lookbehind (older Hermes lacks it): a leading (^|[^\d/]) group stands in for it.
const DATE_RE = /(^|[^\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/;

/**
 * Take a span out of the line and close the gap — the PHP clean, plus one
 * departure from it: the word that INTRODUCED the span leaves with it, so
 * "standup at 9am" is a reminder called "standup", not "standup at". The
 * suite's parse_time_from_text does a bare str_replace and left the dangling
 * preposition; that was the reference behaviour until Sean called it
 * (2026-08-18) — date/time tokens are instructions, and the word that hands
 * them in is part of the instruction. spec/parse.json pins the new shape
 * ("Up at 12am" -> "Up"), which is the contract the native cores follow.
 * Only "at" and "on" leave — "by" and "due" carry meaning of their own.
 */
function lift(text: string, at: number, len: number): string {
  const prep = /\b(?:at|on)\s+$/i.exec(text.slice(0, at));
  const start = prep ? at - prep[0].length : at;
  return (text.slice(0, start) + text.slice(at + len)).replace(/\s{2,}/g, ' ').trim();
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * WHICH HALF OF THE DAY A BARE HOUR MEANS — Sean, 2026-09-03: "also allow a
 * specification like 12:30 (which would assume pm) or 5:00 (would assume
 * PM).. 6-8 will assume pm unless specified, then 9-11 will assume am.. 12-5
 * is pm".
 *
 * Nine, ten and eleven are the morning. Everything else — noon through eight —
 * is the afternoon or the evening. It is not a clever rule and it is not meant
 * to be: it is where his hours actually fall, so the common case needs no
 * suffix and the uncommon one says "am" and is believed.
 *
 * 0 and 13–23 are already unambiguous 24-hour times and come back untouched.
 */
const HOURS_ASSUMED_AM = new Set([9, 10, 11]);
export function assumeMeridiem(h: number): number {
  if (h === 0 || h > 12) return h;
  if (HOURS_ASSUMED_AM.has(h)) return h;
  return h === 12 ? 12 : h + 12;
}

/**
 * A time with NO am/pm, in free text. The colon is the whole signal: "12:30"
 * is a clock and a bare "5" is a quantity, a page, an aisle or a count of
 * apples. A dedicated time field can afford to read the lone number, and
 * parseClockField() does — a line of prose cannot.
 */
const BARE_TIME_RE = /\b(\d{1,2}):(\d{2})\b/;

/** Pull "2pm" / "2:30 pm" / "12:30" out; returns [cleanedText, 'HH:MM' | null]. */
export function parseTimeFromText(text: string): [string, string | null] {
  const m = TIME_RE.exec(text);
  if (m) {
    let h = parseInt(m[1]!, 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3]!.toLowerCase();
    if (h < 1 || h > 12 || min >= 60) return [text, null];
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return [lift(text, m.index, m[0].length), `${pad(h)}:${pad(min)}`];
  }
  // Said without a meridiem. The hour picks its own half of the day.
  const b = BARE_TIME_RE.exec(text);
  if (!b) return [text, null];
  const h = parseInt(b[1]!, 10);
  const min = parseInt(b[2]!, 10);
  if (h > 23 || min >= 60) return [text, null];
  return [lift(text, b.index, b[0].length), `${pad(assumeMeridiem(h))}:${pad(min)}`];
}

/**
 * A FIELD WHOSE ONLY JOB IS A TIME — the Add screen's Time and End boxes, the
 * request sheet's. Everything parseTimeFromText reads, plus the lone hour it
 * deliberately will not: "5" here can only mean five o'clock, because there is
 * nothing else the box could be holding. Returns 'HH:MM' or null.
 *
 * It is a second door on purpose. The looser rule must not leak into the add
 * line, where a bare number is usually a number.
 */
export function parseClockField(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  const [, t] = parseTimeFromText(s);
  if (t !== null) return t;
  const m = /^(\d{1,2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  if (h > 23) return null;
  return `${pad(assumeMeridiem(h))}:00`;
}

/**
 * A time RANGE — "9am-10am", "9–10am", "lunch 12-1pm", "3pm to 4:30pm".
 *
 * Sean, 2026-08-20, after the event Copy shipped a line the parser could not
 * read back: "add range parsing to time specifications everywhere". It goes
 * here because here is everywhere — parseWhenFromText is the one door the add
 * line, the section add row, the item sheet, the inline row edit and the
 * shared add all go through.
 *
 * ONE side must say am/pm; the other may lean on it, because that is how
 * people write these. Which side leans is decided by the clock rather than by
 * a rule about word order:
 *
 *   · "12-1pm"  → the start borrows 'pm'. 12pm then 1pm reads forward, so it
 *                 stands.
 *   · "11-1pm"  → borrowing 'pm' would put the start at 23:00 and the end at
 *                 13:00, which runs backwards. The start flips to 11am.
 *   · "11am-1"  → the end borrows 'am' and lands at 01:00, before its own
 *                 start; it flips to 1pm.
 *
 * An end EQUAL to its start gets the same treatment ("12-12pm" is midday to
 * midnight, not a zero-length event) — the flip triggers on `<=`, not `<`.
 *
 * Since 2026-09-03 a range where NEITHER side says am/pm is read too — but
 * only when both sides are written as clock times, minutes and all
 * ("12:30-2:00", "9:00-11:00"). Each hour picks its half of the day through
 * assumeMeridiem(), and the same backwards-flip below still applies.
 *
 * Deliberately still NOT matched: a bare number pair ("9-10", "6-8"). That is
 * a score, a page range, a quantity — and this parser has never read a bare
 * 24-hour time either ("2/3 cup" reads as Feb 3 is the same family of
 * documented limit). Sean, 2026-09-03, choosing between the two: the lone
 * number is a time in the Time and End FIELDS, where it cannot mean anything
 * else, and stays text in a line of prose. parseClockField() is that door.
 */
const RANGE_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*([apAP])?\.?[mM]?\.?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*([apAP])?\.?[mM]?\.?\b/;

const clampHM = (h: number, min: number, ap: 'a' | 'p'): string => {
  let hh = h;
  if (ap === 'p' && hh < 12) hh += 12;
  if (ap === 'a' && hh === 12) hh = 0;
  return `${pad(hh)}:${pad(min)}`;
};

/** Pull a range out; returns [cleanedText, 'HH:MM' | null, 'HH:MM' | null]. */
export function parseTimeRangeFromText(text: string): [string, string | null, string | null] {
  const m = RANGE_RE.exec(text);
  if (!m) return [text, null, null];
  const h1 = parseInt(m[1]!, 10);
  const n1 = m[2] ? parseInt(m[2], 10) : 0;
  const a1 = m[3]?.toLowerCase() as 'a' | 'p' | undefined;
  const h2 = parseInt(m[4]!, 10);
  const n2 = m[5] ? parseInt(m[5], 10) : 0;
  const a2 = m[6]?.toLowerCase() as 'a' | 'p' | undefined;
  // Both bare is a range only when both sides are written as clock times —
  // see the note above. m[2] and m[5] are the two ':MM' groups.
  const bothBare = !a1 && !a2;
  if (bothBare && !(m[2] && m[5])) return [text, null, null];
  // A bare side may be an unambiguous 24-hour hour; a side wearing am/pm may not.
  const lo = bothBare ? 0 : 1;
  const hi = bothBare ? 23 : 12;
  if (h1 < lo || h1 > hi || h2 < lo || h2 > hi || n1 >= 60 || n2 >= 60) return [text, null, null];

  let start: string;
  let end: string;
  if (bothBare) {
    start = `${pad(assumeMeridiem(h1))}:${pad(n1)}`;
    end = `${pad(assumeMeridiem(h2))}:${pad(n2)}`;
    // The same flip the borrowing branches make: a range that reads backwards
    // is not what was meant, so the END moves to the other half of the day.
    // "1:00-11:00" is one in the afternoon until eleven at night.
    if (end <= start && h2 >= 1 && h2 <= 12) {
      end = clampHM(h2 % 12 === 0 ? 12 : h2 % 12, n2, assumeMeridiem(h2) >= 12 ? 'a' : 'p');
    }
  } else if (a1 && a2) {
    start = clampHM(h1, n1, a1);
    end = clampHM(h2, n2, a2);
  } else if (a2) {
    // The start leans on the end, and flips if that reads backwards.
    end = clampHM(h2, n2, a2);
    start = clampHM(h1, n1, a2);
    if (start >= end) start = clampHM(h1, n1, a2 === 'p' ? 'a' : 'p');
  } else {
    end = clampHM(h2, n2, a1!);
    start = clampHM(h1, n1, a1!);
    if (end <= start) end = clampHM(h2, n2, a1 === 'p' ? 'a' : 'p');
  }
  return [lift(text, m.index, m[0].length), start, end];
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
// Weekday names, full and short — Sean's ask, 2026-08-18. Before this,
// "party on saturday at 8pm" landed on TODAY with the time honoured and the
// day silently dropped, which was the surprising half of the old behaviour
// (TODO §1 had it measured). The short forms are real words too — "she sat
// down" — but this is a quick-add box, not prose, and Sean asked for the
// shorthand by name. Next occurrence, and a weekday naming today stays
// today, exactly the bare-m/d rule.
const WEEKDAY_RE =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday|s)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?)\b/i;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const SPAN_UNIT = (raw: string): 'day' | 'week' | 'month' | 'year' => {
  const u = raw.toLowerCase();
  if (u.startsWith('d')) return 'day';
  if (u.startsWith('w')) return 'week';
  if (u.startsWith('y')) return 'year';
  return 'month';
};
const countOf = (raw: string): number => (/^an?$/i.test(raw) ? 1 : parseInt(raw, 10));

/**
 * 'YYYY-MM-DD' shifted. Days anchor at NOON so a DST jump moves the clock and
 * never the date; months and years clamp the day, as repeats already do — Jan
 * 31 plus a month is the 28th, not the 3rd of March.
 *
 * `n` IS SIGNED, and the backwards direction is pinned in
 * test/shiftback.test.ts. Nothing reaches it today — the parser's span regex
 * takes no minus and "yesterday" is a day — but the two lines that make it
 * work are easy to write plausibly and wrongly: `Math.trunc` for `Math.floor`
 * leaves the year where it was, and dropping the `+12` normalisation gives a
 * month of 0 or less. Both were mutation-tested and neither was watched.
 *
 * The NOON anchor stays untested and deliberately so. It matters only where
 * local midnight does not exist — a few zones shift the clock at 00:00 — and
 * the suite runs in America/Chicago, where midnight always exists, so no
 * assertion here can tell the two apart. Removing it changes nothing that can
 * be observed from this machine; it is still right.
 */
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

/** "tomorrow", "friday", "in 2 weeks", "3 days" → [cleanedText, date | null]. */
export function parseRelativeDate(text: string, today: string): [string, string | null] {
  const w = REL_DAY_RE.exec(text);
  if (w) {
    const by = { yesterday: -1, today: 0, tomorrow: 1 }[w[1]!.toLowerCase()] ?? 0;
    return [lift(text, w.index, w[0].length), shiftDate(today, by, 'day')];
  }
  const wd = WEEKDAY_RE.exec(text);
  if (wd) {
    const dow = WEEKDAYS.indexOf(wd[1]!.slice(0, 3).toLowerCase());
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const ahead = (dow - new Date(y, m - 1, d, 12).getDay() + 7) % 7;
    return [lift(text, wd.index, wd[0].length), shiftDate(today, ahead, 'day')];
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
 * What a DATE FIELD accepts: the explicit m/d first, then the relative words.
 * The little "m/d" box beside the title sits next to a text field that now
 * understands "tomorrow" and "in 2 weeks", and a box that refused the words
 * its neighbour accepts is the kind of seam a person walks straight into.
 * Returns just the date — a field has no title to clean.
 */
export function parseDateField(text: string, today: string): string | null {
  const raw = text.trim();
  if (raw === '') return null;
  const [, explicit] = parseDateFromText(raw, today);
  if (explicit) return explicit;
  const [, relative] = parseRelativeDate(raw, today);
  return relative;
}

/**
 * Both at once: [cleanedText, date | null, time | null]. Date lifts first, as
 * PHP does; the relative forms fill in only what the explicit ones didn't say,
 * so "8/3 tomorrow" keeps the 3rd. `now` ('HH:MM') is what lets a bare time
 * know whether it has already gone by — without it, a bare time simply means
 * today.
 *
 * `lift` is the manual-beats-parsed rule (Sean, 2026-08-18: "if the date or
 * time was manually chosen, that is the winner and text is left alone").
 * A category switched OFF is neither lifted NOR read: the token stays in the
 * text — it was not used, and a title stripped of a date that lost would be
 * lying about where the date came from. Both default ON, which is every
 * caller that predates the rule.
 */
/**
 * The escape hatch, app-wide (Sean, 2026-08-20: "anything can always be
 * escaped with a \ to not be caught in the parser"): a backslash protects
 * the token after it from every matcher, so "\2pm" survives as the literal
 * text "2pm" in the title, un-lifted, on ANY field that reads dates and
 * times out of a line. It lives HERE because parseWhenFromText is the one
 * door those fields all go through — the add line, the section add row, the
 * item sheet, the inline row edit, the shared add — so no screen ever
 * handles a backslash itself. The token hides behind a NUL-fenced sentinel
 * (untypeable, and no date or time pattern crosses it), is parsed around,
 * and comes back without its backslash.
 */
function protectEscapes(text: string): [string, string[]] {
  const held: string[] = [];
  const out = text.replace(/\\(\S+)/g, (_, tok: string) => {
    held.push(tok);
    return `\u0000${held.length - 1}\u0000`;
  });
  return [out, held];
}

function restoreEscapes(text: string, held: string[]): string {
  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? '');
}

export function parseWhenFromText(
  text: string,
  today: string,
  now?: string,
  lift: { date?: boolean; time?: boolean } = {},
): [string, string | null, string | null, string | null] {
  const liftDate = lift.date ?? true;
  const liftTime = lift.time ?? true;
  const [protectedText, held] = protectEscapes(text);
  let out = protectedText;
  let d: string | null = null;
  let t: string | null = null;
  let e: string | null = null;
  if (liftDate) {
    const [t1, date] = parseDateFromText(out, today);
    out = t1;
    d = date;
  }
  if (liftTime) {
    // The RANGE first, and it has to be: TIME_RE would take "9am" out of
    // "9am–10am" and leave "–10am" sitting in the title, which is exactly the
    // bug the event Copy ran into.
    const [tr, rStart, rEnd] = parseTimeRangeFromText(out);
    if (rStart !== null) {
      out = tr;
      t = rStart;
      e = rEnd;
    }
    const [t2, time] = t === null ? parseTimeFromText(out) : [out, t];
    out = t2;
    t = time;
    if (t === null) {
      const [t3, rd, rt] = parseRelativeClock(out, today, now ?? '00:00');
      if (rt !== null) {
        out = t3;
        t = rt;
        if (liftDate) d ??= rd;
      }
    }
  }
  if (liftDate && d === null) {
    const [t4, rel] = parseRelativeDate(out, today);
    if (rel !== null) {
      out = t4;
      d = rel;
    }
  }
  // A time always implies a day: the one it still belongs to, or the next —
  // unless the day is not this parser's to say (lift.date off means the
  // caller holds a manual date that outranks any implication).
  if (liftDate && t !== null && d === null) d = now && t < now ? shiftDate(today, 1, 'day') : today;
  // A FOURTH element, appended rather than inserted: every existing caller
  // destructures three and is untouched by this. Only the kinds that HAVE an
  // end (events) reach for it — a reminder has no end field, and the range
  // still earns its keep there by taking both tokens out of the title.
  return [restoreEscapes(out, held), d, t, e];
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

/**
 * 'HH:MM' moved by minutes, wrapping at midnight — the "+1 hour" an event's
 * end time presumes. The DATE deliberately does not move: an event ending in
 * the small hours still belongs to the day it started.
 */
export function timePlus(hm: string, addMin: number): string {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  const t = (((h * 60 + m + addMin) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** '3pm–4:30pm' when there is an end, '3pm' when there is not, '' bare. */
export function timeRangeLabel(t: string | null | undefined, end: string | null | undefined, clock24 = false): string {
  const a = timeLabel(t, clock24);
  if (!a) return '';
  const b = end ? timeLabel(end, clock24) : '';
  return b ? `${a}–${b}` : a;
}

/** A stored 'HH:MM' back in the suite's spoken style: '3pm', '2:30pm'. */
export function timeLabel(t: string | null | undefined, clock24 = false): string {
  if (!t) return '';
  const [h0, m] = t.split(':').map(Number) as [number, number];
  // 24-hour keeps the leading zero and the minutes ALWAYS: '09:00', not '9'.
  // Dropping ':00' is a 12-hour habit — "9" on a 24-hour clock reads like a
  // number, not a time.
  if (clock24) return `${String(h0).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ap = h0 >= 12 ? 'pm' : 'am';
  const h = h0 % 12 === 0 ? 12 : h0 % 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

/**
 * The default name a brand-new note wears: 'Aug 9, 2026 at 3:04pm'.
 *
 * A note made by + used to arrive with an empty title and sit blank in the
 * list until you named it. Sean's call: give it the date and time, and select
 * the whole thing when the field takes focus, so typing replaces it and doing
 * nothing still leaves something readable.
 *
 * Built from the same pieces the rest of the app speaks — timeLabel's spoken
 * style, not a locale format that would drift between web and native.
 */
export function defaultNoteTitle(d = new Date()): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${timeLabel(nowStr(d))}`;
}

/**
 * Does this title look like one defaultNoteTitle wrote?
 *
 * Needed because the default title IS a date, and the title field parses
 * dates out of names ('Dentist 8/3' lands on the calendar). Comparing to
 * defaultNoteTitle() cannot work — the note was named minutes ago and the
 * clock has moved — so match the shape instead. A note nobody renamed must
 * not end up on the calendar for the crime of being created.
 */
export function looksLikeDefaultNoteTitle(s: string): boolean {
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4} at \d{1,2}(:\d{2})?(am|pm)$/.test(s.trim());
}
