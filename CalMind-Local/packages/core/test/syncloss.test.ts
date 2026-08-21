/**
 * The dot must never say "synced" while an edit is only on this device.
 *
 * sync.test.ts pins thirteen scenarios, each a sequence someone wrote down:
 * an echo, a mid-flight edit, a failed transport, an equal-stamp tie, a
 * refusal. They are the cases we thought of. This drives the ones nobody
 * wrote down — a few thousand random interleavings of put, delete, sync,
 * offline and refusal — and checks the one property that matters underneath
 * all of them:
 *
 *   if this device holds an edit the server has not got, hasPending() is true.
 *
 * That is the promise the sync dot makes. CLAUDE.md's list of the worst bugs
 * this project has found is three variations of breaking it — "an oversized
 * record dropped while the app said synced" is exactly this invariant
 * failing — and every one of them was silent. A random walk is the only way
 * to reach interleavings nobody has imagined.
 *
 * The fake server mirrors app.php rather than being convenient: last-write
 * wins on a strictly newer stamp, an EQUAL stamp with different content is
 * accepted and bumps the sequence (the arbiter rule the two-device tie
 * depends on), and an oversized record is refused by id instead of stored.
 *
 * What this does NOT claim: it is not a proof, and it found no bug. It is a
 * net under the part of the engine whose failures do not announce themselves.
 *
 * ITS BLIND SPOTS, found by mutation rather than guessed, and worth knowing
 * because they are exactly what sync.test.ts covers — neither file replaces
 * the other and deleting either would open a hole:
 *
 *   · This walk AWAITS every sync, so there is never a window in which an
 *     edit lands mid-flight. Clearing `dirty` regardless of a mid-flight
 *     stamp passes everything here; sync.test.ts's "an edit made mid-flight
 *     stays dirty for the next round" is what catches it.
 *   · One engine against one server cannot observe the two-device tie.
 *     Dropping the equal-stamp arbiter rule passes everything here — the
 *     engine keeps its own copy, which stays dirty, gets pushed, and the
 *     server takes it, so this device still converges. sync.test.ts's
 *     equal-stamp pair is what catches it.
 *
 * What it DOES catch, and nothing else did: a dirty flag cleared for a
 * record the server refused. That is the "synced" lie in its purest form.
 */
import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync';
import type { AnyRec, Rec, SyncRequest, SyncResponse } from '../src/index';

const reminder = (id: string, text: string, updated = 0): Rec<'reminder'> => ({
  id, type: 'reminder', updated,
  payload: { text, due: null, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'V' },
});

/** Key-order-independent comparison, as the server's own canonicalisation is. */
const same = (a: AnyRec | undefined, b: AnyRec | undefined): boolean => {
  if (!a || !b) return false;
  if (a.updated !== b.updated || !!a.deleted !== !!b.deleted) return false;
  const norm = (r: AnyRec) => JSON.stringify(Object.entries(r.payload as Record<string, unknown>).sort());
  return norm(a) === norm(b);
};

function server() {
  const recs = new Map<string, AnyRec & { seq: number }>();
  let seq = 0;
  return {
    held: (id: string) => {
      const r = recs.get(id);
      if (!r) return undefined;
      const { seq: _s, ...rest } = r;
      return rest as AnyRec;
    },
    /** `refuse` names ids the server will not store — the 64KB rule, in effect. */
    transport(refuse: Set<string>) {
      return async (req: SyncRequest): Promise<SyncResponse> => {
        const rejected: string[] = [];
        for (const c of req.changes) {
          if (refuse.has(c.id)) { rejected.push(c.id); continue; }
          const cur = recs.get(c.id);
          if (!cur || c.updated > cur.updated) { recs.set(c.id, { ...c, seq: ++seq }); continue; }
          // The arbiter rule: an equal stamp whose CONTENT differs is taken.
          if (c.updated === cur.updated && !same(c, { ...cur })) recs.set(c.id, { ...c, seq: ++seq });
        }
        const changes = [...recs.values()]
          .filter((r) => r.seq > req.cursor)
          .map(({ seq: _s, ...r }) => r as AnyRec);
        return { cursor: seq, changes, rejected };
      };
    },
  };
}

describe('no local edit is ever silently lost', () => {
  it('holds across 300 random walks of put / delete / sync / offline / refusal', async () => {
    // Deterministic: a failure is reproducible from the seed printed with it.
    let seed = 20260812;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (let walk = 0; walk < 300; walk++) {
      const sv = server();
      const eng = new SyncEngine();
      const refuse = new Set<string>();
      // A clock that mostly advances but sometimes stands still, because an
      // equal stamp is the case the tie-break exists for and a strictly
      // increasing clock would never produce one.
      let clock = 1000;

      for (let step = 0; step < 14; step++) {
        const id = `r${Math.floor(rnd() * 3)}`;
        const roll = rnd();
        if (roll < 0.34) {
          if (rnd() < 0.35) clock += 0; else clock += 1;
          eng.put(reminder(id, `t${step}`, clock), clock);
        } else if (roll < 0.44) {
          clock += 1;
          eng.del(id, clock);
        } else if (roll < 0.52) {
          // The server starts refusing this id — an oversized record.
          refuse.add(id);
        } else if (roll < 0.58) {
          refuse.delete(id);
        } else if (roll < 0.78) {
          // Offline: the transport throws, and the engine must keep the work.
          await eng.sync(async () => { throw new Error('offline'); }).catch(() => {});
        } else {
          await eng.sync(sv.transport(refuse));
        }

        // THE INVARIANT. Anything this device holds that the server does not
        // have identically is unsent work, so the engine must still say so.
        const behind = eng.all().filter((r) => !same(r, sv.held(r.id)));
        if (behind.length > 0) {
          expect(
            eng.hasPending(),
            `walk ${walk} step ${step}: ${behind.length} record(s) differ from the server ` +
              `(${behind.map((r) => r.id).join(', ')}) yet the engine reports nothing pending`,
          ).toBe(true);
        }
      }

      // And once the refusals lift, a quiet device must actually reach
      // agreement — otherwise "always pending" would satisfy everything above.
      refuse.clear();
      for (let i = 0; i < 4; i++) await eng.sync(sv.transport(refuse));
      for (const r of eng.all()) {
        expect(
          same(r, sv.held(r.id)),
          `walk ${walk}: ${r.id} never reached the server even after the refusals lifted`,
        ).toBe(true);
      }
      expect(eng.hasPending(), `walk ${walk}: still pending after settling`).toBe(false);
    }
  });

  it('a refused record stays named and pending however many times it is retried', async () => {
    const sv = server();
    const eng = new SyncEngine();
    const refuse = new Set(['big']);
    eng.put(reminder('big', 'too large', 5), 5);
    for (let i = 0; i < 5; i++) await eng.sync(sv.transport(refuse));
    expect(eng.rejected(), 'the id is still named after five attempts').toContain('big');
    expect(eng.hasPending(), 'and still owed').toBe(true);
    expect(sv.held('big'), 'and the server never took it').toBeUndefined();

    // Lifting the refusal must clear both, or the warning would outlive the
    // problem and the app would cry wolf for ever.
    refuse.clear();
    await eng.sync(sv.transport(refuse));
    expect(eng.rejected()).toEqual([]);
    expect(eng.hasPending()).toBe(false);
    expect(sv.held('big')).toBeDefined();
  });
});
