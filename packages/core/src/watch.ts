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
import { folderApp, type AnyRec, type Rec } from './types';
import { byRecOrd } from './order';
import { addDays, dayItems } from './day';
import { prefsOf } from './manage';
import { timePlus } from './parse';
import { sortByDate } from './sort';

export type WatchRow = { id: string; text: string; due: string | null; time: string | null; done: boolean; folderId: string; sectionId: string };

/** A folder as the iOS widget's picker lists it, and the watch groups by. */
export type WatchFolder = { id: string; name: string; color: string };

/**
 * A calendar as the iOS widget's picker lists it.
 *
 * The picker used to offer reminder FOLDERS, which is the wrong axis: in this
 * app a folder decides which reminders exist, and "which of those reach the
 * calendar" is already answered by the tri-state in Manage reminders. What a
 * widget instance still gets to choose is which CALENDARS' events it shows —
 * exactly what the app's own calendar picker chooses. Sean's ask.
 *
 * `sharedFrom` names the partner when the calendar is theirs, so the picker
 * can badge it the way the app does. Shared calendars were missing from the
 * widget's list entirely: the feed is built from MY records, and a partner's
 * live in a separate store.
 */
export type WatchCalendar = { id: string; name: string; color: string; sharedFrom?: string };

/** A section, so the wrist can show the same structure the phone does. */
export type WatchSection = { id: string; name: string; folderId: string };

export function watchRows(recs: AnyRec[]): WatchRow[] {
  const reminders = recs
    .filter((r): r is Rec<'reminder'> => r.type === 'reminder' && !r.deleted && !r.payload.done)
    .sort(byRecOrd);
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
export type WatchEvent = { id: string; text: string; date: string; time: string | null; color: string; end: string | null };

/**
 * When an event LEAVES the widget and the wrist (Sean, 2026-08-19: "if no
 * end time is specified for an event, take it out of my widget/watch after
 * 1 hour.. otherwise respect the end time"). Resolved HERE so both Swift
 * consumers read one answer instead of re-deriving the rule twice:
 *   · a real end after the start — the end;
 *   · a start with no end — an hour later;
 *   · no start at all — never (a timeless event has no hour to add to);
 *   · an end or an hour-later that crosses midnight — never, matching the
 *     event model's own "past midnight reads as the small hours".
 * The CONSUMERS compare this against their own clock — core builds a feed,
 * not a moment — which is why it travels as data rather than as a filter.
 */
export function eventLeave(time: string | null | undefined, end?: string | null): string | null {
  if (!time) return null;
  if (end && end > time) return end;
  if (end) return null; // crosses midnight — stays until the day does
  const t = timePlus(time, 60);
  return t > time ? t : null;
}

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
export function watchFeed(
  recs: AnyRec[],
  today: string,
  /** A partner's records and their name, so their shared CALENDARS can reach
   *  the widget's picker. They were missing entirely: the feed is built from
   *  my store, and a partner's records live in another one. */
  shared: { recs: AnyRec[]; partner: string } | null = null,
  /** Which calendars the phone's home-screen widget is currently set to, read
   *  off the App Group by WatchBridge. Carried, NOT applied: the same JSON is
   *  the widget's own cache, and two widget instances may be configured
   *  differently, so `days` has to stay unfiltered for them. The WATCH
   *  applies it — Sean asked its first page to match the widget exactly. An
   *  empty list means every calendar, the same rule the widget itself uses. */
  widgetCalendars: string[] = [],
): { items: WatchRow[]; events: WatchEvent[]; folders: WatchFolder[]; calendars: WatchCalendar[]; sections: WatchSection[]; groups: WatchGroup[]; days: WidgetDay[]; widgetCalendars: string[]; clock24: boolean } {
  // Both stores' calendars: a partner's event names one that exists only in
  // theirs, and without it every shared event drew in the fallback blue.
  const calColor = new Map(
    [...recs, ...(shared?.recs ?? [])]
      .filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted)
      .map((c) => [c.id, c.payload.color]),
  );
  // The partner's events travel too. Sean, 2026-08-10: "i don't see shared
  // calendar on my watch" — this list is the Events page, and it was built
  // from MY records alone, so a shared calendar could be visible on the phone
  // and on the widget and still be missing from the wrist. The 30-item cap is
  // applied AFTER the merge, so the nearest 30 win regardless of whose they
  // are, rather than a partner's next event losing to my thirty-first.
  const events = [...recs, ...(shared?.recs ?? [])]
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
      end: eventLeave(e.payload.time, e.payload.end),
    }));
  // Folders travel so the iOS widget can offer a picker. Reminder folders
  // only: the widget lists things to DO, and a notes folder in that menu is
  // a promise the widget cannot keep.
  //
  // Through folderApp(), NOT `app === 'reminders'`: a milestone-1 folder
  // carries no `app` at all and is a reminders folder by convention
  // (types.ts). Reading it strictly here sent an account whose folders
  // predate the field an EMPTY folder list, and the watch drew one flat
  // ungrouped page — with no error anywhere, because an empty list is what
  // a genuinely folder-less account looks like too.
  // The calendars the widget's picker offers: mine, then the partner's with
  // their name attached so the picker can badge them.
  const calendars: WatchCalendar[] = [
    ...recs
      .filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted)
      .sort(byRecOrd)
      .map((c) => ({ id: c.id, name: c.payload.name, color: c.payload.color })),
    ...(shared
      ? shared.recs
          .filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted)
          .sort(byRecOrd)
          .map((c) => ({ id: c.id, name: c.payload.name, color: c.payload.color, sharedFrom: shared.partner }))
      : []),
  ];
  const folders = recs
    .filter((r): r is Rec<'folder'> => r.type === 'folder' && !r.deleted && folderApp(r.payload) === 'reminders')
    .sort(byRecOrd)
    .map((f) => ({ id: f.id, name: f.payload.name, color: f.payload.color }));
  // Sections travel too: Sean asked the wrist to show the same folder and
  // section structure the phone does, rather than one flat list. In list
  // order, so the watch never has to sort anything.
  const sections = recs
    .filter((r): r is Rec<'section'> => r.type === 'section' && !r.deleted)
    .sort(byRecOrd)
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
    calendars,
    sections,
    groups: watchGroups(items, folders, sections),
    // The partner's records go in too — their shared calendars were already
    // in `calendars` above, so the picker offered them while the feed held
    // none of their events. See widgetDays for why events and not reminders.
    days: widgetDays(recs, today, { sharedRecs: shared?.recs }),
    widgetCalendars,
    // The watch and the widget are other processes in another language and
    // cannot read a pref record. The flag travels with the list so all four
    // surfaces speak the same clock from one setting.
    clock24: prefsOf(recs, 'suite').clock24 === true,
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
 *     same date sit under one heading. That came from the Scriptable widget,
 *     since removed; Sean asked for this one to look like that one, and the
 *     shape outlived its source.
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
  /** Which calendar an event belongs to, so the widget's picker can filter
   *  it. Null for a reminder — a reminder has no calendar, and its own
   *  visibility is the tri-state's business. */
  calendarId: string | null;
  /** When the line LEAVES the widget/wrist (eventLeave's answer) — the
   *  event's end, or an hour past a bare start. Null for a reminder and for
   *  a timeless event: neither expires. */
  end: string | null;
};

export type WidgetDay = { date: string; lines: WidgetLine[] };

/** How far ahead the widget looks. Two weeks is what the day list is for. */
export const WIDGET_DAYS = 14;

export function widgetDays(
  recs: AnyRec[],
  today: string,
  opts: { folderIds?: string[]; ticked?: string[]; days?: number; sharedRecs?: AnyRec[] } = {},
): WidgetDay[] {
  const wanted = new Set(opts.folderIds ?? []);
  const ticked = new Set(opts.ticked ?? []);
  // A partner's records live in ANOTHER STORE, so nothing built from `recs`
  // alone can see them. Their shared calendars already reached the widget's
  // picker (watchFeed's `calendars`), which made the gap worse rather than
  // better: Sean could tick a shared calendar and get nothing, because the
  // events behind it were never in the feed. Reported by him, 2026-08-10.
  //
  // EVENTS ONLY, deliberately. Their reminders are shown on the Calendar
  // screen under their own heading and can be ticked there, through
  // sharedPut() — a write to the OTHER store. The widget's check-off has no
  // such path: it queues an id in the App Group and the app applies it
  // through the ordinary put(), which would look in my store, miss, and drop
  // the tick silently. A tick box that does nothing is worse than an absent
  // row, so their reminders stay off the widget until that path exists.
  const sharedRecs = opts.sharedRecs ?? [];
  // THE CALENDAR'S OWN RULE, not a second one that resembles it.
  //
  // This used to walk every open reminder and drop it on its due date, which
  // is not what the calendar shows: the calendar obeys the tri-state set in
  // "Manage reminders" — a folder is 'all' (its undated items ride along on
  // today), 'dated' (only items with a date), or 'none' (it never appears).
  // The widget ignored all three, so a folder Sean had switched OFF for the
  // calendar still filled his home screen. Sean's words: it should show what
  // the calendar shows.
  //
  // dayItems() is that rule, and calling it per day is the only way the two
  // cannot drift — it also brings the pieces the flat list could not know
  // about: a repeat that lands on a date, an overdue reminder still showing
  // on today, and the rider flag.
  const modes = prefsOf(recs, 'calendar').folderModes;
  // Both stores' calendars, because a partner's event names a calendar that
  // only exists in THEIRS. Without it every shared event drew in the fallback
  // blue and the picker's colour swatch disagreed with the row it filtered.
  const calColor = new Map(
    [...recs, ...sharedRecs]
      .filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted)
      .map((c) => [c.id, c.payload.color]),
  );

  const out: WidgetDay[] = [];
  for (let i = 0; i < (opts.days ?? WIDGET_DAYS); i++) {
    const date = addDays(today, i);
    const { events, reminders } = dayItems(recs, date, today, modes);
    // Through dayItems() again rather than a filter of my own: it is what the
    // Calendar screen calls on the same records (Calendar.tsx's sharedItems),
    // so a repeating shared event expands onto this day for the widget exactly
    // as it does on the phone.
    const theirs = sharedRecs.length > 0 ? dayItems(sharedRecs, date, today, modes).events : [];
    const lines: WidgetLine[] = [];
    for (const e of [...events, ...theirs]) {
      lines.push({
        id: e.id,
        text: e.payload.text,
        time: e.payload.time,
        isReminder: false,
        overdue: false,
        color: calColor.get(e.payload.calendarId) ?? '#60a5fa',
        calendarId: e.payload.calendarId,
        end: eventLeave(e.payload.time, e.payload.end),
      });
    }
    for (const { rec: r, overdue } of reminders) {
      if (r.payload.done || ticked.has(r.id)) continue;
      if (wanted.size > 0 && !wanted.has(r.payload.folderId)) continue;
      lines.push({ id: r.id, text: r.payload.text, time: r.payload.time, isReminder: true, overdue, color: null, calendarId: null, end: null });
    }
    // A day with nothing on it is not a heading — the widget has room for a
    // handful of lines and an empty date spends one of them saying nothing.
    if (lines.length === 0) continue;
    out.push({
      date,
      // No time leads: it is the day itself, not a moment in it — day.ts's
      // own tiebreak, kept so the widget and the calendar agree.
      lines: lines.sort((a, b) => (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0),
    });
  }
  return out;
}
