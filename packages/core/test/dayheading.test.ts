import { describe, it, expect } from 'vitest';
import { dayHeading } from '../src/day';

/**
 * The heading the widget has drawn since 2026-08-12, now shared with the
 * calendar's list view. Uppercase, a middle dot, no comma — the punctuation
 * is the point: toLocaleDateString writes "Fri, Aug 22", and a heading that
 * is ALMOST the widget's is worse than one that is plainly different.
 */
describe('a day heading', () => {
  const TODAY = '2026-08-21';

  it('names today as today, with the date beside it', () => {
    expect(dayHeading('2026-08-21', TODAY)).toBe('TODAY · AUG 21');
  });

  it('any other day is its weekday', () => {
    expect(dayHeading('2026-08-22', TODAY)).toBe('SAT · AUG 22');
    expect(dayHeading('2026-08-24', TODAY)).toBe('MON · AUG 24');
  });

  it('reads a past day the same way — it is not a "today" test in disguise', () => {
    expect(dayHeading('2026-08-20', TODAY)).toBe('THU · AUG 20');
  });

  it('crosses a month and a year without a comma appearing', () => {
    expect(dayHeading('2026-09-01', TODAY)).toBe('TUE · SEP 1');
    expect(dayHeading('2027-01-01', TODAY)).toBe('FRI · JAN 1');
    expect(dayHeading('2027-01-01', TODAY)).not.toContain(',');
  });

  it('a day number is never zero-padded, as the widget never pads it', () => {
    expect(dayHeading('2026-09-05', TODAY)).toBe('SAT · SEP 5');
  });

  it('nonsense in, the string back out rather than an Invalid Date', () => {
    expect(dayHeading('not-a-date', TODAY)).toBe('NOT-A-DATE');
  });
});
