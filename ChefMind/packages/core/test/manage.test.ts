/**
 * The folder-manager rules, ported from the suite: deletes keep items and
 * re-resolve the default AFTER the delete; the rideAlong and last folders are
 * undeletable; a folder's only section is undeletable; renames refuse empty
 * and taken names. One implementation, every platform.
 */
import { describe, it, expect } from 'vitest';
import { deleteCalendar, duplicateItem, showAgain, deleteFolder, deleteHabitSection, deleteSection, moveHabit, moveHabitSection, moveNote, moveReminderBlock, moveSection, convertEventToReminder, convertReminderToEvent, convertToNote, moveSectionEmptyingFolder, reminderBlock, renameCalendar, renameFolder, renameSection, prefsOf, prefsPut } from '../src/manage';
import { parseDateField } from '../src/parse';
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


describe('habit sections — delete keeps the habits', () => {
  const hs = (id: string, ord = 'V'): Rec<'habitsection'> => ({
    id, type: 'habitsection', updated: 0, payload: { name: id, color: '#4357ef', ord },
  });
  const habit = (id: string, sectionId: string): Rec<'habit'> => ({
    id, type: 'habit', updated: 0, payload: { name: id, sectionId, ord: 'V' },
  });

  it('the last section stays', () => {
    expect('error' in deleteHabitSection([hs('s1')], 's1')).toBe(true);
  });

  it('deleting moves its habits to the first remaining section', () => {
    const res = deleteHabitSection([hs('s1', 'A'), hs('s2', 'B'), habit('h1', 's2')], 's2');
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((r) => r.id === 'h1') as Rec<'habit'>).payload.sectionId).toBe('s1');
  });
});

describe('the habits drag — rows between sections, sections among themselves', () => {
  const hs = (id: string, ord: string): Rec<'habitsection'> => ({
    id, type: 'habitsection', updated: 0, payload: { name: id, color: '#4357ef', ord },
  });
  const habit = (id: string, sectionId: string, ord: string): Rec<'habit'> => ({
    id, type: 'habit', updated: 0, payload: { name: id, sectionId, ord },
  });
  // Two sections, two habits in the first and one in the second.
  const base = (): AnyRec[] => [
    hs('s1', 'A'), hs('s2', 'B'),
    habit('h1', 's1', 'A'), habit('h2', 's1', 'B'), habit('h3', 's2', 'A'),
  ];

  it('a habit lands in another section, before the row named', () => {
    const res = moveHabit(base(), 'h1', 's2', 'h3');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put[0] as Rec<'habit'>;
    expect(moved.payload.sectionId).toBe('s2');
    expect(moved.payload.ord < 'A').toBe(true); // ahead of h3
  });

  it('a null landing row means the end of the destination', () => {
    const res = moveHabit(base(), 'h1', 's2', null);
    if ('error' in res) throw new Error(res.error);
    expect((res.put[0] as Rec<'habit'>).payload.ord > 'A').toBe(true); // after h3
  });

  it('reordering within a section never re-homes it', () => {
    const res = moveHabit(base(), 'h2', 's1', 'h1');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put[0] as Rec<'habit'>;
    expect(moved.payload.sectionId).toBe('s1');
    expect(moved.payload.ord < 'A').toBe(true);
  });

  it('a habit refuses a section that is not there, and a landing row that is not', () => {
    expect('error' in moveHabit(base(), 'h1', 'nope', null)).toBe(true);
    expect('error' in moveHabit(base(), 'h1', 's2', 'ghost')).toBe(true);
  });

  it('a section reorders against its siblings, and to the end', () => {
    const first = moveHabitSection(base(), 's2', 's1');
    if ('error' in first) throw new Error(first.error);
    expect((first.put[0] as Rec<'habitsection'>).payload.ord < 'A').toBe(true);
    const last = moveHabitSection(base(), 's1', null);
    if ('error' in last) throw new Error(last.error);
    expect((last.put[0] as Rec<'habitsection'>).payload.ord > 'B').toBe(true);
  });

  it('a section has no last-section or duplicate-name refusal to hit — only a missing one', () => {
    // There is nowhere else to move a habit section TO, so moveSection's two
    // refusals cannot arise here; the one section left still reorders.
    expect('error' in moveHabitSection([hs('s1', 'A')], 's1', null)).toBe(false);
    expect('error' in moveHabitSection(base(), 'ghost', null)).toBe(true);
  });
});

describe('the outline drag — blocks travel, exactly as the suite moves them', () => {
  const sec = (id: string, folderId: string, ord = 'V'): Rec<'section'> => ({
    id, type: 'section', updated: 0, payload: { name: id, folderId, ord },
  });
  const fold = (id: string): Rec<'folder'> => ({
    id, type: 'folder', updated: 0, payload: { name: id, color: '#fff', ord: id, app: 'reminders' },
  });
  const row = (id: string, sectionId: string, ord: string, indent: 0 | 1 = 0, folderId = 'f1'): Rec<'reminder'> => ({
    id, type: 'reminder', updated: 0,
    payload: { text: id, due: null, time: null, done: false, repeat: null, folderId, sectionId, indent, ord },
  });

  const world = (): AnyRec[] => [
    fold('f1'), fold('f2'), sec('sA', 'f1', 'A'), sec('sB', 'f2', 'B'),
    row('p1', 'sA', 'B'), row('c1', 'sA', 'D', 1), row('c2', 'sA', 'F', 1),
    row('p2', 'sA', 'H'), row('q1', 'sB', 'B'),
  ];

  it('a parent block gathers its subtasks; a subtask alone is its own block', () => {
    expect(reminderBlock(world(), 'p1').map((r) => r.id)).toEqual(['p1', 'c1', 'c2']);
    expect(reminderBlock(world(), 'c2').map((r) => r.id)).toEqual(['c2']);
    expect(reminderBlock(world(), 'p2').map((r) => r.id)).toEqual(['p2']);
  });

  it('moving a parent below a later row carries the family in order', () => {
    const res = moveReminderBlock(world(), 'p1', 'sA', null); // to the end
    if ('error' in res) throw new Error(res.error);
    const ords = new Map(res.put.map((r) => [r.id, (r.payload as { ord: string }).ord]));
    expect([...ords.keys()]).toEqual(['p1', 'c1', 'c2']);
    expect(ords.get('p1')! > 'H').toBe(true); // past p2
    expect(ords.get('c1')! > ords.get('p1')!).toBe(true);
    expect(ords.get('c2')! > ords.get('c1')!).toBe(true);
  });

  it('a cross-folder move re-files folderId and sectionId for the whole block', () => {
    const res = moveReminderBlock(world(), 'p1', 'sB', 'q1');
    if ('error' in res) throw new Error(res.error);
    for (const r of res.put) {
      expect((r.payload as { sectionId: string }).sectionId).toBe('sB');
      expect((r.payload as { folderId: string }).folderId).toBe('f2');
      expect((r.payload as { ord: string }).ord < 'B').toBe(true); // all before q1
    }
  });

  it('a block refuses to land inside itself', () => {
    expect('error' in moveReminderBlock(world(), 'p1', 'sA', 'c1')).toBe(true);
  });
});

describe('moveNote and moveSection — the rest of the outline drag rules', () => {
  const nsec = (id: string, folderId: string, name: string, ord = 'V'): Rec<'section'> => ({
    id, type: 'section', updated: 0, payload: { name, folderId, ord },
  });
  const nfold = (id: string, app: 'reminders' | 'notes' = 'notes'): Rec<'folder'> => ({
    id, type: 'folder', updated: 0, payload: { name: id, color: '#fff', ord: id, app },
  });
  const note = (id: string, folderId: string, sectionId: string, ord: string): Rec<'note'> => ({
    id, type: 'note', updated: 0, payload: { title: id, body: '', date: null, folderId, sectionId, ord },
  });

  it('a note re-files across folders and lands before its target', () => {
    const recs: AnyRec[] = [
      nfold('f1'), nfold('f2'), nsec('sA', 'f1', 'A'), nsec('sB', 'f2', 'B'),
      note('n1', 'f1', 'sA', 'B'), note('n2', 'f2', 'sB', 'B'),
    ];
    const res = moveNote(recs, 'n1', 'sB', 'n2');
    if ('error' in res) throw new Error(res.error);
    const moved = res.put[0] as Rec<'note'>;
    expect(moved.payload.folderId).toBe('f2');
    expect(moved.payload.ord < 'B').toBe(true);
  });

  it('a section refuses to move into a folder holding its name', () => {
    const recs: AnyRec[] = [nfold('f1'), nfold('f2'), nsec('s1', 'f1', 'General'), nsec('s1b', 'f1', 'Extra'), nsec('s2', 'f2', 'general')];
    expect('error' in moveSection(recs, 's1', 'f2', null)).toBe(true);
  });

  it("a folder's last section stays put", () => {
    const recs: AnyRec[] = [nfold('f1'), nfold('f2'), nsec('s1', 'f1', 'Only'), nsec('s2', 'f2', 'Other')];
    expect('error' in moveSection(recs, 's1', 'f2', null)).toBe(true);
  });

  it('a legal section move re-points its rows to the new folder', () => {
    const recs: AnyRec[] = [
      nfold('f1'), nfold('f2'), nsec('s1', 'f1', 'Recipes'), nsec('s1b', 'f1', 'Extra'), nsec('s2', 'f2', 'Other'),
      note('n1', 'f1', 's1', 'B'),
    ];
    const res = moveSection(recs, 's1', 'f2', null);
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((r) => r.id === 's1') as Rec<'section'>).payload.folderId).toBe('f2');
    expect((res.put.find((r) => r.id === 'n1') as Rec<'note'>).payload.folderId).toBe('f2');
  });
});

describe('moveSectionEmptyingFolder — the ask-first flow, as one write', () => {
  const f = (id: string, app: 'reminders' | 'notes' = 'notes', rideAlong = false): Rec<'folder'> => ({
    id, type: 'folder', updated: 0, payload: { name: id, color: '#fff', ord: id, app, ...(rideAlong ? { rideAlong: true } : {}) },
  });
  const sct = (id: string, folderId: string, name: string): Rec<'section'> => ({
    id, type: 'section', updated: 0, payload: { name, folderId, ord: 'V' },
  });

  it('moves the last section and tombstones the emptied folder together', () => {
    const recs: AnyRec[] = [f('f1'), f('f2'), sct('s1', 'f1', 'Only'), sct('s2', 'f2', 'Home')];
    const res = moveSectionEmptyingFolder(recs, 's1', 'f2', null);
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((r) => r.id === 's1') as Rec<'section'>).payload.folderId).toBe('f2');
    expect((res.put.find((r) => r.id === 'f1') as Rec<'folder'>).deleted).toBe(true);
  });

  it('the rideAlong folder and the last folder of an app still refuse', () => {
    const ride: AnyRec[] = [f('cal', 'reminders', true), f('other', 'reminders'), sct('s1', 'cal', 'Only'), sct('s2', 'other', 'X')];
    expect('error' in moveSectionEmptyingFolder(ride, 's1', 'other', null)).toBe(true);
    const last: AnyRec[] = [f('f1'), sct('s1', 'f1', 'Only')];
    expect('error' in moveSectionEmptyingFolder(last, 's1', 'f1', null)).toBe(true);
  });
});

describe('kind conversions — one-way into notes, both ways reminder⇄event', () => {
  const cf = (id: string, app: 'reminders' | 'notes'): Rec<'folder'> => ({
    id, type: 'folder', updated: 0, payload: { name: id, color: '#fff', ord: id, app },
  });
  const cs = (id: string, folderId: string): Rec<'section'> => ({
    id, type: 'section', updated: 0, payload: { name: id, folderId, ord: 'V' },
  });
  const cr = (id: string, opts: Partial<Rec<'reminder'>['payload']> = {}): Rec<'reminder'> => ({
    id, type: 'reminder', updated: 0,
    payload: { text: id, due: null, time: null, done: false, repeat: null, folderId: 'rf', sectionId: 'rs', indent: 0, ord: 'M', ...opts },
  });
  const cal = (id: string): Rec<'calendar'> => ({ id, type: 'calendar', updated: 0, payload: { name: id, color: '#fff', ord: 'V' } });
  const world = (): AnyRec[] => [cf('rf', 'reminders'), cs('rs', 'rf'), cf('nf', 'notes'), cs('ns', 'nf'), cal('c1')];

  it('a reminder becomes a note and the source goes', () => {
    const res = convertToNote([...world(), cr('r1')], 'r1', 'ns', 'note1');
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((x) => x.id === 'note1') as Rec<'note'>).payload.title).toBe('r1');
    expect((res.put.find((x) => x.id === 'r1') as Rec<'reminder'>).deleted).toBe(true);
  });

  it('a reminder WITH subtasks stays behind as their home', () => {
    const recs = [...world(), cr('r1', { ord: 'B' }), cr('sub', { indent: 1, ord: 'D' })];
    const res = convertToNote(recs, 'r1', 'ns', 'note1');
    if ('error' in res) throw new Error(res.error);
    expect(res.put.find((x) => x.id === 'r1')).toBeUndefined(); // not deleted
  });

  it('an undated reminder converts onto today as an event', () => {
    const res = convertReminderToEvent([...world(), cr('r1')], 'r1', 'c1', '2026-08-08', 'ev1');
    if ('error' in res) throw new Error(res.error);
    expect((res.put.find((x) => x.id === 'ev1') as Rec<'event'>).payload.date).toBe('2026-08-08');
  });

  it('an event becomes a dated reminder and the event goes', () => {
    const ev: Rec<'event'> = { id: 'e1', type: 'event', updated: 0, payload: { text: 'e1', date: '2026-08-10', time: '09:00', repeat: null, calendarId: 'c1', ord: 'V' } };
    const res = convertEventToReminder([...world(), ev], 'e1', 'rs', 'r9');
    if ('error' in res) throw new Error(res.error);
    const r = res.put.find((x) => x.id === 'r9') as Rec<'reminder'>;
    expect(r.payload.due).toBe('2026-08-10');
    expect(r.payload.time).toBe('09:00');
    expect((res.put.find((x) => x.id === 'e1') as Rec<'event'>).deleted).toBe(true);
  });
});

describe('duplicateItem — a copy directly under the original, fresh ids', () => {
  const mk = () => { let n = 0; return () => 'dup' + ++n; };

  it('copies a reminder BLOCK under the original, family intact', () => {
    const sub = reminder('r2', 'fa', 'sa');
    sub.payload.indent = 1;
    const recs = [...base(), reminder('r1', 'fa', 'sa'), sub, reminder('r9', 'fa', 'sa')];
    const res = duplicateItem(recs, 'r1', mk());
    if ('error' in res) throw new Error(res.error);
    expect(res.put.map((p) => p.id)).toEqual(['dup1', 'dup2']);
    const [copyP, copyS] = res.put as Rec<'reminder'>[];
    expect(copyP!.payload.text).toBe('r1');
    expect(copyS!.payload.indent).toBe(1);
    // Ords land strictly between the block's end and the next row.
    expect(copyP!.payload.ord > 'r2' && copyP!.payload.ord < 'r9').toBe(true);
    expect(copyS!.payload.ord > copyP!.payload.ord && copyS!.payload.ord < 'r9').toBe(true);
  });

  it('copies a note directly under itself', () => {
    const note = (id: string): Rec<'note'> => ({ id, type: 'note', updated: 0, payload: { title: id, body: '', date: null, folderId: 'nf', sectionId: 'ns', ord: id } });
    const recs = [...base(), note('n1'), note('n3')];
    const res = duplicateItem(recs, 'n1', mk());
    if ('error' in res) throw new Error(res.error);
    const copy = res.put[0] as Rec<'note'>;
    expect(copy.id).toBe('dup1');
    expect(copy.payload.ord > 'n1' && copy.payload.ord < 'n3').toBe(true);
  });

  it('copies an event as one fresh-id row and refuses a missing id', () => {
    // `ord` is required on an Event and the app never writes one without it;
    // the literal was missing it and only the typecheck knew, because
    // duplicateItem copies an event's payload wholesale rather than reading
    // the field. A fixture the app cannot produce is the one thing this
    // repo's own notes say not to trust.
    const ev: Rec<'event'> = { id: 'e1', type: 'event', updated: 0, payload: { text: 'party', date: '2026-08-08', time: null, repeat: null, calendarId: 'c1', ord: 'a' } };
    const res = duplicateItem([...base(), ev], 'e1', mk());
    if ('error' in res) throw new Error(res.error);
    expect(res.put[0]!.id).toBe('dup1');
    expect((res.put[0] as Rec<'event'>).payload.text).toBe('party');
    expect('error' in duplicateItem(base(), 'ghost', mk())).toBe(true);
  });
});

describe("showAgain — what you just added must be visible", () => {
  const pref = (payload: object): AnyRec => ({ id: 'prefs_calendar', type: 'pref', updated: 0, payload } as AnyRec);
  it('widens a single view on another calendar back to All', () => {
    const res = showAgain([...base(), pref({ lastView: 'calA' })], 'calendar', 'calB');
    expect(res?.payload.lastView).toBe('all');
  });
  it('un-hides a hidden destination', () => {
    const res = showAgain([...base(), pref({ hidden: ['calB'] })], 'calendar', 'calB');
    expect(res?.payload.hidden).toEqual([]);
  });
  it('stays quiet when nothing would swallow the add', () => {
    expect(showAgain([...base(), pref({ lastView: 'calB' })], 'calendar', 'calB')).toBeNull();
    expect(showAgain([...base(), pref({})], 'calendar', 'calB')).toBeNull();
  });
});

describe('parseDateField — the little m/d box takes the words too', () => {
  it('explicit first', () => {
    expect(parseDateField('8/3', '2026-08-01')).toBe('2026-08-03');
  });
  it('then the relative words its neighbour already understood', () => {
    expect(parseDateField('tomorrow', '2026-08-01')).toBe('2026-08-02');
    expect(parseDateField('in 2 weeks', '2026-08-01')).toBe('2026-08-15');
    expect(parseDateField(' 3 days ', '2026-08-01')).toBe('2026-08-04');
  });
  it('and nothing is still nothing', () => {
    expect(parseDateField('', '2026-08-01')).toBeNull();
    expect(parseDateField('gibberish', '2026-08-01')).toBeNull();
  });
});
