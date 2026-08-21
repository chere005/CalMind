/**
 * normalize() must SETTLE. Nothing was checking that it does.
 *
 * store.tsx calls it on every refresh and puts everything it hands back:
 *
 *     const { added, edited } = normalize(engine.all());
 *     for (const r of [...added, ...edited]) engine.put(r);
 *
 * `put` marks a record dirty, a dirty record is pushed on the next sync, and
 * a sync ends in another refresh. So a repair that does not settle is not a
 * cosmetic wobble — it is a write on every refresh, for ever, on every
 * device, and it looks like nothing at all from the outside except a store
 * that is never quite in sync and a battery that goes flat.
 *
 * This does not fix anything: normalize settles today, on all seven damage
 * cases below and on random stores. It is here because the property is the
 * kind that holds until someone adds one more repair, and because the failure
 * has no symptom anyone would report.
 *
 * The damage cases are the repairs normalize actually performs, taken from
 * its own source rather than imagined: a row pointing at a container that is
 * gone, a container pointing at a folder that is gone, an app with no folder,
 * a folder with no section, a live row inside a DELETED section, and two
 * containers sharing one ord key. The seeding path is included too — an empty
 * store is the case every new account starts from.
 */
import { describe, it, expect } from 'vitest';
import { normalize, type AnyRec } from '../src/index';

/** One normalize pass, applied. Returns the new store and how much it wrote. */
function pass(recs: AnyRec[]): { next: AnyRec[]; wrote: number } {
  const { added, edited } = normalize(recs);
  const byId = new Map(recs.map((r) => [r.id, r]));
  for (const r of [...added, ...edited]) byId.set(r.id, r);
  return { next: [...byId.values()], wrote: added.length + edited.length };
}

/** Normalise until it stops writing, or give up and say how far it got. */
function settle(recs: AnyRec[], limit = 6): { passes: number; store: AnyRec[]; wrote: number[] } {
  const wrote: number[] = [];
  let store = recs;
  for (let i = 0; i < limit; i++) {
    const r = pass(store);
    wrote.push(r.wrote);
    store = r.next;
    if (r.wrote === 0) return { passes: i, store, wrote };
  }
  return { passes: limit, store, wrote };
}

const folder = (id: string, app: 'reminders' | 'notes' = 'reminders', ord = id): AnyRec =>
  ({ id, type: 'folder', updated: 1, payload: { name: id, color: '#fff', ord, app } }) as AnyRec;
const section = (id: string, folderId: string): AnyRec =>
  ({ id, type: 'section', updated: 1, payload: { name: id, folderId, ord: id } }) as AnyRec;
const reminder = (id: string, folderId: string, sectionId: string): AnyRec =>
  ({
    id, type: 'reminder', updated: 1,
    payload: { text: id, due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: id },
  }) as AnyRec;

const damaged: [string, AnyRec[]][] = [
  ['an empty store — what every new account starts from', []],
  ['a reminder in a section that is gone', [folder('f'), section('s', 'f'), reminder('r', 'f', 'GONE')]],
  ['a reminder in a folder that is gone', [folder('f'), section('s', 'f'), reminder('r', 'GONE', 's')]],
  ['a section in a folder that is gone', [folder('f'), section('s', 'f'), section('orphan', 'GONE')]],
  ['a folder with no section', [folder('f')]],
  ['a live reminder inside a DELETED section', [
    folder('f'), section('s', 'f'),
    { ...(section('dead', 'f') as { id: string }), deleted: true } as AnyRec,
    reminder('r', 'f', 'dead'),
  ]],
  ['two folders sharing one ord key', [folder('a'), section('sa', 'a'), folder('b', 'reminders', 'a'), section('sb', 'b')]],
  ['notes has a folder and reminders has none', [folder('nf', 'notes'), section('ns', 'nf')]],
];

describe('normalize settles', () => {
  for (const [name, recs] of damaged) {
    it(name, () => {
      const { passes, wrote } = settle(recs);
      // One pass to repair, and the next must write NOTHING. `passes` is the
      // index of the first silent pass, so 0 means it was already clean and 1
      // means it repaired once and then stopped — both fine. More than that
      // is a repair chasing its own tail.
      expect(passes, `still writing after ${wrote.length} passes: ${wrote.join(', ')}`).toBeLessThanOrEqual(1);
    });
  }

  it('settles on random damage, 400 stores', () => {
    // Deterministic, so a failure can be reproduced from the seed alone.
    let seed = 20260812;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;

    for (let n = 0; n < 400; n++) {
      const recs: AnyRec[] = [];
      const fids: string[] = [];
      const sids: string[] = [];
      for (let i = 0; i < Math.floor(rnd() * 4); i++) {
        const id = `f${i}`;
        fids.push(id);
        recs.push(folder(id, rnd() < 0.3 ? 'notes' : 'reminders', rnd() < 0.25 ? 'DUP' : id));
      }
      for (let i = 0; i < Math.floor(rnd() * 5); i++) {
        const id = `s${i}`;
        sids.push(id);
        // Deliberately sometimes pointing at a folder that was never made.
        recs.push(section(id, rnd() < 0.3 ? 'GONE' : (fids.length ? pick(fids) : 'GONE')));
      }
      for (let i = 0; i < Math.floor(rnd() * 6); i++) {
        recs.push(reminder(
          `r${i}`,
          rnd() < 0.3 ? 'GONE' : (fids.length ? pick(fids) : 'GONE'),
          rnd() < 0.3 ? 'GONE' : (sids.length ? pick(sids) : 'GONE'),
        ));
      }
      // …and sometimes a tombstone over something still referenced.
      if (recs.length && rnd() < 0.3) {
        const at = Math.floor(rnd() * recs.length);
        recs[at] = { ...recs[at]!, deleted: true };
      }

      const { passes, wrote } = settle(recs);
      expect(passes, `store ${n} kept writing: ${wrote.join(', ')}\n${JSON.stringify(recs)}`).toBeLessThanOrEqual(1);
    }
  });

  it('survives every container for an app being DELETED, rather than throwing', () => {
    // normalize claims `appFolders(app)[0]!.id` and `secsOf(folderId)[0]!.id`
    // when it re-homes a stranded row. Both are true only because seeding
    // runs FIRST — put the re-home ahead of it and these become a TypeError
    // inside refresh(), which escapes syncNow (its try/catch covers the
    // network, not this) and takes the render with it.
    //
    // Tombstones are the way to reach it: a folder can be deleted on the
    // phone while the web still holds rows inside it, which is an ordinary
    // Tuesday on three devices, not a corrupt store.
    const del = (r: AnyRec): AnyRec => ({ ...r, deleted: true });
    const note = (id: string, folderId: string, sectionId: string): AnyRec =>
      ({ id, type: 'note', updated: 1, payload: { title: id, body: '', date: null, folderId, sectionId, ord: id } }) as AnyRec;

    const cases: [string, AnyRec[]][] = [
      ['every reminders folder deleted', [del(folder('a')), section('sa', 'a'), reminder('r', 'a', 'sa')]],
      ['the folder lives, its every section deleted', [folder('a'), del(section('sa', 'a')), reminder('r', 'a', 'sa')]],
      ['both deleted', [del(folder('a')), del(section('sa', 'a')), reminder('r', 'a', 'sa')]],
      ['the notes side, same shape', [del(folder('n', 'notes')), del(section('sn', 'n')), note('nt', 'n', 'sn')]],
    ];
    for (const [name, recs] of cases) {
      expect(() => normalize(recs), name).not.toThrow();
      // …and it still settles afterwards, which is the property above holding
      // on the paths that only a tombstone reaches.
      const { passes } = settle(recs);
      expect(passes, `${name}: repaired but would not settle`).toBeLessThanOrEqual(1);
    }
  });

  it('and a settled store is left completely alone', () => {
    // The strong form: not "few writes" but none, and the same records out as
    // in. A normalize that rewrote one field harmlessly on every pass would
    // satisfy every test above via `edited` being cheap; it would still push
    // a record to the server on every refresh.
    const { store } = settle([]);
    const { added, edited } = normalize(store);
    expect(added, 'a settled store adds nothing').toEqual([]);
    expect(edited, 'and edits nothing').toEqual([]);
  });
});
