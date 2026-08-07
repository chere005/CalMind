import { describe, it, expect } from 'vitest';
import { normalize, FOLDER_STARTER, SECTION_DEFAULT } from '../src/normalize';
import type { AnyRec, Rec } from '../src/types';

const folder = (id: string, name: string, ord = 'V'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name, color: '#60a5fa', ord },
});
const section = (id: string, folderId: string, name = 'S', ord = 'V'): Rec<'section'> => ({
  id, type: 'section', updated: 0, payload: { name, folderId, ord },
});
const reminder = (id: string, folderId: string, sectionId: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: 't', due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: 'V' },
});

describe('normalize — the shape guarantees', () => {
  it('an empty account grows the starter folder and its General', () => {
    const { added } = normalize([]);
    expect(added.map((r) => r.type).sort()).toEqual(['folder', 'section']);
    expect((added.find((r) => r.type === 'folder') as Rec<'folder'>).payload.name).toBe(FOLDER_STARTER);
    expect((added.find((r) => r.type === 'section') as Rec<'section'>).payload.name).toBe(SECTION_DEFAULT);
  });

  it('a folder with no section gets its General', () => {
    const recs: AnyRec[] = [folder('f1', 'Stuff')];
    const { added } = normalize(recs);
    expect(added.length).toBe(1);
    expect((added[0] as Rec<'section'>).payload.folderId).toBe('f1');
  });

  it('a reminder in a dead folder re-homes to the first folder, first section', () => {
    const recs: AnyRec[] = [folder('f1', 'A'), section('s1', 'f1'), reminder('r1', 'gone', 'nowhere')];
    const { edited } = normalize(recs);
    expect(edited.length).toBe(1);
    const r = edited[0] as Rec<'reminder'>;
    expect(r.payload.folderId).toBe('f1');
    expect(r.payload.sectionId).toBe('s1');
  });

  it("a reminder pointing at another folder's section is pulled back", () => {
    const recs: AnyRec[] = [
      folder('f1', 'A', 'A'), section('s1', 'f1'),
      folder('f2', 'B', 'B'), section('s2', 'f2'),
      reminder('r1', 'f1', 's2'),
    ];
    const { edited } = normalize(recs);
    expect((edited[0] as Rec<'reminder'>).payload.sectionId).toBe('s1');
  });

  it('a tombstoned section counts as gone', () => {
    const recs: AnyRec[] = [folder('f1', 'A'), { ...section('s1', 'f1'), deleted: true }];
    const { added } = normalize(recs);
    expect(added.length).toBe(1); // a fresh General replaces it
  });

  it('a well-formed list is left completely alone', () => {
    const recs: AnyRec[] = [folder('f1', 'A'), section('s1', 'f1'), reminder('r1', 'f1', 's1')];
    const { added, edited } = normalize(recs);
    expect(added.length + edited.length).toBe(0);
  });
});
