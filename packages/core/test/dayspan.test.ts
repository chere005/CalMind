/**
 * Multi-day events span the day model (Sean, 2026-09-15): an event with an
 * endDate after its date lands on every day it runs, not only the day it
 * starts — and a REPEATING span does the same for each occurrence. The label
 * per day rides in spec/span.json; what is pinned here is the belonging.
 */
import { describe, it, expect } from 'vitest';
import { dayItems, type AnyRec } from '../src/index';

const ev = (id: string, date: string, endDate: string | null, repeat: { n: number; unit: 'day' | 'week' | 'month' | 'year' } | null = null): AnyRec => ({
  id,
  type: 'event',
  updated: 0,
  payload: { text: id, date, time: null, end: null, endDate, repeat, calendarId: 'c1', ord: 'a0' },
});

const has = (recs: AnyRec[], date: string, id: string) =>
  dayItems(recs, date, date).events.some((e) => e.id === id);

describe('dayItems spans a multi-day event', () => {
  const recs = [ev('conf', '2026-09-15', '2026-09-17')];
  it('the day before is untouched', () => expect(has(recs, '2026-09-14', 'conf')).toBe(false));
  it('the start day carries it', () => expect(has(recs, '2026-09-15', 'conf')).toBe(true));
  it('a middle day carries it', () => expect(has(recs, '2026-09-16', 'conf')).toBe(true));
  it('the end day carries it', () => expect(has(recs, '2026-09-17', 'conf')).toBe(true));
  it('the day after is untouched', () => expect(has(recs, '2026-09-18', 'conf')).toBe(false));
});

describe('a single-day event still lands on its one day only', () => {
  const recs = [ev('lunch', '2026-09-15', null)];
  it('on its day', () => expect(has(recs, '2026-09-15', 'lunch')).toBe(true));
  it('not the next', () => expect(has(recs, '2026-09-16', 'lunch')).toBe(false));
});

describe('an equal-or-earlier endDate does not span (single day)', () => {
  const recs = [ev('same', '2026-09-15', '2026-09-15')];
  it('on its day', () => expect(has(recs, '2026-09-15', 'same')).toBe(true));
  it('not the next', () => expect(has(recs, '2026-09-16', 'same')).toBe(false));
});

describe('each occurrence of a repeating span spans too', () => {
  // Weekly, two days long (15th–16th), so the next run is the 22nd–23rd.
  const recs = [ev('standup', '2026-09-15', '2026-09-16', { n: 1, unit: 'week' })];
  it('first run, both days', () => {
    expect(has(recs, '2026-09-15', 'standup')).toBe(true);
    expect(has(recs, '2026-09-16', 'standup')).toBe(true);
  });
  it('the gap between runs is empty', () => expect(has(recs, '2026-09-17', 'standup')).toBe(false));
  it('second run, both days', () => {
    expect(has(recs, '2026-09-22', 'standup')).toBe(true);
    expect(has(recs, '2026-09-23', 'standup')).toBe(true);
  });
  it('and the day after the second run is empty', () => expect(has(recs, '2026-09-24', 'standup')).toBe(false));
});
