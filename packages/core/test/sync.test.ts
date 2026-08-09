import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync';
import type { AnyRec, Rec, SyncRequest, SyncResponse } from '../src/index';

const reminder = (id: string, text: string, updated = 0): Rec<'reminder'> => ({
  id,
  type: 'reminder',
  updated,
  payload: { text, due: null, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'V' },
});

/** A tiny in-memory server speaking the real protocol — LWW + per-user seq. */
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

describe('the sync engine', () => {
  it('pushes local edits and clears them once acked', async () => {
    const server = fakeServer();
    const a = new SyncEngine();
    a.put(reminder('r1', 'buy milk'), 1000);
    expect(a.hasPending()).toBe(true);
    await a.sync(server);
    expect(a.hasPending()).toBe(false);
    expect(a.all().length).toBe(1);
  });

  it('two devices converge, later write winning', async () => {
    const server = fakeServer();
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('r1', 'from a'), 1000);
    await a.sync(server);
    await b.sync(server); // b learns of r1
    b.put({ ...b.get('r1')!, payload: { ...(b.get('r1') as Rec<'reminder'>).payload, text: 'from b, later' } }, 2000);
    await b.sync(server);
    await a.sync(server);
    expect((a.get('r1') as Rec<'reminder'>).payload.text).toBe('from b, later');
  });

  it('a tombstone deletes everywhere', async () => {
    const server = fakeServer();
    const a = new SyncEngine();
    const b = new SyncEngine();
    a.put(reminder('r1', 'doomed'), 1000);
    await a.sync(server);
    await b.sync(server);
    a.del('r1', 2000);
    await a.sync(server);
    await b.sync(server);
    expect(b.get('r1')).toBeUndefined();
    expect(b.all().length).toBe(0);
  });

  it('an echo of my own push is a no-op, not a flicker', async () => {
    const server = fakeServer();
    const a = new SyncEngine();
    const mine = a.put(reminder('r1', 'mine'), 1000);
    await a.sync(server);
    expect(a.get('r1')!.updated).toBe(mine.updated);
  });

  it('an edit made mid-flight stays dirty for the next round', async () => {
    const server = fakeServer();
    const a = new SyncEngine();
    a.put(reminder('r1', 'v1'), 1000);
    // Race: the transport is in flight while the user keeps typing.
    const slow = async (req: SyncRequest) => {
      const res = await server(req);
      a.put({ ...a.get('r1')!, payload: { ...(a.get('r1') as Rec<'reminder'>).payload, text: 'v2' } }, 2000);
      return res;
    };
    await a.sync(slow);
    expect(a.hasPending()).toBe(true); // v2 still owed to the server
  });

  it('a transport that fails keeps the work owed', async () => {
    // The commonest event in the life of a sync engine, and nothing was
    // watching it: a phone in a tunnel. The error must reach the caller so
    // the UI can say so, and the record must stay dirty — swallowing either
    // one turns a lost connection into a lost note.
    const a = new SyncEngine();
    a.put(reminder('r1', 'written underground'), 1000);
    await expect(a.sync(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(a.hasPending(), 'still owed to the server').toBe(true);
    expect(a.toSnapshot().dirty).toEqual(['r1']);
    expect((a.get('r1') as Rec<'reminder'>).payload.text).toBe('written underground');
  });

  it('an EQUAL stamp does not displace what is already here — see TODO 1w', async () => {
    // Characterising a known limitation rather than approving of it. The
    // merge takes a remote record only when it is strictly NEWER, and the
    // server's rule is identical, so a tie leaves every party holding its own
    // incumbent. Two devices that stamp the same record identically stay
    // different from each other, silently and permanently.
    //
    // Ties are not as exotic as they sound: put() clamps to updated + 1 when
    // the clock is not ahead of the record, so a single device with a fast
    // clock makes every later edit from a correct one land on exactly that
    // value.
    //
    // Pinned so that changing it has to be deliberate. What it should change
    // TO is Sean's call: a winner must be picked, and picking one silently
    // discards somebody's writing.
    const a = new SyncEngine();
    const mine = a.put(reminder('r1', 'mine'), 500);
    await a.sync(async () => ({
      cursor: 1,
      changes: [{ ...mine, payload: { text: 'theirs' } } as Rec<'reminder'>],
    }));
    expect(
      (a.get('r1') as Rec<'reminder'>).payload.text,
      'the tie is kept by whoever already had it, which is why two devices can disagree forever',
    ).toBe('mine');
  });

  it('snapshots round-trip, dirt included', async () => {
    const a = new SyncEngine();
    a.put(reminder('r1', 'unsent'), 1000);
    const b = SyncEngine.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    expect(b.hasPending()).toBe(true);
    expect(b.all().length).toBe(1);
  });
});

describe('a record the server refuses', () => {
  it('stays dirty and is named, instead of quietly becoming local-only', () => {
    // The old behaviour: the server dropped an oversized record, answered ok,
    // and the engine cleared it from dirty because it had been "sent". The
    // note then existed on exactly one device while the app reported
    // everything saved — the worst shape a sync bug can take.
    const e = new SyncEngine();
    e.put({ id: 'big', type: 'note', updated: 1, deleted: false, payload: { title: 'x', body: 'y' } } as never, 1);
    e.put({ id: 'ok', type: 'note', updated: 1, deleted: false, payload: { title: 'a', body: 'b' } } as never, 1);
    expect(e.hasPending()).toBe(true);

    const transport = async () => ({ cursor: 5, changes: [], rejected: ['big'] });
    return e.sync(transport).then(() => {
      expect(e.rejected(), 'the refusal is reported by id').toEqual(['big']);
      expect(e.hasPending(), 'and the record is still waiting to be saved').toBe(true);
      // The rest of the batch landed and is forgotten, as it should be.
      const snap = e.toSnapshot();
      expect(snap.dirty).toEqual(['big']);
    });
  });

  it('clears the refusal once the record is accepted', () => {
    const e = new SyncEngine();
    e.put({ id: 'big', type: 'note', updated: 1, deleted: false, payload: { title: 'x', body: 'y' } } as never, 1);
    return e
      .sync(async () => ({ cursor: 1, changes: [], rejected: ['big'] }))
      .then(() => e.sync(async () => ({ cursor: 2, changes: [], rejected: [] })))
      .then(() => {
        expect(e.rejected()).toEqual([]);
        expect(e.hasPending()).toBe(false);
      });
  });
});
