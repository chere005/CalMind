import { describe, it, expect } from 'vitest';
import { eventLeave, watchFeed } from '../src/watch';
import type { AnyRec } from '../src/index';

describe("an event's leave time — Sean, 2026-08-19: gone after the end, or an hour past a bare start", () => {
  it('resolves the four shapes', () => {
    expect(eventLeave('14:00', '15:30')).toBe('15:30'); // a real end is respected
    expect(eventLeave('14:00', null)).toBe('15:00');    // no end: an hour
    expect(eventLeave('14:00')).toBe('15:00');
    expect(eventLeave(null)).toBe(null);                // timeless: never leaves
    expect(eventLeave('23:30')).toBe(null);             // the hour crosses midnight: stays
    expect(eventLeave('22:00', '01:00')).toBe(null);    // an end in the small hours: stays
  });

  it('travels on both feed shapes, resolved', () => {
    const recs: AnyRec[] = [
      { id: 'c1', type: 'calendar', updated: 1, payload: { name: 'P', color: '#111111', ord: 'a' } } as AnyRec,
      { id: 'e1', type: 'event', updated: 1, payload: { text: 'capped', date: '2026-08-20', time: '14:00', repeat: null, calendarId: 'c1', ord: 'a' } } as AnyRec,
      { id: 'e2', type: 'event', updated: 1, payload: { text: 'long', date: '2026-08-20', time: '14:00', end: '17:00', repeat: null, calendarId: 'c1', ord: 'b' } } as AnyRec,
      { id: 'e3', type: 'event', updated: 1, payload: { text: 'timeless', date: '2026-08-20', time: null, repeat: null, calendarId: 'c1', ord: 'c' } } as AnyRec,
    ];
    const feed = watchFeed(recs, '2026-08-20');
    const byId = new Map(feed.events.map((e) => [e.id, e.end]));
    expect(byId.get('e1')).toBe('15:00');
    expect(byId.get('e2')).toBe('17:00');
    expect(byId.get('e3')).toBe(null);
    const lines = new Map(feed.days[0]!.lines.map((l) => [l.id, l.end]));
    expect(lines.get('e1')).toBe('15:00');
    expect(lines.get('e2')).toBe('17:00');
    expect(lines.get('e3')).toBe(null);
  });
});
