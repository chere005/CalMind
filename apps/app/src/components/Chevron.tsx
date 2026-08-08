/** A wide, obtuse chevron — the text glyphs (▾ ⌄) render cramped and narrow;
 *  this one is drawn: 14×7, round caps, pointing down when open, right when
 *  folded, exactly the collapse language the suite's chevrons speak. */
import React from 'react';
import Svg, { Polyline } from 'react-native-svg';
import { T } from '../theme';

export function Chevron({ open, size = 14, color }: { open: boolean; size?: number; color?: string }) {
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
