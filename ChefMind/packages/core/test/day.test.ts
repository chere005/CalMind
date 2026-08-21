import { describe, it, expect } from 'vitest';
import { addDays, monthGridFilled, twoWeeksFrom, weekOf, cellMarks, dayItems, dayMarks, monthGrid, monthLegend } from '../src/day';
import type { AnyRec, Rec } from '../src/types';

const TODAY = '2026-08-07';

const folder = (id: string, rideAlong = false): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name: id, color: '#fff', ord: 'V', app: 'reminders', ...(rideAlong ? { rideAlong: true } : {}) },
});
const rem = (id: string, due: string | null, opts: Partial<Rec<'reminder'>['payload']> = {}): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: id, due, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'V', ...opts },
});
const ev = (id: string, date: string, time: string | null, opts: Partial<Rec<'event'>['payload']> = {}): Rec<'event'> => ({
  id, type: 'event', updated: 0, payload: { text: id, date, time, repeat: null, calendarId: 'c', ord: 'V', ...opts },
});

describe('dayItems — what lands on a day', () => {
  it('events sort by time, then order', () => {
    const items = dayItems([ev('late', TODAY, '18:00'), ev('early', TODAY, '09:00'), ev('untimed', TODAY, null)], TODAY, TODAY);
    expect(items.events.map((e) => e.id)).toEqual(['untimed', 'early', 'late']);
  });

  it('a repeating event lands on its expanded days, clamped', () => {
    const monthly = ev('m', '2026-01-31', null, { repeat: { n: 1, unit: 'month' } });
    expect(dayItems([monthly], '2026-02-28', TODAY).events.length).toBe(1);
    expect(dayItems([monthly], '2026-03-31', TODAY).events.length).toBe(1);
    expect(dayItems([monthly], '2026-03-30', TODAY).events.length).toBe(0);
  });

  it('today collects the overdue and the riders; other days do not', () => {
    const recs: AnyRec[] = [
      folder('cal', true), folder('f'),
      rem('late', '2026-08-01'),
      rem('rider', null, { folderId: 'cal' }),
      rem('plain-undated', null),
    ];
    const today = dayItems(recs, TODAY, TODAY);
    expect(today.reminders.map((r) => r.rec.id)).toEqual(['rider', 'late']); // undated-first, then date
    expect(today.reminders.find((r) => r.rec.id === 'late')!.overdue).toBe(true);
    expect(today.reminders.find((r) => r.rec.id === 'rider')!.overdue).toBe(false); // a rider is never late
    const tomorrow = dayItems(recs, '2026-08-08', TODAY);
    expect(tomorrow.reminders.length).toBe(0);
  });

  it('a done reminder STAYS on today, and stops being overdue', () => {
    // It used to leave the day the instant it was ticked, and that was a bug
    // Sean hit on 2026-08-12: a reminder that "always appears on today" — a
    // rider, or something late — disappeared with no grace to take the tap
    // back. The two-second grace is a FILTER the screens apply over this
    // list, and a filter cannot keep a row core has already dropped. A DATED
    // reminder never had the problem, because `onDate` never asked about
    // done; this is the other two catching up with it.
    const recs: AnyRec[] = [folder('cal', true), rem('done-late', '2026-08-01', { done: true }), rem('done-rider', null, { folderId: 'cal', done: true })];
    const today = dayItems(recs, TODAY, TODAY);
    expect(today.reminders.map((r) => r.rec.id).sort()).toEqual(['done-late', 'done-rider']);
    // Present, but not painted late: `overdue` still means late AND open.
    expect(today.reminders.find((r) => r.rec.id === 'done-late')!.overdue).toBe(false);
    expect(today.reminders.find((r) => r.rec.id === 'done-rider')!.rider).toBe(true);
    // And it is TODAY's business only — a done rider does not haunt tomorrow.
    expect(dayItems(recs, '2026-08-08', TODAY).reminders.length).toBe(0);
  });

  it('a dated note shows on its day', () => {
    const n: Rec<'note'> = { id: 'n1', type: 'note', updated: 0, payload: { title: 'x', body: '', date: TODAY, folderId: 'f', sectionId: 's', ord: 'V' } };
    expect(dayItems([n], TODAY, TODAY).notes.length).toBe(1);
    expect(dayItems([n], '2026-08-08', TODAY).notes.length).toBe(0);
  });
});

describe('dayMarks — the month cell summary', () => {
  it('overdue beats open; done only when everything is ticked', () => {
    const recs: AnyRec[] = [folder('f'), rem('a', TODAY), rem('late', '2026-08-01')];
    expect(dayMarks(recs, TODAY, TODAY).reminderState).toBe('overdue');
    const allDone: AnyRec[] = [folder('f'), rem('a', TODAY, { done: true })];
    expect(dayMarks(allDone, TODAY, TODAY).reminderState).toBe('done');
  });

  it('event colors arrive in first-appearance order, deduped', () => {
    const cal = (id: string, color: string): Rec<'calendar'> => ({ id, type: 'calendar', updated: 0, payload: { name: id, color, ord: 'V' } });
    const recs: AnyRec[] = [cal('c1', '#111111'), cal('c2', '#222222'), ev('e1', TODAY, '09:00', { calendarId: 'c1' }), ev('e2', TODAY, '10:00', { calendarId: 'c2' }), ev('e3', TODAY, '11:00', { calendarId: 'c1' })];
    expect(dayMarks(recs, TODAY, TODAY).eventColors).toEqual(['#111111', '#222222']);
  });
});

describe('monthGrid', () => {
  it('August 2026 starts on a Saturday and has 31 days', () => {
    const cells = monthGrid(2026, 8);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]); // Sun..Fri blank
    expect(cells[6]).toBe('2026-08-01');
    expect(cells[cells.length - 1]).toBe('2026-08-31');
  });
});

const cal = (id: string, name: string, color: string, ord: string): Rec<'calendar'> => ({
  id, type: 'calendar', updated: 0, payload: { name, color, ord },
});

describe('cellMarks — one icon per kind and colour, worst state per colour', () => {
  it('two calendars on one day wear two event marks, kinds in legend order', () => {
    const recs: AnyRec[] = [
      cal('c1', 'Personal', '#0379f6', 'B'), cal('c2', 'Work', '#803be7', 'D'), folder('f'),
      ev('e1', '2026-08-10', null, { calendarId: 'c1' }),
      ev('e2', '2026-08-10', null, { calendarId: 'c2' }),
      ev('e3', '2026-08-10', '09:00', { calendarId: 'c1' }),
      rem('r1', '2026-08-10'),
    ];
    const marks = cellMarks(recs, '2026-08-10', TODAY);
    expect(marks.map((m) => m.kind)).toEqual(['event', 'event', 'reminder']);
    expect(marks[0]!.color).not.toBe(marks[1]!.color); // one icon PER colour, never per item
  });

  it("a colour's reminder mark: overdue beats open, done only when all are ticked", () => {
    const recs: AnyRec[] = [folder('f'), rem('open', TODAY), rem('late', '2026-08-01'), rem('finished', TODAY, { done: true })];
    const marks = cellMarks(recs, TODAY, TODAY); // today collects the overdue one too
    expect(marks).toEqual([{ kind: 'reminder', color: '#fff', state: 'overdue' }]);
    const allDone = cellMarks([folder('f'), rem('finished', TODAY, { done: true })], TODAY, TODAY);
    expect(allDone[0]!.state).toBe('done');
  });
});

describe('monthLegend — every calendar/folder with an item in the window', () => {
  it('lists in kind order and skips the quiet ones', () => {
    const recs: AnyRec[] = [
      cal('c1', 'Personal', '#0379f6', 'B'), cal('c2', 'Work', '#803be7', 'D'), folder('f'),
      ev('e1', '2026-08-10', null, { calendarId: 'c2' }),
      rem('r1', '2026-08-11'),
    ];
    const legend = monthLegend(recs, ['2026-08-10', '2026-08-11', null], '2026-08-01');
    expect(legend.map((l) => `${l.kind}:${l.name}`)).toEqual(['event:Work', 'reminder:f']);
  });

  it('is empty for an empty window', () => {
    expect(monthLegend([cal('c1', 'P', '#0379f6', 'B')], ['2026-08-10'], '2026-08-01')).toEqual([]);
  });

  it("reads the days through the SAME tri-state the grid draws through", () => {
    // Sean's rule: only what actually occurs in the view earns a chip. A
    // folder switched to 'none' draws no mark on any cell, so listing it was
    // naming something with no occurrence anywhere in the window.
    const recs: AnyRec[] = [folder('f'), rem('r1', '2026-08-11')];
    const dates = ['2026-08-10', '2026-08-11'];
    expect(monthLegend(recs, dates, '2026-08-01').map((l) => l.name)).toEqual(['f']);
    expect(monthLegend(recs, dates, '2026-08-01', { f: 'none' })).toEqual([]);
  });

  it('drops a folder whose every item in the window is ticked', () => {
    // The cell hides a finished mark unless Completed is showing, so a chip
    // for an all-done folder named a colour the grid never drew.
    const recs: AnyRec[] = [folder('f'), rem('r1', '2026-08-11', { done: true })];
    const dates = ['2026-08-10', '2026-08-11'];
    expect(monthLegend(recs, dates, '2026-08-01')).toEqual([]);
    // Completed showing: the mark comes back, so the chip must too.
    expect(monthLegend(recs, dates, '2026-08-01', undefined, true).map((l) => l.name)).toEqual(['f']);
    // One open item is enough to keep the chip.
    const mixed: AnyRec[] = [folder('f'), rem('r1', '2026-08-11', { done: true }), rem('r2', '2026-08-10')];
    expect(monthLegend(mixed, dates, '2026-08-01').map((l) => l.name)).toEqual(['f']);
  });

  it("a rideAlong folder earns its chip only on a day it actually rides", () => {
    // 'all' rides today and nothing else, so a window without today has no
    // occurrence to show — and one WITH today does.
    const recs: AnyRec[] = [folder('f', true), rem('r1', null)];
    expect(monthLegend(recs, ['2026-08-10'], TODAY, { f: 'all' })).toEqual([]);
    expect(monthLegend(recs, [TODAY], TODAY, { f: 'all' }).map((l) => l.name)).toEqual(['f']);
  });
});

describe('weekOf — a month row, not a floating seven days', () => {
  it('returns the 7-cell row holding the date', () => {
    const w = weekOf('2026-08-08');
    expect(w.cells).toHaveLength(7);
    expect(w.cells).toContain('2026-08-08');
    expect(w.ym).toBe('2026-08');
  });
  it('pads the month edges with nulls like the grid', () => {
    // Aug 2026 starts on a Saturday: the first row is six nulls + the 1st.
    const w = weekOf('2026-08-01');
    expect(w.cells).toEqual([null, null, null, null, null, null, '2026-08-01']);
  });
  it('stepping the anchor across an edge lands on the neighbour month row', () => {
    const back = addDays('2026-08-01', -7); // 2026-07-25
    const w = weekOf(back);
    expect(w.ym).toBe('2026-07');
    expect(w.cells).toContain('2026-07-25');
    expect(weekOf(addDays('2026-07-31', 7)).ym).toBe('2026-08');
  });
  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('the filled grid and the two-week fold', () => {
  it('fills the edges with the neighbours\u2019 real days, whole weeks', () => {
    const g = monthGridFilled(2026, 8); // Aug 2026 starts Saturday
    expect(g.length % 7).toBe(0);
    expect(g[0]).toBe('2026-07-26'); // the leading Sunday, July
    expect(g).toContain('2026-08-01');
    expect(g[g.length - 1]! >= '2026-08-31').toBe(true);
  });
  it('two weeks run from the selected day\u2019s Sunday, crossing months freely', () => {
    const w = twoWeeksFrom('2026-08-08');
    expect(w).toHaveLength(14);
    expect(w[0]).toBe('2026-08-02');
    expect(w[13]).toBe('2026-08-15');
    expect(twoWeeksFrom('2026-08-31')[13]!.startsWith('2026-09')).toBe(true);
  });
});

describe('folderModes — the calendar tri-state per reminder folder', () => {
  const folder = (id: string, rideAlong = false): Rec<'folder'> => ({
    id, type: 'folder', updated: 0,
    payload: { name: id, color: '#fff', ord: id, app: 'reminders', ...(rideAlong ? { rideAlong: true } : {}) },
  });
  const rem = (id: string, folderId: string, due: string | null): Rec<'reminder'> => ({
    id, type: 'reminder', updated: 0,
    payload: { text: id, due, time: null, done: false, repeat: null, folderId, sectionId: 's', indent: 0, ord: id },
  });
  const today = '2026-08-08';
  const recs = [folder('cal', true), folder('plain'), rem('rider', 'cal', null), rem('loose', 'plain', null), rem('dated', 'plain', today)];

  it('defaults keep the old behaviour: rideAlong rides, plain is dated-only', () => {
    const got = dayItems(recs, today, today);
    expect(got.reminders.map((r) => r.rec.id).sort()).toEqual(['dated', 'rider']);
  });
  it("'all' on a plain folder makes its undated ride on today", () => {
    const got = dayItems(recs, today, today, { plain: 'all' });
    expect(got.reminders.map((r) => r.rec.id).sort()).toEqual(['dated', 'loose', 'rider']);
  });
  it("'none' silences a folder entirely — cells included", () => {
    const got = dayItems(recs, today, today, { plain: 'none' });
    expect(got.reminders.map((r) => r.rec.id)).toEqual(['rider']);
    expect(cellMarks(recs, today, today, { plain: 'none', cal: 'none' }).filter((m) => m.kind === 'reminder')).toEqual([]);
  });
  it("'dated' on the rideAlong folder stops the ride", () => {
    const got = dayItems(recs, today, today, { cal: 'dated' });
    expect(got.reminders.map((r) => r.rec.id)).toEqual(['dated']);
  });
});
