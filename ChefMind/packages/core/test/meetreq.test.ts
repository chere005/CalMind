import { describe, it, expect } from 'vitest';
import { meetreqBadgeCount, meetreqEvent, pendingRequests } from '../src/meetreq';
import type { AnyRec } from '../src/index';

const rec = (id: string, type: string, updated: number, payload: object, deleted = false): AnyRec =>
  ({ id, type, updated, deleted, payload } as unknown as AnyRec);

describe('meeting requests, the client side', () => {
  it('accepting builds the one-hour event, named for the requester', () => {
    expect(meetreqEvent({ name: 'Aki', date: '2026-08-25', time: '14:00' }, 'cal1', 'a0')).toEqual({
      text: 'Meeting: Aki',
      date: '2026-08-25',
      time: '14:00',
      end: '15:00',
      repeat: null,
      calendarId: 'cal1',
      ord: 'a0',
    });
    // The last requestable slot still ends inside the window's contract.
    expect(meetreqEvent({ name: 'X', date: '2026-08-25', time: '19:00' }, 'c', 'o').end).toBe('20:00');
  });

  it('the list is live requests only, soonest first', () => {
    const recs = [
      rec('m2', 'meetreq', 1, { name: 'B', email: 'b@x.com', date: '2026-08-26', time: '10:00' }),
      rec('m1', 'meetreq', 2, { name: 'A', email: 'a@x.com', date: '2026-08-25', time: '14:00' }),
      rec('m3', 'meetreq', 3, { name: 'C', email: 'c@x.com', date: '2026-08-25', time: '10:00' }, true),
      rec('e1', 'event', 4, { text: 'not a request', date: '2026-08-25' }),
    ];
    expect(pendingRequests(recs).map((r) => r.payload.name)).toEqual(['A', 'B']);
  });

  it('the badge count (STUBBED — nothing renders it yet) counts NEW only', () => {
    const recs = [
      rec('m1', 'meetreq', 1, { name: 'A', email: 'a@x.com', date: '2026-08-25', time: '14:00' }),
      rec('m2', 'meetreq', 2, { name: 'B', email: 'b@x.com', date: '2026-08-26', time: '10:00', status: 'proposed' }),
      rec('m3', 'meetreq', 3, { name: 'C', email: 'c@x.com', date: '2026-08-27', time: '11:00', status: 'new' }),
    ];
    expect(meetreqBadgeCount(recs)).toBe(2);
  });
});
