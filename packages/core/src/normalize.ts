/**
 * The shape guarantees, ported from sections_normalize + folders_load: at least
 * one folder always exists, every live folder holds at least one live section,
 * and every reminder sits in a real section of a real folder. Run on every load;
 * pure — returns the records to add and the ones it edited, and the caller stamps
 * and persists them (so a partner's data could be normalized in memory only,
 * exactly as the suite does).
 */
import type { AnyRec, Rec } from './types';
import { newId } from './types';
import { ordBetween, byOrd } from './order';

export const FOLDER_STARTER = 'Reminders';
export const SECTION_DEFAULT = 'General';

const live = (r: { deleted?: boolean }) => !r.deleted;

export function normalize(recs: AnyRec[]): { added: AnyRec[]; edited: AnyRec[] } {
  const added: AnyRec[] = [];
  const edited: AnyRec[] = [];
  const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder' && live(r));
  const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section' && live(r));
  const reminders = recs.filter((r): r is Rec<'reminder'> => r.type === 'reminder' && live(r));

  // A brand-new account starts with one folder — the suite's starter, minus the
  // web-only permanent Calendar (that arrives with the Calendar app's milestone).
  if (folders.length === 0) {
    const f: Rec<'folder'> = {
      id: newId(),
      type: 'folder',
      updated: 0,
      payload: { name: FOLDER_STARTER, color: '#60a5fa', ord: ordBetween(null, null) },
    };
    added.push(f);
    folders.push(f);
  }

  // Every folder keeps at least one section, so nothing can land loose.
  const secsOf = (fid: string) => sections.filter((s) => s.payload.folderId === fid).sort((a, b) => byOrd(a.payload, b.payload));
  for (const f of folders) {
    if (secsOf(f.id).length === 0) {
      const s: Rec<'section'> = {
        id: newId(),
        type: 'section',
        updated: 0,
        payload: { name: SECTION_DEFAULT, folderId: f.id, ord: ordBetween(null, null) },
      };
      added.push(s);
      sections.push(s);
    }
  }

  // Re-home strays: unknown folder → first folder; wrong/dead section → its
  // folder's first section. Ids make this cheap — no name chasing.
  const firstFolder = folders.sort((a, b) => byOrd(a.payload, b.payload))[0]!;
  const secById = new Map(sections.map((s) => [s.id, s]));
  const folderIds = new Set(folders.map((f) => f.id));
  for (const r of reminders) {
    let { folderId, sectionId } = r.payload;
    if (!folderIds.has(folderId)) folderId = firstFolder.id;
    const sec = secById.get(sectionId);
    if (!sec || sec.payload.folderId !== folderId) sectionId = secsOf(folderId)[0]!.id;
    if (folderId !== r.payload.folderId || sectionId !== r.payload.sectionId) {
      r.payload = { ...r.payload, folderId, sectionId };
      edited.push(r);
    }
  }
  return { added, edited };
}
