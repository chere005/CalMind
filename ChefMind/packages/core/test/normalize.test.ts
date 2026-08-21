import { describe, it, expect } from 'vitest';
import {
  normalize,
  FOLDER_STARTER,
  FOLDER_NOTES_STARTER,
  FOLDER_SHOPPING,
  SECTION_DEFAULT,
} from '../src/normalize';
import type { AnyRec, Rec } from '../src/types';

/**
 * ChefMind's shape guarantees, which are NOT CalMind's.
 *
 * Upstream this file also pins a ride-along Calendar folder, a starter
 * calendar and a habit section. This app has none of those tabs, so seeding
 * them would mean records that sync forever and are never drawn — and a
 * Calendar folder sitting in the Reminders tab that nothing can be filed into.
 * What it pins instead is the shopping list, which is this app's own.
 */
const folder = (id: string, name: string, app: 'reminders' | 'notes' = 'reminders', ord = 'V'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name, color: '#60a5fa', ord, app },
});
const shopFolder = (id: string, ord = 'W'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name: FOLDER_SHOPPING, color: '#f0b429', ord, app: 'reminders', shopping: true },
});
const section = (id: string, folderId: string, name = 'S', ord = 'V'): Rec<'section'> => ({
  id, type: 'section', updated: 0, payload: { name, folderId, ord },
});
const reminder = (id: string, folderId: string, sectionId: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: 't', due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: 'V' },
});
const note = (id: string, folderId: string, sectionId: string): Rec<'note'> => ({
  id, type: 'note', updated: 0, payload: { title: 'n', body: '', date: null, folderId, sectionId, ord: 'V' },
});

describe('normalize — ChefMind’s shape guarantees', () => {
  it('an empty account grows three folders: Reminders, Recipes’ General, and the shopping list', () => {
    const { added } = normalize([]);
    const folders = added.filter((r): r is Rec<'folder'> => r.type === 'folder');
    expect(folders.map((f) => f.payload.name).sort())
      .toEqual([FOLDER_NOTES_STARTER, FOLDER_SHOPPING, FOLDER_STARTER].sort());
    expect(folders.find((f) => f.payload.name === FOLDER_SHOPPING)!.payload.shopping).toBe(true);
    expect(folders.find((f) => f.payload.name === FOLDER_NOTES_STARTER)!.payload.app).toBe('notes');
    expect(added.filter((r) => r.type === 'section').length).toBe(3); // one General per folder
  });

  it('seeds no calendar and no habit section — this app has neither', () => {
    const { added } = normalize([]);
    expect(added.filter((r) => r.type === 'calendar')).toEqual([]);
    expect(added.filter((r) => r.type === 'habitsection')).toEqual([]);
    expect(added.filter((r) => r.type === 'folder' && r.payload.rideAlong)).toEqual([]);
  });

  it('the shopping list is permanent, and renaming it never makes a second', () => {
    const renamed: Rec<'folder'> = {
      id: 'sf', type: 'folder', updated: 0,
      payload: { name: 'Groceries', color: '#f0b429', ord: 'W', app: 'reminders', shopping: true },
    };
    const { added } = normalize([folder('f1', 'A'), section('s1', 'f1'), renamed, section('ss', 'sf'), folder('nf', 'N', 'notes'), section('ns', 'nf')]);
    expect(added.filter((r) => r.type === 'folder')).toEqual([]);
  });

  /**
   * The one that would have been silent. Without excluding the shopping list
   * from "does a reminders folder exist?", an account whose only reminders
   * folder IS the shopping list grows no general one — and the re-homing pass
   * then files every ordinary reminder onto the shopping list.
   */
  it('a shopping list alone does not count as the reminders folder', () => {
    const { added } = normalize([shopFolder('sf'), section('ss', 'sf'), folder('nf', 'N', 'notes'), section('ns', 'nf')]);
    const grown = added.filter((r): r is Rec<'folder'> => r.type === 'folder');
    expect(grown.map((f) => f.payload.name)).toEqual([FOLDER_STARTER]);
    expect(grown[0]!.payload.shopping).toBeUndefined();
  });

  it('a folder with no section gets its General', () => {
    const { added } = normalize([folder('f1', 'Stuff'), ...seed()]);
    const sec = added.filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === 'f1');
    expect(sec.length).toBe(1);
    expect(sec[0]!.payload.name).toBe(SECTION_DEFAULT);
  });

  it('a recipe pointing into a REMINDERS folder is pulled home to a notes folder', () => {
    const recs: AnyRec[] = [
      folder('rf', 'Rem', 'reminders'), section('rs', 'rf'),
      folder('nf', 'Recipes', 'notes'), section('ns', 'nf'),
      shopFolder('sf'), section('ss', 'sf'),
      note('n1', 'rf', 'rs'), // filed across apps — must not stand
    ];
    const { edited } = normalize(recs);
    const n = edited.find((r) => r.id === 'n1') as Rec<'note'>;
    expect(n.payload.folderId).toBe('nf');
    expect(n.payload.sectionId).toBe('ns');
  });

  it('a shopping row stays on the shopping list rather than being re-homed', () => {
    const recs: AnyRec[] = [...seed(), reminder('r1', 'seed-sf', 'seed-ss')];
    const { edited } = normalize(recs);
    expect(edited.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('a well-formed account is left completely alone', () => {
    const { added, edited } = normalize([...seed(), reminder('r1', 'seed-rf', 'seed-rs'), note('n1', 'seed-nf', 'seed-ns')]);
    expect(added.length + edited.length).toBe(0);
  });
});

/** The starters, so a test can focus on one guarantee at a time. */
function seed(): AnyRec[] {
  return [
    folder('seed-rf', FOLDER_STARTER, 'reminders', 'A'), section('seed-rs', 'seed-rf'),
    folder('seed-nf', FOLDER_NOTES_STARTER, 'notes', 'B'), section('seed-ns', 'seed-nf'),
    shopFolder('seed-sf', 'C'), section('seed-ss', 'seed-sf'),
  ];
}
