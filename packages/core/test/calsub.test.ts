import { describe, it, expect } from 'vitest';
import { subOccurrences } from '../src/calsub';

/**
 * The join between parseIcal and expandRrule — both heavily tested alone; what
 * these pin is the JOIN's own arithmetic: windows, spans, and the exclusive
 * all-day DTEND. Shapes are the real-world ones the ical tests established
 * (folded lines and TZIDs are ical.test.ts's business, not repeated here).
 */

const wrap = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;

const TZ = 'America/Chicago';

describe('subOccurrences', () => {
  it('a plain timed event chips its day with start and end', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Dentist\r\nDTSTART;TZID=America/Chicago:20260820T140000\r\nDTEND;TZID=America/Chicago:20260820T150000\r\nEND:VEVENT\r\n',
    );
    expect(subOccurrences(ics, TZ, '2026-08-01', '2026-08-31')).toEqual([
      { date: '2026-08-20', time: '14:00', endTime: '15:00', title: 'Dentist', location: '', uid: 'a' },
    ]);
  });

  it('a weekly recurrence lands once per week inside the window and not outside it', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:Standup\r\nDTSTART;TZID=America/Chicago:20260803T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\n',
    );
    const days = subOccurrences(ics, TZ, '2026-08-10', '2026-08-31').map((o) => o.date);
    expect(days).toEqual(['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('an all-day event has no time, and its EXCLUSIVE DTEND does not paint the checkout day', () => {
    // Two nights away: the 21st and 22nd. DTEND says the 23rd, meaning "over".
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:trip\r\nSUMMARY:Cabin\r\nDTSTART;VALUE=DATE:20260821\r\nDTEND;VALUE=DATE:20260823\r\nEND:VEVENT\r\n',
    );
    const out = subOccurrences(ics, TZ, '2026-08-01', '2026-08-31');
    expect(out.map((o) => o.date)).toEqual(['2026-08-21', '2026-08-22']);
    expect(out[0]!.time).toBeNull();
  });

  it('a multi-day event straddling the window start still paints the days inside it', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:s\r\nSUMMARY:Fair\r\nDTSTART;VALUE=DATE:20260830\r\nDTEND;VALUE=DATE:20260902\r\nEND:VEVENT\r\n',
    );
    // Window is September: the fair began in August and is still on.
    expect(subOccurrences(ics, TZ, '2026-09-01', '2026-09-30').map((o) => o.date)).toEqual(['2026-09-01']);
  });

  it('EXDATE removes exactly its occurrence', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Yoga\r\nDTSTART;TZID=America/Chicago:20260803T180000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4\r\nEXDATE;TZID=America/Chicago:20260817T180000\r\nEND:VEVENT\r\n',
    );
    expect(subOccurrences(ics, TZ, '2026-08-01', '2026-08-31').map((o) => o.date)).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-24',
    ]);
  });

  it('a UTC instant lands on the wall-clock day of the given zone', () => {
    // 02:00Z on the 21st is 9pm Chicago on the 20TH.
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:Launch\r\nDTSTART:20260821T020000Z\r\nEND:VEVENT\r\n',
    );
    expect(subOccurrences(ics, TZ, '2026-08-01', '2026-08-31')).toEqual([
      { date: '2026-08-20', time: '21:00', endTime: null, title: 'Launch', location: '', uid: 'z' },
    ]);
  });

  it('the day sorts: all-day first, then by time, ties by title', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Bee\r\nDTSTART;TZID=America/Chicago:20260820T090000\r\nEND:VEVENT\r\n' +
      'BEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Fete\r\nDTSTART;VALUE=DATE:20260820\r\nEND:VEVENT\r\n' +
      'BEGIN:VEVENT\r\nUID:3\r\nSUMMARY:Ant\r\nDTSTART;TZID=America/Chicago:20260820T090000\r\nEND:VEVENT\r\n',
    );
    expect(subOccurrences(ics, TZ, '2026-08-20', '2026-08-20').map((o) => o.title)).toEqual([
      'Fete', 'Ant', 'Bee',
    ]);
  });

  it('a runaway all-day span is capped, not a flood', () => {
    // A typo'd DTEND a year out must not paint 365 chips.
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:r\r\nSUMMARY:Oops\r\nDTSTART;VALUE=DATE:20260801\r\nDTEND;VALUE=DATE:20270801\r\nEND:VEVENT\r\n',
    );
    const out = subOccurrences(ics, TZ, '2026-08-01', '2026-12-31');
    expect(out.length).toBeLessThanOrEqual(60);
  });
});
