/**
 * The folder-manager rules, ported from the suite: deletes keep items and
 * re-resolve the default AFTER the delete; the rideAlong and last folders are
 * undeletable; a folder's only section is undeletable; renames refuse empty
 * and taken names. One implementation, every platform.
 */
import { describe, it, expect } from 'vitest';
import { deleteCalendar, deleteFolder, deleteSection, renameCalendar, renameFolder, renameSection, prefsOf, prefsPut } from '../src/manage';
import { prefsId } from '../src/types';
import type { AnyRec, Rec } from '../src/types';

const folder = (id: string, name: string, opts: { app?: 'reminders' | 'notes'; rideAlong?: boolean; ord?: string } = {}): Rec<'folder'> => ({
  id, type: 'folder', updated: 0,
  payload: { name, color: '#fff', ord: opts.ord ?? id, app: opts.app ?? 'reminders', ...(opts.rideAlong ? { rideAlong: true } : {}) },
});
const section = (id: string, folderId: string, name = id, ord = id): Rec<'section'> => ({
  id, type: 'section', updated: 0, payload: { name, folderId, ord },
});
const reminder = (id: string, folderId: string, sectionId: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: id, due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: id },
});

/** Two reminder folders (one rideAlong) + a notes folder, a section each. */
const base = (): AnyRec[] => [
  folder('fa', 'A', { ord: 'A' }), section('sa', 'fa'),
  folder('cal', 'Calendar', { rideAlong: true, ord: 'B' }), section('sc', 'cal'),
  folder('nf', 'General', { app: 'notes', ord: 'C' }), section('ns', 'nf'),
];

describe('deleteFolder', () => {
  it('keeps the items — they move to the resolved default, section included', () => {
    const recs = [...base(), folder('fb', 'B', { ord: 'D' }), section('sb', 'fb'), reminder('r1', 'fb', 'sb')];
    const res = deleteFolder(recs, 'fb');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put.find((r) => r.id === 'r1') as Rec<'reminder'>;
    expect(moved.payload.folderId).toBe('fa'); // first remaining folder of the app
    expect(moved.payload.sectionId).toBe('sa');
    expect(res.put.find((r) => r.id === 'fb')!.deleted).toBe(true);
    expect(res.put.find((r) => r.id === 'sb')!.deleted).toBe(true); // its sections go too
  });

  it('honors the default-for-new-items pref, but never a section INSIDE the deleted folder', () => {
    const withPref = [...base(), folder('fb', 'B', { ord: 'D' }), section('sb', 'fb'), reminder('r1', 'fb', 'sb'),
      { ...prefsPut(base(), 'reminders', { defaultSectionId: 'sc' }) }];
    const res = deleteFolder(withPref, 'fb');
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((r) => r.id === 'r1') as Rec<'reminder'>).payload.sectionId).toBe('sc');
    // Default pointing into the folder being deleted: re-resolves elsewhere.
    const selfPref = [...base(), folder('fb', 'B', { ord: 'D' }), section('sb', 'fb'), reminder('r1', 'fb', 'sb'),
      { ...prefsPut(base(), 'reminders', { defaultSectionId: 'sb' }) }];
    const res2 = deleteFolder(selfPref, 'fb');
    if ('error' in res2) throw new Error(res2.error);
    expect((res2.put.find((r) => r.id === 'r1') as Rec<'reminder'>).payload.sectionId).toBe('sa');
  });

  it('refuses the rideAlong folder and the last folder of an app', () => {
    expect('error' in deleteFolder(base(), 'cal')).toBe(true);
    expect('error' in deleteFolder(base(), 'nf')).toBe(true); // notes' only folder
  });

  it("a notes-folder delete moves notes, and never touches reminders", () => {
    const note: Rec<'note'> = { id: 'n1', type: 'note', updated: 0, payload: { title: 'n', body: '', date: null, folderId: 'nf2', sectionId: 'ns2', ord: 'V' } };
    const recs = [...base(), folder('nf2', 'Recipes', { app: 'notes', ord: 'D' }), section('ns2', 'nf2'), note];
    const res = deleteFolder(recs, 'nf2');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put.find((r) => r.id === 'n1') as Rec<'note'>;
    expect(moved.payload.folderId).toBe('nf');
    expect(moved.payload.sectionId).toBe('ns');
  });
});

describe('deleteSection', () => {
  it("moves the section's items to the folder's first remaining section", () => {
    const recs = [...base(), section('sa2', 'fa', 'Second', 'Z'), reminder('r1', 'fa', 'sa2')];
    const res = deleteSection(recs, 'sa2');
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((r) => r.id === 'r1') as Rec<'reminder'>).payload.sectionId).toBe('sa');
  });

  it("refuses a folder's only section", () => {
    expect('error' in deleteSection(base(), 'sa')).toBe(true);
  });
});

describe('renames', () => {
  it('folder: refuses empty and taken (case-insensitive, same app only)', () => {
    const recs = [...base(), folder('fb', 'B', { ord: 'D' }), section('sb', 'fb')];
    expect('error' in renameFolder(recs, 'fb', '  ')).toBe(true);
    expect('error' in renameFolder(recs, 'fb', 'a')).toBe(true); // 'A' exists in reminders
    const across = renameFolder(recs, 'fb', 'General'); // notes has it; reminders doesn't
    expect('error' in across).toBe(false);
  });

  it('section: same rules within its folder', () => {
    const recs = [...base(), section('sa2', 'fa', 'Second', 'Z')];
    expect('error' in renameSection(recs, 'sa2', 'SA')).toBe(true); // 'sa' name is 'sa'
    const ok = renameSection(recs, 'sa2', 'Fresh');
    if ('error' in ok) throw new Error(ok.error);
    expect((ok.put[0] as Rec<'section'>).payload.name).toBe('Fresh');
  });

  it('the rideAlong folder RENAMES fine — the flag is the identity now, not the name', () => {
    const res = renameFolder(base(), 'cal', 'Today list');
    expect('error' in res).toBe(false);
  });
});

describe('prefs records', () => {
  it('read empty, merge on put, deterministic id', () => {
    expect(prefsOf([], 'reminders')).toEqual({});
    const p1 = prefsPut([], 'reminders', { lastView: 'all' });
    expect(p1.id).toBe(prefsId('reminders'));
    const p2 = prefsPut([p1], 'reminders', { hidden: ['f1'] });
    expect(p2.payload).toEqual({ lastView: 'all', hidden: ['f1'] });
  });
});

describe('calendars — rename and delete carry the folder rules over', () => {
  const cal = (id: string, name: string, ord = 'V'): Rec<'calendar'> => ({
    id, type: 'calendar', updated: 0, payload: { name, color: '#60a5fa', ord },
  });
  const ev = (id: string, calendarId: string): Rec<'event'> => ({
    id, type: 'event', updated: 0, payload: { text: 'e', date: '2026-08-07', time: null, repeat: null, calendarId, ord: 'V' },
  });

  it('the last calendar is undeletable', () => {
    const res = deleteCalendar([cal('c1', 'Personal')], 'c1');
    expect('error' in res).toBe(true);
  });

  it('deleting keeps the events — they fall to the first remaining calendar', () => {
    const res = deleteCalendar([cal('c1', 'A', 'A'), cal('c2', 'B', 'B'), ev('e1', 'c2')], 'c2');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put.find((r) => r.id === 'e1') as Rec<'event'>;
    expect(moved.payload.calendarId).toBe('c1');
    expect((res.put.find((r) => r.id === 'c2') as Rec<'calendar'>).deleted).toBe(true);
  });

  it('renames refuse empty, unchanged and taken names', () => {
    const recs = [cal('c1', 'Personal'), cal('c2', 'Work', 'W')];
    expect('error' in renameCalendar(recs, 'c1', '')).toBe(true);
    expect('error' in renameCalendar(recs, 'c1', 'Personal')).toBe(true);
    expect('error' in renameCalendar(recs, 'c1', 'work')).toBe(true);
    const ok = renameCalendar(recs, 'c1', 'Home');
    if ('error' in ok) throw new Error(ok.error);
    expect((ok.put[0] as Rec<'calendar'>).payload.name).toBe('Home');
  });
});
