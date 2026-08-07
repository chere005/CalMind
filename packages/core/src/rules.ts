/**
 * Behavior that screens kept re-implementing, promoted into core — the repo
 * rule is that a rule living in a screen is a bug even when it renders
 * correctly. Ported from the suite and pinned by tests.
 */
import type { AnyRec, Rec, Reminder } from './types';
import { repeatNext } from './repeats';

/**
 * Ticking a reminder: a repeating, dated, open reminder rolls its due date to
 * the next occurrence instead of finishing the series. The roll lands strictly
 * after max(due, today) — the suite's rule — so ticking an OVERDUE repeat jumps
 * past today rather than crawling occurrence by occurrence through the past.
 * Everything else toggles done. A rolling tick never sets done.
 */
export function reminderToggle(p: Reminder, today: string): Reminder {
  if (p.repeat && p.due && !p.done) {
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
