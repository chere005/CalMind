/**
 * The availability overrides Sean draws under the Requests menu (2026-08-21).
 *
 * The property worth holding onto through every one of these is that the
 * record is a DIFF, not a picture of the day: a slot he never touched has no
 * entry, so it keeps following the rules — the open hours, and whatever his
 * calendar says. Half of what is pinned below is really that one property,
 * approached from different sides, because the failure it prevents is the
 * quiet kind: a day that looks right the afternoon he sets it and is wrong a
 * week later, offering an hour he is already booked in.
 */
import { describe, it, expect } from 'vitest';
import {
  dayAnyOpen, dayToggleAll, meetAvailId, meetAvailOf, slotOpen, slotSet, slotToggle,
} from '../src/meetreq';
import type { AnyRec, MeetAvail } from '../src/index';

const rec = (id: string, type: string, payload: object, deleted = false): AnyRec =>
  ({ id, type, updated: 1, deleted, payload } as unknown as AnyRec);

const empty = (date = '2026-08-25'): MeetAvail => ({ date, off: [], on: [] });
/** The shape the screen hands the All button: the day's window, with clashes. */
const day = (...pairs: [string, boolean][]) => pairs.map(([time, busy]) => ({ time, busy }));

describe('reading a day', () => {
  it('one record per day, addressed by the day', () => {
    expect(meetAvailId('2026-08-25')).toBe('meetavail_2026-08-25');
  });

  it('an untouched day reads as no override at all', () => {
    expect(meetAvailOf([], '2026-08-25')).toEqual({ date: '2026-08-25', off: [], on: [] });
  });

  it('a deleted record is not an override', () => {
    const recs = [rec('meetavail_2026-08-25', 'meetavail', { date: '2026-08-25', off: ['14:00'], on: [] }, true)];
    expect(meetAvailOf(recs, '2026-08-25').off).toEqual([]);
  });

  it('a half-written payload reads as no override rather than throwing', () => {
    // Sync merges whatever arrives; a record from an older build, or one
    // truncated in transit, must not take the screen down with it.
    const recs = [rec('meetavail_2026-08-25', 'meetavail', { date: '2026-08-25' })];
    expect(meetAvailOf(recs, '2026-08-25')).toEqual({ date: '2026-08-25', off: [], on: [] });
  });

  it('reads only its own day', () => {
    const recs = [rec('meetavail_2026-08-26', 'meetavail', { date: '2026-08-26', off: ['14:00'], on: [] })];
    expect(meetAvailOf(recs, '2026-08-25').off).toEqual([]);
  });

  it('the lists it hands back are copies — a caller cannot edit the store', () => {
    const stored = { date: '2026-08-25', off: ['14:00'], on: [] };
    const recs = [rec('meetavail_2026-08-25', 'meetavail', stored)];
    meetAvailOf(recs, '2026-08-25').off.push('15:00');
    expect(stored.off).toEqual(['14:00']);
  });
});

describe('what a slot shows', () => {
  it('blue by the rules, red where the calendar has something', () => {
    expect(slotOpen(empty(), '11:00', false)).toBe(true);
    expect(slotOpen(empty(), '14:00', true)).toBe(false);
  });

  it('off closes an hour the rules opened', () => {
    expect(slotOpen({ date: 'd', off: ['11:00'], on: [] }, '11:00', false)).toBe(false);
  });

  it('on opens an hour his calendar had taken — the override he asked for', () => {
    expect(slotOpen({ date: 'd', off: [], on: ['14:00'] }, '14:00', true)).toBe(true);
  });
});

describe('tapping one hour', () => {
  it('a tap on an open hour closes it, and records that it did', () => {
    const av = slotToggle(empty(), '11:00', false);
    expect(av.off).toEqual(['11:00']);
    expect(slotOpen(av, '11:00', false)).toBe(false);
  });

  it('a tap on a busy hour opens it, and records that too', () => {
    const av = slotToggle(empty(), '14:00', true);
    expect(av.on).toEqual(['14:00']);
    expect(slotOpen(av, '14:00', true)).toBe(true);
  });

  it('tapping back leaves NOTHING behind, so the rules resume', () => {
    // The point of a diff. He closes 11:00, changes his mind, and the record
    // is as empty as it started — so when an event lands on 11:00 next week
    // the slot closes itself.
    const closed = slotToggle(empty(), '11:00', false);
    const reopened = slotToggle(closed, '11:00', false);
    expect(reopened).toEqual(empty());
    expect(slotOpen(reopened, '11:00', true)).toBe(false);
  });

  it('a slot never lands in both lists', () => {
    const av = slotSet(slotSet(empty(), '14:00', true, true), '14:00', true, false);
    expect(av.on).toEqual([]);
    expect(av.off).toEqual([]);
  });

  it('an override kept over a hour that BECAME busy still says open', () => {
    // He opened 14:00 over a clash; the clash moved; the clash came back.
    // His word stands the whole way through — that is "the final say".
    const av = slotToggle(empty(), '14:00', true);
    expect(slotOpen(av, '14:00', false)).toBe(true);
    expect(slotOpen(av, '14:00', true)).toBe(true);
  });

  it('leaves the other hours alone', () => {
    const av = slotToggle(slotToggle(empty(), '11:00', false), '15:00', false);
    expect(av.off).toEqual(['11:00', '15:00']);
    expect(slotOpen(av, '12:00', false)).toBe(true);
  });
});

describe('All', () => {
  const slots = day(['10:00', false], ['11:00', false], ['14:00', true]);

  it('a day with one open hour counts as open — ANY, not every', () => {
    // The reading that decides which way the button throws. Under "every"
    // the first press on an ordinary half-booked day would OFFER the whole
    // day, which is not what a hand reaching for All is reaching for.
    expect(dayAnyOpen(empty(), slots)).toBe(true);
    expect(dayAnyOpen(empty(), day(['14:00', true]))).toBe(false);
  });

  it('an empty day is not open — there is nothing to turn off', () => {
    expect(dayAnyOpen(empty(), [])).toBe(false);
  });

  it('the first press turns the whole day off', () => {
    const av = dayToggleAll(empty(), slots);
    for (const s of slots) expect(slotOpen(av, s.time, s.busy)).toBe(false);
    // …and the busy hour needs no entry to be closed: the rules had it.
    expect(av.off).toEqual(['10:00', '11:00']);
    expect(av.on).toEqual([]);
  });

  it('the second press turns the whole day on, clashes included', () => {
    const off = dayToggleAll(empty(), slots);
    const on = dayToggleAll(off, slots);
    for (const s of slots) expect(slotOpen(on, s.time, s.busy)).toBe(true);
    expect(on.on).toEqual(['14:00']);
    expect(on.off).toEqual([]);
  });

  it('presses alternate, from any starting point', () => {
    const off = dayToggleAll(empty(), slots);
    expect(dayAnyOpen(off, slots)).toBe(false);
    const on = dayToggleAll(off, slots);
    expect(dayAnyOpen(on, slots)).toBe(true);
    expect(dayAnyOpen(dayToggleAll(on, slots), slots)).toBe(false);
  });

  it('one hour left open is still enough to make All mean OFF', () => {
    // The half-state, which is most days: 10 closed by hand, 11 open by the
    // rules, 14 busy. One open hour, so the press clears the day rather
    // than offering it.
    const av = slotToggle(empty(), '10:00', false);
    const first = dayToggleAll(av, slots);
    for (const s of slots) expect(slotOpen(first, s.time, s.busy)).toBe(false);
  });

  it('touches only the day it was given', () => {
    const av = dayToggleAll({ date: '2026-08-25', off: [], on: [] }, slots);
    expect(av.date).toBe('2026-08-25');
  });
});
