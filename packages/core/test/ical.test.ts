import { describe, it, expect } from 'vitest';
import { parseIcal, parseIcalLine, unescapeIcalText, unfoldIcal, utcToZoned, zonedToUtc } from '../src/ical';

const CHI = 'America/Chicago';
const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

describe('unfolding and property lines', () => {
  it('rejoins a folded line without eating a character', () => {
    expect(unfoldIcal('SUMMARY:Dentist appoin\r\n tment')).toEqual(['SUMMARY:Dentist appointment']);
    expect(unfoldIcal('A:1\r\nB:2')).toEqual(['A:1', 'B:2']);
  });
  it('finds the colon that is not inside a quoted parameter', () => {
    const p = parseIcalLine('DTSTART;TZID="America/New_York":20260808T140000')!;
    expect(p.name).toBe('DTSTART');
    expect(p.params.TZID).toBe('America/New_York');
    expect(p.value).toBe('20260808T140000');
  });
  it('unescapes the separators a TEXT value has to hide', () => {
    expect(unescapeIcalText('Lunch\\, then\; run\\nBring shoes')).toBe('Lunch, then; run\nBring shoes');
    expect(unescapeIcalText('back\\\\slash')).toBe('back\\slash');
  });
});

describe('the three kinds of moment', () => {
  it('a DATE is a day with no time, and stays that day in any zone', () => {
    const [e] = parseIcal(wrap('BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:20260808\r\nEND:VEVENT'), CHI);
    expect(e!.start).toBe('2026-08-08');
    expect(e!.time).toBeNull();
    expect(e!.allDay).toBe(true);
  });

  it('a UTC instant is converted, including across midnight', () => {
    // 01:30 UTC on the 9th is still the 8th in Chicago — the case where a
    // naive parser files an event on the wrong day entirely.
    const [e] = parseIcal(wrap('BEGIN:VEVENT\r\nUID:2\r\nDTSTART:20260809T013000Z\r\nEND:VEVENT'), CHI);
    expect(e!.start).toBe('2026-08-08');
    expect(e!.time).toBe('20:30');
  });

  it('a floating time means the same clock reading everywhere', () => {
    const [e] = parseIcal(wrap('BEGIN:VEVENT\r\nUID:3\r\nDTSTART:20260808T090000\r\nEND:VEVENT'), CHI);
    expect(e!.start).toBe('2026-08-08');
    expect(e!.time).toBe('09:00');
  });

  it('a wall clock in ANOTHER zone is moved into ours', () => {
    const [e] = parseIcal(
      wrap('BEGIN:VEVENT\r\nUID:4\r\nDTSTART;TZID=America/New_York:20260808T140000\r\nEND:VEVENT'),
      CHI,
    );
    expect(e!.time).toBe('13:00');
  });
});

describe('daylight saving, which is where this quietly goes wrong', () => {
  it('the same UTC time is a different Chicago hour in winter and summer', () => {
    expect(utcToZoned(Date.UTC(2026, 0, 15, 18, 0), CHI).hm).toBe('12:00'); // CST, -6
    expect(utcToZoned(Date.UTC(2026, 6, 15, 18, 0), CHI).hm).toBe('13:00'); // CDT, -5
  });
  it('a wall clock either side of the spring change lands on the right instant', () => {
    // US clocks go forward on 8 March 2026 at 02:00 local.
    expect(zonedToUtc('2026-03-07', '12:00', CHI)).toBe(Date.UTC(2026, 2, 7, 18, 0));
    expect(zonedToUtc('2026-03-09', '12:00', CHI)).toBe(Date.UTC(2026, 2, 9, 17, 0));
  });
  it('and either side of the autumn one', () => {
    expect(zonedToUtc('2026-10-31', '12:00', CHI)).toBe(Date.UTC(2026, 9, 31, 17, 0));
    expect(zonedToUtc('2026-11-02', '12:00', CHI)).toBe(Date.UTC(2026, 10, 2, 18, 0));
  });
  it('round trips every hour across a spring-forward day', () => {
    // The hour 02:00–02:59 does not exist locally, so it is expected to land
    // on 03:00; every other hour must come back exactly as it went in.
    for (let h = 0; h < 24; h++) {
      const hm = `${String(h).padStart(2, '0')}:30`;
      const back = utcToZoned(zonedToUtc('2026-03-08', hm, CHI), CHI);
      if (h !== 2) expect(back.hm, `hour ${h}`).toBe(hm);
      expect(back.ymd).toBe('2026-03-08');
    }
  });
});

describe('the rest of a VEVENT', () => {
  it('keeps summary, location, rrule and exdates, and skips anything with no start', () => {
    const events = parseIcal(
      wrap(
        'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Stand-up\r\nLOCATION:Room 2\\, upstairs\r\n' +
        'DTSTART:20260810T140000Z\r\nDTEND:20260810T143000Z\r\n' +
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEXDATE;VALUE=DATE:20260817,20260824\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:No start at all\r\nEND:VEVENT',
      ),
      CHI,
    );
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.summary).toBe('Stand-up');
    expect(e.location).toBe('Room 2, upstairs');
    expect(e.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    expect(e.exdates).toEqual(['2026-08-17', '2026-08-24']);
    expect(e.time).toBe('09:00');
    expect(e.endTime).toBe('09:30');
  });
});
