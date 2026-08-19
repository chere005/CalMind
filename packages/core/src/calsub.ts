/**
 * A subscribed calendar, read-only — Sean's call, 2026-08-18: "subscribe-by-link
 * first, i just want read only access to other calendar system."
 *
 * The pieces were built and waiting: parseIcal knows what a VEVENT says and
 * expandRrule knows when it repeats. This file is only the join — the ICS text
 * a `calsub_fetch` brings back, turned into the flat list of day-chips a
 * calendar month wants. Nothing here writes anything: a subscription's events
 * are never records, never sync, and never carry an edit path.
 */
import { parseIcal, type IcalEvent } from './ical';
import { expandRrule } from './rrule';
import { addDays } from './day';

/** One rendered chip: an event occurrence on one calendar day. */
export type SubOccurrence = {
  date: string;            // the day the chip renders on, YYYY-MM-DD
  time: string | null;     // HH:MM, or null for all-day
  endTime: string | null;  // HH:MM when the event ends the same occurrence
  title: string;
  location: string;
  uid: string;
};

/** Whole days an all-day event covers. DTEND is EXCLUSIVE for all-day events
 *  (an event through Tuesday says DTEND Wednesday), so the span is
 *  [start, end), never less than one day even when a feed omits or repeats
 *  the start as the end. */
function allDaySpan(ev: IcalEvent): number {
  if (!ev.allDay || !ev.end) return 1;
  let n = 0;
  let d = ev.start;
  while (d < ev.end && n < 60) { d = addDays(d, 1); n++; }
  return Math.max(1, n);
}

/**
 * Every chip the window [from, to] should show for one calendar's ICS.
 *
 * Recurrences are expanded by start date; a multi-day ALL-DAY event paints
 * each covered day (capped at 60 — a "yearly conference" with a typo for an
 * end date must not flood a month). A TIMED event chips only its start day,
 * the same rule the app's own events follow — an end time past midnight
 * stays a label ("11pm–1am"), not a second chip.
 */
export function subOccurrences(ics: string, tz: string, from: string, to: string): SubOccurrence[] {
  const out: SubOccurrence[] = [];
  for (const ev of parseIcal(ics, tz)) {
    const span = allDaySpan(ev);
    // An occurrence STARTING up to span-1 days before the window still
    // reaches into it — widen the expansion, filter per painted day.
    const starts = expandRrule(ev.start, ev.rrule, ev.exdates, addDays(from, -(span - 1)), to);
    for (const s of starts) {
      for (let i = 0; i < span; i++) {
        const date = i === 0 ? s : addDays(s, i);
        if (date < from || date > to) continue;
        out.push({
          date,
          time: ev.allDay ? null : ev.time,
          endTime: ev.allDay ? null : ev.endTime,
          title: ev.summary,
          location: ev.location,
          uid: ev.uid,
        });
      }
    }
  }
  out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 :
    (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 :
    a.title.localeCompare(b.title));
  return out;
}
