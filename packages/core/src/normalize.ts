/**
 * The shape guarantees for the whole suite, run on every load: each app's
 * starter records exist, every folder holds at least one section, and every
 * item sits in a real container of the right app. Pure — returns what to add
 * and what it edited; the caller stamps and persists (so a partner's shared
 * data could one day be normalized in memory only, exactly as the suite does).
 */
import type { AnyRec, Rec } from './types';
import { folderApp, newId } from './types';
import { ordBetween, byOrd } from './order';

export const FOLDER_STARTER = 'Reminders';
export const FOLDER_CALENDAR = 'Calendar'; // seeded WITH rideAlong — the name is a label, the flag is the identity
export const FOLDER_NOTES_STARTER = 'General';
export const SECTION_DEFAULT = 'General';
export const CALENDAR_STARTER = 'Personal';
export const HABIT_SECTION_STARTER = 'Habits';

// Seed colors, one per app tier as in lib/palette.php: reminders' vivid blue,
// the event blue (deliberately a blue, never a cyan), notes' sky, habits' indigo.
const C_REMINDERS = '#4c8bf0';
const C_CALENDAR_FOLDER = '#66d695';
const C_NOTES = '#7dc2ed';
const C_CAL = '#0379f6';
const C_HABITS = '#4357ef';

const live = (r: { deleted?: boolean }) => !r.deleted;

export function normalize(recs: AnyRec[]): { added: AnyRec[]; edited: AnyRec[] } {
  const added: AnyRec[] = [];
  const edited: AnyRec[] = [];
  const of = <T extends AnyRec['type']>(t: T) => recs.filter((r) => r.type === t && live(r)) as Rec<T>[];

  const folders = of('folder');
  const sections = of('section');

  const put = (r: AnyRec) => {
    added.push(r);
    return r;
  };
  const folder = (name: string, color: string, app: 'reminders' | 'notes', rideAlong = false, after?: string): Rec<'folder'> => {
    const f: Rec<'folder'> = {
      id: newId(),
      type: 'folder',
      updated: 0,
      payload: { name, color, ord: ordBetween(after ?? null, null), app, ...(rideAlong ? { rideAlong: true } : {}) },
    };
    folders.push(f);
    return put(f) as Rec<'folder'>;
  };

  // Starters. Reminders opens with its general folder plus the ride-along
  // Calendar folder; Notes with General; one calendar; one habit section.
  const appFolders = (app: 'reminders' | 'notes') =>
    folders.filter((f) => folderApp(f.payload) === app).sort((a, b) => byOrd(a.payload, b.payload));
  if (appFolders('reminders').length === 0) {
    folder(FOLDER_STARTER, C_REMINDERS, 'reminders');
  }
  // The ride-along folder always exists — folders_fixed()'s guarantee carried
  // over: it's the flag that's permanent, and an account from before the flag
  // (milestone 1) grows one on its next load.
  if (!appFolders('reminders').some((f) => f.payload.rideAlong)) {
    const last = appFolders('reminders').slice(-1)[0];
    folder(FOLDER_CALENDAR, C_CALENDAR_FOLDER, 'reminders', true, last?.payload.ord);
  }
  if (appFolders('notes').length === 0) {
    folder(FOLDER_NOTES_STARTER, C_NOTES, 'notes');
  }
  const calendars = of('calendar');
  if (calendars.length === 0) {
    calendars.push(
      put({ id: newId(), type: 'calendar', updated: 0, payload: { name: CALENDAR_STARTER, color: C_CAL, ord: ordBetween(null, null) } }) as Rec<'calendar'>,
    );
  }
  const habitSections = of('habitsection');
  if (habitSections.length === 0) {
    habitSections.push(
      put({ id: newId(), type: 'habitsection', updated: 0, payload: { name: HABIT_SECTION_STARTER, color: C_HABITS, ord: ordBetween(null, null) } }) as Rec<'habitsection'>,
    );
  }

  // Every folder keeps at least one section, so nothing can land loose.
  const secsOf = (fid: string) =>
    sections.filter((s) => s.payload.folderId === fid).sort((a, b) => byOrd(a.payload, b.payload));
  for (const f of folders) {
    if (secsOf(f.id).length === 0) {
      sections.push(
        put({ id: newId(), type: 'section', updated: 0, payload: { name: SECTION_DEFAULT, folderId: f.id, ord: ordBetween(null, null) } }) as Rec<'section'>,
      );
    }
  }

  // Re-home strays into their own app's containers. Ids make this cheap.
  const secById = new Map(sections.map((s) => [s.id, s]));
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const rehome = (r: Rec<'reminder'> | Rec<'note'>, app: 'reminders' | 'notes') => {
    let { folderId, sectionId } = r.payload;
    const f = folderById.get(folderId);
    if (!f || folderApp(f.payload) !== app) folderId = appFolders(app)[0]!.id;
    const sec = secById.get(sectionId);
    if (!sec || sec.payload.folderId !== folderId) sectionId = secsOf(folderId)[0]!.id;
    if (folderId !== r.payload.folderId || sectionId !== r.payload.sectionId) {
      r.payload = { ...r.payload, folderId, sectionId };
      edited.push(r);
    }
  };
  for (const r of of('reminder')) rehome(r, 'reminders');
  for (const n of of('note')) rehome(n, 'notes');

  // Events with a dead calendar fall to the first one; habits likewise.
  const calIds = new Set(calendars.map((c) => c.id));
  const firstCal = calendars.sort((a, b) => byOrd(a.payload, b.payload))[0]!;
  for (const e of of('event')) {
    if (!calIds.has(e.payload.calendarId)) {
      e.payload = { ...e.payload, calendarId: firstCal.id };
      edited.push(e);
    }
  }
  const hsIds = new Set(habitSections.map((s) => s.id));
  const firstHs = habitSections.sort((a, b) => byOrd(a.payload, b.payload))[0]!;
  for (const h of of('habit')) {
    if (!hsIds.has(h.payload.sectionId)) {
      h.payload = { ...h.payload, sectionId: firstHs.id };
      edited.push(h);
    }
  }

  return { added, edited };
}
