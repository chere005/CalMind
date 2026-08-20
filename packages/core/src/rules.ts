/**
 * Behavior that screens kept re-implementing, promoted into core — the repo
 * rule is that a rule living in a screen is a bug even when it renders
 * correctly. Ported from the suite and pinned by tests.
 */
import type { AnyRec, Rec, Reminder } from './types';
import { repeatAdvances, repeatNext } from './repeats';
import { parseWhenFromText } from './parse';

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
