/**
 * The watch feed. This code had never run in a test: it sat behind the
 * phone's `if (!bridge) return`, so it only executed on a device with a watch
 * paired to it — the one place nobody is watching a test run.
 */
import { describe, it, expect } from 'vitest';
import { watchRows } from '../src/watch';
import type { AnyRec, Rec } from '../src/types';

const rem = (
  id: string,
  text: string,
  opts: { due?: string | null; time?: string | null; done?: boolean; indent?: number; ord?: string; deleted?: boolean } = {},
): Rec<'reminder'> => ({
  id,
  type: 'reminder',
  updated: 1,
  ...(opts.deleted ? { deleted: true } : {}),
  payload: {
    text,
    due: opts.due ?? null,
    time: opts.time ?? null,
    done: opts.done ?? false,
    repeat: null,
    folderId: 'f',
    sectionId: 's',
    indent: opts.indent ?? 0,
    ord: opts.ord ?? id,
  },
});

describe('watchRows — what the wrist is handed', () => {
  it('carries only open reminders — nothing done, nothing deleted, nothing else', () => {
    const recs: AnyRec[] = [
      rem('a', 'still open'),
      rem('b', 'finished', { done: true }),
      rem('c', 'gone', { deleted: true }),
      { id: 'n1', type: 'note', updated: 1, payload: { title: 'a note', body: '', date: null, folderId: 'f', sectionId: 's', ord: 'a' } },
      { id: 'e1', type: 'event', updated: 1, payload: { text: 'an event', date: '2026-08-08', time: null, repeat: null, calendarId: 'c', ord: 'a' } },
    ];
    expect(watchRows(recs).map((r) => r.text)).toEqual(['still open']);
  });

  it('keeps the list\'s own order: undated first, then by date, then time', () => {
    const recs: AnyRec[] = [
      rem('c', 'later that day', { due: '2026-08-08', time: '15:00', ord: 'c' }),
      rem('a', 'no date at all', { ord: 'a' }),
      rem('b', 'that morning', { due: '2026-08-08', time: '09:00', ord: 'b' }),
      rem('d', 'next week', { due: '2026-08-15', ord: 'd' }),
    ];
    expect(watchRows(recs).map((r) => r.text)).toEqual([
      'no date at all',
      'that morning',
      'later that day',
      'next week',
    ]);
  });

  it('a subtask travels under its parent rather than sorting away from it', () => {
    // The block sort is the whole reason sortByDate takes an indent. An
    // undated subtask under a dated parent would otherwise leap to the top
    // and read as a subtask of whatever landed above it.
    const recs: AnyRec[] = [
      rem('p', 'dated parent', { due: '2026-08-20', ord: 'a' }),
      rem('s', 'its subtask', { indent: 1, ord: 'b' }),
      rem('u', 'undated other', { ord: 'c' }),
    ];
    expect(watchRows(recs).map((r) => r.text)).toEqual(['undated other', 'dated parent', 'its subtask']);
  });

  it('hands over exactly the fields the watch draws, and no more', () => {
    const [row] = watchRows([rem('a', 'tea', { due: '2026-08-08', time: '16:30' })]);
    expect(row).toEqual({ id: 'a', text: 'tea', due: '2026-08-08', time: '16:30', done: false });
  });

  it('an empty store is an empty list, not a crash', () => {
    expect(watchRows([])).toEqual([]);
  });
});
