/**
 * What the watch is given: the open reminders, in the list's own order.
 *
 * This lived inside the phone's bridge module, behind an `if (!bridge)
 * return` — which meant it could not run anywhere except a phone with a
 * paired watch, and so had never run in a test at all. It is behaviour, and
 * behaviour lives here; the app side keeps only the WatchConnectivity
 * plumbing.
 *
 * The order is the Reminders list's: undated first, then by date, then time,
 * with a subtask travelling under its parent — a watch that sorted its own
 * way would disagree with the phone it is strapped beside.
 */
import type { AnyRec, Rec } from './types';
import { byOrd } from './order';
import { sortByDate } from './sort';

export type WatchRow = { id: string; text: string; due: string | null; time: string | null; done: boolean };

export function watchRows(recs: AnyRec[]): WatchRow[] {
  const reminders = recs
    .filter((r): r is Rec<'reminder'> => r.type === 'reminder' && !r.deleted && !r.payload.done)
    .sort((a, b) => byOrd(a.payload, b.payload));
  return sortByDate(
    reminders.map((r) => ({
      id: r.id,
      indent: r.payload.indent,
      due: r.payload.due,
      time: r.payload.time,
      text: r.payload.text,
      done: r.payload.done,
    })),
  ).map(({ id, text, due, time, done }) => ({ id, text, due, time, done }));
}
