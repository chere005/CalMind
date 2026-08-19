/**
 * Meeting requests (Sean's ask, 2026-08-19): a PUBLIC page at
 * <app>/request offers his open hours to anyone with the link — requestable
 * 10am–8pm unless his calendar says otherwise, about an hour each, only the
 * start time is chosen. A request arrives as a `meetreq` RECORD in his own
 * store, appended server-side by the anonymous endpoint, so it reaches every
 * device through ordinary sync with no new plumbing.
 *
 * The SLOT arithmetic (which hours are open) lives on the SERVER, not here —
 * a deliberate exception to "behavior lives in core": the public endpoint
 * must validate an anonymous create against the same rule, and a rule the
 * server cannot run is a rule the server cannot enforce. server/lib/app.php
 * carries it, server/tools/test.php pins it. What belongs to the CLIENT is
 * here: what accepting a request builds, and what the list shows.
 */
import type { AnyRec, Event, Rec } from './types';
import { timePlus } from './parse';

/** The requestable window, shared vocabulary with the server's MEETREQ_*. */
export const MEETREQ_START = 10;
export const MEETREQ_END = 20; // exclusive — the last ~1h slot starts at 19:00

/**
 * Accepting a request puts a ONE-HOUR event on the calendar ("if i accept it
 * goes on my calendar as a 1 hour event") — named for the requester, on the
 * requested day and start time.
 */
export function meetreqEvent(
  req: { name: string; date: string; time: string },
  calendarId: string,
  ord: string,
): Event {
  return {
    text: `Meeting: ${req.name}`,
    date: req.date,
    time: req.time,
    end: timePlus(req.time, 60),
    repeat: null,
    calendarId,
    ord,
  };
}

/** The Requests page's list: every live request, soonest first. */
export function pendingRequests(recs: AnyRec[]): Rec<'meetreq'>[] {
  return recs
    .filter((r): r is Rec<'meetreq'> => r.type === 'meetreq' && !r.deleted)
    .sort((a, b) => {
      const ak = `${a.payload.date} ${a.payload.time}`;
      const bk = `${b.payload.date} ${b.payload.time}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
}

/**
 * STUB — notifications and badges. Sean, 2026-08-19: "no notifications or
 * badges for now.. stub in notifications/badges". This count is the number a
 * badge would show and a notification would announce; nothing renders or
 * fires it yet. When badges arrive, the account button in chrome.tsx is the
 * natural wearer, and the moment a sync brings a NEW meetreq id into this
 * count is the natural notification trigger.
 */
export function meetreqBadgeCount(recs: AnyRec[]): number {
  return pendingRequests(recs).filter((r) => (r.payload.status ?? 'new') === 'new').length;
}
