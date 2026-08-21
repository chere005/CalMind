/**
 * The shape guarantees for the whole suite, run on every load: each app's
 * starter records exist, every folder holds at least one section, and every
 * item sits in a real container of the right app. Pure — returns what to add
 * and what it edited; the caller stamps and persists (so a partner's shared
 * data could one day be normalized in memory only, exactly as the suite does).
 */
import type { AnyRec, Rec } from './types';
import { folderApp, newId } from './types';
import { ordBetween, byRecOrd } from './order';

export const FOLDER_STARTER = 'Reminders';
export const FOLDER_CALENDAR = 'Calendar'; // seeded WITH rideAlong — the name is a label, the flag is the identity
export const FOLDER_NOTES_STARTER = 'General';
export const FOLDER_SHOPPING = 'Shopping list';
export const SECTION_DEFAULT = 'General';
export const CALENDAR_STARTER = 'Personal';
export const HABIT_SECTION_STARTER = 'Habits';

// Seed colours, as in lib/palette.php: reminders' vivid blue and notes' sky.
// CalMind's calendar and habit colours are gone with the tabs that used them.
const C_REMINDERS = '#4c8bf0';
const C_NOTES = '#7dc2ed';
// The shopping list's own colour — the palette's gold, which is also the tile
// this app wears, so the tab and the folder read as the same thing.
const C_SHOPPING = '#f0b429';

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
  const folder = (name: string, color: string, app: 'reminders' | 'notes', rideAlong = false, after?: string, shopping = false): Rec<'folder'> => {
    const f: Rec<'folder'> = {
      id: newId(),
      type: 'folder',
      updated: 0,
      payload: {
        name, color, ord: ordBetween(after ?? null, null), app,
        ...(rideAlong ? { rideAlong: true } : {}),
        ...(shopping ? { shopping: true } : {}),
      },
    };
    folders.push(f);
    return put(f) as Rec<'folder'>;
  };

  /**
   * Starters. Reminders opens with its general folder, Recipes with General,
   * and there is always a shopping list.
   *
   * NO RIDE-ALONG CALENDAR FOLDER, no calendar, no habit section — CalMind's
   * core seeds all three and ChefMind has none of those tabs. Seeded here they
   * would be records that sync forever and are never drawn, and the Calendar
   * folder would show up in the Reminders tab as a container nothing can ever
   * be filed into.
   *
   * The ordinary shopping-list folder is NOT counted as a reminders folder for
   * the "does one exist?" test below. A brand-new account whose only reminders
   * folder was the shopping list would otherwise never grow a general one, and
   * every reminder made anywhere would be re-homed onto the shopping list by
   * the rehome pass at the bottom of this function.
   */
  const appFolders = (app: 'reminders' | 'notes') =>
    folders.filter((f) => folderApp(f.payload) === app && !f.payload.shopping).sort(byRecOrd);
  if (appFolders('reminders').length === 0) {
    folder(FOLDER_STARTER, C_REMINDERS, 'reminders');
  }
  if (appFolders('notes').length === 0) {
    folder(FOLDER_NOTES_STARTER, C_NOTES, 'notes');
  }
  // Permanent the way rideAlong is permanent: the flag is the identity, so an
  // account that predates the shopping list grows one on its next load, and
  // renaming the folder never makes a second appear.
  if (!folders.some((f) => f.payload.shopping)) {
    const last = appFolders('reminders').slice(-1)[0];
    folder(FOLDER_SHOPPING, C_SHOPPING, 'reminders', false, last?.payload.ord, true);
  }

  // Every folder keeps at least one section, so nothing can land loose.
  const secsOf = (fid: string) =>
    sections.filter((s) => s.payload.folderId === fid).sort(byRecOrd);
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

  // No event or habit re-homing: with nothing seeding a calendar or a habit
  // section there is nowhere to re-home them TO, and this app writes neither.

  return { added, edited };
}
