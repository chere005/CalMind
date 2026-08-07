import { describe, it, expect } from 'vitest';
import {
  normalize,
  FOLDER_STARTER,
  FOLDER_CALENDAR,
  FOLDER_NOTES_STARTER,
  SECTION_DEFAULT,
  CALENDAR_STARTER,
  HABIT_SECTION_STARTER,
} from '../src/normalize';
import type { AnyRec, Rec } from '../src/types';

const folder = (id: string, name: string, app: 'reminders' | 'notes' = 'reminders', ord = 'V'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name, color: '#60a5fa', ord, app },
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

describe('normalize — the suite shape guarantees', () => {
  it('an empty account grows every starter: two reminder folders (one rideAlong), notes General, a calendar, a habit section', () => {
    const { added } = normalize([]);
    const folders = added.filter((r): r is Rec<'folder'> => r.type === 'folder');
    expect(folders.map((f) => f.payload.name).sort()).toEqual([FOLDER_CALENDAR, FOLDER_NOTES_STARTER, FOLDER_STARTER].sort());
    expect(folders.find((f) => f.payload.name === FOLDER_CALENDAR)!.payload.rideAlong).toBe(true);
    expect(folders.find((f) => f.payload.name === FOLDER_NOTES_STARTER)!.payload.app).toBe('notes');
    expect(added.filter((r) => r.type === 'section').length).toBe(3); // one General per folder
    expect((added.find((r) => r.type === 'calendar') as Rec<'calendar'>).payload.name).toBe(CALENDAR_STARTER);
    expect((added.find((r) => r.type === 'habitsection') as Rec<'habitsection'>).payload.name).toBe(HABIT_SECTION_STARTER);
  });

  it('a milestone-1 record set (folders without app) keeps its items and grows the rideAlong folder', () => {
    const legacy: Rec<'folder'> = { id: 'f1', type: 'folder', updated: 0, payload: { name: 'Old', color: '#fff', ord: 'V' } };
    const recs: AnyRec[] = [legacy, section('s1', 'f1'), reminder('r1', 'f1', 's1')];
    const { added, edited } = normalize(recs);
    expect(edited.find((r) => r.id === 'r1')).toBeUndefined(); // no re-homing of a valid legacy shape
    const grown = added.filter((r): r is Rec<'folder'> => r.type === 'folder');
    expect(grown.length).toBe(2); // notes' General + the rideAlong Calendar, never a second starter
    expect(grown.find((f) => f.payload.rideAlong)!.payload.name).toBe(FOLDER_CALENDAR);
  });

  it('an account that already has its rideAlong folder is not given another', () => {
    const cal: Rec<'folder'> = { id: 'cf', type: 'folder', updated: 0, payload: { name: 'Calendar', color: '#fff', ord: 'W', app: 'reminders', rideAlong: true } };
    const { added } = normalize([folder('f1', 'A'), section('s1', 'f1'), cal, section('cs', 'cf'), ...normSeed()]);
    expect(added.filter((r) => r.type === 'folder').length).toBe(0);
  });

  it('a folder with no section gets its General', () => {
    const { added } = normalize([folder('f1', 'Stuff'), ...normSeed()]);
    const sec = added.filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === 'f1');
    expect(sec.length).toBe(1);
    expect(sec[0]!.payload.name).toBe(SECTION_DEFAULT);
  });

  it('a note pointing into a REMINDERS folder is pulled home to a notes folder', () => {
    const recs: AnyRec[] = [
      folder('rf', 'Rem', 'reminders'), section('rs', 'rf'),
      folder('nf', 'Notes', 'notes'), section('ns', 'nf'),
      note('n1', 'rf', 'rs'), // filed across apps — must not stand
    ];
    const { edited } = normalize(recs);
    const n = edited.find((r) => r.id === 'n1') as Rec<'note'>;
    expect(n.payload.folderId).toBe('nf');
    expect(n.payload.sectionId).toBe('ns');
  });

  it('an event on a dead calendar falls to the first live one', () => {
    const cal: Rec<'calendar'> = { id: 'c1', type: 'calendar', updated: 0, payload: { name: 'P', color: '#60a5fa', ord: 'V' } };
    const ev: Rec<'event'> = { id: 'e1', type: 'event', updated: 0, payload: { text: 'x', date: '2026-08-07', time: null, repeat: null, calendarId: 'gone', ord: 'V' } };
    const { edited } = normalize([cal, ev, ...normSeed()]);
    expect((edited.find((r) => r.id === 'e1') as Rec<'event'>).payload.calendarId).toBe('c1');
  });

  it('a habit in a dead section falls to the first live one', () => {
    const hs: Rec<'habitsection'> = { id: 'h1', type: 'habitsection', updated: 0, payload: { name: 'Habits', color: '#818cf8', ord: 'V' } };
    const habit: Rec<'habit'> = { id: 'hb1', type: 'habit', updated: 0, payload: { name: 'Run', sectionId: 'gone', ord: 'V' } };
    const { edited } = normalize([hs, habit, ...normSeed()]);
    expect((edited.find((r) => r.id === 'hb1') as Rec<'habit'>).payload.sectionId).toBe('h1');
  });

  it('a well-formed suite is left completely alone', () => {
    const recs: AnyRec[] = [
      folder('f1', 'A'), section('s1', 'f1'), reminder('r1', 'f1', 's1'),
      { id: 'cf', type: 'folder', updated: 0, payload: { name: 'Calendar', color: '#fff', ord: 'W', app: 'reminders', rideAlong: true } },
      section('cs', 'cf'),
      folder('nf', 'N', 'notes'), section('ns', 'nf'), note('n1', 'nf', 'ns'),
      { id: 'c1', type: 'calendar', updated: 0, payload: { name: 'P', color: '#60a5fa', ord: 'V' } },
      { id: 'h1', type: 'habitsection', updated: 0, payload: { name: 'H', color: '#818cf8', ord: 'V' } },
    ];
    const { added, edited } = normalize(recs);
    expect(added.length + edited.length).toBe(0);
  });
});

/** The other apps' starters, so a test can focus on one guarantee at a time. */
function normSeed(): AnyRec[] {
  return [
    folder('seed-rf', 'Reminders', 'reminders', 'A'), section('seed-rs', 'seed-rf'),
    folder('seed-nf', 'General', 'notes', 'B'), section('seed-ns', 'seed-nf'),
    { id: 'seed-c', type: 'calendar', updated: 0, payload: { name: 'P', color: '#60a5fa', ord: 'V' } },
    { id: 'seed-h', type: 'habitsection', updated: 0, payload: { name: 'H', color: '#818cf8', ord: 'V' } },
  ];
}
