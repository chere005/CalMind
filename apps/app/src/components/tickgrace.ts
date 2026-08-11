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

/** How long a ticked row lingers. Sean's number. */
export const GRACE_MS = 2000;

export function useTickGrace(ms: number = GRACE_MS) {
  // A tick is a render trigger, not state anybody reads: the map is the truth
  // and lives in a ref so holding one row does not re-render on every keystroke
  // elsewhere.
  const [version, bump] = useState(0);
  const until = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Timers outlive the screen otherwise — switching tabs mid-grace would fire
  // a setState on something unmounted.
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const hold = useCallback((id: string) => {
    until.current.set(id, Date.now() + ms);
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev);
    timers.current.set(id, setTimeout(() => {
      until.current.delete(id);
      timers.current.delete(id);
      bump((n) => n + 1);
    }, ms));
    bump((n) => n + 1);
  }, [ms]);

  /** Let go early — the row was unticked, so there is nothing to hold. */
  const release = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    if (until.current.delete(id)) bump((n) => n + 1);
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
