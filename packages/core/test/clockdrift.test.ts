import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync';
import type { Rec } from '../src/index';

/**
 * What put()'s clock clamp actually does, measured rather than asserted.
 *
 * `updated: Math.max(now, prev + 1)` was written up in TODO §1 as a lurking
 * disaster — "a device that edits rapidly or carries a fast clock pushes
 * updated ahead of wall clock, and the skew is STICKY … a stale edit from the
 * skewed device then beats a genuinely newer edit from a correct one".
 *
 * The last part is FALSE, and these are the numbers that say so. The clamp
 * guarantees that anyone editing a record they have SEEN stamps it higher than
 * what they saw, so the later editor wins whatever their clock reads. That is
 * causal ordering, and it is the property worth keeping.
 *
 * Pinned here because the entry made it sound like something to rip out, and
 * ripping it out would break exactly the case it protects.
 */
const r = (id: string, text: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text, due: null, time: null, done: false, repeat: null, folderId: 'f', sectionId: 's', indent: 0, ord: 'V' },
});

describe("the clock clamp in put()", () => {
  const T = 1_000_000;

  it('a burst of edits runs ahead of the clock by ONE MILLISECOND PER EDIT, no more', () => {
    const e = new SyncEngine();
    let last = 0;
    for (let i = 0; i < 200; i++) last = e.put(r('x', `v${i}`), T).updated;
    // 200 edits inside one millisecond: 200ms of drift, not hours.
    expect(last - T).toBe(199);
  });

  it('and the drift self-heals the moment real time passes it', () => {
    const e = new SyncEngine();
    for (let i = 0; i < 200; i++) e.put(r('x', `v${i}`), T);
    // One second later the stamp is the wall clock again, exactly.
    expect(e.put(r('x', 'later'), T + 1000).updated).toBe(T + 1000);
  });

  it('a device with an HOUR-fast clock does not win against a later edit elsewhere', () => {
    // THE CASE THE TODO CLAIMED WAS BROKEN. A fast device stamps an hour into
    // the future; a correct-clock device that has SEEN that edit and changes
    // the record afterwards still wins, because the clamp puts it one above
    // what it saw. Causal order beats wall-clock disagreement.
    const HOUR = 3_600_000;
    const fast = new SyncEngine();
    const poisoned = fast.put(r('x', 'from the fast device'), T + HOUR).updated;

    const ok = new SyncEngine();
    ok.put({ ...r('x', 'from the fast device'), updated: poisoned } as Rec<'reminder'>, T + HOUR);
    const mine = ok.put(r('x', 'genuinely later, correct clock'), T + 60_000).updated;

    expect(mine, 'the later editor wins whatever their clock reads').toBeGreaterThan(poisoned);
  });

  it('what IS exposed: two devices editing something neither has seen the other touch', () => {
    // The honest residue, and it is not stickiness — it is plain concurrency.
    // Two devices edit from the same starting point; the higher clock wins
    // regardless of who was actually later. No client-side clamp can fix that;
    // only a server-assigned time could, which is a protocol change.
    const a = new SyncEngine();
    const b = new SyncEngine();
    const start = { ...r('x', 'shared start'), updated: T } as Rec<'reminder'>;
    a.put(start, T); b.put(start, T);
    const fromA = a.put(r('x', 'A, clock an hour fast'), T + 3_600_000).updated;
    const fromB = b.put(r('x', 'B, correct clock, LATER in real time'), T + 60_000).updated;
    expect(fromA, 'the fast clock wins a genuine tie — inherent to wall-clock LWW').toBeGreaterThan(fromB);
  });
});
