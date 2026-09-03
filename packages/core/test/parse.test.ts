import { describe, it, expect } from 'vitest';
import { defaultNoteTitle, looksLikeDefaultNoteTitle, parseClockField, parseTimeFromText, parseTimeRangeFromText, timeLabel } from '../src/parse';


describe('defaultNoteTitle — a new note arrives readable', () => {
  it('speaks the app style, not a locale format', () => {
    expect(defaultNoteTitle(new Date(2026, 7, 9, 15, 4))).toBe('Aug 9, 2026 at 3:04pm');
  });
  it('noon and midnight are the two that catch 12-hour clocks out', () => {
    expect(defaultNoteTitle(new Date(2026, 0, 1, 12, 0))).toBe('Jan 1, 2026 at 12pm');
    expect(defaultNoteTitle(new Date(2026, 0, 1, 0, 30))).toBe('Jan 1, 2026 at 12:30am');
  });
});

describe('looksLikeDefaultNoteTitle', () => {
  it('recognises what defaultNoteTitle writes, at any hour', () => {
    for (const d of [new Date(2026, 7, 9, 15, 4), new Date(2026, 0, 1, 12, 0), new Date(2026, 11, 31, 0, 30)]) {
      expect(looksLikeDefaultNoteTitle(defaultNoteTitle(d))).toBe(true);
    }
  });
  it('leaves a real name alone — including one with a date in it', () => {
    expect(looksLikeDefaultNoteTitle('Dentist 8/3')).toBe(false);
    expect(looksLikeDefaultNoteTitle('Aug 9 shopping')).toBe(false);
    expect(looksLikeDefaultNoteTitle('')).toBe(false);
  });
});

describe('timeLabel — 12- or 24-hour, per Sean\'s Settings choice', () => {
  // One setting on 'suite', honoured by web, iOS, the watch and the widget.
  // The native two cannot read a pref record, so watchFeed carries the flag;
  // this is the rule they all implement.
  it('12-hour by default — an account that never touches the setting sees no change', () => {
    expect(timeLabel('15:30')).toBe('3:30pm');
    expect(timeLabel('14:00')).toBe('2pm');
    expect(timeLabel('09:05')).toBe('9:05am');
    expect(timeLabel('00:00')).toBe('12am');
    expect(timeLabel('12:00')).toBe('12pm');
  });

  it('24-hour keeps the leading zero AND the minutes', () => {
    // "9" on a 24-hour clock reads like a number, not a time — dropping
    // ':00' is a 12-hour habit and does not carry over.
    expect(timeLabel('15:30', true)).toBe('15:30');
    expect(timeLabel('14:00', true)).toBe('14:00');
    expect(timeLabel('09:05', true)).toBe('09:05');
    expect(timeLabel('00:00', true)).toBe('00:00');
    expect(timeLabel('12:00', true)).toBe('12:00');
  });

  it('empty stays empty in both', () => {
    expect(timeLabel(null)).toBe('');
    expect(timeLabel(null, true)).toBe('');
  });
});

/**
 * THE TIME FIELDS — Sean, 2026-09-03: "in all input fields that allow a time
 * specification ... also allow a specification like 12:30 (which would assume
 * pm) or 5:00 (would assume PM).. 6-8 will assume pm unless specified, then
 * 9-11 will assume am.. 12-5 is pm".
 *
 * The hour's own half of the day is pinned in spec/parse.json, which the
 * native cores replay. What is HERE is the second door: a box whose only job
 * is a time can read the lone number the add line deliberately will not.
 */
describe('parseClockField — a box that can only be holding a time', () => {
  it('reads the lone hour, and puts it in the half of the day Sean means', () => {
    // 9, 10, 11 morning; noon through eight afternoon and evening.
    const want: Record<string, string> = {
      '9': '09:00', '10': '10:00', '11': '11:00',
      '12': '12:00', '1': '13:00', '2': '14:00', '5': '17:00',
      '6': '18:00', '7': '19:00', '8': '20:00',
    };
    for (const [typed, expected] of Object.entries(want)) {
      expect(parseClockField(typed)).toBe(expected);
    }
  });
  it('reads a clock time the same way, with or without the meridiem', () => {
    expect(parseClockField('12:30')).toBe('12:30');
    expect(parseClockField('5:00')).toBe('17:00');
    expect(parseClockField('9:15')).toBe('09:15');
    expect(parseClockField(' 2:30 pm ')).toBe('14:30');
    expect(parseClockField('5:00am')).toBe('05:00');   // said out loud, and believed
  });
  it('takes an unambiguous 24-hour time at its word', () => {
    expect(parseClockField('15:30')).toBe('15:30');
    expect(parseClockField('23')).toBe('23:00');
    expect(parseClockField('0')).toBe('00:00');
  });
  it('refuses what is not a time at all', () => {
    for (const junk of ['', '  ', 'abc', '24', '25', '12:60', '5 apples', '9-10']) {
      expect(parseClockField(junk)).toBeNull();
    }
  });
});

describe('the add line is not a time field', () => {
  it('leaves a lone number alone — it is a count, a page, an aisle', () => {
    // The looser rule must not leak out of parseClockField. This is the half
    // Sean chose (2026-09-03) when asked where the bare hour should apply.
    expect(parseTimeFromText('buy 3 apples')[1]).toBeNull();
    expect(parseTimeFromText('read pages 9-10')[1]).toBeNull();
    expect(parseTimeRangeFromText('lunch 6-8')[1]).toBeNull();
  });
  it('but reads a written clock time, because a colon is not a quantity', () => {
    expect(parseTimeFromText('Lunch 12:30')).toEqual(['Lunch', '12:30']);
    expect(parseTimeRangeFromText('Lunch 12:30-2:00')).toEqual(['Lunch', '12:30', '14:00']);
  });
  it('flips a bare range that would otherwise read backwards', () => {
    // 1 assumes pm and 11 assumes am, which runs backwards; the END moves.
    expect(parseTimeRangeFromText('1:00-11:00')).toEqual(['', '13:00', '23:00']);
  });
});
