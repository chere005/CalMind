/**
 * Folder and section management — the suite's delete/rename rules, ported so
 * every screen (and every platform) calls one implementation. Pure: each
 * mutator returns the records to put (tombstones and re-homed items with
 * payloads already updated); the caller stamps and persists them. An error is
 * a string the UI can show verbatim.
 */
import type { AnyRec, Prefs, Rec } from './types';
import { folderApp, prefsId, type PrefsApp } from './types';
import { byRecOrd, ordBetween, ordGap } from './order';
import { sectionNameTaken } from './rules';

const live = (r: { deleted?: boolean }) => !r.deleted;
const of = <T extends AnyRec['type']>(recs: AnyRec[], t: T) =>
  recs.filter((r) => r.type === t && live(r)) as Rec<T>[];

export type ManageResult = { put: AnyRec[] } | { error: string };

/** The prefs record for an app, or an empty one. */
export function prefsOf(recs: AnyRec[], app: PrefsApp): Prefs {
  const rec = recs.find((r) => r.id === prefsId(app) && !r.deleted);
  return rec && rec.type === 'pref' ? (rec.payload as Prefs) : {};
}

/** A fresh pref record carrying `next` merged over what's stored. */
export function prefsPut(recs: AnyRec[], app: PrefsApp, next: Partial<Prefs>): Rec<'pref'> {
  return { id: prefsId(app), type: 'pref', updated: 0, payload: { ...prefsOf(recs, app), ...next } };
}

const sectionsOf = (recs: AnyRec[], folderId: string) =>
  of(recs, 'section')
    .filter((s) => s.payload.folderId === folderId)
    .sort(byRecOrd);

const foldersOf = (recs: AnyRec[], app: 'reminders' | 'notes') =>
  of(recs, 'folder')
    .filter((f) => folderApp(f.payload) === app)
    .sort(byRecOrd);

/** Where deleted-container items land: the default-for-new-items, re-resolved
 *  to skip anything being deleted — the suite's folder_default_get rule. */
function destSection(recs: AnyRec[], app: 'reminders' | 'notes', deadFolderIds: Set<string>): Rec<'section'> | null {
  const def = prefsOf(recs, app).defaultSectionId;
  const secs = of(recs, 'section');
  const chosen = secs.find((s) => s.id === def && !deadFolderIds.has(s.payload.folderId));
  if (chosen) return chosen;
  const folder = foldersOf(recs, app).find((f) => !deadFolderIds.has(f.id));
  return folder ? sectionsOf(recs, folder.id)[0] ?? null : null;
}

export function folderNameTaken(recs: AnyRec[], app: 'reminders' | 'notes', name: string): boolean {
  const want = name.trim().toLowerCase();
  return foldersOf(recs, app).some((f) => f.payload.name.trim().toLowerCase() === want);
}

export function renameFolder(recs: AnyRec[], folderId: string, name: string): ManageResult {
  const f = of(recs, 'folder').find((x) => x.id === folderId);
  if (!f) return { error: 'no such folder' };
  const clean = name.trim();
  if (clean === '') return { error: 'a folder needs a name' };
  if (clean === f.payload.name) return { put: [] };
  if (folderNameTaken(recs, folderApp(f.payload), clean)) return { error: 'that name is taken' };
  return { put: [{ ...f, payload: { ...f.payload, name: clean } }] };
}

export function renameSection(recs: AnyRec[], sectionId: string, name: string): ManageResult {
  const s = of(recs, 'section').find((x) => x.id === sectionId);
  if (!s) return { error: 'no such section' };
  const clean = name.trim();
  if (clean === '') return { error: 'a section needs a name' };
  if (clean === s.payload.name) return { put: [] };
  if (sectionNameTaken(recs, s.payload.folderId, clean)) return { error: 'that name is taken' };
  return { put: [{ ...s, payload: { ...s.payload, name: clean } }] };
}

/**
 * Deleting a section keeps its items — they move to the folder's first
 * remaining section. The folder's only section is undeletable, so nothing can
 * ever land loose.
 */
export function deleteSection(recs: AnyRec[], sectionId: string): ManageResult {
  const s = of(recs, 'section').find((x) => x.id === sectionId);
  if (!s) return { error: 'no such section' };
  const siblings = sectionsOf(recs, s.payload.folderId).filter((x) => x.id !== sectionId);
  if (siblings.length === 0) return { error: "a folder keeps at least one section" };
  const dest = siblings[0]!;
  const put: AnyRec[] = [{ ...s, deleted: true }];
  for (const r of of(recs, 'reminder')) {
    if (r.payload.sectionId === sectionId) put.push({ ...r, payload: { ...r.payload, sectionId: dest.id } });
  }
  for (const n of of(recs, 'note')) {
    if (n.payload.sectionId === sectionId) put.push({ ...n, payload: { ...n.payload, sectionId: dest.id } });
  }
  return { put };
}

/**
 * Deleting a folder keeps its items — they move to the default for new items,
 * re-resolved after the delete. The rideAlong folder and the last folder of an
 * app are undeletable (the suite's permanent-folder and last-folder rules).
 */
export function deleteFolder(recs: AnyRec[], folderId: string): ManageResult {
  const f = of(recs, 'folder').find((x) => x.id === folderId);
  if (!f) return { error: 'no such folder' };
  if (f.payload.rideAlong) return { error: 'the Calendar folder is permanent' };
  const app = folderApp(f.payload);
  if (foldersOf(recs, app).length <= 1) return { error: 'an app keeps at least one folder' };
  const dead = new Set([folderId]);
  const dest = destSection(recs, app, dead);
  if (!dest) return { error: 'nowhere to move its items' };
  const put: AnyRec[] = [{ ...f, deleted: true }];
  for (const s of sectionsOf(recs, folderId)) put.push({ ...s, deleted: true });
  const rehome = (r: Rec<'reminder'> | Rec<'note'>) => {
    if (r.payload.folderId === folderId) {
      put.push({ ...r, payload: { ...r.payload, folderId: dest.payload.folderId, sectionId: dest.id } } as AnyRec);
    }
  };
  if (app === 'reminders') for (const r of of(recs, 'reminder')) rehome(r);
  else for (const n of of(recs, 'note')) rehome(n);
  return { put };
}

// ---------------------------------------------------------------- calendars

export function calendarNameTaken(recs: AnyRec[], name: string): boolean {
  const clean = name.trim().toLowerCase();
  return of(recs, 'calendar').some((c) => c.payload.name.trim().toLowerCase() === clean);
}

export function renameCalendar(recs: AnyRec[], calendarId: string, name: string): ManageResult {
  const c = of(recs, 'calendar').find((x) => x.id === calendarId);
  if (!c) return { error: 'no such calendar' };
  const clean = name.trim();
  if (clean === '') return { error: 'a calendar needs a name' };
  if (clean === c.payload.name) return { error: 'unchanged' };
  if (calendarNameTaken(recs, clean)) return { error: 'that name is taken' };
  return { put: [{ ...c, payload: { ...c.payload, name: clean } }] };
}

/** Deleting a calendar keeps its events — they fall to the first remaining
 *  calendar. The last calendar is undeletable, as the last folder is. */
export function deleteCalendar(recs: AnyRec[], calendarId: string): ManageResult {
  const cals = of(recs, 'calendar').sort(byRecOrd);
  const c = cals.find((x) => x.id === calendarId);
  if (!c) return { error: 'no such calendar' };
  if (cals.length <= 1) return { error: 'the last calendar stays' };
  const dest = cals.find((x) => x.id !== calendarId)!;
  const put: AnyRec[] = [{ ...c, deleted: true }];
  for (const e of of(recs, 'event')) {
    if (e.payload.calendarId === calendarId) {
      put.push({ ...e, payload: { ...e.payload, calendarId: dest.id } });
    }
  }
  return { put };
}


// ---------------------------------------------------------------- habit sections

/** Deleting a habit section keeps its habits — they move to the first
 *  remaining section. The last section stays, as everywhere else. */
export function deleteHabitSection(recs: AnyRec[], sectionId: string): ManageResult {
  const sections = of(recs, 'habitsection').sort(byRecOrd);
  const target = sections.find((s) => s.id === sectionId);
  if (!target) return { error: 'no such section' };
  if (sections.length <= 1) return { error: 'the last section stays' };
  const dest = sections.find((s) => s.id !== sectionId)!;
  const put: AnyRec[] = [{ ...target, deleted: true }];
  for (const h of of(recs, 'habit')) {
    if (h.payload.sectionId === sectionId) {
      put.push({ ...h, payload: { ...h.payload, sectionId: dest.id } });
    }
  }
  return { put };
}

// ---------------------------------------------------------------- outline drag

/**
 * The rows a drag takes together — the suite's blockOf(): a top-level
 * reminder carries every indent-1 row that follows it in stored (ord) order
 * within its section, up to the next top-level row. A subtask alone is its
 * own block (it can be dragged out; landing makes it read under its new
 * neighbour, exactly as the suite's flat outline reads).
 */
export function reminderBlock(recs: AnyRec[], reminderId: string): Rec<'reminder'>[] {
  const r = of(recs, 'reminder').find((x) => x.id === reminderId);
  if (!r) return [];
  if (r.payload.indent > 0) return [r];
  const siblings = of(recs, 'reminder')
    .filter((x) => x.payload.sectionId === r.payload.sectionId)
    .sort(byRecOrd);
  const at = siblings.findIndex((x) => x.id === reminderId);
  const block = [siblings[at]!];
  for (let i = at + 1; i < siblings.length && siblings[i]!.payload.indent > 0; i++) {
    block.push(siblings[i]!);
  }
  return block;
}

/**
 * Drop a reminder block into a section, before `beforeId` (null = at the
 * end). Cross-section and cross-folder moves re-file the whole block; the
 * block's rows take consecutive ords in the landing gap, so it stays one
 * family. Landing relative to a row inside another block is allowed — the
 * suite lets a row drop between any two rows.
 */
export function moveReminderBlock(
  recs: AnyRec[],
  reminderId: string,
  destSectionId: string,
  beforeId: string | null,
): ManageResult {
  const block = reminderBlock(recs, reminderId);
  if (block.length === 0) return { error: 'no such reminder' };
  const dest = of(recs, 'section').find((s) => s.id === destSectionId);
  if (!dest) return { error: 'no such section' };
  const blockIds = new Set(block.map((b) => b.id));
  if (beforeId !== null && blockIds.has(beforeId)) return { error: 'a block cannot land inside itself' };
  const destRows = of(recs, 'reminder')
    .filter((x) => x.payload.sectionId === destSectionId && !blockIds.has(x.id))
    .sort(byRecOrd);
  const at = beforeId === null ? destRows.length : destRows.findIndex((x) => x.id === beforeId);
  if (at === -1) return { error: 'no such landing row' };
  // ordGap, not the raw neighbours: two rows can share a key — see order.ts —
  // and asking for one between them threw in the middle of the drag.
  let [lo, hi] = ordGap(destRows.map((x) => x.payload.ord), at);
  const put: AnyRec[] = [];
  for (const b of block) {
    const ord = ordBetween(lo, hi);
    put.push({ ...b, payload: { ...b.payload, ord, sectionId: destSectionId, folderId: dest.payload.folderId } });
    lo = ord; // consecutive keys keep the family in order inside the gap
  }
  return { put };
}

/** Drop a note into a section, before `beforeId` (null = end) — the row move,
 *  cross-folder re-filing included. Notes have no blocks. */
export function moveNote(recs: AnyRec[], noteId: string, destSectionId: string, beforeId: string | null): ManageResult {
  const n = of(recs, 'note').find((x) => x.id === noteId);
  if (!n) return { error: 'no such note' };
  const dest = of(recs, 'section').find((s) => s.id === destSectionId);
  if (!dest) return { error: 'no such section' };
  const destRows = of(recs, 'note')
    .filter((x) => x.payload.sectionId === destSectionId && x.id !== noteId)
    .sort(byRecOrd);
  const at = beforeId === null ? destRows.length : destRows.findIndex((x) => x.id === beforeId);
  if (at === -1) return { error: 'no such landing row' };
  const ord = ordBetween(...ordGap(destRows.map((x) => x.payload.ord), at));
  return { put: [{ ...n, payload: { ...n.payload, ord, sectionId: destSectionId, folderId: dest.payload.folderId } }] };
}

/**
 * Move a habit into a section, landing before another habit (null = the end).
 * A habit belongs to its section and nothing else — there is no folder layer
 * in Habits — so this is moveNote without the re-pointing.
 */
export function moveHabit(recs: AnyRec[], habitId: string, destSectionId: string, beforeId: string | null): ManageResult {
  const h = of(recs, 'habit').find((x) => x.id === habitId);
  if (!h) return { error: 'no such habit' };
  if (!of(recs, 'habitsection').some((s) => s.id === destSectionId)) return { error: 'no such habit section' };
  const destRows = of(recs, 'habit')
    .filter((x) => x.payload.sectionId === destSectionId && x.id !== habitId)
    .sort(byRecOrd);
  const at = beforeId === null ? destRows.length : destRows.findIndex((x) => x.id === beforeId);
  if (at === -1) return { error: 'no such landing row' };
  const ord = ordBetween(...ordGap(destRows.map((x) => x.payload.ord), at));
  return { put: [{ ...h, payload: { ...h.payload, ord, sectionId: destSectionId } }] };
}

/**
 * Reorder a habit section against its siblings (null = the end). Habit
 * sections sit in one flat list, so moveSection's two refusals — a folder's
 * last section, a duplicate name in the destination — cannot arise: there is
 * nowhere else to move a section TO, only somewhere else in the same order.
 */
export function moveHabitSection(recs: AnyRec[], sectionId: string, beforeSectionId: string | null): ManageResult {
  const sec = of(recs, 'habitsection').find((s) => s.id === sectionId);
  if (!sec) return { error: 'no such habit section' };
  const sibs = of(recs, 'habitsection')
    .filter((s) => s.id !== sectionId)
    .sort(byRecOrd);
  const at = beforeSectionId === null ? sibs.length : sibs.findIndex((s) => s.id === beforeSectionId);
  if (at === -1) return { error: 'no such landing section' };
  const ord = ordBetween(...ordGap(sibs.map((x) => x.payload.ord), at));
  return { put: [{ ...sec, payload: { ...sec.payload, ord } }] };
}

/**
 * Move a section (with everything in it) into a folder, before another
 * section (null = end). The suite's refusals carry over: a folder whose
 * STAYING sections already hold the name refuses (a duplicate loses items on
 * delete), and a folder never gives up its last section (the suite asks and
 * deletes the emptied folder — that confirm flow arrives with the UI).
 */
export function moveSection(recs: AnyRec[], sectionId: string, destFolderId: string, beforeSectionId: string | null): ManageResult {
  const sec = of(recs, 'section').find((s) => s.id === sectionId);
  if (!sec) return { error: 'no such section' };
  const dest = of(recs, 'folder').find((f) => f.id === destFolderId);
  if (!dest) return { error: 'no such folder' };
  const srcFolderId = sec.payload.folderId;
  if (srcFolderId !== destFolderId) {
    const srcSections = of(recs, 'section').filter((s) => s.payload.folderId === srcFolderId);
    if (srcSections.length <= 1) return { error: 'a folder keeps its last section' };
    const staying = of(recs, 'section').filter((s) => s.payload.folderId === destFolderId && s.id !== sectionId);
    if (staying.some((s) => s.payload.name.trim().toLowerCase() === sec.payload.name.trim().toLowerCase())) {
      return { error: 'that folder already has a section by that name' };
    }
  }
  const destSecs = of(recs, 'section')
    .filter((s) => s.payload.folderId === destFolderId && s.id !== sectionId)
    .sort(byRecOrd);
  const at = beforeSectionId === null ? destSecs.length : destSecs.findIndex((s) => s.id === beforeSectionId);
  if (at === -1) return { error: 'no such landing section' };
  const ord = ordBetween(...ordGap(destSecs.map((x) => x.payload.ord), at));
  const put: AnyRec[] = [{ ...sec, payload: { ...sec.payload, ord, folderId: destFolderId } }];
  // The rows follow their section; only their folderId needs re-pointing.
  for (const r of of(recs, 'reminder')) {
    if (r.payload.sectionId === sectionId && r.payload.folderId !== destFolderId) {
      put.push({ ...r, payload: { ...r.payload, folderId: destFolderId } });
    }
  }
  for (const n of of(recs, 'note')) {
    if (n.payload.sectionId === sectionId && n.payload.folderId !== destFolderId) {
      put.push({ ...n, payload: { ...n.payload, folderId: destFolderId } });
    }
  }
  return { put };
}

/**
 * The suite's "dragging a folder's last section out asks first" flow: OK
 * means move the section AND delete the folder it emptied — one result, so
 * the two writes can't race. The rideAlong folder and an app's last folder
 * still refuse (they were never offered in the suite either).
 */
export function moveSectionEmptyingFolder(
  recs: AnyRec[],
  sectionId: string,
  destFolderId: string,
  beforeSectionId: string | null,
): ManageResult {
  const sec = of(recs, 'section').find((s) => s.id === sectionId);
  if (!sec) return { error: 'no such section' };
  const srcFolder = of(recs, 'folder').find((f) => f.id === sec.payload.folderId);
  if (!srcFolder) return { error: 'no such folder' };
  if (srcFolder.payload.rideAlong) return { error: 'the Calendar folder is permanent' };
  const app = folderApp(srcFolder.payload);
  if (foldersOf(recs, app).length <= 1) return { error: 'an app keeps at least one folder' };
  // Pretend the section already has a sibling so the plain move goes through,
  // then tombstone the emptied folder in the same result.
  const ghost: Rec<'section'> = {
    id: '__ghost__', type: 'section', updated: 0,
    payload: { name: '__ghost__', folderId: sec.payload.folderId, ord: 'zzzz' },
  };
  const moved = moveSection([...recs, ghost], sectionId, destFolderId, beforeSectionId);
  if ('error' in moved) return moved;
  return { put: [...moved.put, { ...srcFolder, deleted: true }] };
}

// ---------------------------------------------------------------- kind conversions

/**
 * The suite's conversion rules, one place: a reminder or event can become the
 * title of a NEW note (one-way — a note never converts out); reminder⇄event
 * convert both ways. Converting removes the source — unless a reminder has
 * subtasks, which can't ride along, so it stays behind as their home.
 */
/**
 * The suite's $showAgain(): whatever you just added has to be visible
 * afterwards, or the add reads as having failed. When the current filter
 * would swallow the new item — a single-view on some OTHER container, or
 * the destination hidden — widen the view back to All and un-hide it.
 * Returns the pref record to put, or null when nothing would swallow it.
 */
export function showAgain(
  recs: AnyRec[],
  app: 'reminders' | 'notes' | 'calendar',
  destContainerId: string,
): Rec<'pref'> | null {
  const p = prefsOf(recs, app);
  const next: Partial<Prefs> = {};
  let needed = false;
  if (p.lastView && p.lastView !== 'all' && p.lastView !== destContainerId) {
    next.lastView = 'all';
    needed = true;
  }
  if ((p.hidden ?? []).includes(destContainerId)) {
    next.hidden = (p.hidden ?? []).filter((id) => id !== destContainerId);
    needed = true;
  }
  return needed ? prefsPut(recs, app, next) : null;
}

/**
 * The suite's duplicate button: a copy directly under the original, fresh
 * ids throughout. A reminder copies its whole outline block (parent and
 * subtasks travel together); a note or event is a single copy. `mkId` is
 * called once per copied row so callers control id generation.
 */
export function duplicateItem(recs: AnyRec[], id: string, mkId: () => string): ManageResult {
  const src = recs.find((x) => x.id === id && !x.deleted);
  if (!src) return { error: 'no such item' };
  if (src.type === 'event') {
    return { put: [{ ...src, id: mkId(), payload: { ...(src as Rec<'event'>).payload } }] };
  }
  if (src.type === 'note') {
    const n = src as Rec<'note'>;
    const rows = of(recs, 'note')
      .filter((x) => x.payload.sectionId === n.payload.sectionId)
      .sort(byRecOrd);
    const at = rows.findIndex((x) => x.id === id);
    // at + 1: the same pair, widened past a duplicate key below it.
    const ord = ordBetween(...ordGap(rows.map((x) => x.payload.ord), at + 1));
    return { put: [{ ...n, id: mkId(), payload: { ...n.payload, ord } }] };
  }
  if (src.type !== 'reminder') return { error: 'not duplicable' };
  const block = reminderBlock(recs, id);
  if (block.length === 0) return { error: 'no such item' };
  const last = block[block.length - 1]!;
  const rows = of(recs, 'reminder')
    .filter((x) => x.payload.sectionId === last.payload.sectionId)
    .sort(byRecOrd);
  const at = rows.findIndex((x) => x.id === last.id);
  let [lo, hi] = ordGap(rows.map((x) => x.payload.ord), at + 1);
  const put: AnyRec[] = [];
  for (const b of block) {
    const ord = ordBetween(lo, hi);
    put.push({ ...b, id: mkId(), payload: { ...b.payload, ord } });
    lo = ord;
  }
  return { put };
}

export function convertToNote(recs: AnyRec[], sourceId: string, destSectionId: string, newNoteId: string): ManageResult {
  const src = of(recs, 'reminder').find((r) => r.id === sourceId) ?? of(recs, 'event').find((r) => r.id === sourceId);
  if (!src) return { error: 'no such item' };
  const dest = of(recs, 'section').find((s) => s.id === destSectionId);
  if (!dest) return { error: 'no such section' };
  const first = of(recs, 'note')
    .filter((n) => n.payload.sectionId === destSectionId)
    .sort(byRecOrd)[0];
  const title = src.type === 'reminder' ? src.payload.text : src.payload.text;
  const put: AnyRec[] = [
    {
      id: newNoteId, type: 'note', updated: 0,
      payload: { title, body: '', date: null, folderId: dest.payload.folderId, sectionId: destSectionId, ord: ordBetween(null, first?.payload.ord ?? null) },
    },
  ];
  const keepHome = src.type === 'reminder' && reminderBlock(recs, sourceId).length > 1;
  // superseded: a conversion, not a deletion — see Rec.superseded.
  if (!keepHome) put.push({ ...src, deleted: true, superseded: true } as AnyRec);
  return { put };
}

export function convertReminderToEvent(recs: AnyRec[], reminderId: string, calendarId: string, today: string, newEventId: string): ManageResult {
  const r = of(recs, 'reminder').find((x) => x.id === reminderId);
  if (!r) return { error: 'no such reminder' };
  if (!of(recs, 'calendar').some((c) => c.id === calendarId)) return { error: 'no such calendar' };
  const put: AnyRec[] = [
    {
      id: newEventId, type: 'event', updated: 0,
      payload: {
        text: r.payload.text,
        date: r.payload.due ?? today, // an undated reminder converts onto today
        time: r.payload.time,
        repeat: r.payload.repeat,
        calendarId,
        ord: ordBetween(null, null),
      },
    },
  ];
  const keepHome = reminderBlock(recs, reminderId).length > 1;
  // superseded: a conversion, not a deletion — see Rec.superseded.
  if (!keepHome) put.push({ ...r, deleted: true, superseded: true });
  return { put };
}

export function convertEventToReminder(recs: AnyRec[], eventId: string, destSectionId: string, newReminderId: string): ManageResult {
  const ev = of(recs, 'event').find((x) => x.id === eventId);
  if (!ev) return { error: 'no such event' };
  const dest = of(recs, 'section').find((s) => s.id === destSectionId);
  if (!dest) return { error: 'no such section' };
  const first = of(recs, 'reminder')
    .filter((x) => x.payload.sectionId === destSectionId)
    .sort(byRecOrd)[0];
  return {
    put: [
      {
        id: newReminderId, type: 'reminder', updated: 0,
        payload: {
          text: ev.payload.text, due: ev.payload.date, time: ev.payload.time, done: false,
          repeat: ev.payload.repeat, folderId: dest.payload.folderId, sectionId: destSectionId,
          indent: 0, ord: ordBetween(null, first?.payload.ord ?? null),
        },
      },
      // superseded: a conversion, not a deletion — see Rec.superseded.
      { ...ev, deleted: true, superseded: true },
    ],
  };
}
