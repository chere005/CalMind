/**
 * Behavior that screens kept re-implementing, promoted into core — the repo
 * rule is that a rule living in a screen is a bug even when it renders
 * correctly. Ported from the suite and pinned by tests.
 */
import type { AnyRec, Event, Rec, Reminder } from './types';
import { repeatAdvances, repeatNext } from './repeats';
import { parseDateFromText, parseWhenFromText, timeLabel, timeRangeLabel } from './parse';

/**
 * Ticking a reminder: a repeating, dated, open reminder rolls its due date to
 * the next occurrence instead of finishing the series. The roll lands strictly
 * after max(due, today) — the suite's rule — so ticking an OVERDUE repeat jumps
 * past today rather than crawling occurrence by occurrence through the past.
 * Everything else toggles done. A rolling tick never sets done.
 *
 * …and a rule that cannot ADVANCE is not a series, so it finishes like any
 * one-off. Without that it rolled to the date it was already on and stayed
 * undone: a row that could not be ticked off, in the app, the widget and the
 * wrist alike, absorbing taps for ever. repeatDates() has always drawn such a
 * rule as a one-off; this is the same question asked on the tick path, which
 * is the half that was missed.
 */
export function reminderToggle(p: Reminder, today: string): Reminder {
  if (p.repeat && p.due && !p.done && repeatAdvances(p.due, p.repeat)) {
    return { ...p, due: repeatNext(p.due, p.repeat, p.due > today ? p.due : today) };
  }
  return { ...p, done: !p.done };
}

/**
 * A folder never holds two same-named sections, compared case-insensitively —
 * the suite's rule. Items reference sections by id now, so duplicates wouldn't
 * lose data any more, but two "General"s in one folder still read as a bug.
 */
export function sectionNameTaken(recs: AnyRec[], folderId: string, name: string): boolean {
  const want = name.trim().toLowerCase();
  return recs.some(
    (r) =>
      r.type === 'section' &&
      !r.deleted &&
      (r as Rec<'section'>).payload.folderId === folderId &&
      (r as Rec<'section'>).payload.name.trim().toLowerCase() === want,
  );
}

/**
 * Retyping a reminder's row reads the same way as typing a new one — the
 * suite's inline-edit rule, verbatim from reminders/index.php: "'Vet 8/3 2pm'
 * moves it to Aug 3 at 2pm and leaves 'Vet' behind. … a line with no date in
 * it must leave the date alone rather than clear it, or renaming a dated
 * reminder would quietly undate it." Sean asked for the inline edit back on
 * 2026-08-20 ("parsed as if it were just being added, even overwriting
 * existing dates/times") — typed tokens OVERWRITE, an untyped category keeps
 * what the row had. The parse itself is parseWhenFromText, the one door,
 * so the \-escape works here exactly as it does on an add.
 *
 * A blank retype returns the payload unchanged: erasing every word is
 * abandoning the edit, not renaming the reminder to nothing.
 */
export function editReminderLine(p: Reminder, raw: string, today: string, now: string): Reminder {
  const line = raw.trim();
  if (!line) return p;
  const [text, due, time] = parseWhenFromText(line, today, now);
  return { ...p, text: text || line, due: due ?? p.due, time: time ?? p.time };
}

/**
 * Would the parser take this single word back out of a line? Asked by ASKING
 * IT — no second copy of the token grammar to drift from the first, which is
 * the whole point of parseWhenFromText being one door.
 */
function parserEats(word: string, today: string): boolean {
  const [clean, due, time] = parseWhenFromText(word, today, '00:00');
  return due !== null || time !== null || clean !== word;
}

/**
 * A reminder written back out as ONE typed line — `editReminderLine`'s
 * inverse, and what the row's Copy puts on the clipboard.
 *
 * Copying a dated reminder as its bare text would drop the half of it that is
 * hardest to retype, so the date and time come along as the tokens that MADE
 * them: "vet visit 9/3 2pm" reads as a sentence in a message and parses back
 * into the same reminder in the add field. Two details make that round trip
 * hold rather than nearly hold:
 *
 *  · A bare m/d means the NEXT one, so a due date already past (or more than
 *    a year out) would come back as a different day. The year is spelled
 *    exactly when it has to be, and which case that is comes from asking
 *    parseDateFromText rather than from a rule about it.
 *  · The time is always the am/pm form, even for a 24-hour reader: '14:00' is
 *    not a token this parser reads, and a line that cannot be pasted back is
 *    the thing this function exists to avoid. The screen's clock preference
 *    governs what is DISPLAYED; the clipboard carries what can be re-typed.
 *
 * And the words are shielded: a reminder whose text really does contain '2pm'
 * only got that way through Sean's \-escape (2026-08-20), so re-escaping is
 * how the copy stays faithful. Word-level is exactly right, not a
 * simplification — `\` protects one `\S+` run by construction, so any escape
 * that got INTO a payload came from a single word.
 *
 * The limit, stated: a multi-word phrase in the text that the parser would
 * read ("call Bob in 2 weeks", typeable only through the item sheet's title
 * field) is not shielded, and pasting it back re-reads the phrase. That is
 * the add field doing its job on a line a person typed, not a lossy copy —
 * the clipboard string itself is right either way.
 */
export function reminderLine(p: Reminder, today: string): string {
  const parts = [shieldWords(p.text, today)];
  if (p.due) parts.push(dateToken(p.due, today));
  if (p.time) parts.push(timeLabel(p.time));
  return parts.filter(Boolean).join(' ');
}

/** Every word the parser would eat, escaped so it survives a paste back. */
function shieldWords(text: string, today: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (parserEats(w, today) ? `\\${w}` : w))
    .join(' ');
}

/** 'YYYY-MM-DD' as the shortest token that reads back as THAT day. */
function dateToken(ymd: string, today: string): string {
  const [, mo, dy] = ymd.split('-') as [string, string, string];
  const bare = `${Number(mo)}/${Number(dy)}`;
  const [, readBack] = parseDateFromText(bare, today);
  return readBack === ymd ? bare : `${bare}/${ymd.slice(2, 4)}`;
}

/**
 * An event as one line — the row's Copy on the calendar's day panel (Sean,
 * 2026-08-20), and `reminderLine`'s sibling.
 *
 * It carries the END time as a range, and that round-trips like everything
 * else here — but only since the same day. This shipped first with the end
 * in the line and no parser able to read it back: "standup 9/3 9am–10am"
 * pasted into an add field became a reminder called "standup –10am". The
 * trade was recorded rather than hidden, and Sean's answer was to remove it:
 * parseTimeRangeFromText now reads a range in every field, so the line and
 * the parser agree again.
 *
 * The lesson worth keeping is the ordering. Putting the end in was right on
 * its own terms — an event shorn of its end is misrepresented to whoever you
 * paste it to, which is what copying an event is mostly FOR — and pinning
 * what that cost is what made the cost visible enough to be worth fixing.
 */
export function eventLine(p: Event, today: string): string {
  const parts = [shieldWords(p.text, today), dateToken(p.date, today)];
  if (p.time) parts.push(timeRangeLabel(p.time, p.end));
  return parts.filter(Boolean).join(' ');
}
