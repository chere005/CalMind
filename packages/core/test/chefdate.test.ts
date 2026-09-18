import { describe, expect, it } from 'vitest';
import { chefDateOf, chefDatedDays, chefDates, chefDatesOn, pruneChefDates, setChefDate } from '../src/chefdate';
import { prefsId } from '../src/types';
import type { AnyRec, Rec } from '../src/types';

const note = (id: string, title: string, deleted = false): Rec<'note'> =>
  ({ id, type: 'note', updated: 0, payload: { title, body: '', sectionId: 's1', ord: 'a', date: null }, ...(deleted ? { deleted: true } : {}) }) as Rec<'note'>;

/** The recipes as ChefMind's read model hands them over. */
const CHEF: AnyRec[] = [note('r1', 'Sheet-pan chicken'), note('r2', 'Red lentil dal'), note('r3', 'Risotto')];

/** A CalMind store carrying whatever the given pref record says. */
const store = (pref?: AnyRec): AnyRec[] => (pref ? [pref] : []);

describe('dates CalMind keeps about ChefMind recipes', () => {
  it('starts with nothing planned', () => {
    expect(chefDates([])).toEqual({});
    expect(chefDateOf([], 'r1')).toBe(null);
    expect(chefDatesOn([], CHEF, '2026-09-17')).toEqual([]);
  });

  it('plans a recipe for a day and reads it back', () => {
    const recs = store(setChefDate([], 'r1', '2026-09-17'));
    expect(chefDateOf(recs, 'r1')).toBe('2026-09-17');
    expect(chefDatesOn(recs, CHEF, '2026-09-17').map((n) => n.id)).toEqual(['r1']);
  });

  /**
   * THE WHOLE POINT: the day is written into CalMind's own notes prefs and
   * NOWHERE near the recipe. Sean, 2026-09-16 — "only known to CalMind".
   */
  it('writes only a CalMind pref record, never the recipe', () => {
    const put = setChefDate([], 'r1', '2026-09-17');
    expect(put.type).toBe('pref');
    expect(put.id).toBe(prefsId('notes'));
    // The recipe is untouched — the caller was handed one record and it is
    // not a note.
    expect(CHEF.find((r) => r.id === 'r1')).toEqual(note('r1', 'Sheet-pan chicken'));
  });

  it('moves a plan rather than stacking two', () => {
    let recs = store(setChefDate([], 'r1', '2026-09-17'));
    recs = store(setChefDate(recs, 'r1', '2026-09-19'));
    expect(chefDatesOn(recs, CHEF, '2026-09-17')).toEqual([]);
    expect(chefDatesOn(recs, CHEF, '2026-09-19').map((n) => n.id)).toEqual(['r1']);
  });

  /**
   * Clearing DELETES the key. Prefs are whole-record last-writer-wins, so a
   * map that only ever grew would carry every recipe anyone had ever dated to
   * every device, forever.
   */
  it('clearing a date removes the key, it does not blank it', () => {
    let recs = store(setChefDate([], 'r1', '2026-09-17'));
    recs = store(setChefDate(recs, 'r1', null));
    expect(chefDates(recs)).toEqual({});
    expect(chefDateOf(recs, 'r1')).toBe(null);
  });

  it('keeps other plans when one is cleared', () => {
    let recs = store(setChefDate([], 'r1', '2026-09-17'));
    recs = store(setChefDate(recs, 'r2', '2026-09-18'));
    recs = store(setChefDate(recs, 'r1', null));
    expect(chefDates(recs)).toEqual({ r2: '2026-09-18' });
  });

  it("lists several recipes on one day in ChefMind's order", () => {
    let recs = store(setChefDate([], 'r2', '2026-09-17'));
    recs = store(setChefDate(recs, 'r1', '2026-09-17'));
    // r1 before r2 because that is how ChefMind lists them — the plan does
    // not get to reorder somebody else's list.
    expect(chefDatesOn(recs, CHEF, '2026-09-17').map((n) => n.id)).toEqual(['r1', 'r2']);
  });

  /**
   * A recipe deleted in ChefMind leaves a key behind, because CalMind is not
   * told. It must read as "nothing planned", never as a blank row.
   */
  it('a plan for a recipe that no longer exists draws nothing', () => {
    const recs = store(setChefDate([], 'gone', '2026-09-17'));
    expect(chefDatesOn(recs, CHEF, '2026-09-17')).toEqual([]);
    expect(chefDatedDays(recs, CHEF).has('2026-09-17')).toBe(false);
  });

  it('a recipe tombstoned in ChefMind drops out the same way', () => {
    const chef = [note('r1', 'Sheet-pan chicken', true)];
    const recs = store(setChefDate([], 'r1', '2026-09-17'));
    expect(chefDatesOn(recs, chef, '2026-09-17')).toEqual([]);
  });

  it('names every day that has a live plan on it', () => {
    let recs = store(setChefDate([], 'r1', '2026-09-17'));
    recs = store(setChefDate(recs, 'r2', '2026-09-17'));
    recs = store(setChefDate(recs, 'r3', '2026-09-20'));
    recs = store(setChefDate(recs, 'gone', '2026-09-25'));
    expect([...chefDatedDays(recs, CHEF)].sort()).toEqual(['2026-09-17', '2026-09-20']);
  });

  it('prunes dangling keys, and says so by returning null when there are none', () => {
    let recs = store(setChefDate([], 'r1', '2026-09-17'));
    expect(pruneChefDates(recs, CHEF)).toBe(null);
    recs = store(setChefDate(recs, 'gone', '2026-09-18'));
    const pruned = pruneChefDates(recs, CHEF);
    expect(pruned).not.toBe(null);
    expect(chefDates(store(pruned!))).toEqual({ r1: '2026-09-17' });
  });
});
