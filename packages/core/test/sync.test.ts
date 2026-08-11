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
    const r1 = b.get('r1') as Rec<'reminder'>;
    b.put({ ...r1, payload: { ...r1.payload, text: 'from b, later' } }, 2000);
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
      const cur = a.get('r1') as Rec<'reminder'>;
      a.put({ ...cur, payload: { ...cur.payload, text: 'v2' } }, 2000);
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

  it('an equal stamp with DIFFERENT content takes the server\'s copy, so two devices converge', async () => {
    // The fix for "two devices can disagree forever" (Sean's call,
    // 2026-08-11: the server arbitrates). Strictly-newer on both sides left
    // every party holding its own incumbent on a tie, and neither would ever
    // push again because neither was dirty.
    //
    // The server now accepts an equal-stamped write whose content differs, so
    // its copy means "whichever edit reached it last". Taking that here is
    // what makes the two agree.
    const a = new SyncEngine();
    const mine = a.put(reminder('r1', 'mine'), 500);
    // Sent and accepted, so nothing is owed — this is the settled case.
    await a.sync(async () => ({ cursor: 1, changes: [] }));
    expect(a.hasPending()).toBe(false);
    await a.sync(async () => ({
      cursor: 2,
      changes: [{ ...mine, payload: { text: 'theirs' } } as Rec<'reminder'>],
    }));
    expect(
      (a.get('r1') as Rec<'reminder'>).payload.text,
      'the tie resolves to what the server holds, rather than the two staying different forever',
    ).toBe('theirs');
  });

  it('an equal stamp does NOT clobber an edit we have not pushed yet', async () => {
    // The one case where the incumbent must win. A dirty record has never
    // been offered to anyone, so it is not a stale loser — and overwriting it
    // would be silent AND pointless: the id stays dirty, so the next push
    // would send back the copy we just adopted, which the server recognises
    // as identical and ignores. The local writing would be gone for nothing.
    const a = new SyncEngine();
    const mine = a.put(reminder('r1', 'unsent'), 500);
    expect(a.hasPending()).toBe(true);
    await a.sync(async () => ({
      cursor: 1,
      // The server's tail carries a different record at the same stamp, and
      // reports nothing rejected — but our own push is in the same round
      // trip, so this arrives while we are still dirty.
      changes: [{ ...mine, payload: { text: 'theirs' } } as Rec<'reminder'>],
    }));
    expect(
      (a.get('r1') as Rec<'reminder'>).payload.text,
      'an unsent edit survives the tie; it gets pushed, and the OTHER device converges on it',
    ).toBe('unsent');
  });

  it('an equal stamp with the SAME content changes nothing', async () => {
    // The echo. Without this the two devices would hand the record back and
    // forth for ever, each "resolving" a tie that is not one.
    const a = new SyncEngine();
    const mine = a.put(reminder('r1', 'same'), 500);
    await a.sync(async () => ({ cursor: 1, changes: [] }));
    const before = a.get('r1');
    // The SAME payload, rebuilt with its keys in the opposite order — which
    // is the case the canonicalisation exists for. Without sorting, a client
    // that happens to serialise its object differently would read as a
    // conflict on every single sync.
    const reordered = Object.fromEntries(Object.entries(mine.payload).reverse());
    await a.sync(async () => ({
      cursor: 2,
      changes: [{ updated: mine.updated, id: 'r1', type: 'reminder', payload: reordered } as Rec<'reminder'>],
    }));
    expect(a.get('r1'), 'an echo is not a conflict').toBe(before); // identity: toEqual ignores key order and so cannot see a needless replacement
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
