/**
 * Undo the last delete.
 *
 * Sean, 2026-08-11: an entry in the username's dropdown that "undoes the last
 * delete of any reminder, event, note, or habit".
 *
 * NOTHING NEW IS REMEMBERED TO DO THIS. A delete in this app is a tombstone —
 * the record stays, with `deleted: true` and the stamp of the moment it went —
 * so "the last delete" is already written down, and the newest tombstone IS
 * the answer. That matters for three reasons: it survives a reload, it is the
 * same answer on every device rather than a per-device undo stack that
 * disagrees with itself, and it cannot drift out of step with what was
 * actually deleted.
 *
 * Undoing is an ordinary edit that clears the flag. The engine stamps it
 * newer, so it beats the tombstone by the same last-write-wins rule as
 * everything else and reaches the other devices without a special path.
 *
 * Undo repeatedly and you walk back through the deletions, newest first,
 * because each undo stops being a tombstone as it is restored.
 */
import type { AnyRec } from './types';

/**
 * The four Sean named. Sections, folders and calendars are deliberately NOT
 * here: deleting one of those re-homes or refuses in `manage.ts` rather than
 * leaving a simple tombstone, so "undo" for them is a different question with
 * a different answer, and quietly restoring one could resurrect a container
 * whose contents have since moved.
 */
export const UNDOABLE = ['reminder', 'event', 'note', 'habit'] as const;
export type UndoableType = (typeof UNDOABLE)[number];

/**
 * The most recently deleted undoable record, or null.
 *
 * `recs` must be the FULL record list including tombstones — the engine's
 * `all()` filters them out, so this wants `toSnapshot().recs`. Passing the
 * filtered list finds nothing and the menu would simply never offer anything,
 * which is the failure that looks like a feature nobody asked for.
 *
 * NOT EVERY TOMBSTONE IS A DELETION. convertToNote, convertReminderToEvent and
 * convertEventToReminder each write the new record and tombstone the old one,
 * so any conversion leaves the freshest tombstone in the account. Undo took it
 * and resurrected the thing that had been converted AWAY, while the converted
 * copy was still there: the user asked for one item back and got two, named
 * after an original they had not deleted. Those tombstones carry `superseded`
 * and are skipped here.
 */
export function lastDeleted(recs: AnyRec[]): AnyRec | null {
  let best: AnyRec | null = null;
  for (const r of recs) {
    if (!r.deleted || r.superseded) continue;
    if (!(UNDOABLE as readonly string[]).includes(r.type)) continue;
    if (!best || r.updated > best.updated) best = r;
  }
  return best;
}

/** The record, no longer deleted. The caller puts it, which stamps it newer. */
export function undeleted<T extends AnyRec>(rec: T): T {
  return { ...rec, deleted: false };
}

/**
 * What to call the thing that came back, for the message afterwards. Each
 * type keeps its name in a different field, and an untitled note is the
 * commonest record in this app that has no words at all.
 */
export function recLabel(rec: AnyRec): string {
  const p = rec.payload as Record<string, unknown>;
  const first = [p.text, p.title, p.name].find((v) => typeof v === 'string' && v.trim() !== '');
  return typeof first === 'string' ? first.trim() : 'Untitled';
}
