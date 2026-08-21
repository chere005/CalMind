/**
 * The kind icons, one drawing language across cells, legend and tab bar —
 * the suite's cal_legend_icon() set: a calendar glyph before events, a tick
 * box before reminders, a page before notes. Sizes are exact multiples so
 * strokes land on pixels; every icon is centred by construction.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { T } from '../theme';

/** A tiny calendar: rounded frame, binder bar. */
export function CalGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Rect x={1} y={2} width={10} height={9} rx={2} fill="none" stroke={color} strokeWidth={1.6} />
      <Path d="M 1 5 H 11" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

/** A tick box; filled when done, orange ring when overdue is passed as color. */
export function TickBoxGlyph({ color, done = false, size = 11 }: { color: string; done?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Rect x={1} y={1} width={10} height={10} rx={3} fill={done ? color : 'none'} stroke={color} strokeWidth={1.6} />
      {done && <Path d="M 3.5 6 L 5.3 7.8 L 8.5 4.2" stroke={T.bg} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
  );
}

/** A page: rect with a folded corner suggestion (two text lines). */
export function PageGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Rect x={2} y={1} width={8} height={10} rx={1.5} fill="none" stroke={color} strokeWidth={1.6} />
      <Path d="M 4 4.5 H 8 M 4 7 H 8" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------- tab bar

export function TickCircleIcon({ size = 20, color = T.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeWidth={2.2} />
      <Path d="M 7.5 12.2 L 10.6 15.3 L 16.5 9" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PageIcon({ size = 20, color = T.dim }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={3} width={14} height={18} rx={2.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M 8.5 8.5 H 15.5 M 8.5 12 H 15.5 M 8.5 15.5 H 13" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A shopping basket, in the same drawing language as the rest of the bar: a
 * tapered body, the rim across the top, and the two handles arcing over it.
 * Stroked at 2, like PageIcon, so it reads at the same weight beside it.
 */
export function BasketIcon({ size = 20, color = T.dim }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* ONE ARC over the top, not two straight handles. The two-handle
          version read as a waste bin at tab-bar size — which, next to a list
          of things you are about to buy, is the worst possible misread. A
          single semicircular handle is the shape a picnic basket has and
          nothing else does. */}
      <Path d="M 8 9 A 4 4 0 0 1 16 9" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M 3.5 9 H 20.5 L 18.4 19.2 A 1.6 1.6 0 0 1 16.8 20.5 H 7.2 A 1.6 1.6 0 0 1 5.6 19.2 Z"
            fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function CalendarIcon({ size = 20, color = T.dim }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={3} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M 3 10 H 21 M 8 3 V 7 M 16 3 V 7" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={15.5} r={1.8} fill={color} />
    </Svg>
  );
}

export function FlameIcon({ size = 20, color = '#f09a19' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M 12 2.5 C 13.5 6 17.5 8 17.5 13 A 5.5 5.5 0 0 1 6.5 13 C 6.5 10.5 8 9 8.8 7.5 C 9.6 9 10.6 9.7 11 9.2 C 11.6 8.4 10.8 5.5 12 2.5 Z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
