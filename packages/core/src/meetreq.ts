/**
 * Meeting requests (Sean's ask, 2026-08-19): a PUBLIC page at
 * <app>/request offers his open hours to anyone with the link — requestable
 * inside the day's window unless his calendar says otherwise, about an hour
 * each, only the start time is chosen. The window is his week, not one
 * number: every day 10am–8pm, except Tuesday opens at 2pm and Friday and
 * Saturday run to 11pm (settled on the third pass, 2026-08-19).
 * A request arrives as a `meetreq` RECORD in his own
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
import type { AnyRec, Event, MeetAvail, Rec } from './types';
import { timePlus } from './parse';

// The requestable hours themselves live in app.php's meetreq_window() — per
// weekday, and only the server can enforce them against an anonymous create.
// Nothing client-side needs the numbers: the page draws whatever slot list
// the server answers with.

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

// ------------------------------------------------------------ availability
//
// Sean, 2026-08-21: a calendar under the Requests menu, tap a day and its
// hours appear below — blue by the request page's own rules, red once he
// taps one, and red already where his calendar has something, "they aren't
// omitted in my view so i can override". "These settings are the final say
// on the request screen."
//
// So the whole model is one function, `slotOpen`: the rules answer, and an
// override outranks the answer. Everything else here is a way of writing an
// override down.
//
// The arithmetic is HERE and the enforcement is in app.php's
// meetreq_slots_for — the same split the window itself has lived under since
// this feature was built, and for the same reason: an anonymous create must
// be checked by the server against the rule the page drew, and a rule the
// server cannot run is a rule it cannot enforce. server/tools/test.php pins
// that side; meetavail.test.ts pins this one, and they are written to agree
// slot for slot.

/**
 * One record per day, so two devices editing the same day converge under LWW
 * instead of each minting a row nothing reconciles.
 *
 * Underscore, not a colon, and it is not a style choice: the server's
 * REC_ID_RE is `[A-Za-z0-9_-]{1,64}` and an id outside it is dropped by sync
 * — silently, with ok:true and an empty `rejected` list, which is exactly
 * what a colon bought on the first run of this. `prefs_suite` names itself
 * the same way for the same reason.
 */
export function meetAvailId(date: string): string {
  return `meetavail_${date}`;
}

/** The day's overrides, or an empty set. Tolerates a payload missing either
 *  list — a half-written record should read as "no override", not throw. */
export function meetAvailOf(recs: AnyRec[], date: string): MeetAvail {
  const rec = recs.find((r) => r.id === meetAvailId(date) && !r.deleted);
  const p = rec && rec.type === 'meetavail' ? rec.payload : null;
  return { date, off: [...(p?.off ?? [])], on: [...(p?.on ?? [])] };
}

/** Is this hour requestable? `busy` is what the rules say without him — a
 *  clash on his own calendar. The override is the final say. */
export function slotOpen(av: MeetAvail, time: string, busy: boolean): boolean {
  if (av.on.includes(time)) return true;
  if (av.off.includes(time)) return false;
  return !busy;
}

/**
 * The day's overrides after forcing one slot to `want`.
 *
 * An override that agrees with the rules is DROPPED rather than recorded,
 * which is the whole reason this is a diff: re-opening a slot he closed
 * leaves nothing behind, so if a clash later appears in that hour the slot
 * closes itself, exactly as it would have if he had never touched it.
 */
export function slotSet(av: MeetAvail, time: string, busy: boolean, want: boolean): MeetAvail {
  const off = av.off.filter((t) => t !== time);
  const on = av.on.filter((t) => t !== time);
  if (want !== !busy) (want ? on : off).push(time);
  return { date: av.date, off: off.sort(), on: on.sort() };
}

export function slotToggle(av: MeetAvail, time: string, busy: boolean): MeetAvail {
  return slotSet(av, time, busy, !slotOpen(av, time, busy));
}

/**
 * Is the day requestable AT ALL? — what the All button reads, and what
 * colours it.
 *
 * ANY, not every, and the difference is the whole behaviour of the button:
 * a normal day is part open and part not, so "every" would make the first
 * press on almost any day turn everything ON, which is the opposite of what
 * a hand reaching for All is usually reaching for. Any-open means the press
 * always clears the day first, and a second press offers all of it.
 */
export function dayAnyOpen(av: MeetAvail, slots: { time: string; busy: boolean }[]): boolean {
  return slots.some((s) => slotOpen(av, s.time, s.busy));
}

/**
 * All: every slot to one state — closed if anything is open, open otherwise.
 *
 * Two states, because "disable/enable all requests for that day" names two.
 * Note what the second press does: enable-all means ALL, so an hour with a
 * clash comes back open rather than back to default. There is no third
 * press that means "forget I said anything" — that is per-slot work, and a
 * button that cycled through three states would be a button nobody could
 * predict from looking at it.
 */
export function dayToggleAll(av: MeetAvail, slots: { time: string; busy: boolean }[]): MeetAvail {
  const want = !dayAnyOpen(av, slots);
  return slots.reduce((acc, s) => slotSet(acc, s.time, s.busy, want), av);
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
