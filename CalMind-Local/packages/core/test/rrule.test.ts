import { describe, it, expect } from 'vitest';
import { expandRrule, parseRrule } from '../src/rrule';

const W = (from: string, to: string) => [from, to] as const;

describe('parseRrule', () => {
  it('reads the parts a calendar actually writes', () => {
    const r = parseRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T000000Z')!;
    expect(r.freq).toBe('WEEKLY');
    expect(r.interval).toBe(2);
    expect(r.byday).toEqual(['MO', 'WE']);
    expect(r.until).toBe('2026-12-31');
  });
  it('a rule with no FREQ is not a rule', () => {
    expect(parseRrule('INTERVAL=2')).toBeNull();
  });
});

describe('the everyday patterns', () => {
  it('no rule at all is one date, and only inside the window', () => {
    expect(expandRrule('2026-08-08', null, [], ...W('2026-08-01', '2026-08-31'))).toEqual(['2026-08-08']);
    expect(expandRrule('2026-08-08', null, [], ...W('2026-09-01', '2026-09-30'))).toEqual([]);
  });

  it('every third day, five times', () => {
    expect(expandRrule('2026-08-01', 'FREQ=DAILY;INTERVAL=3;COUNT=5', [], ...W('2026-08-01', '2026-12-31')))
      .toEqual(['2026-08-01', '2026-08-04', '2026-08-07', '2026-08-10', '2026-08-13']);
  });

  it('Mondays and Wednesdays', () => {
    expect(expandRrule('2026-08-03', 'FREQ=WEEKLY;BYDAY=MO,WE', [], ...W('2026-08-01', '2026-08-16')))
      .toEqual(['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12']);
  });

  it('a fortnightly stand-up skips the weeks in between', () => {
    expect(expandRrule('2026-08-03', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', [], ...W('2026-08-01', '2026-09-30')))
      .toEqual(['2026-08-03', '2026-08-17', '2026-08-31', '2026-09-14', '2026-09-28']);
  });

  it('WKST decides which days share a week, and it changes the answer', () => {
    // The subtlest thing in this file and the only part with nothing watching
    // it. WKST is inert until INTERVAL is above 1 AND the BYDAY set straddles
    // a week boundary; then it decides where one fortnight ends and the next
    // begins. This is RFC 5545's own example, and the point of it is that the
    // two answers DIFFER — an implementation that quietly ignored WKST would
    // return the Monday-start list for both and look perfectly plausible.
    const mo = expandRrule('1997-08-05', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO');
    const su = expandRrule('1997-08-05', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU');
    expect(mo).toEqual(['1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24']);
    expect(su).toEqual(['1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31']);
    expect(su, 'the week start is not decoration').not.toEqual(mo);
  });

  it('UNTIL includes its own day and then stops', () => {
    expect(expandRrule('2026-08-01', 'FREQ=DAILY;UNTIL=20260804', [], ...W('2026-08-01', '2026-12-31')))
      .toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  });

  it('EXDATE removes a date without shifting the rest', () => {
    expect(expandRrule('2026-08-03', 'FREQ=WEEKLY;BYDAY=MO', ['2026-08-10'], ...W('2026-08-01', '2026-08-31')))
      .toEqual(['2026-08-03', '2026-08-17', '2026-08-24', '2026-08-31']);
  });
});

describe('the dates that do not exist', () => {
  it('monthly on the 31st SKIPS short months rather than sliding to the 30th', () => {
    // RFC 5545 is explicit and it is the opposite of ordinary date maths. A
    // meeting quietly moved to the 28th of February is wrong in the way
    // nobody notices until they miss it.
    expect(expandRrule('2026-01-31', 'FREQ=MONTHLY', [], ...W('2026-01-01', '2026-08-31')))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31']);
  });

  it('29 February happens only in leap years', () => {
    expect(expandRrule('2024-02-29', 'FREQ=YEARLY', [], ...W('2024-01-01', '2033-12-31')))
      .toEqual(['2024-02-29', '2028-02-29', '2032-02-29']);
  });
});

describe('the nth weekday of a month', () => {
  it('the third Friday', () => {
    expect(expandRrule('2026-08-21', 'FREQ=MONTHLY;BYDAY=3FR', [], ...W('2026-08-01', '2026-11-30')))
      .toEqual(['2026-08-21', '2026-09-18', '2026-10-16', '2026-11-20']);
  });
  it('the LAST Friday, which is not always the fourth', () => {
    expect(expandRrule('2026-08-28', 'FREQ=MONTHLY;BYDAY=-1FR', [], ...W('2026-08-01', '2026-11-30')))
      .toEqual(['2026-08-28', '2026-09-25', '2026-10-30', '2026-11-27']);
  });
  it('an unnumbered BYDAY means every one of them in the month', () => {
    expect(expandRrule('2026-08-07', 'FREQ=MONTHLY;BYDAY=FR', [], ...W('2026-08-01', '2026-08-31')))
      .toEqual(['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28']);
  });
  it('BYMONTHDAY counts backwards when it is negative', () => {
    expect(expandRrule('2026-08-31', 'FREQ=MONTHLY;BYMONTHDAY=-1', [], ...W('2026-08-01', '2026-11-30')))
      .toEqual(['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30']);
  });
});

describe('the awkward bits', () => {
  it('COUNT counts occurrences, including ones before the window opens', () => {
    // Otherwise a window that starts late silently extends the series — the
    // ten-session course would run to twelve.
    expect(expandRrule('2026-08-01', 'FREQ=DAILY;COUNT=5', [], ...W('2026-08-03', '2026-12-31')))
      .toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('nothing is ever emitted before the start date', () => {
    expect(expandRrule('2026-08-15', 'FREQ=WEEKLY;BYDAY=MO,SA', [], ...W('2026-08-01', '2026-08-25')))
      .toEqual(['2026-08-15', '2026-08-17', '2026-08-22', '2026-08-24']);
  });

  it('a rule it does not understand still yields the event itself', () => {
    // An event in the wrong pattern is a complaint; an event that vanished is
    // a missed appointment.
    expect(expandRrule('2026-08-08', 'FREQ=HOURLY;INTERVAL=6', [], ...W('2026-08-01', '2026-08-31')))
      .toEqual(['2026-08-08']);
  });

  it('an open-ended daily rule is bounded by the window, not by patience', () => {
    const out = expandRrule('2020-01-01', 'FREQ=DAILY', [], ...W('2026-08-01', '2026-08-05'));
    expect(out).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']);
  });
});
