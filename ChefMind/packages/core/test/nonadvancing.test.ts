/**
 * A repeat rule that does not advance, on the TICK path.
 *
 * repeatDates() grew a guard for these — `{ n: 0 }`, or a unit written by a
 * client this build has never met — because every step returns the start date
 * and the drawing loop pushed the same day REPEAT_MAX times. repeatNext(), its
 * sibling, did not get one, and it is the function a TICK goes through.
 *
 * Neither shape can come from this app: the stepper clamps to 1..999 and the
 * units are pills. Both can arrive over sync, and nothing validates a record
 * on the way in — which is exactly the reasoning that put the guard in
 * repeatDates in the first place.
 */
import { describe, it, expect } from 'vitest';
import { repeatAdvances, repeatNext, reminderToggle, type Reminder } from '../src/index';

const base: Reminder = {
  text: 'water the ferns', due: '2026-08-11', time: null, done: false,
  repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'a',
};

describe('a repeat rule that cannot advance', () => {
  it('is recognised as not advancing, whatever shape it arrives in', () => {
    expect(repeatAdvances('2026-08-11', { n: 0, unit: 'day' })).toBe(false);
    expect(repeatAdvances('2026-08-11', { n: 1, unit: 'fortnight' as never })).toBe(false);
    // A negative n walks backwards, which is not a repeat forward either.
    expect(repeatAdvances('2026-08-11', { n: -1, unit: 'day' })).toBe(false);
    expect(repeatAdvances('2026-08-11', { n: 1, unit: 'day' })).toBe(true);
  });

  it('has no next occurrence to offer, and returns the start to say so', () => {
    // `start` is the fallback, NOT an answer — pinned by the shared vectors in
    // spec/repeats.json, and asserted here because it is the reason the next
    // test could go wrong at all: a caller reading it as a roll writes the
    // reminder back onto the day it was already on.
    //
    // This does NOT test repeatNext's early return. That return changes no
    // result for any input, so nothing can distinguish it; it is a fast path,
    // and the comment there says as much.
    expect(repeatNext('2026-08-11', { n: 0, unit: 'day' }, '2026-08-11')).toBe('2026-08-11');
  });

  it('is completed by a tick rather than rolled nowhere', () => {
    const p: Reminder = { ...base, repeat: { n: 0, unit: 'day' } };
    const next = reminderToggle(p, '2026-08-11');
    // The row has to LEAVE the list. Rolled to the same date and still undone,
    // it sits there absorbing taps for ever.
    expect(next.done, 'ticking it marks it done').toBe(true);
  });

  it('same for a unit this build has never heard of', () => {
    const p: Reminder = { ...base, repeat: { n: 1, unit: 'fortnight' as never } };
    const next = reminderToggle(p, '2026-08-11');
    expect(next.done, 'an unknown unit is a one-off, not an immovable row').toBe(true);
  });

  it('and a rule that DOES advance still rolls, untouched', () => {
    const p: Reminder = { ...base, repeat: { n: 1, unit: 'week' } };
    const next = reminderToggle(p, '2026-08-11');
    expect(next.done).toBe(false);
    expect(next.due).toBe('2026-08-18');
  });
});
