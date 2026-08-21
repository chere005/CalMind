/**
 * The calendar's read model — what lands on a day, ported from the suite's
 * rules: events first in time order, then reminders (undated-first, then date,
 * then time), then notes. Today additionally collects every overdue open
 * reminder and the undated riders from rideAlong folders. Repeats expand over
 * whatever window is drawn; there is only ever the one stored row.
 */
import type { FolderMode, AnyRec, Rec } from './types';
import { folderApp } from './types';
import { repeatDates } from './repeats';
import { byOrd, byRecOrd } from './order';
import { shiftDate } from './parse';

const live = (r: { deleted?: boolean }) => !r.deleted;
const of = <T extends AnyRec['type']>(recs: AnyRec[], t: T) =>
  recs.filter((r) => r.type === t && live(r)) as Rec<T>[];

export type DayReminder = {
  rec: Rec<'reminder'>;
  overdue: boolean;
  rider: boolean;
  /**
   * This row is here because it is LATE, not because it belongs to this day —
   * its due date is some earlier day and `late` rolled it onto today.
   *
   * Reported so the screen can tell the two apart. `overdue` cannot do it: it
   * means late AND OPEN, so a ticked overdue row has overdue false and looks
   * exactly like one that belongs here. That mattered the moment Sean turned
   * Completed on (2026-08-20: "show completed only shows completed reminders
   * from the day being selected") — today's panel was also showing everything
   * completed that had been due on other days, because a late row is
   * collected whether or not it is done.
   */
  late: boolean;
};
export type DayItems = { events: Rec<'event'>[]; reminders: DayReminder[]; notes: Rec<'note'>[] };

/** Everything on `date`, in the panel's order. `today` decides overdue/riders. */
/** The calendar's per-folder gate. Absent modes keep the old behaviour:
 *  a rideAlong folder rides, everyone else contributes dated rows only. */
export function folderMode(f: { rideAlong?: boolean }, id: string, modes?: Record<string, FolderMode>): FolderMode {
  return modes?.[id] ?? (f.rideAlong ? 'all' : 'dated');
}

export function dayItems(recs: AnyRec[], date: string, today: string, modes?: Record<string, FolderMode>): DayItems {
  const events = of(recs, 'event')
    .filter((e) => repeatDates(e.payload.date, e.payload.repeat, date, date).length > 0)
    .sort((a, b) => (a.payload.time ?? '') < (b.payload.time ?? '') ? -1 : (a.payload.time ?? '') > (b.payload.time ?? '') ? 1 : byRecOrd(a, b));

  const modeById = new Map(
    of(recs, 'folder')
      .filter((f) => folderApp(f.payload) === 'reminders')
      .map((f) => [f.id, folderMode(f.payload, f.id, modes)]),
  );

  const reminders: DayReminder[] = [];
  for (const r of of(recs, 'reminder')) {
    const { due, done, repeat, folderId } = r.payload;
    const mode = modeById.get(folderId) ?? 'dated';
    if (mode === 'none') continue;
    // `done` is NOT part of whether a row belongs to this day — that is the
    // screen's business, and `onDate` below has always worked that way.
    //
    // It used to be part of `rider` and `overdue`, and that asymmetry was a
    // bug Sean hit: ticking a reminder that "always appears on today" made it
    // vanish instantly, with no two-second grace to take the tap back. The
    // grace is a FILTER over the day's rows — `showDone || !done ||
    // grace.held` — and a filter can only keep a row that is still in the
    // list. Core had already removed it, so there was nothing to hold.
    //
    // A dated reminder never had the problem because `onDate` does not ask.
    const rider = !due && mode === 'all' && date === today;
    const onDate = !!due && repeatDates(due, repeat, date, date).length > 0;
    // Today gathers what's late as well as what's due — an overdue reminder
    // stays in sight until ticked. It is never flagged as a rider (it isn't
    // riding, it's late) and a rider is never overdue (it was never due).
    // BELONGING and BEING LATE are separated here, and that is the fix: a
    // late reminder is collected onto today whether or not it is ticked, so
    // the grace has a row to hold, while the `overdue` FLAG — which is what
    // paints it late — still means late AND open. A ticked one sits there
    // struck through for its two seconds rather than wearing the late colour.
    const late = !!due && due < today && date === today;
    const overdue = late && !done;
    if (rider || onDate || late) reminders.push({ rec: r, overdue, rider, late: late && !onDate });
  }
  reminders.sort((a, b) => {
    const ka = `${a.rec.payload.due ?? ''}\u0000${a.rec.payload.time ?? ''}`;
    const kb = `${b.rec.payload.due ?? ''}\u0000${b.rec.payload.time ?? ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : byOrd(a.rec.payload, b.rec.payload);
  });

  const notes = of(recs, 'note')
    .filter((n) => n.payload.date === date)
    .sort(byRecOrd);

  return { events, reminders, notes };
}

export type DayMarks = { eventColors: string[]; reminderState: 'none' | 'open' | 'overdue' | 'done'; noteCount: number };

/** The month cell's summary: event colors in first-appearance order, the worst
 *  reminder state (overdue beats open; done only when every one is ticked). */
export function dayMarks(recs: AnyRec[], date: string, today: string): DayMarks {
  const items = dayItems(recs, date, today);
  const calById = new Map(of(recs, 'calendar').map((c) => [c.id, c.payload.color]));
  const eventColors: string[] = [];
  for (const e of items.events) {
    const c = calById.get(e.payload.calendarId) ?? '#60a5fa';
    if (!eventColors.includes(c)) eventColors.push(c);
  }
  let reminderState: DayMarks['reminderState'] = 'none';
  if (items.reminders.length) {
    const open = items.reminders.filter((r) => !r.rec.payload.done);
    reminderState = open.length === 0 ? 'done' : open.some((r) => r.overdue) ? 'overdue' : 'open';
  }
  return { eventColors, reminderState, noteCount: items.notes.length };
}

/** One month-cell icon: a kind, its colour, and (for reminders) the worst state. */
export type CellMark = { kind: 'event' | 'reminder' | 'note'; color: string; state?: 'open' | 'overdue' | 'done' };

/**
 * The suite's cell rule: one icon per kind AND colour, kinds in the legend's
 * order (events → reminders → notes), colours in first-appearance order within
 * each kind. A reminder icon takes the worst state of ITS colour's reminders
 * that day — overdue beats open, and it only reads done once every one of that
 * colour is ticked.
 */
export function cellMarks(recs: AnyRec[], date: string, today: string, modes?: Record<string, FolderMode>): CellMark[] {
  const items = dayItems(recs, date, today, modes);
  const calById = new Map(of(recs, 'calendar').map((c) => [c.id, c.payload.color]));
  const folderById = new Map(of(recs, 'folder').map((f) => [f.id, f.payload.color]));
  const out: CellMark[] = [];
  for (const e of items.events) {
    const color = calById.get(e.payload.calendarId) ?? '#60a5fa';
    if (!out.some((m) => m.kind === 'event' && m.color === color)) out.push({ kind: 'event', color });
  }
  const byColor = new Map<string, DayReminder[]>();
  for (const r of items.reminders) {
    const color = folderById.get(r.rec.payload.folderId) ?? '#4c8bf0';
    (byColor.get(color) ?? byColor.set(color, []).get(color)!).push(r);
  }
  for (const [color, rows] of byColor) {
    const open = rows.filter((r) => !r.rec.payload.done);
    const state = open.length === 0 ? 'done' : open.some((r) => r.overdue) ? 'overdue' : 'open';
    out.push({ kind: 'reminder', color, state });
  }
  for (const n of items.notes) {
    const color = folderById.get(n.payload.folderId) ?? '#7dc2ed';
    if (!out.some((m) => m.kind === 'note' && m.color === color)) out.push({ kind: 'note', color });
  }
  return out;
}

export type LegendRow = { kind: 'event' | 'reminder' | 'note'; id: string; name: string; color: string };

/**
 * The key under the grid: every calendar/folder with an item in the drawn
 * window, grouped events → reminders → notes — built straight off the cells,
 * so it always matches them. Empty when the window is empty.
 *
 * `modes` matters and used to be missed: the grid draws its marks through the
 * per-folder tri-state, so a folder switched to 'none' contributes nothing to
 * a single cell — but the legend, reading the days WITHOUT the modes, still
 * listed it. That's a chip for something with no occurrence anywhere in the
 * view. The legend has to see the days exactly as the grid drew them.
 */
export function monthLegend(
  recs: AnyRec[],
  dates: (string | null)[],
  today: string,
  modes?: Record<string, FolderMode>,
  showDone = false,
): LegendRow[] {
  const cals = new Set<string>();
  const remFolders = new Set<string>();
  const noteFolders = new Set<string>();
  for (const d of dates) {
    if (!d) continue;
    const items = dayItems(recs, d, today, modes);
    for (const e of items.events) cals.add(e.payload.calendarId);
    // Same rule the cell draws by: a finished reminder is HIDDEN unless
    // Completed is showing, so a folder whose every item in the window is
    // ticked draws no mark and must not earn a chip either.
    for (const r of items.reminders) {
      if (showDone || !r.rec.payload.done) remFolders.add(r.rec.payload.folderId);
    }
    for (const n of items.notes) noteFolders.add(n.payload.folderId);
  }
  const out: LegendRow[] = [];
  for (const c of of(recs, 'calendar').sort(byRecOrd)) {
    if (cals.has(c.id)) out.push({ kind: 'event', id: c.id, name: c.payload.name, color: c.payload.color });
  }
  const folders = of(recs, 'folder').sort(byRecOrd);
  for (const f of folders) {
    if (remFolders.has(f.id)) out.push({ kind: 'reminder', id: f.id, name: f.payload.name, color: f.payload.color });
  }
  for (const f of folders) {
    if (noteFolders.has(f.id)) out.push({ kind: 'note', id: f.id, name: f.payload.name, color: f.payload.color });
  }
  return out;
}

/** The month grid: leading nulls to the first weekday (Sunday start), then one
 *  'YYYY-MM-DD' per day. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

/** 'YYYY-MM-DD' plus n days. One implementation of date arithmetic lives in
 *  parse.ts (shiftDate, which also does months and years with the clamping
 *  repeats needs); this is its day-shaped name, kept because half the codebase
 *  reads better saying addDays. Two hand-rolled versions of "add n days to a
 *  date string" is precisely the pair that drifts apart on a DST weekend. */
export function addDays(date: string, n: number): string {
  return shiftDate(date, n, 'day');
}

/**
 * The suite's week mode: one ROW of a month's grid, never a free-floating
 * seven days. The row is the one holding `date` in its own month's grid
 * (null-padded at both edges), so stepping the anchor across a month edge
 * lands on the neighbour month's first/last row — the ?wk=first|last idea.
 */
export function weekOf(date: string): { ym: string; cells: (string | null)[] } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const grid = monthGrid(year, month);
  while (grid.length % 7 !== 0) grid.push(null);
  const at = grid.indexOf(date);
  const row = Math.max(0, Math.floor(at / 7));
  return { ym: date.slice(0, 7), cells: grid.slice(row * 7, row * 7 + 7) };
}

/** The month grid with the neighbours' days filling the edges — full weeks,
 *  every cell a real date. The screen lightens the out-of-month ones; picking
 *  one selects it WITHOUT changing the shown month (Sean's rule). */
export function monthGridFilled(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = addDays(first.toISOString().slice(0, 10), -first.getUTCDay());
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = Math.ceil((first.getUTCDay() + days) / 7);
  const out: string[] = [];
  for (let i = 0; i < rows * 7; i++) out.push(addDays(start, i));
  return out;
}

/** Sean's week fold: the selected day's week plus the next — fourteen
 *  contiguous real dates from that week's Sunday. */
export function twoWeeksFrom(date: string): string[] {
  const d = new Date(`${date}T12:00:00Z`);
  const start = addDays(date, -d.getUTCDay());
  const out: string[] = [];
  for (let i = 0; i < 14; i++) out.push(addDays(start, i));
  return out;
}

/**
 * A day's heading, in the widget's words: "TODAY · AUG 21", "FRI · AUG 22".
 *
 * Sean, 2026-08-20: the calendar's list view "needs headers showing dates,
 * similar to the widget". The widget has written them this way since
 * 2026-08-12 — uppercase, a middle dot, and NO comma, which he wrote out by
 * hand when he asked for the weekday there. `toLocaleDateString` with
 * weekday/month/day punctuates it "Fri, Aug 22" instead, and a heading that
 * is almost the widget's is worse than one that is plainly different.
 *
 * The Swift copy in targets/appwidget/HomeWidget.swift is the original and
 * stays; this is the app's, kept identical so the two surfaces read the same.
 * Built from a fixed month table rather than a locale format, for the same
 * reason timeLabel is: a locale that abbreviates differently would make the
 * app and the widget disagree on the same phone.
 */
const MONTHS_UP = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS_UP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function dayHeading(ymd: string, today: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  if (!y || !m || !d) return ymd.toUpperCase();
  const dt = new Date(y, m - 1, d, 12);
  const md = `${MONTHS_UP[m - 1]} ${d}`;
  if (ymd === today) return `TODAY · ${md}`;
  return `${WEEKDAYS_UP[dt.getDay()]} · ${md}`;
}
