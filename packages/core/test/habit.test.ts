import { describe, it, expect } from 'vitest';
import {
  dayShares, frequencyOf, habitCountedOn, habitOnScheduleOn, isWeekend,
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

  it('SCHEDULE and COUNT are different questions, and the two frequencies part them oppositely', () => {
    // Never is on schedule every day and counts on none of them; Weekdays is
    // off schedule at the weekend and counts there only when it is ticked.
    const never = habit('n', 's', 'never');
    expect(habitOnScheduleOn(never, MON), 'Never is an ordinary day, drawn normally').toBe(true);
    expect(habitCountedOn(never, MON, false), 'Never never counts').toBe(false);
    expect(habitCountedOn(never, MON, true), 'not even ticked — "at all" was explicit').toBe(false);

    const week = habit('w', 's', 'weekdays');
    expect(habitOnScheduleOn(week, FRI)).toBe(true);
    expect(habitOnScheduleOn(week, SAT), 'off schedule, so drawn faint').toBe(false);
    expect(habitCountedOn(week, SAT, false), 'an untouched weekend costs nothing').toBe(false);
    expect(habitCountedOn(week, SAT, true), 'a ticked weekend is a bonus that counts').toBe(true);
    expect(habitCountedOn(week, FRI, false), 'a weekday counts whether done or not').toBe(true);

    const always = habit('a', 's', 'always');
    expect(habitOnScheduleOn(always, SUN)).toBe(true);
    expect(habitCountedOn(always, SUN, false)).toBe(true);
  });

  it('every habit is drawn on every day now — no cell is ever missing', () => {
    // The weekend cell used to be absent. It is present and faint instead, so
    // there is no day on which a habit cannot be ticked.
    const hs = [habit('a', 's', 'always'), habit('w', 's', 'weekdays'), habit('n', 's', 'never')];
    for (const d of [FRI, SAT, SUN, MON]) {
      expect(hs.every((h) => typeof habitOnScheduleOn(h, d) === 'boolean')).toBe(true);
    }
    expect(hs.filter((h) => !habitOnScheduleOn(h, SAT)).map((h) => h.id)).toEqual(['w']);
    expect(hs.filter((h) => !habitOnScheduleOn(h, FRI))).toEqual([]);
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
    // Saturday: the weekdays habit is off schedule and untouched, so only 'a'
    // counts, and it is ticked — a full circle.
    expect(dayShares(secs, hs, ticked, SAT)).toEqual([
      { color: '#ff0000', frac: 1, open: 0 },
      { color: '#00ff00', frac: 0, open: 0 },
    ]);
    // Monday: both count, one ticked — half.
    expect(dayShares(secs, hs, ticked, MON)[0]!.frac).toBe(0.5);
  });

  it('leaves a Never habit out of the numerator AND the denominator', () => {
    const hs = [habit('a', 's1', 'always'), habit('n', 's1', 'never')];
    // Even TICKED, the Never habit must not move the circle: if it counted in
    // the numerator alone it would read as more than done.
    expect(dayShares(secs, hs, () => true, MON)).toEqual([
      { color: '#ff0000', frac: 1, open: 0 },
      { color: '#00ff00', frac: 0, open: 0 },
    ]);
    // And with only Never habits there is nothing to fill, rather than a
    // division by zero. Nothing OWED either — a Never habit is not a thing the
    // day asked for, so it must not draw a faint arc any more than a solid one.
    expect(dayShares(secs, [habit('n', 's1', 'never')], () => true, MON)).toEqual([
      { color: '#ff0000', frac: 0, open: 0 },
      { color: '#00ff00', frac: 0, open: 0 },
    ]);
  });

  it('a weekend tick is a bonus: it can only help the circle, never dilute it', () => {
    // The rule Sean asked for on 2026-08-12, stated as the two halves that
    // matter. A weekdays habit at the weekend enters BOTH sides or NEITHER.
    const hs = [habit('a', 's1', 'always'), habit('w', 's1', 'weekdays')];

    // Nothing done at all: the untouched weekend habit stays out of the
    // denominator, so the circle is empty rather than half-failed.
    expect(dayShares(secs, hs, () => false, SAT).map((x) => x.frac)).toEqual([0, 0]);

    // The always habit done, the weekend one not: a FULL circle, because the
    // weekend one was never asked for.
    expect(dayShares(secs, hs, (id) => id === 'a', SAT)[0]!.frac).toBe(1);

    // Both done: still a full circle — a bonus cannot make a finished day
    // read as unfinished.
    expect(dayShares(secs, hs, () => true, SAT)[0]!.frac).toBe(1);

    // The bonus alone does NOT fill the circle, and this is the assertion
    // worth having: 'a' is an always habit, so it is due on Saturday whether
    // or not it is done. Doing only the weekend bonus leaves it half — the
    // bonus joins the denominator it earns, it does not excuse the day's real
    // work. (Written expecting 1 at first; the suite was right and I was not.)
    expect(dayShares(secs, hs, (id) => id === 'w', SAT)[0]!.frac).toBe(0.5);
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

  describe('what the day still OWES', () => {
    // Sean, 2026-08-12: "very transparent fill for items required-but-unchecked
    // that day". The fill needs a number, and this is it.

    it('is what was required and not done', () => {
      const hs = [habit('a', 's1'), habit('b', 's2'), habit('c', 's2')];
      // Only 'b' done. s1 owes its one, s2 has one of two.
      const shares = dayShares(secs, hs, (id) => id === 'b', MON);
      expect(shares.map((s) => s.frac)).toEqual([0, 1 / 3]);
      expect(shares.map((s) => s.open)).toEqual([1 / 3, 1 / 3]);
    });

    it('fills the circle exactly once, between the two shares', () => {
      // The property the drawing depends on: each section is one contiguous
      // wedge, and the wedges together are the whole circle. If this ever
      // exceeded 1 the arcs would wrap past 12 o'clock and overdraw the
      // section they started from.
      const hs = [habit('a', 's1'), habit('b', 's2'), habit('c', 's2')];
      for (const ticked of [() => true, () => false, (id: string) => id === 'c']) {
        const shares = dayShares(secs, hs, ticked, MON);
        expect(shares.reduce((n, s) => n + s.frac + s.open, 0)).toBeCloseTo(1);
      }
    });

    it('is empty on a day that asked for nothing', () => {
      // No habits at all, and only-Never habits, both go through the total===0
      // branch — there is nothing owed rather than everything owed.
      expect(dayShares(secs, [], () => false, MON).map((s) => s.open)).toEqual([0, 0]);
      expect(dayShares(secs, [habit('n', 's1', 'never')], () => false, MON).map((s) => s.open))
        .toEqual([0, 0]);
    });

    it('owes nothing for an untouched OFF-schedule day', () => {
      // The half that makes `open` honest rather than just "not ticked": a
      // weekdays habit at the weekend was never asked for, so it owes nothing.
      // Reading `open` off the whole habit list instead of off what the day
      // counted — the obvious wrong implementation — would draw a faint arc on
      // every Saturday for every weekday habit Sean has.
      //
      // THE WEEKDAYS HABIT IS IN ITS OWN SECTION, and an always habit shares
      // the day, both deliberately. Written first as a lone weekdays habit, it
      // was a test that could not fail: with nothing counted the whole function
      // returns early on `total === 0` and never reaches the arithmetic this is
      // about. Proven by making that exact wrong change and watching this stay
      // green while two older tests went red. Now s1 carries the day's real
      // work and s2 carries only the thing Saturday did not ask for, so s2's
      // share is the assertion.
      const hs = [habit('a', 's1', 'always'), habit('w', 's2', 'weekdays')];
      expect(dayShares(secs, hs, () => false, SAT).map((s) => s.open)).toEqual([1, 0]);
      // …and on a weekday it does owe it — half the day each.
      expect(dayShares(secs, hs, () => false, MON).map((s) => s.open)).toEqual([0.5, 0.5]);
    });

    it('owes nothing once the thing is ticked, on either kind of day', () => {
      const hs = [habit('w', 's1', 'weekdays')];
      expect(dayShares(secs, hs, () => true, MON)[0]!).toEqual({ color: '#ff0000', frac: 1, open: 0 });
      // The weekend bonus: in the numerator and denominator together, so it is
      // done rather than owed.
      expect(dayShares(secs, hs, () => true, SAT)[0]!).toEqual({ color: '#ff0000', frac: 1, open: 0 });
    });
  });
});
