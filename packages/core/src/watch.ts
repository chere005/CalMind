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

export type WatchRow = { id: string; text: string; due: string | null; time: string | null; done: boolean; folderId: string };

/** A folder as the iOS widget's picker lists it. */
export type WatchFolder = { id: string; name: string; color: string };

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
      folderId: r.payload.folderId,
    })),
  ).map(({ id, text, due, time, done, folderId }) => ({ id, text, due, time, done, folderId }));
}

/** An event as the watch shows it: what, when, which calendar's colour. */
export type WatchEvent = { id: string; text: string; date: string; time: string | null; color: string };

/**
 * The whole watch feed: open reminders in the list's order, plus the next
 * stretch of events from today forward. One shape, one push — the watch's
 * tabs (summary, reminders, events, calendar) all read from this. Kept
 * SMALL on purpose: WatchConnectivity's application context is a plist with
 * a size ceiling, and an oversized context is dropped SILENTLY — the
 * lesson this project keeps re-learning is to ask what happens when a write
 * fails. 30 events covers every face and tab while staying far from the
 * cliff.
 */
export function watchFeed(recs: AnyRec[], today: string): { items: WatchRow[]; events: WatchEvent[]; folders: WatchFolder[] } {
  const calColor = new Map(
    recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted).map((c) => [c.id, c.payload.color]),
  );
  const events = recs
    .filter((r): r is Rec<'event'> => r.type === 'event' && !r.deleted && r.payload.date >= today)
    .sort((a, b) =>
      a.payload.date !== b.payload.date
        ? (a.payload.date < b.payload.date ? -1 : 1)
        // Null time is the day itself, so it leads — day.ts's own tiebreak.
        : (a.payload.time ?? '') < (b.payload.time ?? '') ? -1 : 1,
    )
    .slice(0, 30)
    .map((e) => ({
      id: e.id,
      text: e.payload.text,
      date: e.payload.date,
      time: e.payload.time,
      color: calColor.get(e.payload.calendarId) ?? '#60a5fa',
    }));
  // Folders travel so the iOS widget can offer a picker. Reminder folders
  // only: the widget lists things to DO, and a notes folder in that menu is
  // a promise the widget cannot keep.
  const folders = recs
    .filter((r): r is Rec<'folder'> => r.type === 'folder' && !r.deleted && r.payload.app === 'reminders')
    .sort((a, b) => byOrd(a.payload, b.payload))
    .map((f) => ({ id: f.id, name: f.payload.name, color: f.payload.color }));
  return { items: watchRows(recs), events, folders };
}
