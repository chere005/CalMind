/**
 * The suite's swipe-a-row-left: a firm left swipe marks the row swiped, which
 * reveals its delete control already ARMED — the swipe counts as the first
 * press, so one tap deletes. Callers don't attach it to a row that's inline-
 * editing or being dragged, which is the suite's "stands down in edit mode".
 * Stable per-key responders claiming in the CAPTURE phase on clearly
 * horizontal leftward travel, so taps and the vertical drags never contend.
 */
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, type PanResponderInstance } from 'react-native';

export function useSwipeLeft(): {
  handlersFor: (key: string) => PanResponderInstance['panHandlers'];
  swiped: string | null;
  clear: () => void;
  /** True in the swipe's immediate wake — the browser fires a CLICK on the
   *  same mouseup that ended the pan, and a tap handler that clears the
   *  swiped state would undo the gesture the instant it landed. */
  justSwiped: () => boolean;
} {
  const [swiped, setSwiped] = useState<string | null>(null);
  const swipedAt = useRef(0);
  const responders = useRef(new Map<string, PanResponderInstance>());

  /**
   * A tap anywhere else puts the parked × away (Sean, 2026-08-20: "tap to
   * exit swipe to delete doesn't work"). Only the row's own tap handler
   * cleared it, so a tap on blank space, a heading, or another row left the
   * armed delete sitting there — a one-press delete parked under a finger
   * that has moved on, which is the state this app least wants to leave
   * lying around.
   *
   * It lives HERE, in the hook every swipeable list shares, rather than in
   * five screens — the same argument EditExit's wrapper makes. WEB only,
   * for the same reason as those document listeners: on native the row's
   * own responder and the screens' EditExit ancestor already receive the
   * touch, and `swipe.swiped` is cleared by the row's onPress there.
   *
   * `pointerdown` in CAPTURE, not click: a click may never arrive (a press
   * on a bare View produces none), and capture beats any handler that stops
   * propagation. The delete control itself is exempt — clearing on the very
   * press meant to confirm would eat it, which is what the closest() check
   * is for.
   *
   * NO time window, deliberately, and this cost a red test to see: the
   * gesture's OWN pointerdown fired before `swiped` was set, so it happened
   * before this listener existed and can never reach it. Every pointerdown
   * that gets here is a fresh press. A 400ms guard — copied by reflex from
   * the click-based `justSwiped` — swallowed exactly the quick tap a person
   * makes right after swiping, which is the commonest way to change your
   * mind about deleting something.
   */
  useEffect(() => {
    if (swiped === null || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onDown = (ev: Event) => {
      const t = ev.target as Element | null;
      // The armed × and anything inside it: its own press must reach it.
      if (t?.closest?.('[data-testid="swipe-del"],[data-testid="ing-del"],[data-testid="step-del"],[aria-label="Confirm delete"]')) return;
      setSwiped(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [swiped]);

  const handlersFor = (key: string) => {
    if (!responders.current.has(key)) {
      responders.current.set(
        key,
        PanResponder.create({
          onMoveShouldSetPanResponderCapture: (_e, g) => g.dx < -12 && Math.abs(g.dx) > 1.5 * Math.abs(g.dy),
          // The same refusal both drag hooks needed, and for the same reason:
          // the enclosing ScrollView asks for the responder once a gesture
          // travels, and yielding kills the swipe on any list long enough to
          // scroll. It matters more here than it did there — a recipe line's
          // ONLY delete is this swipe now that the × left the row.
          onPanResponderTerminationRequest: () => false,
          onPanResponderRelease: (_e, g) => {
            if (g.dx < -50) swipedAt.current = Date.now();
            setSwiped(g.dx < -50 ? key : null);
          },
          onPanResponderTerminate: () => setSwiped(null),
        }),
      );
    }
    return responders.current.get(key)!.panHandlers;
  };

  return { handlersFor, swiped, clear: () => setSwiped(null), justSwiped: () => Date.now() - swipedAt.current < 400 };
}
