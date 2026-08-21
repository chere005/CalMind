import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync';
import type { AnyRec, Rec, SyncRequest, SyncResponse } from '../src/index';

/**
 * Two TABS of one browser share a single snapshot key, and each holds its own
 * engine. mergeSnapshot is what a tab does when the `storage` event says the
 * other one wrote: fold their snapshot in by sync's own rules, so that
 * OFFLINE, neither tab's work dies with whichever snapshot was written last.
 * (e2e/twotab.spec.ts held the loss pinned as a fixme since 2026-08-11.)
 */

const reminder = (id: string, text: string, updated = 0): Rec<'reminder'> => ({
  id,
  type: 'reminder',
  updated,
  payload: { text, due: null, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'V' },
});

const text = (r: AnyRec | undefined): string => (r as Rec<'reminder'> | undefined)?.payload.text ?? '';

/** The same tiny server sync.test.ts drives — LWW + per-user seq. */
function fakeServer() {
  const recs = new Map<string, AnyRec & { seq: number }>();
  let seq = 0;
  return async (req: SyncRequest): Promise<SyncResponse> => {
    for (const c of req.changes) {
      const cur = recs.get(c.id);
      if (!cur || c.updated > cur.updated) recs.set(c.id, { ...c, seq: ++seq });
    }
    const changes = [...recs.values()].filter((r) => r.seq > req.cursor).map(({ seq: _s, ...r }) => r as AnyRec);
    return { cursor: seq, changes };
  };
}

describe('mergeSnapshot — two offline tabs', () => {
  it('the twotab case: disjoint offline adds both survive the merge', () => {
    // One account, one stored snapshot, two engines hydrated from it.
    const a = SyncEngine.fromSnapshot(null);
    const b = SyncEngine.fromSnapshot(null);
    a.put(reminder('ra', 'written in tab A'), 1000);
    b.put(reminder('rb', 'written in tab B'), 1001);
    // Tab B persisted last; tab A merges what B wrote.
    expect(a.mergeSnapshot(b.toSnapshot())).toBe(true);
    expect(a.all().map((r) => r.id).sort()).toEqual(['ra', 'rb']);
    // And what A now persists is the union — the reload reads THIS.
    const survived = SyncEngine.fromSnapshot(a.toSnapshot());
    expect(survived.all().length).toBe(2);
  });

  it('a strictly newer copy wins, an older one never clobbers', () => {
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('r1', 'mine, newer'), 2000);
    b.put(reminder('r1', 'theirs, older'), 1000);
    expect(a.mergeSnapshot(b.toSnapshot())).toBe(false);
    expect(text(a.get('r1'))).toBe('mine, newer');
    b.mergeSnapshot(a.toSnapshot());
    expect(text(b.get('r1'))).toBe('mine, newer');
  });

  it('an equal stamp keeps ours — the tie is the server’s to break, not a tab’s', () => {
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('r1', 'A at the same instant'), 1000);
    b.put(reminder('r1', 'B at the same instant'), 1000);
    a.mergeSnapshot(b.toSnapshot());
    expect(text(a.get('r1'))).toBe('A at the same instant');
  });

  it('an adopted dirty record is pushed by the adopting tab', async () => {
    // Tab B wrote offline and CLOSED. Tab A merged B's snapshot; A is now the
    // record's only way to the server.
    const server = fakeServer();
    const a = new SyncEngine();
    const b = new SyncEngine();
    b.put(reminder('rb', 'only B ever had this'), 1000);
    a.mergeSnapshot(b.toSnapshot());
    expect(a.hasPending()).toBe(true);
    await a.sync(server);
    // A fresh device pulls it from the server: the record made it.
    const c = new SyncEngine();
    await c.sync(server);
    expect(text(c.get('rb'))).toBe('only B ever had this');
  });

  it('a server-borne record from the further tab arrives clean, not dirty', async () => {
    const server = fakeServer();
    const b = new SyncEngine();
    b.put(reminder('r1', 'synced through B'), 1000);
    await b.sync(server);
    expect(b.hasPending()).toBe(false);
    const a = new SyncEngine();
    a.mergeSnapshot(b.toSnapshot());
    expect(text(a.get('r1'))).toBe('synced through B');
    expect(a.hasPending(), 'nothing to push — the server already has it').toBe(false);
    // And the cursor came along, so A does not re-download what B consumed.
    expect(a.toSnapshot().cursor).toBe(b.toSnapshot().cursor);
  });

  it('merging identical snapshots reports no change — the storage ping-pong terminates', () => {
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('ra', 'from A'), 1000);
    b.put(reminder('rb', 'from B'), 1001);
    expect(a.mergeSnapshot(b.toSnapshot())).toBe(true); // A persists the union
    expect(b.mergeSnapshot(a.toSnapshot())).toBe(true); // B folds A's half in, persists
    expect(a.mergeSnapshot(b.toSnapshot()), 'third bounce: nothing new').toBe(false);
  });

  it('a tombstone travels between tabs like any other write', () => {
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('r1', 'doomed'), 1000);
    b.mergeSnapshot(a.toSnapshot());
    b.del('r1', 2000);
    a.mergeSnapshot(b.toSnapshot());
    expect(a.get('r1')).toBeUndefined();
    expect(a.hasPending(), 'the tombstone is dirty here too, in case B closes').toBe(true);
  });
});
