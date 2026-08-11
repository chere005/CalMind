/**
 * The two seconds a just-ticked reminder stays on screen.
 *
 * Sean, 2026-08-11: "when checking off a reminder in all apps, make sure to
 * show the checked reminder for 2 seconds, giving the user the ability to
 * uncheck it if checking it was a mistake".
 *
 * Ticking a reminder marks it done, and every list filters done items out, so
 * the row vanished the instant it was touched — a mis-tap left nothing to
 * correct except by turning on Completed and hunting for it. This holds the
 * row where it is, ticked, for long enough to tap again.
 *
 * NOT a delayed write. The tick is saved immediately and syncs immediately,
 * exactly as before; the only thing deferred is the row leaving the list. A
 * grace period that held the WRITE back would lose the tick if the app were
 * closed inside it, which is a worse bargain than the one it fixes.
 *
 * A REPEATING reminder does not need this and does not get it: reminderToggle
 * rolls it to its next date rather than finishing it, so it never leaves the
 * list and there is nothing to hold. Callers pass the result of the toggle,
 * so that distinction is made once at the call site rather than guessed here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reminderToggle, todayStr, type Rec, type Reminder } from '@calmind/core';
import { useStore } from '../store';

/** How long a ticked row lingers. Sean's number. */
export const GRACE_MS = 2000;

/**
 * @typeParam V - what to hand back if the row is tapped again. Only the shared
 *   lists need it; see useSharedTick below for why, and why the owned lists do
 *   not. Defaults to `never`, so a caller that has no use for it cannot pass
 *   one by accident.
 */
export function useTickGrace<V = never>(ms: number = GRACE_MS) {
  // A tick is a render trigger, not state anybody reads: the map is the truth
  // and lives in a ref so holding one row does not re-render on every keystroke
  // elsewhere.
  const [version, bump] = useState(0);
  const until = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const before = useRef(new Map<string, V>());

  // Timers outlive the screen otherwise — switching tabs mid-grace would fire
  // a setState on something unmounted.
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    before.current.clear();
  }, []);

  const hold = useCallback((id: string, restore?: V) => {
    until.current.set(id, Date.now() + ms);
    if (restore !== undefined) before.current.set(id, restore);
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev);
    timers.current.set(id, setTimeout(() => {
      until.current.delete(id);
      timers.current.delete(id);
      before.current.delete(id);
      bump((n) => n + 1);
    }, ms));
    bump((n) => n + 1);
  }, [ms]);

  /**
   * Let go early — the row was unticked, so there is nothing to hold.
   *
   * It RETURNS what hold() was given rather than offering a separate getter,
   * so that reading the value and dropping it are one step. A getter would
   * have made "read it after releasing" — which returns undefined and silently
   * does nothing — a spelling mistake away.
   */
  const release = useCallback((id: string): V | undefined => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    const was = before.current.get(id);
    before.current.delete(id);
    if (until.current.delete(id)) bump((n) => n + 1);
    return was;
  }, []);

  /** Compared against the clock, not merely "is it in the map": a timer that
   *  has not fired yet must not keep a stale row alive after a re-render. */
  const held = useCallback((id: string) => (until.current.get(id) ?? 0) > Date.now(), []);

  // Anything that MEMOISES a list filtered with `held` must recompute when a
  // hold starts or ends, and `held` is deliberately a stable callback — so the
  // memo needs something that changes. Reminders' flatRows is one: it decides
  // drag indices, and if it disagreed with what is drawn, a drag during the
  // grace would land the row in the wrong place.
  return { hold, release, held, version };
}

/**
 * The same two seconds, for a row in a PARTNER's list.
 *
 * Sean asked for the grace "in all apps". Three surfaces tick a partner's
 * reminder — Reminders' All view, the shared folder view, Calendar's day panel
 * — and none of them had it: a mis-tap on someone else's list vanished with no
 * way back, which is the case where it matters most, because the row is not
 * mine to go hunting for and they will see the change.
 *
 * It is a hook rather than three call sites because of the second tap, which
 * is NOT the same as the owned one. An owned tick writes to the local store
 * and the next render already reads the new payload. A shared tick is a POST
 * followed by a re-pull, so for a moment the record on screen still says
 * `done: false` — toggling from it a second time would tick it AGAIN and leave
 * the partner's row done, the exact opposite of what the tap asked for. So the
 * pre-tick payload is put aside at the first tap and put back verbatim at the
 * second, and the round trip is never consulted.
 */
export function useSharedTick() {
  const { sharedPut } = useStore();
  const grace = useTickGrace<Reminder>();

  const tick = useCallback((r: Rec<'reminder'>) => {
    if (grace.held(r.id)) {
      // Second tap inside the grace: undo, never re-toggle. The ?? is a
      // floor, not a path — hold() below always stores a payload — and it
      // unticks, which is what a row drawn ticked should do when tapped.
      const back = grace.release(r.id) ?? { ...r.payload, done: false };
      void sharedPut({ ...r, payload: back });
      return;
    }
    const next = reminderToggle(r.payload, todayStr());
    // A repeating reminder rolls to its next date instead of finishing, so it
    // never leaves the list and there is nothing to hold — same rule as the
    // owned lists.
    if (next.done) grace.hold(r.id, r.payload);
    void sharedPut({ ...r, payload: next });
  }, [sharedPut, grace]);

  /** Drawn state: ticked the moment it is tapped, not when the server agrees. */
  const done = useCallback(
    (r: Rec<'reminder'>) => r.payload.done || grace.held(r.id),
    [grace],
  );

  /** Filter for a list that hides done rows: keep the one being held. */
  const shows = useCallback(
    (r: Rec<'reminder'>) => !r.payload.done || grace.held(r.id),
    [grace],
  );

  return { tick, done, shows, version: grace.version };
}
