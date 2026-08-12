/**
 * The guards in manage.ts that nothing was watching.
 *
 * Found by mutation, 2026-08-11: each single-line `if (…) return { error: … }`
 * was neutered in turn and the suite re-run. Thirty-three of forty-eight
 * survived — nothing anywhere noticed when they stopped firing. Coverage would
 * have called those lines exercised; they are reached constantly, just never
 * with the argument that makes them fire.
 *
 * They are two different problems and get two different answers here.
 *
 * FIVE ARE RULES, and two of those are the sibling asymmetry this repo keeps
 * producing: 'a folder needs a name' was pinned and 'a section needs a name'
 * was not; 'an app keeps at least one folder' was pinned in
 * moveSectionEmptyingFolder and not in deleteFolder, which is the function
 * anyone would actually reach it through. Each gets its own test below.
 *
 * TWENTY-SEVEN ARE BAD-ID DEFENCES — 'no such folder', 'no such landing row'.
 * Individually dull, collectively the app's answer to a stale id, which is not
 * hypothetical: Sean runs a phone, a watch and the web on one account, so a row
 * can be deleted on one device while another is mid-drag over it. What matters
 * is the property they share — an id that is gone comes back as an error and
 * never as a crash — so they get one table rather than twenty-seven tests.
 *
 * The sweep now leaves THREE survivors, and they are a different thing again:
 * each is unreachable behind an earlier guard, so no argument makes it fire.
 *   · deleteFolder's 'nowhere to move its items' — it is past the
 *     at-least-one-folder check, and normalize() guarantees every folder has a
 *     section, so a destination always exists;
 *   · moveSectionEmptyingFolder's 'no such folder' — the section was just
 *     found, so its folderId resolves unless a record points at a dead
 *     container, which normalize() re-homes;
 *   · duplicateItem's 'no such item' — src is already known to be a reminder,
 *     and reminderBlock on a live reminder never returns empty.
 * Left in place and left untested on purpose: they cost nothing, they are the
 * right answer if an assumption above them ever stops holding, and a test that
 * has to fake an impossible store to reach them would pin the fake rather than
 * the rule.
 */
import { describe, it, expect } from 'vitest';
import {
  convertEventToReminder, convertReminderToEvent, convertToNote, deleteCalendar,
  deleteFolder, deleteHabitSection, deleteSection, duplicateItem, moveHabit,
  moveHabitSection, moveNote, moveReminderBlock, moveSection,
  moveSectionEmptyingFolder, renameCalendar, renameFolder, renameSection,
  type AnyRec, type ManageResult, type Rec,
} from '../src/index';

const folder = (id: string, name: string, opts: { app?: 'reminders' | 'notes'; rideAlong?: boolean; ord?: string } = {}): Rec<'folder'> => ({
  id, type: 'folder', updated: 0,
  payload: { name, color: '#fff', ord: opts.ord ?? id, app: opts.app ?? 'reminders', ...(opts.rideAlong ? { rideAlong: true } : {}) },
});
const section = (id: string, folderId: string, name = id, ord = id): Rec<'section'> => ({
  id, type: 'section', updated: 0, payload: { name, folderId, ord },
});
const reminder = (id: string, folderId: string, sectionId: string, indent: 0 | 1 = 0, ord = id): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: id, due: null, time: null, done: false, repeat: null, folderId, sectionId, indent, ord },
});

const base = (): AnyRec[] => [
  folder('fa', 'A', { ord: 'A' }), section('sa', 'fa'),
  folder('cal', 'Calendar', { rideAlong: true, ord: 'B' }), section('sc', 'cal'),
  folder('nf', 'General', { app: 'notes', ord: 'C' }), section('ns', 'nf'),
  // TWO calendars and TWO habit sections deliberately. With one of each, the
  // 'no such calendar' / 'no such section' guards were MASKED by the guard on
  // the next line — 'the last calendar stays' fired instead, so neutering the
  // first changed nothing observable and the mutation survived. A fixture that
  // hides the thing under test is its own kind of check that cannot fail.
  { id: 'c1', type: 'calendar', updated: 0, payload: { name: 'Personal', color: '#fff', ord: 'A' } },
  { id: 'c2', type: 'calendar', updated: 0, payload: { name: 'Work', color: '#fff', ord: 'B' } },
  { id: 'hs', type: 'habitsection', updated: 0, payload: { name: 'Habits', color: '#fff', ord: 'A' } },
  { id: 'hs2', type: 'habitsection', updated: 0, payload: { name: 'Evening', color: '#fff', ord: 'B' } },
  { id: 'h1', type: 'habit', updated: 0, payload: { name: 'Walk', sectionId: 'hs', ord: 'A', frequency: 'always' } },
  { id: 'n1', type: 'note', updated: 0, payload: { title: 'N', body: '', date: null, folderId: 'nf', sectionId: 'ns', ord: 'A' } },
  { id: 'e1', type: 'event', updated: 0, payload: { text: 'E', date: '2026-08-11', time: null, repeat: null, calendarId: 'c1', ord: 'A' } },
  reminder('r1', 'fa', 'sa'),
];

const err = (r: ManageResult) => ('error' in r ? r.error : null);

describe('the rules nothing was watching', () => {
  it('a section needs a name — the twin of the folder rule, which WAS pinned', () => {
    expect(err(renameSection(base(), 'sa', '   '))).toBe('a section needs a name');
    expect(err(renameSection(base(), 'sa', ''))).toBe('a section needs a name');
    // …and a real name still goes through, or "always refuses" would pass too.
    expect(err(renameSection(base(), 'sa', 'Errands'))).toBeNull();
  });

  it('an app keeps at least one folder, through deleteFolder itself', () => {
    // Notes has exactly one folder and it is not rideAlong: the clean case.
    expect(err(deleteFolder(base(), 'nf'))).toBe('an app keeps at least one folder');
    // Add a second and the delete is allowed, so this is not simply "never".
    const two = [...base(), folder('nb', 'B', { app: 'notes', ord: 'D' }), section('nsb', 'nb')];
    expect(err(deleteFolder(two, 'nb'))).toBeNull();
  });

  it('…and the rideAlong Calendar folder COUNTS as one of them', () => {
    // Written the other way round first, on the assumption that the permanent
    // folder does not count as the app's spare. It does: foldersOf() filters
    // by app and the Calendar folder is a reminders folder. So deleting the
    // last ORDINARY reminders folder is allowed and everything lands in
    // Calendar — coherent, surprising enough to pin, and not something to
    // change on a guess. normalize() will not seed a replacement either: it
    // only acts when an app has NO folder at all.
    expect(err(deleteFolder(base(), 'fa'))).toBeNull();
    const onlyCal = base().filter((r) => r.id !== 'fa' && r.id !== 'sa');
    expect(err(deleteFolder(onlyCal, 'cal'))).toBe('the Calendar folder is permanent');
  });

  it('a block cannot land inside itself', () => {
    const recs = [...base(), reminder('p', 'fa', 'sa', 0, 'B'), reminder('k', 'fa', 'sa', 1, 'C')];
    // 'k' is 'p''s subtask, so it travels WITH p — dropping p before k is
    // dropping it inside its own family.
    expect(err(moveReminderBlock(recs, 'p', 'sa', 'k'))).toBe('a block cannot land inside itself');
    // Landing before an unrelated row is fine.
    expect(err(moveReminderBlock(recs, 'p', 'sa', 'r1'))).toBeNull();
  });

  it('renaming a calendar to the name it already has is refused as unchanged', () => {
    expect(err(renameCalendar(base(), 'c1', 'Personal'))).toBe('unchanged');
    expect(err(renameCalendar(base(), 'c1', 'Errands'))).toBeNull();
  });

  it('a folder is not a duplicable item', () => {
    expect(err(duplicateItem(base(), 'fa', () => 'x'))).toBe('not duplicable');
    expect(err(duplicateItem(base(), 'r1', () => 'x'))).toBeNull();
  });
});

describe('a stale id is an error, never a crash', () => {
  // One table for the twenty-seven bad-id guards. Reachable rather than
  // theoretical: a row deleted on the phone while the web is mid-drag over it
  // arrives here as an id that no longer resolves.
  const calls: [string, () => ManageResult][] = [
    ['renameFolder', () => renameFolder(base(), 'gone', 'X')],
    ['renameSection', () => renameSection(base(), 'gone', 'X')],
    ['deleteSection', () => deleteSection(base(), 'gone')],
    ['deleteFolder', () => deleteFolder(base(), 'gone')],
    ['renameCalendar', () => renameCalendar(base(), 'gone', 'X')],
    ['deleteCalendar', () => deleteCalendar(base(), 'gone')],
    ['deleteHabitSection', () => deleteHabitSection(base(), 'gone')],
    ['moveReminderBlock/row', () => moveReminderBlock(base(), 'gone', 'sa', null)],
    ['moveReminderBlock/dest', () => moveReminderBlock(base(), 'r1', 'gone', null)],
    ['moveReminderBlock/before', () => moveReminderBlock(base(), 'r1', 'sa', 'gone')],
    ['moveNote/row', () => moveNote(base(), 'gone', 'ns', null)],
    ['moveNote/dest', () => moveNote(base(), 'n1', 'gone', null)],
    ['moveNote/before', () => moveNote(base(), 'n1', 'ns', 'gone')],
    ['moveHabit/row', () => moveHabit(base(), 'gone', 'hs', null)],
    ['moveHabit/dest', () => moveHabit(base(), 'h1', 'gone', null)],
    ['moveHabit/before', () => moveHabit(base(), 'h1', 'hs', 'gone')],
    ['moveHabitSection/row', () => moveHabitSection(base(), 'gone', null)],
    ['moveHabitSection/before', () => moveHabitSection(base(), 'hs', 'gone')],
    ['moveSection/row', () => moveSection(base(), 'gone', 'fa', null)],
    ['moveSection/dest', () => moveSection(base(), 'sa', 'gone', null)],
    ['moveSection/before', () => moveSection(base(), 'sa', 'fa', 'gone')],
    ['moveSectionEmptyingFolder/row', () => moveSectionEmptyingFolder(base(), 'gone', 'fa', null)],
    ['moveSectionEmptyingFolder/dest', () => moveSectionEmptyingFolder(base(), 'sa', 'gone', null)],
    ['duplicateItem', () => duplicateItem(base(), 'gone', () => 'x')],
    ['convertToNote/source', () => convertToNote(base(), 'gone', 'ns', 'new')],
    ['convertToNote/dest', () => convertToNote(base(), 'r1', 'gone', 'new')],
    ['convertReminderToEvent/source', () => convertReminderToEvent(base(), 'gone', 'c1', '2026-08-11', 'new')],
    ['convertReminderToEvent/cal', () => convertReminderToEvent(base(), 'r1', 'gone', '2026-08-11', 'new')],
    ['convertEventToReminder/source', () => convertEventToReminder(base(), 'gone', 'sa', 'new')],
    ['convertEventToReminder/dest', () => convertEventToReminder(base(), 'e1', 'gone', 'new')],
  ];

  for (const [name, call] of calls) {
    it(name, () => {
      let res: ManageResult;
      expect(() => { res = call(); }, `${name} threw instead of returning an error`).not.toThrow();
      expect(err(res!), `${name} answered with a put instead of an error`).not.toBeNull();
    });
  }
});
