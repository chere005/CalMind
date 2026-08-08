/**
 * A portable row drag for equal-height lists — PanResponder, so it works on
 * web and native alike. The suite's feedback rule carries over: nothing moves
 * while you drag; a single drop line is the only hint, and the list reorders
 * on release. The dragged row just dims and rides the finger.
 *
 * The responders are created ONCE per row index and read live values through
 * a ref — a responder rebuilt mid-gesture drops the gesture on the floor,
 * which showed up as text selection instead of a drag.
 */
import { useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance } from 'react-native';
import { ordBetween } from '@calmind/core';

export type RowDrag = {
  /** Pan handlers for the ≡ handle of row `i`. */
  handleFor: (i: number) => PanResponderInstance['panHandlers'];
  dragIdx: number | null;
  dragDy: number;
  /** The boundary the drop line sits on (0..count), or null. */
  slot: number | null;
};

export function useRowDrag(count: number, rowHeight: number, onDrop: (from: number, to: number) => void): RowDrag {
  const [ui, setUi] = useState<{ dragIdx: number | null; dragDy: number; slot: number | null }>({
    dragIdx: null,
    dragDy: 0,
    slot: null,
  });
  const cfg = useRef({ count, rowHeight, onDrop });
  cfg.current = { count, rowHeight, onDrop };
  const responders = useRef(new Map<number, PanResponderInstance>());

  const handleFor = (i: number) => {
    if (!responders.current.has(i)) {
      const live = { from: i, to: i };
      responders.current.set(
        i,
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            live.from = i;
            live.to = i;
            setUi({ dragIdx: i, dragDy: 0, slot: null });
          },
          onPanResponderMove: (_e, g) => {
            const { count: n, rowHeight: h } = cfg.current;
            const to = Math.max(0, Math.min(n - 1, i + Math.round(g.dy / h)));
            live.to = to;
            // The line draws where the row would LAND: below `to` when sinking,
            // above when rising — as a boundary index 0..count.
            setUi({ dragIdx: i, dragDy: g.dy, slot: to > i ? to + 1 : to });
          },
          onPanResponderRelease: (_e, g) => {
            // Compute from the RELEASE's own travel, not the last move — a
            // fast flick can land with barely any move events processed.
            const { count: n, rowHeight: h } = cfg.current;
            const to = Math.max(0, Math.min(n - 1, i + Math.round(g.dy / h)));
            setUi({ dragIdx: null, dragDy: 0, slot: null });
            if (i !== to) cfg.current.onDrop(i, to);
          },
          onPanResponderTerminate: () => setUi({ dragIdx: null, dragDy: 0, slot: null }),
        }),
      );
    }
    return responders.current.get(i)!.panHandlers;
  };

  return { ...ui, handleFor };
}

/** The ord key a row takes when it moves from index `from` to `to` in a list
 *  already sorted by ord. */
export function ordForMove<T extends { payload: { ord: string } }>(arr: T[], from: number, to: number): string {
  const rest = arr.filter((_x, i) => i !== from);
  const lo = rest[to - 1]?.payload.ord ?? null;
  const hi = rest[to]?.payload.ord ?? null;
  return ordBetween(lo, hi);
}
