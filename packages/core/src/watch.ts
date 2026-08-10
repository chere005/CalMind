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

export type WatchRow = { id: string; text: string; due: string | null; time: string | null; done: boolean; folderId: string; sectionId: string };

/** A folder as the iOS widget's picker lists it, and the watch groups by. */
export type WatchFolder = { id: string; name: string; color: string };

/** A section, so the wrist can show the same structure the phone does. */
export type WatchSection = { id: string; name: string; folderId: string };

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
      sectionId: r.payload.sectionId,
    })),
  ).map(({ id, text, due, time, done, folderId, sectionId }) => ({ id, text, due, time, done, folderId, sectionId }));
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
export function watchFeed(recs: AnyRec[], today: string): { items: WatchRow[]; events: WatchEvent[]; folders: WatchFolder[]; sections: WatchSection[]; groups: WatchGroup[]; days: WidgetDay[] } {
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
  // Sections travel too: Sean asked the wrist to show the same folder and
  // section structure the phone does, rather than one flat list. In list
  // order, so the watch never has to sort anything.
  const sections = recs
    .filter((r): r is Rec<'section'> => r.type === 'section' && !r.deleted)
    .sort((a, b) => byOrd(a.payload, b.payload))
    .map((x) => ({ id: x.id, name: x.payload.name, folderId: x.payload.folderId }));
  // The grouped shape travels too, so the wrist DRAWS rather than decides —
  // the standing rule, and the reason those three header rules are now
  // testable at all. items/folders/sections stay for older builds and for
  // the widget, which groups by day rather than by folder.
  const items = watchRows(recs);
  // days: the iPhone widget's shape, decided here for the same reason the
  // watch's groups are — it was logic in SwiftUI, which nothing can test.
  // The widget applies its own folder filter and ticks on top, since both
  // live in the App Group and change without a push.
  return {
    items,
    events,
    folders,
    sections,
    groups: watchGroups(items, folders, sections),
    days: widgetDays(items, events, today),
  };
}

/**
 * The wrist's reminder list, already grouped — folder, then section, then
 * rows, with the headers already decided.
 *
 * This lives here rather than in SwiftUI because it is BEHAVIOUR, and the
 * standing rule is that a rule you can say in a sentence belongs in core
 * with a test. Three sentences, and nothing in the repo could test them
 * while they sat on the watch:
 *
 *   - A folder header is shown only when there is more than one folder.
 *   - A section header is shown only when its folder has more than one
 *     section. A folder with a single section has already been named.
 *   - A row whose folder or section never arrived is still shown. Losing a
 *     reminder to a missing header is the worst trade on a 41mm screen.
 *
 * Order is the feed's order throughout; nothing here sorts.
 */
export type WatchGroup = {
  /** null when the header should not be drawn — the watch draws what it is told. */
  folderName: string | null;
  sections: { sectionName: string | null; items: WatchRow[] }[];
};

export function watchGroups(
  items: WatchRow[],
  folders: WatchFolder[],
  sections: WatchSection[],
): WatchGroup[] {
  const out: WatchGroup[] = [];
  const manyFolders = folders.length > 1;
  for (const f of folders) {
    const mine = items.filter((r) => r.folderId === f.id);
    if (mine.length === 0) continue; // a header with nothing under it is pure cost
    const secs = sections.filter((s) => s.folderId === f.id);
    const parts: WatchGroup['sections'] = [];
    for (const s of secs) {
      const inSec = mine.filter((r) => r.sectionId === s.id);
      if (inSec.length > 0) parts.push({ sectionName: secs.length > 1 ? s.name : null, items: inSec });
    }
    const orphans = mine.filter((r) => !secs.some((s) => s.id === r.sectionId));
    if (orphans.length > 0) parts.push({ sectionName: null, items: orphans });
    out.push({ folderName: manyFolders ? f.name : null, sections: parts });
  }
  // Anything whose folder never arrived still has to be reachable.
  const known = new Set(folders.map((f) => f.id));
  const strays = items.filter((r) => !known.has(r.folderId));
  if (strays.length > 0) out.push({ folderName: null, sections: [{ sectionName: null, items: strays }] });
  return out;
}

/**
 * The iPhone home-screen widget's lines, grouped by DAY.
 *
 * Same reasoning as watchGroups: this was decision-making in SwiftUI, where
 * nothing in this repo can test it. The rules, each a sentence:
 *
 *   - The day is the section, not the kind — a reminder and an event on the
 *     same date sit under one heading. That is tools/scriptable-widget.js's
 *     choice, and Sean asked the widget to look like that one.
 *   - An undated reminder still belongs where a person looks: today.
 *   - A reminder already ticked ON THE WIDGET is gone immediately, before the
 *     app has woken to apply it — the optimistic half of check-off.
 *   - No folder selection means EVERY folder. An empty picker must not mean
 *     an empty widget.
 *   - Within a day, earlier times first; an item with no time leads, since
 *     it is the day itself rather than a moment in it.
 */
export type WidgetLine = {
  id: string;
  text: string;
  time: string | null;
  isReminder: boolean;
  overdue: boolean;
  /** The calendar's colour for an event; null for a reminder. */
  color: string | null;
};

export type WidgetDay = { date: string; lines: WidgetLine[] };

export function widgetDays(
  items: WatchRow[],
  events: WatchEvent[],
  today: string,
  opts: { folderIds?: string[]; ticked?: string[] } = {},
): WidgetDay[] {
  const wanted = new Set(opts.folderIds ?? []);
  const ticked = new Set(opts.ticked ?? []);
  const byDay = new Map<string, WidgetLine[]>();
  const push = (date: string, line: WidgetLine) => {
    const at = byDay.get(date);
    if (at) at.push(line);
    else byDay.set(date, [line]);
  };

  for (const r of items) {
    if (r.done || ticked.has(r.id)) continue;
    if (wanted.size > 0 && !wanted.has(r.folderId)) continue;
    // Undated lands on today — where someone actually looks for it.
    const day = r.due ?? today;
    push(day, { id: r.id, text: r.text, time: r.time, isReminder: true, overdue: day < today, color: null });
  }
  for (const e of events) {
    push(e.date, { id: e.id, text: e.text, time: e.time, isReminder: false, overdue: false, color: e.color });
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, lines]) => ({
      date,
      // No time leads: it is the day itself, not a moment in it — day.ts's
      // own tiebreak, kept so the widget and the calendar agree.
      lines: lines.slice().sort((a, b) => (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0),
    }));
}
