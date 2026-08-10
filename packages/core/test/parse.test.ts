import { describe, it, expect } from 'vitest';
import { defaultNoteTitle, looksLikeDefaultNoteTitle, timeLabel } from '../src/parse';


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
