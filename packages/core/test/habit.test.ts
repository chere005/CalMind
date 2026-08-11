import { describe, it, expect } from 'vitest';
import {
  dayShares, frequencyOf, habitCountedOn, habitListedOn, habitsListedOn, isWeekend,
  type Frequency,
} from '../src/habit';
import type { Rec } from '../src/index';

const habit = (id: string, sectionId: string, frequency?: Frequency): Rec<'habit'> => ({
  id,
  type: 'habit',
  updated: 1,
  payload: { name: id, sectionId, ord: 'V', ...(frequency ? { frequency } : {}) },
});

const section = (id: string, color: string): Rec<'habitsection'> => ({
  id,
  type: 'habitsection',
  updated: 1,
  payload: { name: id, color, ord: 'V' },
});

// A real week, named so the assertions below are readable rather than
// arithmetic: 2026-08-10 is a Monday.
const MON = '2026-08-10';
const FRI = '2026-08-14';
const SAT = '2026-08-15';
const SUN = '2026-08-16';

describe('a habit’s frequency', () => {
  it('reads as Always when it is missing or unrecognised', () => {
    // Every habit written before Frequency existed has none, and every one of
    // them WAS every-day. Reading a stray value as 'always' too, because a bad
    // value must not be able to hide a habit from Sean's grid.
    expect(frequencyOf(habit('h', 's'))).toBe('always');
    expect(frequencyOf({ ...habit('h', 's'), payload: { name: 'h', sectionId: 's', ord: 'V', frequency: 'nonsense' as Frequency } })).toBe('always');
  });

  it('knows which days are the weekend', () => {
    expect(isWeekend(MON)).toBe(false);
    expect(isWeekend(FRI)).toBe(false);
    expect(isWeekend(SAT)).toBe(true);
    expect(isWeekend(SUN)).toBe(true);
  });

  it('LISTS and COUNTS are different questions, and only Never tells them apart', () => {
    // Sean asked for Never to stop counting, not to disappear — it stays
    // tickable on the week grid and contributes nothing to the month's pies.
    // Weekdays answers both the same way, because he did say "taken out of
    // the list entirely" for the weekend.
    const never = habit('n', 's', 'never');
    expect(habitListedOn(never, MON), 'Never is still there to tick').toBe(true);
    expect(habitCountedOn(never, MON), 'Never never counts').toBe(false);

    const week = habit('w', 's', 'weekdays');
    expect(habitListedOn(week, FRI)).toBe(true);
    expect(habitListedOn(week, SAT), 'gone from the list at the weekend').toBe(false);
    expect(habitCountedOn(week, SAT)).toBe(false);

    const always = habit('a', 's', 'always');
    expect(habitListedOn(always, SUN)).toBe(true);
    expect(habitCountedOn(always, SUN)).toBe(true);
  });

  it('drops weekday-only habits from the weekend list, and keeps the rest', () => {
    const hs = [habit('a', 's', 'always'), habit('w', 's', 'weekdays'), habit('n', 's', 'never')];
    expect(habitsListedOn(hs, FRI).map((h) => h.id)).toEqual(['a', 'w', 'n']);
    expect(habitsListedOn(hs, SAT).map((h) => h.id)).toEqual(['a', 'n']);
  });
});

describe('the day’s pie', () => {
  const secs = [section('s1', '#ff0000'), section('s2', '#00ff00')];

  it('divides by what counts THAT DAY, so a weekday habit cannot spoil Sunday', () => {
    // The bug this shape prevents: with a flat denominator of every visible
    // habit, a Monday-to-Friday habit made Sunday's circle impossible to
    // fill however much Sean actually did.
    const hs = [habit('a', 's1', 'always'), habit('w', 's1', 'weekdays')];
    const ticked = (id: string) => id === 'a';
    // Saturday: only 'a' counts, and it is ticked — a full circle.
    expect(dayShares(secs, hs, ticked, SAT)).toEqual([
      { color: '#ff0000', frac: 1 },
      { color: '#00ff00', frac: 0 },
    ]);
    // Monday: both count, one ticked — half.
    expect(dayShares(secs, hs, ticked, MON)[0]!.frac).toBe(0.5);
  });

  it('leaves a Never habit out of the numerator AND the denominator', () => {
    const hs = [habit('a', 's1', 'always'), habit('n', 's1', 'never')];
    // Even TICKED, the Never habit must not move the circle: if it counted in
    // the numerator alone it would read as more than done.
    expect(dayShares(secs, hs, () => true, MON)).toEqual([
      { color: '#ff0000', frac: 1 },
      { color: '#00ff00', frac: 0 },
    ]);
    // And with only Never habits there is nothing to fill, rather than a
    // division by zero.
    expect(dayShares(secs, [habit('n', 's1', 'never')], () => true, MON)).toEqual([
      { color: '#ff0000', frac: 0 },
      { color: '#00ff00', frac: 0 },
    ]);
  });

  it('splits the circle between sections, and the shares sum to one when everything is done', () => {
    const hs = [habit('a', 's1'), habit('b', 's2'), habit('c', 's2')];
    const shares = dayShares(secs, hs, () => true, MON);
    expect(shares.map((s) => s.frac)).toEqual([1 / 3, 2 / 3]);
    expect(shares.reduce((n, s) => n + s.frac, 0)).toBeCloseTo(1);
  });

  it('an untouched day is empty, not absent', () => {
    const hs = [habit('a', 's1'), habit('b', 's2')];
    expect(dayShares(secs, hs, () => false, MON).map((s) => s.frac)).toEqual([0, 0]);
  });
});
