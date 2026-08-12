/**
 * Two rows carrying the SAME order key, which is not exotic.
 *
 * `ordBetween(null, null)` is deterministic and always answers 'V', so two
 * devices that each add the FIRST row to a section while offline both write
 * 'V'. After a sync that section holds two rows with one key between them —
 * and Sean runs a phone, a watch and the web against one account.
 *
 * Dragging anything to land between them then asked for a key between 'V' and
 * 'V'. There is no such key, so ordBetween threw, in the middle of a gesture,
 * with nothing anywhere catching it.
 */
import { describe, it, expect } from 'vitest';
import {
  ordBetween, ordGap, moveReminderBlock, moveNote, duplicateItem, byRecOrd, SyncEngine,
  type AnyRec, type Rec,
} from '../src/index';

const sec: Rec<'section'> = { id: 's1', type: 'section', updated: 1, payload: { name: 'General', folderId: 'f1', ord: 'V' } };
const rem = (id: string, ord: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 1,
  payload: { text: id, due: null, time: null, done: false, repeat: null, folderId: 'f1', sectionId: 's1', indent: 0, ord },
});
const note = (id: string, ord: string): Rec<'note'> => ({
  id, type: 'note', updated: 1,
  payload: { title: id, body: '', date: null, folderId: 'f1', sectionId: 's1', ord },
});

describe('a duplicate order key does not break the drag', () => {
  it('is what two offline devices actually produce', () => {
    // The collision is in the generator, not in some corrupted record.
    expect(ordBetween(null, null)).toBe(ordBetween(null, null));
  });

  it('moveReminderBlock lands the row instead of throwing', () => {
    const recs: AnyRec[] = [sec, rem('a', 'V'), rem('b', 'V'), rem('c', 'z')];
    const res = moveReminderBlock(recs, 'c', 's1', 'b');
    expect('error' in res, JSON.stringify(res)).toBe(false);
    if ('error' in res) return;
    const moved = res.put[0] as Rec<'reminder'>;
    // After the run of equal keys — there is no order between them to respect.
    expect(moved.payload.ord > 'V').toBe(true);
  });

  it('moveNote lands the row instead of throwing', () => {
    const recs: AnyRec[] = [sec, note('n1', 'z'), note('n2', 'V'), note('n3', 'V')];
    const res = moveNote(recs, 'n1', 's1', 'n3');
    expect('error' in res, JSON.stringify(res)).toBe(false);
  });

  it('duplicateItem copies a row whose neighbour shares its key', () => {
    const recs: AnyRec[] = [sec, rem('a', 'V'), rem('b', 'V')];
    const res = duplicateItem(recs, 'a', () => 'copy');
    expect('error' in res, JSON.stringify(res)).toBe(false);
  });

  it('and with NO duplicates the bounds are exactly the neighbours they were', () => {
    // The half that keeps the widening from quietly changing where every row
    // lands. Without it, "it no longer throws" would pass for a version that
    // always appended to the end.
    const keys = ['1', '3', '5', '7'];
    expect(ordGap(keys, 0)).toEqual([null, '1']);
    expect(ordGap(keys, 2)).toEqual(['3', '5']);
    expect(ordGap(keys, 4)).toEqual(['7', null]);
    const recs: AnyRec[] = [sec, rem('a', '1'), rem('b', '3'), rem('c', '5')];
    const res = moveReminderBlock(recs, 'c', 's1', 'b');
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const moved = res.put[0] as Rec<'reminder'>;
    expect(moved.payload.ord > '1' && moved.payload.ord < '3', `${moved.payload.ord} between 1 and 3`).toBe(true);
  });

  it('ordGap covers the shape the SCREENS use too, not just manage', () => {
    // ordForMove (rowdrag.ts) and the subtask insert in Reminders both take
    // BOTH bounds from real rows, so both had the identical exposure and both
    // were missed when manage.ts's ten sites were fixed. The arithmetic they
    // do is this; pinning it here is what makes the two call sites safe.
    //
    // ordForMove: the row is pulled OUT first, so `to` indexes the remainder.
    const rest = ['V', 'V', 'z'];
    expect(() => ordBetween(...ordGap(rest, 1))).not.toThrow();
    expect(() => ordBetween(...ordGap(rest, 2))).not.toThrow();
    expect(() => ordBetween(...ordGap(rest, 3))).not.toThrow();
    // The subtask: parent at `at`, the row after it at `at + 1`.
    expect(() => ordBetween(...ordGap(['V', 'V'], 1))).not.toThrow();
  });

  it('a whole run of equal keys is stepped over, not just one', () => {
    expect(ordGap(['V', 'V', 'V', 'z'], 1)).toEqual(['V', 'z']);
    expect(ordGap(['V', 'V', 'V'], 1)).toEqual(['V', null]);
  });

  it('two devices holding the same records draw them in the SAME order', () => {
    // The divergence this fixes, reproduced exactly: device A made 'a' and
    // then received its twin; device B saw them the other way about. byOrd
    // answers 0 for the pair and Array.sort is stable, so each device fell
    // back to its own arrival order and the two drew one account differently,
    // for good, with nothing on screen to explain it.
    const A = new SyncEngine(); A.put(rem('a', 'V')); A.put(rem('b', 'V'));
    const B = new SyncEngine(); B.put(rem('b', 'V')); B.put(rem('a', 'V'));
    const list = (e: SyncEngine) => (e.all() as AnyRec[])
      .filter((r): r is Rec<'reminder'> => r.type === 'reminder')
      .sort(byRecOrd)
      .map((r) => r.id);
    expect(list(A)).toEqual(list(B));
    expect(list(A)).toEqual(['a', 'b']);
  });

  it('the block keeps its family order through the degenerate gap', () => {
    const parent = rem('p', 'V');
    const child: Rec<'reminder'> = { ...rem('k', 'V2'), payload: { ...rem('k', 'V2').payload, indent: 1 as const } };
    const recs: AnyRec[] = [sec, parent, child, rem('x', 'V'), rem('y', 'z')];
    const res = moveReminderBlock(recs, 'p', 's1', 'y');
    expect('error' in res, JSON.stringify(res)).toBe(false);
    if ('error' in res) return;
    const ords = res.put.map((r) => (r as Rec<'reminder'>).payload.ord);
    expect([...ords].sort(), 'parent before child, still').toEqual(ords);
  });
});
