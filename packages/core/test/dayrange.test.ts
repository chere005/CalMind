import { describe, expect, it } from 'vitest';
import { normalizeEndDate, parseDayRangeFromText, parseWhenFromText } from '../src/parse';

/**
 * A weekday RANGE — Sean, 2026-09-19: "calmind should have mon-wed parsing
 * that would be an all day event and any varient like Monday-Wed case
 * insensitive".
 *
 * The end DAY is the fifth thing parseWhenFromText hands back, and the spec
 * replay only reads the first three, so the span itself is held here.
 *
 * 2026-08-01 is a Saturday. The first Monday after it is the 3rd.
 */
const SAT = '2026-08-01';

describe('what a range spans', () => {
  it('runs from the coming first day to the second day after it', () => {
    expect(parseDayRangeFromText('conference mon-wed', SAT)).toEqual(['conference', '2026-08-03', '2026-08-05']);
  });

  it('crosses the weekend forwards, never backwards through the week', () => {
    // fri-mon is three days, not a walk back to the Monday before.
    expect(parseDayRangeFromText('away fri-mon', SAT)).toEqual(['away', '2026-08-07', '2026-08-10']);
  });

  it('counts today as the coming day, the way one weekday alone does', () => {
    // Asked on the Saturday, "sat-sun" starts today.
    expect(parseDayRangeFromText('market sat-sun', SAT)).toEqual(['market', SAT, '2026-08-02']);
  });

  it('reads one day named twice as one day, which core then drops', () => {
    const [, start, end] = parseDayRangeFromText('standup mon-mon', SAT);
    expect([start, end]).toEqual(['2026-08-03', '2026-08-03']);
    expect(normalizeEndDate(start!, end)).toBeNull();
  });

  it('spans a whole week and a bit when the second day comes first', () => {
    expect(parseDayRangeFromText('cover wed-tue', SAT)).toEqual(['cover', '2026-08-05', '2026-08-11']);
  });
});

describe('how it may be written', () => {
  const same = (input: string) => {
    const [text, start, end] = parseDayRangeFromText(input, SAT);
    expect([start, end], input).toEqual(['2026-08-03', '2026-08-05']);
    expect(text, input).toBe('conference');
  };

  it('takes every spelling and every case', () => {
    for (const input of ['conference mon-wed', 'conference Mon-Wed', 'conference MON-WED',
                         'conference Monday-Wed', 'conference mon-Wednesday',
                         'conference monday-wednesday', 'conference MONDAY - Weds']) same(input);
  });

  it('takes a dash of any width, spaced or not', () => {
    for (const input of ['conference mon-wed', 'conference mon - wed',
                         'conference mon–wed', 'conference mon — wed']) same(input);
  });

  it('takes the words people write instead of a dash', () => {
    for (const input of ['conference mon to wed', 'conference mon through wed',
                         'conference mon thru wed', 'conference mon until wed',
                         'conference from mon to wed']) same(input);
  });
});

describe('what it leaves alone', () => {
  it('is not a range when only one day is named', () => {
    expect(parseDayRangeFromText('lunch friday', SAT)).toEqual(['lunch friday', null, null]);
  });

  it('is not a range when the other side is an ordinary word', () => {
    expect(parseDayRangeFromText('sun-dried tomatoes', SAT)).toEqual(['sun-dried tomatoes', null, null]);
    expect(parseDayRangeFromText('talk to bob', SAT)).toEqual(['talk to bob', null, null]);
  });

  it('leaves a hyphenated word whole, and still finds a real day after it', () => {
    expect(parseWhenFromText('sun-dried tomatoes', SAT)[0]).toBe('sun-dried tomatoes');
    expect(parseWhenFromText('sun-dried tomatoes', SAT)[1]).toBeNull();
    const [text, date] = parseWhenFromText('sun-dried tomatoes on friday', SAT);
    expect({ text, date }).toEqual({ text: 'sun-dried tomatoes', date: '2026-08-07' });
  });
});

describe('what comes out of the whole parse', () => {
  it('is an all-day span: a start, an end day, and no clock at all', () => {
    const [text, date, time, end, endDate] = parseWhenFromText('conference mon-wed', SAT);
    expect({ text, date, time, end, endDate })
      .toEqual({ text: 'conference', date: '2026-08-03', time: null, end: null, endDate: '2026-08-05' });
  });

  it('keeps a time written beside it, and stays a span', () => {
    const [text, date, time, , endDate] = parseWhenFromText('standup mon-wed 9am', SAT, '08:00');
    expect({ text, date, time, endDate })
      .toEqual({ text: 'standup', date: '2026-08-03', time: '09:00', endDate: '2026-08-05' });
  });

  it('gives an explicit m/d date the last word, and takes no span from the line', () => {
    const [, date, , , endDate] = parseWhenFromText('conference 8/20 mon-wed', SAT);
    expect({ date, endDate }).toEqual({ date: '2026-08-20', endDate: null });
  });

  it('hands back nothing extra for a line with no range in it', () => {
    expect(parseWhenFromText('Vet 8/3 2pm', SAT)[4]).toBeNull();
  });
});
