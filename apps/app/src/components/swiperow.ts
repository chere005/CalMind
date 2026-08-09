/**
 * The suite's swipe-a-row-left: a firm left swipe marks the row swiped, which
 * reveals its delete control already ARMED — the swipe counts as the first
 * press, so one tap deletes. Callers don't attach it to a row that's inline-
 * editing or being dragged, which is the suite's "stands down in edit mode".
 * Stable per-key responders claiming in the CAPTURE phase on clearly
 * horizontal leftward travel, so taps and the vertical drags never contend.
 */
import { useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance } from 'react-native';

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
