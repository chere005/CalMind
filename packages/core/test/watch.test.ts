/**
 * The watch feed. This code had never run in a test: it sat behind the
 * phone's `if (!bridge) return`, so it only executed on a device with a watch
 * paired to it — the one place nobody is watching a test run.
 */
import { describe, it, expect } from 'vitest';
import { watchFeed, watchRows } from '../src/watch';
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

describe('watchFeed — reminders plus the coming events', () => {
  const cal = (id: string, color: string): AnyRec => ({ id, type: 'calendar', updated: 1, payload: { name: id, color, ord: id } } as AnyRec);
  const ev = (id: string, date: string, time: string | null, calendarId = 'c1'): AnyRec =>
    ({ id, type: 'event', updated: 1, payload: { text: id, date, time, repeat: null, calendarId, ord: id } } as AnyRec);

  it('sends only today-and-forward, dated order, timed after all-day, capped', () => {
    const recs = [cal('c1', '#123456'), ev('past', '2026-08-01', null), ev('b', '2026-08-10', '09:00'), ev('a', '2026-08-10', null), ev('c', '2026-08-12', null)];
    const { events } = watchFeed(recs, '2026-08-09');
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(events[0]!.color).toBe('#123456');
  });

  it('a deleted event or calendar does not ride', () => {
    const recs = [cal('c1', '#123456'), { ...ev('gone', '2026-08-10', null), deleted: true } as AnyRec];
    expect(watchFeed(recs, '2026-08-09').events).toEqual([]);
  });

  it('caps at 30 so the context plist stays under the silent ceiling', () => {
    const recs: AnyRec[] = [cal('c1', '#123456')];
    for (let i = 0; i < 40; i++) recs.push(ev(`e${String(i).padStart(2, '0')}`, '2026-08-10', null));
    expect(watchFeed(recs, '2026-08-09').events).toHaveLength(30);
  });

  it('still carries the open reminders, untouched', () => {
    const recs = [rem('r1', 'walk'), cal('c1', '#123456'), ev('e1', '2026-08-10', null)];
    const feed = watchFeed(recs, '2026-08-09');
    expect(feed.items.map((r) => r.id)).toEqual(['r1']);
  });
});
