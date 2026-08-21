/**
 * A backlog bigger than the server's batch limit used to be permanent.
 *
 * `app.php` refuses more than MAX_BATCH changes in one request — a 400,
 * "batch too large" — and the engine sent EVERY dirty record every time. Past
 * the limit that is not a slow sync, it is a deadlock: the same oversized
 * batch goes out, is refused, and goes out again, for ever. The app reports
 * itself offline while the network is perfectly fine, and the work sits on
 * one device.
 *
 * Measured before the fix, 600 dirty records against a transport that mirrors
 * the server's rule: four rounds, four 400s, still pending after every one.
 *
 * Reachable without doing anything unusual — deleting a folder with hundreds
 * of items re-homes them all and normalize marks every one dirty in a single
 * refresh; so does a long spell offline, or a large import.
 *
 * THE CONSTANT IS DUPLICATED ON PURPOSE and this file is what stops it
 * drifting. Core cannot import a PHP constant, and a quietly smaller client
 * limit would work while hiding the day the server's number changed — so the
 * two are the same number and the last test here reads app.php and says so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SyncEngine, SYNC_MAX_BATCH } from '../src/sync';
import type { AnyRec, Rec, SyncRequest, SyncResponse } from '../src/index';

const rem = (i: number): Rec<'reminder'> => ({
  id: `r${i}`, type: 'reminder', updated: 0,
  payload: { text: `t${i}`, due: null, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: `V${i}` },
});

/** The server's rule, and nothing else: refuse an oversized batch outright. */
function serverWithLimit(limit = SYNC_MAX_BATCH) {
  const recs = new Map<string, AnyRec & { seq: number }>();
  let seq = 0;
  const rounds: number[] = [];
  const transport = async (req: SyncRequest): Promise<SyncResponse> => {
    rounds.push(req.changes.length);
    if (req.changes.length > limit) throw new Error('400 batch too large');
    for (const c of req.changes) recs.set(c.id, { ...c, seq: ++seq });
    return { cursor: seq, changes: [], rejected: [] };
  };
  return { transport, rounds, held: () => recs.size };
}

describe('a backlog larger than the server will take', () => {
  it('drains instead of deadlocking', async () => {
    const eng = new SyncEngine();
    for (let i = 0; i < SYNC_MAX_BATCH + 100; i++) eng.put(rem(i));
    const sv = serverWithLimit();

    await eng.sync(sv.transport);

    expect(eng.hasPending(), 'everything reached the server in one sync call').toBe(false);
    expect(sv.held(), 'and every record is actually there').toBe(SYNC_MAX_BATCH + 100);
    // Two round trips, and no request over the limit — the deadlock was one
    // oversized request repeated, so the sizes are the evidence.
    expect(sv.rounds.length).toBe(2);
    expect(Math.max(...sv.rounds), 'no request exceeds what the server takes').toBeLessThanOrEqual(SYNC_MAX_BATCH);
  });

  it('an ordinary sync is still ONE round trip', async () => {
    // The loop must not cost a second, empty request every time. Anything
    // short of a full batch is the end of the drain.
    const eng = new SyncEngine();
    for (let i = 0; i < 12; i++) eng.put(rem(i));
    const sv = serverWithLimit();
    await eng.sync(sv.transport);
    expect(sv.rounds).toEqual([12]);
  });

  it('a full batch of REFUSED records does not loop for ever', async () => {
    // Rejected ids stay dirty by design. If "full batch" alone meant "go
    // again", a server refusing exactly a batch's worth would spin the client
    // until it ran out of memory — so the loop also needs an unsent record.
    const eng = new SyncEngine();
    for (let i = 0; i < SYNC_MAX_BATCH; i++) eng.put(rem(i));
    let rounds = 0;
    await eng.sync(async (req) => {
      rounds++;
      if (rounds > 5) throw new Error('looped');
      return { cursor: 1, changes: [], rejected: req.changes.map((c) => c.id) };
    });
    expect(rounds, 'one round, not a spin').toBe(1);
    expect(eng.hasPending(), 'and the refused work is still owed').toBe(true);
  });

  it("matches the server's MAX_BATCH, which is why it may be duplicated", () => {
    // Resolved from THIS FILE, not the working directory — vitest's cwd
    // differs between `--root packages/core` and a run from the repo root,
    // and a path that only works one way is a check that stops running.
    const appPhp = fileURLToPath(new URL('../../../../server/lib/app.php', import.meta.url));
    const php = readFileSync(appPhp, 'utf8');
    const m = /const\s+MAX_BATCH\s*=\s*(\d+)/.exec(php);
    expect(m, 'MAX_BATCH not found in app.php — this check is not running').not.toBeNull();
    expect(Number(m![1]), 'core and the server disagree about the batch limit').toBe(SYNC_MAX_BATCH);
  });
});
