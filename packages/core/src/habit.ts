/**
 * How often a habit is meant to happen, and what that means for the grid.
 *
 * Sean, 2026-08-11: a habit is added on a small screen with a Name and a
 * Frequency, and Frequency is one of three:
 *
 *   Always    every day, which is what every habit was before this existed
 *   Weekdays  Monday to Friday — "it's taken out of the list on weekend days
 *             entirely", so it is not a habit you failed at on a Sunday, it
 *             is not a habit that day at all
 *   Never     "doesn't count towards the pie charts in the month view at all"
 *
 * THE TWO QUESTIONS ARE DIFFERENT, and conflating them is the whole subtlety
 * here. "Is this listed today?" and "does this count today?" have different
 * answers for Never: he asked for it to stop counting, not to disappear — so
 * it stays on the week grid where it can still be ticked, and contributes
 * nothing to the month's pies, numerator and denominator alike. Weekdays
 * answers both the same way, because he did say "taken out of the list".
 *
 * Living here rather than in Habits.tsx because it is behaviour: a rule you
 * can say in a sentence belongs in core with a test. The pie's own maths came
 * with it for the same reason — it decided what a day's circle means while
 * sitting in a screen where nothing could test it.
 */
import type { AnyRec, Rec } from './types';

export type Frequency = 'always' | 'weekdays' | 'never';

/** The order the dropdown offers them in, and the labels it uses. */
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'never', label: 'Never' },
];

/**
 * A habit written before Frequency existed has none, and is 'always' — that
 * is what every habit already was, so nothing changes under Sean's feet.
 * Anything unrecognised reads the same way rather than vanishing from his
 * grid: a bad value should not be able to hide a habit.
 */
export function frequencyOf(h: Rec<'habit'>): Frequency {
  const f = h.payload.frequency;
  return f === 'weekdays' || f === 'never' ? f : 'always';
}

/** Saturday or Sunday, for a 'YYYY-MM-DD' string. */
export function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // Local noon, not midnight: constructing a date at midnight and reading its
  // weekday is the classic place a timezone shifts the answer by a day.
  const day = new Date(y, m - 1, d, 12).getDay();
  return day === 0 || day === 6;
}

/** Does this habit appear in the list on this day? */
export function habitListedOn(h: Rec<'habit'>, date: string): boolean {
  return frequencyOf(h) === 'weekdays' ? !isWeekend(date) : true;
}

/** Does this habit count towards the day's pie — numerator AND denominator? */
export function habitCountedOn(h: Rec<'habit'>, date: string): boolean {
  const f = frequencyOf(h);
  if (f === 'never') return false;
  return f === 'weekdays' ? !isWeekend(date) : true;
}

/**
 * One day's pie, as contiguous shares: each section's ticked share of
 * everything that counts THAT DAY.
 *
 * The denominator is per-day now, which is the point of the feature — a
 * weekday-only habit must not make Sunday's circle unfillable, and a 'never'
 * habit must not dilute any day. Before this it was the flat count of every
 * visible habit, on every day, whatever the day was.
 *
 * Sections are returned in the order given, and a day with nothing countable
 * returns every share at zero rather than dividing by nothing.
 */
export function dayShares(
  sections: Rec<'habitsection'>[],
  habits: Rec<'habit'>[],
  isTicked: (habitId: string, date: string) => boolean,
  date: string,
): { color: string; frac: number }[] {
  const counted = habits.filter((h) => habitCountedOn(h, date));
  const total = counted.length;
  return sections.map((sec) => {
    if (total === 0) return { color: sec.payload.color, frac: 0 };
    const mine = counted.filter((h) => h.payload.sectionId === sec.id && isTicked(h.id, date));
    return { color: sec.payload.color, frac: mine.length / total };
  });
}

/**
 * Every habit, filtered to the ones this day actually lists, in the order
 * given. The week grid draws a column per day, so this is asked per column.
 */
export function habitsListedOn(habits: Rec<'habit'>[], date: string): Rec<'habit'>[] {
  return habits.filter((h) => habitListedOn(h, date));
}

/** The habits of one section, for a day, already filtered by frequency. */
export function sectionHabitsOn(habits: Rec<'habit'>[], sectionId: string, date: string): Rec<'habit'>[] {
  return habits.filter((h) => h.payload.sectionId === sectionId && habitListedOn(h, date));
}

/** Is `rec` a live habit? Narrowing helper, so screens stop re-writing it. */
export function isHabit(r: AnyRec): r is Rec<'habit'> {
  return r.type === 'habit' && !r.deleted;
}
