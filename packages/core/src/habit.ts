/**
 * How often a habit is meant to happen, and what that means for the grid.
 *
 * Sean, 2026-08-11: a habit is added on a small screen with a Name and a
 * Frequency, and Frequency is one of three:
 *
 *   Always    every day, which is what every habit was before this existed
 *   Weekdays  Monday to Friday. It was "taken out of the list on weekend days
 *             entirely"; Sean revised that on 2026-08-12 — the weekend cell
 *             is still there, drawn FAINT, and can still be ticked. What
 *             changed is only what an untouched weekend costs, which is
 *             nothing
 *   Never     "doesn't count towards the pie charts in the month view at all"
 *
 * THE TWO QUESTIONS ARE DIFFERENT, and conflating them is the whole subtlety
 * here. "Is this day on the habit's schedule?" and "does it count today?" now
 * come apart for BOTH of the non-always frequencies, in opposite directions:
 * Never is on schedule every day and counts on none of them, while Weekdays
 * is off schedule at the weekend and counts there only when it is ticked.
 * Every habit is drawn on every day; none of them is ever missing a cell.
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

/**
 * Is this day one the habit is MEANT to happen on?
 *
 * Only 'weekdays' has an off-schedule day. 'never' is on schedule every day —
 * its exclusion is about COUNTING, not about when it is meant to happen — so
 * it stays drawn as an ordinary habit rather than a permanently faint one.
 */
export function habitOnScheduleOn(h: Rec<'habit'>, date: string): boolean {
  return frequencyOf(h) === 'weekdays' ? !isWeekend(date) : true;
}

/**
 * Does this habit count towards the day's pie — numerator AND denominator?
 *
 * Sean, 2026-08-12, revising the weekend rule he gave the day before: an
 * off-schedule day "can still be selected … when checked off they DO get
 * counted in the month charts, but when not checked they don't count". So a
 * Saturday tick on a weekdays habit is a BONUS — it enters the numerator and
 * the denominator together, which means it can only ever help the circle, and
 * leaving it alone costs nothing because it never reaches the denominator.
 *
 * That is why this needs to know whether the day is ticked: the question is
 * no longer answerable from the calendar alone.
 *
 * 'never' still counts on no day at all, ticked or not — "doesn't count
 * towards the pie charts in the month view at all" was explicit and is a
 * different request from this one.
 */
export function habitCountedOn(h: Rec<'habit'>, date: string, ticked: boolean): boolean {
  if (frequencyOf(h) === 'never') return false;
  return habitOnScheduleOn(h, date) || ticked;
}

/**
 * One day's pie, as contiguous shares: each section's ticked share of
 * everything that counts THAT DAY, and beside it the share that day still
 * OWES — counted, and not ticked.
 *
 * The denominator is per-day, which is the point of the feature — a
 * weekday-only habit must not make Sunday's circle unfillable, and a 'never'
 * habit must not dilute any day. Before this it was the flat count of every
 * visible habit, on every day, whatever the day was.
 *
 * `open` is Sean's 2026-08-12 ask: "very transparent fill for items
 * required-but-unchecked that day". A section's two shares are adjacent in the
 * drawing, so each section owns ONE contiguous wedge the size of everything it
 * asked of that day, of which the solid part is what got done. That makes the
 * circle always full on a day with anything counted, and the reading of a
 * half-empty day becomes "this much was owed" rather than a gap that could
 * equally mean nothing was asked.
 *
 * The two are separately useful and neither is derivable from the other, which
 * is why both are returned: `frac` sums to 1 only when everything is done, and
 * `frac + open` sums to 1 whenever anything counts at all.
 *
 * `open` is exactly "required that day and not done", with no extra rule of its
 * own — an OFF-schedule day only enters `counted` when it is ticked (a weekend
 * tick is a bonus; see habitCountedOn), so an untouched Saturday on a weekdays
 * habit contributes to neither share. That is what keeps a faint arc from
 * appearing on a day the habit never asked for.
 *
 * Sections are returned in the order given, and a day with nothing countable
 * returns every share at zero rather than dividing by nothing.
 */
export function dayShares(
  sections: Rec<'habitsection'>[],
  habits: Rec<'habit'>[],
  isTicked: (habitId: string, date: string) => boolean,
  date: string,
): { color: string; frac: number; open: number }[] {
  const counted = habits.filter((h) => habitCountedOn(h, date, isTicked(h.id, date)));
  const total = counted.length;
  return sections.map((sec) => {
    if (total === 0) return { color: sec.payload.color, frac: 0, open: 0 };
    const mine = counted.filter((h) => h.payload.sectionId === sec.id);
    const done = mine.filter((h) => isTicked(h.id, date)).length;
    return { color: sec.payload.color, frac: done / total, open: (mine.length - done) / total };
  });
}

/** Is `rec` a live habit? Narrowing helper, so screens stop re-writing it. */
export function isHabit(r: AnyRec): r is Rec<'habit'> {
  return r.type === 'habit' && !r.deleted;
}
