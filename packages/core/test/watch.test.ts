/**
 * The watch feed. This code had never run in a test: it sat behind the
 * phone's `if (!bridge) return`, so it only executed on a device with a watch
 * paired to it — the one place nobody is watching a test run.
 */
import { describe, it, expect } from 'vitest';
import { watchFeed, watchGroups, watchRows, widgetDays, type WatchFolder, type WatchRow, type WatchSection } from '../src/watch';
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
    // folderId joined the set when the iOS widget gained a folder picker —
    // the widget filters by folder, so the row has to say which one it is in.
    expect(row).toEqual({ id: 'a', text: 'tea', due: '2026-08-08', time: '16:30', done: false, folderId: 'f', sectionId: 's' });
  });

  it('an empty store is an empty list, not a crash', () => {
    expect(watchRows([])).toEqual([]);
  });
});

describe('watchFeed — folders for the widget picker', () => {
  const fold = (id: string, name: string, app: string, ord: string): AnyRec =>
    ({ id, type: 'folder', updated: 1, payload: { name, app, color: '#123456', ord, rideAlong: false } } as AnyRec);

  it('carries reminder folders in list order, and NOT notes folders', () => {
    const { folders } = watchFeed(
      [fold('f2', 'Work', 'reminders', 'b'), fold('n1', 'Recipes', 'notes', 'a'), fold('f1', 'Home', 'reminders', 'a')],
      '2026-08-09',
    );
    // A notes folder in a to-do widget's picker is a promise it cannot keep.
    expect(folders.map((f) => f.name)).toEqual(['Home', 'Work']);
    expect(folders[0]).toEqual({ id: 'f1', name: 'Home', color: '#123456' });
  });

  it('a deleted folder does not reach the picker', () => {
    const gone = { ...(fold('f9', 'Old', 'reminders', 'a') as Record<string, unknown>), deleted: true } as AnyRec;
    expect(watchFeed([gone], '2026-08-09').folders).toEqual([]);
  });

  it('a folder with NO app is a reminders folder, and travels', () => {
    // types.ts states the convention: `app` absent means 'reminders' — the
    // shape milestone 1 wrote, which is what the OLDEST folders in a real
    // account still are. Every other reader honours it (folderApp(),
    // `?? 'reminders'`); this one filtered on strict equality and dropped
    // them, so an account whose folders predate the field sent the watch an
    // EMPTY folder list and got a flat, ungrouped page. Sean's did.
    const old = { id: 'f0', type: 'folder', updated: 1, payload: { name: 'Home', color: '#123456', ord: 'a' } } as AnyRec;
    expect(watchFeed([old], '2026-08-09').folders.map((f) => f.name)).toEqual(['Home']);
  });

  it('groups a real pre-app-field account rather than falling back to flat', () => {
    // The end-to-end shape of the same bug: rows + old-shape folders in, a
    // GROUPED page out. With the strict filter this returned one anonymous
    // group — exactly what the wrist was showing.
    const old = (id: string, name: string, ord: string) =>
      ({ id, type: 'folder', updated: 1, payload: { name, color: '#123456', ord } } as AnyRec);
    const sec = (id: string, name: string, folderId: string, ord: string) =>
      ({ id, type: 'section', updated: 1, payload: { name, folderId, ord } } as AnyRec);
    const row = (id: string, text: string, folderId: string, sectionId: string) =>
      ({ id, type: 'reminder', updated: 1, payload: { text, due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: id } } as AnyRec);
    const { groups } = watchFeed(
      [old('f1', 'Home', 'a'), old('f2', 'Work', 'b'), sec('s1', 'Now', 'f1', 'a'), row('r1', 'bins', 'f1', 's1'), row('r2', 'invoice', 'f2', 's2')],
      '2026-08-09',
    );
    expect(groups.map((g) => g.folderName)).toEqual(['Home', 'Work']);
  });
});

describe('watchFeed — sections, so the wrist shows the phone\'s structure', () => {
  const sec = (id: string, name: string, folderId: string, ord: string): AnyRec =>
    ({ id, type: 'section', updated: 1, payload: { name, folderId, ord } } as AnyRec);

  it('carries sections in list order with their folder', () => {
    const { sections } = watchFeed([sec('s2', 'Later', 'f1', 'b'), sec('s1', 'Now', 'f1', 'a')], '2026-08-09');
    expect(sections.map((x) => x.name)).toEqual(['Now', 'Later']);
    expect(sections[0]).toEqual({ id: 's1', name: 'Now', folderId: 'f1' });
  });

  it('a deleted section does not reach the wrist', () => {
    const gone = { ...(sec('s9', 'Old', 'f1', 'a') as Record<string, unknown>), deleted: true } as AnyRec;
    expect(watchFeed([gone], '2026-08-09').sections).toEqual([]);
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

/**
 * The wrist's time format, mirrored here.
 *
 * The Swift is the real implementation (WatchFormat, and its deliberate twin
 * in the complication — a widget extension cannot see the app's sources).
 * Nothing in this repo runs Swift, so these cases pin the RULES Sean gave,
 * and the two Swift copies are written to match them. If a case here is
 * wrong, both copies are wrong.
 *
 * His spec, verbatim: "Today 3pm event name" or "8/15 5pm event name".
 */
describe('the watch clock — the rules the Swift copies implement', () => {
  const clock = (hhmm: string | null): string | null => {
    if (!hhmm || hhmm.length < 4) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
  };

  it('drops :00 on the hour and the leading zero', () => {
    expect(clock('15:00')).toBe('3pm');
    expect(clock('09:00')).toBe('9am');
  });

  it('half past keeps its minutes', () => {
    expect(clock('15:30')).toBe('3:30pm');
    expect(clock('09:05')).toBe('9:05am');
  });

  it('noon and midnight, the two that catch 12-hour clocks out', () => {
    expect(clock('12:00')).toBe('12pm');
    expect(clock('00:00')).toBe('12am');
    expect(clock('00:30')).toBe('12:30am');
  });

  it('an all-day event has no time at all — never a midnight', () => {
    expect(clock(null)).toBeNull();
  });
});

describe('watchGroups — the rules the wrist draws by', () => {
  const row = (id: string, folderId: string, sectionId: string): WatchRow =>
    ({ id, text: id, due: null, time: null, done: false, folderId, sectionId });
  const fold = (id: string, name: string): WatchFolder => ({ id, name, color: '#fff' });
  const sect = (id: string, name: string, folderId: string): WatchSection => ({ id, name, folderId });

  it('ONE folder means no folder header — its name is the whole page', () => {
    const g = watchGroups([row('a', 'f1', 's1')], [fold('f1', 'Home')], [sect('s1', 'General', 'f1')]);
    expect(g).toHaveLength(1);
    expect(g[0]!.folderName).toBeNull();
  });

  it('two folders means both get named', () => {
    const g = watchGroups(
      [row('a', 'f1', 's1'), row('b', 'f2', 's2')],
      [fold('f1', 'Home'), fold('f2', 'Work')],
      [sect('s1', 'General', 'f1'), sect('s2', 'General', 'f2')],
    );
    expect(g.map((x) => x.folderName)).toEqual(['Home', 'Work']);
  });

  it('one section in a folder means no section header — the folder said it', () => {
    const g = watchGroups([row('a', 'f1', 's1')], [fold('f1', 'Home')], [sect('s1', 'Errands', 'f1')]);
    expect(g[0]!.sections[0]!.sectionName).toBeNull();
  });

  it('two sections means both get named, in the feed\'s order', () => {
    const g = watchGroups(
      [row('a', 'f1', 's1'), row('b', 'f1', 's2')],
      [fold('f1', 'Home')],
      [sect('s1', 'Now', 'f1'), sect('s2', 'Later', 'f1')],
    );
    expect(g[0]!.sections.map((s) => s.sectionName)).toEqual(['Now', 'Later']);
  });

  it('an empty folder is dropped — a header with nothing under it is pure cost', () => {
    const g = watchGroups([row('a', 'f1', 's1')], [fold('f1', 'Home'), fold('f2', 'Empty')], [sect('s1', 'G', 'f1')]);
    expect(g).toHaveLength(1);
  });

  it('a row whose SECTION never arrived is still shown', () => {
    const g = watchGroups([row('a', 'f1', 'missing')], [fold('f1', 'Home')], [sect('s1', 'G', 'f1')]);
    expect(g[0]!.sections.flatMap((s) => s.items).map((r) => r.id)).toEqual(['a']);
  });

  it('a row whose FOLDER never arrived is still shown', () => {
    const g = watchGroups([row('a', 'gone', 's1')], [fold('f1', 'Home')], [sect('s1', 'G', 'f1')]);
    expect(g.flatMap((x) => x.sections).flatMap((s) => s.items).map((r) => r.id)).toEqual(['a']);
  });

  it('an empty list is an empty list, not a crash', () => {
    expect(watchGroups([], [], [])).toEqual([]);
  });
});

describe('widgetDays — the home-screen widget, decided here not in SwiftUI', () => {
  const row = (id: string, due: string | null, time: string | null, folderId = 'f1'): WatchRow =>
    ({ id, text: id, due, time, done: false, folderId, sectionId: 's1' });
  const ev = (id: string, date: string, time: string | null): WatchEvent =>
    ({ id, text: id, date, time, color: '#60a5fa' });
  const TODAY = '2026-08-09';

  it('the DAY is the section: a reminder and an event share one heading', () => {
    const d = widgetDays([row('r', TODAY, '09:00')], [ev('e', TODAY, '10:00')], TODAY);
    expect(d).toHaveLength(1);
    expect(d[0]!.lines.map((l) => l.id)).toEqual(['r', 'e']);
  });

  it('an undated reminder lands on today, where someone looks for it', () => {
    const d = widgetDays([row('r', null, null)], [], TODAY);
    expect(d[0]!.date).toBe(TODAY);
  });

  it('an overdue reminder is marked, and keeps its own date', () => {
    const d = widgetDays([row('r', '2026-08-01', null)], [], TODAY);
    expect(d[0]!.date).toBe('2026-08-01');
    expect(d[0]!.lines[0]!.overdue).toBe(true);
  });

  it('a widget-ticked reminder is gone at once — the optimistic half', () => {
    expect(widgetDays([row('r', TODAY, null)], [], TODAY, { ticked: ['r'] })).toEqual([]);
  });

  it('NO folder selection means every folder, not none', () => {
    const d = widgetDays([row('a', TODAY, null, 'f1'), row('b', TODAY, null, 'f2')], [], TODAY);
    expect(d[0]!.lines.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('a folder selection filters reminders to it', () => {
    const d = widgetDays([row('a', TODAY, null, 'f1'), row('b', TODAY, null, 'f2')], [], TODAY, { folderIds: ['f2'] });
    expect(d[0]!.lines.map((l) => l.id)).toEqual(['b']);
  });

  it('within a day, no time leads and then earliest first', () => {
    const d = widgetDays([row('late', TODAY, '18:00'), row('none', TODAY, null), row('early', TODAY, '07:00')], [], TODAY);
    expect(d[0]!.lines.map((l) => l.id)).toEqual(['none', 'early', 'late']);
  });

  it('days come out in date order', () => {
    const d = widgetDays([row('c', '2026-08-20', null), row('a', TODAY, null)], [ev('b', '2026-08-12', null)], TODAY);
    expect(d.map((x) => x.date)).toEqual([TODAY, '2026-08-12', '2026-08-20']);
  });

  it('an empty store is an empty widget, not a crash', () => {
    expect(widgetDays([], [], TODAY)).toEqual([]);
  });
});
