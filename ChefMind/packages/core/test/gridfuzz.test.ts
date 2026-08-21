/**
 * The calendar grids, over two centuries.
 *
 * Grid maths is the classic place for an off-by-one nobody notices until a
 * particular month comes round — a year later, on a leap February that starts
 * on a Sunday. These are properties rather than examples for that reason: the
 * month that breaks it is the one nobody would have written down.
 *
 * The arithmetic is deliberately UTC — `Date.UTC`, and a fixed `T12:00:00Z` in
 * twoWeeksFrom — so a local clock cannot bend it.
 *
 * WHICH THIS CATCHES ONLY OUTSIDE UTC, and that is worth being exact about
 * rather than claiming more. Swapping the noon anchor alone for
 * `new Date(date)` changes nothing anywhere: a date-only ISO string already
 * parses as UTC midnight, and `getUTCDay()` reads the same either way — tried,
 * and every case still passed. The trap needs BOTH halves gone,
 * `new Date(date).getDay()`, and even then the code is genuinely CORRECT under
 * TZ=UTC. Under America/Chicago local midnight falls on the previous day and
 * the fortnight starts on a Monday.
 *
 * So the suite pins TZ=America/Chicago (packages/core/package.json) rather than
 * inheriting the machine's. Otherwise this passes on a UTC runner while being
 * broken for the only person who uses the app — and Chicago is what app.php
 * already defaults its own clock to. The suite passes identically under UTC and
 * Asia/Kathmandu, checked, so pinning hides nothing.
 */
import { describe, it, expect } from 'vitest';
import { monthGrid, monthGridFilled, twoWeeksFrom, weekOf, addDays } from '../src/index';

const dayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

describe('monthGridFilled', () => {
  /**
   * 30s, not vitest's default 5s. This walks two centuries of months and takes
   * five to seven seconds on an idle machine — so it passed here and timed
   * out inside a deploy, which runs it while an export and a browser suite
   * are competing for the same cores. It refused four deploys on
   * 2026-08-20 before the cause was read rather than guessed at: the failure
   * says "Test timed out in 5000ms", not an assertion.
   *
   * The check is unchanged. Only the clock it is given is, and a fuzz test
   * that walks two centuries of months has every right to take seconds.
   */
  it('is whole weeks of real, consecutive dates covering the month, 1900-2100', { timeout: 30_000 }, () => {
    for (let y = 1900; y <= 2100; y++) {
      for (let m = 1; m <= 12; m++) {
        const g = monthGridFilled(y, m);
        expect(g.length % 7, `${y}-${m} is whole weeks`).toBe(0);
        expect(dayOf(g[0]!), `${y}-${m} starts on a Sunday`).toBe(0);
        // Consecutive, with no gap or repeat anywhere in the grid.
        for (let i = 1; i < g.length; i++) {
          expect(addDays(g[i - 1]!, 1), `${y}-${m} cell ${i}`).toBe(g[i]);
        }
        // Every day of the month present exactly once.
        const mine = g.filter((d) => d.slice(0, 7) === `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
        expect(mine.length, `${y}-${m} holds all its own days`).toBe(daysIn(y, m));
        expect(new Set(mine).size).toBe(mine.length);
        // …and no more rows than needed: a grid one week too long would still
        // satisfy everything above.
        expect(g.length / 7).toBe(Math.ceil((dayOf(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`) + daysIn(y, m)) / 7));
      }
    }
  });
});

describe('monthGrid', () => {
  it('pads to the first weekday and then runs the month out', () => {
    for (let y = 1996; y <= 2036; y++) {
      for (let m = 1; m <= 12; m++) {
        const g = monthGrid(y, m);
        const firstDate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
        const lead = g.findIndex((c) => c !== null);
        expect(lead, `${y}-${m} lead nulls`).toBe(dayOf(firstDate));
        expect(g.length - lead, `${y}-${m} day count`).toBe(daysIn(y, m));
        expect(g.slice(lead).every((c) => c !== null), 'no holes after the lead').toBe(true);
      }
    }
  });
});

describe('twoWeeksFrom and weekOf', () => {
  it('give fourteen and seven days, Sunday-aligned, holding the date asked for', () => {
    // A year of consecutive days, so every weekday and every month edge is
    // crossed, plus the US DST switch days explicitly.
    const dates: string[] = [];
    let d = '2026-01-01';
    for (let i = 0; i < 400; i++) { dates.push(d); d = addDays(d, 1); }
    for (const extra of ['2026-03-08', '2026-11-01', '2024-02-29', '2100-02-28']) dates.push(extra);

    for (const date of dates) {
      const two = twoWeeksFrom(date);
      expect(two.length, `${date} is fourteen days`).toBe(14);
      expect(dayOf(two[0]!), `${date} starts on a Sunday`).toBe(0);
      for (let i = 1; i < 14; i++) expect(addDays(two[i - 1]!, 1)).toBe(two[i]);
      expect(two.includes(date), `${date} is in its own fortnight`).toBe(true);

      const wk = weekOf(date);
      expect(wk.cells.length, `${date} week is seven cells`).toBe(7);
      expect(wk.cells.includes(date), `${date} is in its own week`).toBe(true);
      expect(wk.ym).toBe(date.slice(0, 7));
    }
  });
});
