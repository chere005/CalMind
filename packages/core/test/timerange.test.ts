import { describe, it, expect } from 'vitest';
import { parseTimeRangeFromText, parseWhenFromText } from '../src/parse';

const TODAY = '2026-08-20';
const NOW = '10:00';

/**
 * Time ranges, in the one parser every field reads (Sean, 2026-08-20: "add
 * range parsing to time specifications everywhere").
 *
 * The interesting half is not "9am-10am" — it is the leaning: people write
 * "12-1pm" and mean midday to one, and "11-1pm" and mean the morning. Which
 * side borrows the meridiem is settled by whether the result reads forward,
 * so there is no rule about word order to get wrong.
 */
describe('a time range', () => {
  const range = (s: string) => parseTimeRangeFromText(s);

  it('reads both sides when both say so', () => {
    expect(range('standup 9am-10am')).toEqual(['standup', '09:00', '10:00']);
  });

  it('takes an en dash, an em dash, and the words', () => {
    expect(range('standup 9am–10am')[1]).toBe('09:00');
    expect(range('standup 9am—10am')[1]).toBe('09:00');
    expect(range('standup 9am to 10am')).toEqual(['standup', '09:00', '10:00']);
    expect(range('standup 9am until 10am')[2]).toBe('10:00');
  });

  it('minutes on either side', () => {
    expect(range('gym 6:30am-7:15am')).toEqual(['gym', '06:30', '07:15']);
    expect(range('call 3pm to 4:30pm')).toEqual(['call', '15:00', '16:30']);
  });

  it("the START leans on the end — Sean's own example", () => {
    expect(range('lunch 12-1pm')).toEqual(['lunch', '12:00', '13:00']);
  });

  it('…and flips when leaning would run backwards', () => {
    // 11pm→1pm is not a range. The morning is what was meant.
    expect(range('errands 11-1pm')).toEqual(['errands', '11:00', '13:00']);
  });

  it('the END leans on the start, and flips the same way', () => {
    expect(range('shift 11am-1')).toEqual(['shift', '11:00', '13:00']);
    expect(range('shift 9am-11')).toEqual(['shift', '09:00', '11:00']);
  });

  it('an equal pair is a long one, not a zero-length one', () => {
    expect(range('vigil 12-12pm')).toEqual(['vigil', '00:00', '12:00']);
  });

  it('leaves a bare number pair alone — a score is not a schedule', () => {
    expect(range('final 2-1')).toEqual(['final 2-1', null, null]);
    expect(range('read pages 30-45')).toEqual(['read pages 30-45', null, null]);
  });

  it('refuses an impossible clock', () => {
    expect(range('code 13-15pm')).toEqual(['code 13-15pm', null, null]);
    expect(range('code 9:70am-10am')).toEqual(['code 9:70am-10am', null, null]);
  });
});

describe('the range through the one door every field uses', () => {
  it('lifts both tokens out of the title and reports the end', () => {
    const [text, date, time, end] = parseWhenFromText('lunch with Ada 9/3 12-1pm', TODAY, NOW);
    expect(text).toBe('lunch with Ada');
    expect(date).toBe('2026-09-03');
    expect(time).toBe('12:00');
    expect(end).toBe('13:00');
  });

  it('a single time still behaves exactly as it did — no end', () => {
    const [text, , time, end] = parseWhenFromText('standup 9am', TODAY, NOW);
    expect(text).toBe('standup');
    expect(time).toBe('09:00');
    expect(end).toBeNull();
  });

  it('a range implies its day like any time does', () => {
    // 8am has gone by at 10:00, so it belongs to tomorrow — the same rule a
    // bare single time has always followed.
    const [, date] = parseWhenFromText('run 8-9am', TODAY, NOW);
    expect(date).toBe('2026-08-21');
  });

  it('the escape still wins over a range', () => {
    const [text, , time, end] = parseWhenFromText('track \\9am-10am mix', TODAY, NOW);
    expect(text).toBe('track 9am-10am mix');
    expect(time).toBeNull();
    expect(end).toBeNull();
  });

  it('the preposition leaves with the range, as it does with a time', () => {
    const [text] = parseWhenFromText('review at 2-3pm', TODAY, NOW);
    expect(text).toBe('review');
  });

  it('lift.time off leaves a range in the words untouched', () => {
    const [text, , time, end] = parseWhenFromText('lunch 12-1pm', TODAY, NOW, { time: false });
    expect(text).toBe('lunch 12-1pm');
    expect(time).toBeNull();
    expect(end).toBeNull();
  });
});
