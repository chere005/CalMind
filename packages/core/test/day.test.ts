import { describe, it, expect } from 'vitest';
import { dayItems, dayMarks, monthGrid } from '../src/day';
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

  it('a done reminder stops riding and stops being overdue', () => {
    const recs: AnyRec[] = [folder('cal', true), rem('done-late', '2026-08-01', { done: true }), rem('done-rider', null, { folderId: 'cal', done: true })];
    expect(dayItems(recs, TODAY, TODAY).reminders.length).toBe(0);
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
