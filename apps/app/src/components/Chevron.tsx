/**
 * A wide, obtuse chevron — the text glyphs (▾ ⌄ ▸ ›) render cramped and narrow;
 * this one is drawn, with round caps, pointing down when open and right when
 * folded: the collapse language the suite's chevrons speak.
 *
 * ONE size for every collapse in the app, exported so no screen can pick its
 * own. There were three treatments before — a drawn chevron at 15 for folders
 * and 14 for sections in Reminders and Notes, a 12pt '▸/▾' in the calendar's
 * day panel, and a 14pt '›/⌄' in Habits — which is what Sean saw as the same
 * control drawn differently on every page. It landed at 13, then Sean asked
 * for smaller again ('a bit smaller everywhere including the collapse all
 * button'), so: 11.
 *
 * Not to be confused with the '›' at the end of a note row: that one means
 * "open this", not "collapse this", and is deliberately left alone.
 */
import React from 'react';
import Svg, { Polyline } from 'react-native-svg';
import { T } from '../theme';

export const CHEVRON = 11;

export function Chevron({ open, size = CHEVRON, color }: { open: boolean; size?: number; color?: string }) {
  const w = size;
  const h = size / 2;
  return (
    <Svg
      width={w}
      height={w}
      viewBox={`0 0 ${w} ${w}`}
      style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}
    >
      <Polyline
        points={`1,${(w - h) / 2 + 1} ${w / 2},${(w + h) / 2} ${w - 1},${(w - h) / 2 + 1}`}
        fill="none"
        stroke={color ?? T.dim}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
