/**
 * shiftDate going BACKWARDS over a month or year boundary.
 *
 * Found unwatched by mutation, 2026-08-11: `Math.floor(total / 12)` swapped for
 * `Math.trunc`, and `((total % 12) + 12) % 12 + 1` for a bare `total % 12 + 1`,
 * and nothing anywhere went red. Both differ only when `total` is negative.
 *
 * That is not currently reachable through the app — REL_SPAN_RE matches
 * `(an?|\d{1,3})` with no minus, so "in 2 months" can only go forwards, and
 * the one negative shift a user can type, "yesterday", is a DAY and takes the
 * other branch entirely. `shiftDate`'s only caller outside this file is
 * day.ts's addDays, which is days as well.
 *
 * Pinned anyway, and the distinction matters: this is not faking an impossible
 * state to reach dead code. `shiftDate` is exported from core's index with a
 * signed `n` in its signature, so a backwards month is a valid call somebody
 * will make the first time the calendar grows a "previous month" pager — and
 * it would be wrong by a whole year, silently, because `trunc` rounds -1/12
 * toward zero and leaves the year where it was.
 */
import { describe, it, expect } from 'vitest';
import { shiftDate } from '../src/index';

describe('shiftDate, backwards', () => {
  it('crosses into the previous year rather than staying put', () => {
    expect(shiftDate('2026-01-15', -1, 'month')).toBe('2025-12-15');
    expect(shiftDate('2026-01-15', -12, 'month')).toBe('2025-01-15');
    expect(shiftDate('2026-01-31', -13, 'month')).toBe('2024-12-31');
  });

  it('clamps the day going back, as it does going forward', () => {
    // Mar 31 has no counterpart in February.
    expect(shiftDate('2026-03-31', -1, 'month')).toBe('2026-02-28');
    expect(shiftDate('2024-03-31', -1, 'month')).toBe('2024-02-29'); // leap
    expect(shiftDate('2026-02-29', -1, 'year')).toBe('2025-02-28');
  });

  it('and forwards still works, so this is not a one-way fix', () => {
    expect(shiftDate('2026-01-31', 1, 'month')).toBe('2026-02-28');
    expect(shiftDate('2026-12-15', 1, 'month')).toBe('2027-01-15');
    expect(shiftDate('2026-01-15', 12, 'month')).toBe('2027-01-15');
  });
});
