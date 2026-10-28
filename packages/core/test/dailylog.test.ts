import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noteType, setNoteType, addDailyLogCard, updateDailyLogCard, removeDailyLogCard, noteBodyText, searchRecords, SyncEngine, type Note } from '../src/index';
const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../../spec/dailylog.json', import.meta.url)), 'utf8'));
const base = spec.base as Note;

describe('spec/dailylog.json — one note with dated food, exercise and mood cards', () => {
  for (const vector of spec.types) it(vector.name, () => expect(noteType(vector.note)).toBe(vector.expect));
  it('selecting Daily log creates its first card and preserves existing text', () => {
    const note = setNoteType(base, 'daily-log', spec.firstCard.id, spec.today);
    expect(note.body).toBe(base.body);
    expect(note.logCards).toEqual([spec.firstCard]);
    expect(base.logCards).toBeUndefined();
  });
  it('another card on the same day keeps both cards and duplicate ids cannot erase one', () => {
    const first = setNoteType(base, 'daily-log', 'day-1', spec.today);
    const next = addDailyLogCard(first, 'day-2', spec.today);
    expect(next.logCards?.map((c) => c.id)).toEqual(['day-2', 'day-1']);
    expect(next.logCards?.every((c) => c.date === spec.today)).toBe(true);
    expect(addDailyLogCard(next, 'day-1', spec.today)).toBe(next);
  });
  it('editing and removing one card never changes another card', () => {
    const note = addDailyLogCard(addDailyLogCard(base, 'day-1', spec.today), 'day-2', spec.today);
    const edited = updateDailyLogCard(note, 'day-1', { food: 'Soup', exercise: 'Walk', mood: 'Calm' });
    expect(edited.logCards?.[1]).toMatchObject({ food: 'Soup', exercise: 'Walk', mood: 'Calm' });
    expect(note.logCards?.[1]?.food).toBe('');
    expect(removeDailyLogCard(edited, 'day-2').logCards).toEqual([edited.logCards?.[1]]);
  });
  it('switching back to Note and then Daily log retains the cards without adding one', () => {
    const log = setNoteType(base, 'daily-log', 'day-1', spec.today);
    const plain = setNoteType(log, 'note', 'unused', spec.today);
    expect(noteType(plain)).toBe('note');
    expect(plain.body).toBe(base.body);
    expect(setNoteType(plain, 'daily-log', 'unused', spec.today).logCards).toEqual(log.logCards);
  });
  it('card contents survive snapshots and remain searchable and copyable', async () => {
    const payload = updateDailyLogCard(setNoteType(base, 'daily-log', 'day-1', spec.today), 'day-1', { food: 'Soup', exercise: 'Walk', mood: 'Calm' });
    const engine = new SyncEngine();
    engine.put({ id: 'journal', type: 'note', updated: 1, payload }, 1);
    const restored = SyncEngine.fromSnapshot(JSON.parse(JSON.stringify(engine.toSnapshot())));
    const record = restored.get('journal')!;
    expect(record.payload).toEqual(payload);
    expect(searchRecords(restored.all(), 'Calm').map((r) => r.id)).toEqual(['journal']);
    expect(noteBodyText(payload)).toContain('### Exercise\nWalk');
    expect(noteBodyText(payload)).toContain('### Food\nSoup');
    expect(noteBodyText(payload)).toContain('### Mood\nCalm');
    let sent: unknown;
    await restored.sync(async (request) => { sent = request.changes[0]?.payload; return { cursor: 1, changes: [] }; });
    expect(sent).toEqual(payload);
  });
});
