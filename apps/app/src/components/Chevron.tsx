/**
 * A wide, obtuse chevron — the text glyphs (▾ ⌄ ▸ ›) render cramped and narrow;
 * this one is drawn, with round caps, pointing down when open and right when
 * folded: the collapse language the suite's chevrons speak.
 *
 * ONE size for every collapse in the app, exported so no screen can pick its
 * own. There were three treatments before — a drawn chevron at 15 for folders
 * and 14 for sections in Reminders and Notes, a 12pt '▸/▾' in the calendar's
 * day panel, and a 14pt '›/⌄' in Habits — which is what Sean saw as the same
 * control drawn differently on every page. It landed at 13, then 11, and Sean
 * asked for 60% of that: 7.
 *
 * The STROKE scales with it. It was pinned at 2, which is 18% of 11 but 29%
 * of 7 — shrinking the box alone would have left a stubbier, heavier glyph
 * rather than the same one smaller, which is not what "60% of its current
 * size" means. CHEVRON_STROKE keeps the ratio the drawn chevron has always
 * had.
 *
 * Size is DECORATION here, never the tap target: the wrappers own that (see
 * chevWrap, which carries an explicit height for exactly this reason).
 * hitSlop is a no-op under react-native-web, so on the web a control is only
 * as big as it is drawn — shrink the glyph without fixing the box and the
 * target shrinks with it.
 *
 * Not to be confused with the '›' at the end of a note row: that one means
 * "open this", not "collapse this", and is deliberately left alone.
 */
import React from 'react';
import Svg, { Polyline } from 'react-native-svg';
import { T } from '../theme';

export const CHEVRON = 7;
/** The weight the chevron has always been drawn at, as a ratio of its size. */
const CHEVRON_STROKE = 2 / 11;

export function Chevron({ open, size = CHEVRON, color }: { open: boolean; size?: number; color?: string }) {
  const w = size;
  const h = size / 2;
  const stroke = w * CHEVRON_STROKE;
  // Keep the round caps inside the canvas at any size — at 11 a hard-coded
  // inset of 1 did that; below about 8 it stops being enough on its own.
  const pad = stroke / 2;
  return (
    <Svg
      width={w}
      height={w}
      viewBox={`0 0 ${w} ${w}`}
      style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}
    >
      <Polyline
        points={`${pad},${(w - h) / 2 + pad} ${w / 2},${(w + h) / 2} ${w - pad},${(w - h) / 2 + pad}`}
        fill="none"
        stroke={color ?? T.dim}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
