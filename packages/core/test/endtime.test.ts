/**
 * The event end time (Sean's ask, 2026-08-18): timePlus is the "+1 hour"
 * presumption, timeRangeLabel is the chip both calendars draw. The weekday
 * and preposition parsing rides in spec/parse.json; what is here is the one
 * seam the spec cannot carry — the date FIELD accepting a weekday too.
 */
import { describe, it, expect } from 'vitest';
import { parseDateField, timeLabel, timePlus, timeRangeLabel } from '../src/index';

describe('timePlus — the presumed end', () => {
  it('adds an hour', () => expect(timePlus('15:00', 60)).toBe('16:00'));
  it('carries minutes', () => expect(timePlus('14:45', 60)).toBe('15:45'));
  it('wraps past midnight and stays a clock reading', () => expect(timePlus('23:30', 60)).toBe('00:30'));
  it('goes backwards too', () => expect(timePlus('00:30', -60)).toBe('23:30'));
});

describe('timeRangeLabel — the chip', () => {
  it('renders the pair with an en dash', () => expect(timeRangeLabel('15:00', '16:30')).toBe('3pm–4:30pm'));
  it('renders the start alone when there is no end', () => expect(timeRangeLabel('15:00', null)).toBe('3pm'));
  it('renders nothing from nothing', () => expect(timeRangeLabel(null, '16:00')).toBe(''));
  it('honours the 24-hour clock on both halves', () => expect(timeRangeLabel('15:00', '16:30', true)).toBe('15:00–16:30'));
  it('agrees with timeLabel on the halves', () => {
    expect(timeRangeLabel('09:15', '10:00')).toBe(`${timeLabel('09:15')}–${timeLabel('10:00')}`);
  });
});

describe('the date field accepts a weekday, like its neighbour', () => {
  // 2026-08-18 is a Tuesday.
  it('full form', () => expect(parseDateField('friday', '2026-08-18')).toBe('2026-08-21'));
  it('short form', () => expect(parseDateField('fri', '2026-08-18')).toBe('2026-08-21'));
  it('today, named', () => expect(parseDateField('tuesday', '2026-08-18')).toBe('2026-08-18'));
});
