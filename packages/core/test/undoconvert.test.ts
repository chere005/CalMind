/**
 * "Undo last delete" after a CONVERSION.
 *
 * Undo is defined as the newest tombstone, which is a good definition and the
 * reason it needs no bookkeeping. But a tombstone is not always a deletion:
 * convertToNote, convertReminderToEvent and convertEventToReminder each write
 * the new record and tombstone the old one, so a conversion leaves the
 * freshest tombstone in the account.
 *
 * Undo then resurrects the thing that was converted AWAY, while the converted
 * copy is still there — the user asked for one item back and got two, and the
 * message names the original as though it had been deleted.
 */
import { describe, it, expect } from 'vitest';
import { convertReminderToEvent, lastDeleted, type AnyRec, type Rec } from '../src/index';

const rem: Rec<'reminder'> = {
  id: 'r1', type: 'reminder', updated: 100,
  payload: {
    text: 'ring the dentist', due: '2026-08-11', time: null, done: false,
    repeat: null, folderId: 'f1', sectionId: 's1', indent: 0, ord: 'a',
  },
};
const cal: Rec<'calendar'> = { id: 'c1', type: 'calendar', updated: 1, payload: { name: 'Personal', color: '#fff', ord: 'a' } };
const note: Rec<'note'> = {
  id: 'n1', type: 'note', updated: 50, deleted: true,
  payload: { title: 'shopping', body: '', date: null, folderId: 'f2', sectionId: 's2', ord: 'a' },
};

describe('a conversion is not a deletion', () => {
  it('does not become the thing undo offers to bring back', () => {
    const res = convertReminderToEvent([rem, cal, note], 'r1', 'c1', '2026-08-11', 'e1');
    expect('error' in res).toBe(false);
    if ('error' in res) return;

    // Replay the write the way the store does: the engine stamps each put.
    const recs: AnyRec[] = [cal, note];
    for (const p of res.put) recs.push({ ...p, updated: 200 });

    const back = lastDeleted(recs);
    // The note is the only thing the user actually deleted.
    expect(back?.id, 'undo offers the deleted note, not the converted reminder').toBe('n1');
  });
});
