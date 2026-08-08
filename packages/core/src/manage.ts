/**
 * Folder and section management — the suite's delete/rename rules, ported so
 * every screen (and every platform) calls one implementation. Pure: each
 * mutator returns the records to put (tombstones and re-homed items with
 * payloads already updated); the caller stamps and persists them. An error is
 * a string the UI can show verbatim.
 */
import type { AnyRec, Prefs, Rec } from './types';
import { folderApp, prefsId } from './types';
import { byOrd } from './order';
import { sectionNameTaken } from './rules';

const live = (r: { deleted?: boolean }) => !r.deleted;
const of = <T extends AnyRec['type']>(recs: AnyRec[], t: T) =>
  recs.filter((r) => r.type === t && live(r)) as Rec<T>[];

export type ManageResult = { put: AnyRec[] } | { error: string };

/** The prefs record for an app, or an empty one. */
export function prefsOf(recs: AnyRec[], app: 'reminders' | 'notes' | 'calendar'): Prefs {
  const rec = recs.find((r) => r.id === prefsId(app) && !r.deleted);
  return rec && rec.type === 'pref' ? (rec.payload as Prefs) : {};
}

/** A fresh pref record carrying `next` merged over what's stored. */
export function prefsPut(recs: AnyRec[], app: 'reminders' | 'notes' | 'calendar', next: Partial<Prefs>): Rec<'pref'> {
  return { id: prefsId(app), type: 'pref', updated: 0, payload: { ...prefsOf(recs, app), ...next } };
}

const sectionsOf = (recs: AnyRec[], folderId: string) =>
  of(recs, 'section')
    .filter((s) => s.payload.folderId === folderId)
    .sort((a, b) => byOrd(a.payload, b.payload));

const foldersOf = (recs: AnyRec[], app: 'reminders' | 'notes') =>
  of(recs, 'folder')
    .filter((f) => folderApp(f.payload) === app)
    .sort((a, b) => byOrd(a.payload, b.payload));

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
  const cals = of(recs, 'calendar').sort((a, b) => byOrd(a.payload, b.payload));
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
