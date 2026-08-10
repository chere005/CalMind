import { describe, it, expect } from 'vitest';
import { defaultNoteTitle, looksLikeDefaultNoteTitle } from '../src/parse';


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
