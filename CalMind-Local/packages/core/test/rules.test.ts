/**
 * Ported from the suite: the toggle/roll cases the web tests pinned on the
 * Reminders app's `toggle` and the Calendar's `toggle_reminder`, now testable
 * once because the rule lives in core. The roll anchors on max(due, today) —
 * exactly `repeat_next($due, $rep, max($due, date('Y-m-d')))`.
 */
import { describe, it, expect } from 'vitest';
import { timeLabel } from '../src/parse';
import { reminderToggle, sectionNameTaken } from '../src/rules';
import type { AnyRec, Rec, Reminder } from '../src/types';

const rem = (over: Partial<Reminder> = {}): Reminder => ({
  text: 't', due: null, time: null, done: false, repeat: null,
  folderId: 'f', sectionId: 's', indent: 0, ord: 'V', ...over,
});

describe('reminderToggle — ticking rolls a repeat instead of finishing it', () => {
  it('a plain reminder toggles done, both ways', () => {
    expect(reminderToggle(rem(), '2026-08-07').done).toBe(true);
    expect(reminderToggle(rem({ done: true }), '2026-08-07').done).toBe(false);
  });

  it('a weekly repeat due today rolls seven days and stays open', () => {
    const p = reminderToggle(rem({ due: '2026-08-01', repeat: { n: 1, unit: 'week' } }), '2026-08-01');
    expect(p.due).toBe('2026-08-08');
    expect(p.done).toBe(false);
  });

  it('an OVERDUE repeat jumps past today, never crawling through the past', () => {
    // Due a month ago, daily: one tick lands tomorrow, not the day after the
    // stale due — the suite's max(due, today) anchor.
    const p = reminderToggle(rem({ due: '2026-07-01', repeat: { n: 1, unit: 'day' } }), '2026-08-07');
    expect(p.due).toBe('2026-08-08');
  });

  it('a FUTURE repeat rolls from its due, not from today', () => {
    const p = reminderToggle(rem({ due: '2026-09-01', repeat: { n: 1, unit: 'week' } }), '2026-08-07');
    expect(p.due).toBe('2026-09-08');
  });

  it('jan 31 monthly, ticked on its day, clamps to feb 28', () => {
    const p = reminderToggle(rem({ due: '2026-01-31', repeat: { n: 1, unit: 'month' } }), '2026-01-31');
    expect(p.due).toBe('2026-02-28');
  });

  it('an UNDATED repeat has nothing to roll — it just completes', () => {
    const p = reminderToggle(rem({ repeat: { n: 1, unit: 'day' } }), '2026-08-07');
    expect(p.done).toBe(true);
    expect(p.due).toBeNull();
  });

  it('unticking a done repeating reminder reopens it, never rolls it', () => {
    const p = reminderToggle(rem({ due: '2026-08-01', repeat: { n: 1, unit: 'day' }, done: true }), '2026-08-07');
    expect(p.done).toBe(false);
    expect(p.due).toBe('2026-08-01');
  });
});

describe('sectionNameTaken — a folder never holds two same-named sections', () => {
  const sec = (id: string, folderId: string, name: string, deleted = false): Rec<'section'> => ({
    id, type: 'section', updated: 0, ...(deleted ? { deleted: true } : {}), payload: { name, folderId, ord: 'V' },
  });

  it('matches case-insensitively and trims', () => {
    const recs: AnyRec[] = [sec('s1', 'f1', 'Groceries')];
    expect(sectionNameTaken(recs, 'f1', 'groceries')).toBe(true);
    expect(sectionNameTaken(recs, 'f1', '  GROCERIES  ')).toBe(true);
  });

  it('the same name in ANOTHER folder is fine', () => {
    expect(sectionNameTaken([sec('s1', 'f1', 'General')], 'f2', 'General')).toBe(false);
  });

  it('a tombstoned section frees its name', () => {
    expect(sectionNameTaken([sec('s1', 'f1', 'Old', true)], 'f1', 'Old')).toBe(false);
  });
});

describe('timeLabel — stored HH:MM back in the suite spoken style', () => {
  it('drops zero minutes and speaks 12-hour', () => {
    expect(timeLabel('15:00')).toBe('3pm');
    expect(timeLabel('14:30')).toBe('2:30pm');
    expect(timeLabel('00:00')).toBe('12am');
    expect(timeLabel('12:05')).toBe('12:05pm');
    expect(timeLabel(null)).toBe('');
  });
});
