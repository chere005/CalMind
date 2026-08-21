/**
 * The mark: the one-stroke CM — a single line flows from the C into the M
 * (Sean's pick from four candidates for CalMind). ChefMind is the same two
 * letters, so the drawing is unchanged and only the ICON's colour differs:
 * gold rather than the accent green, because two identical tiles on one home
 * screen is a thing you tap wrong every time.
 */
import Svg, { Path } from 'react-native-svg';
import { T } from './theme';

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Path
        d="M 58 26 A 27 27 0 1 0 58 70 L 58 44 L 69 57 L 80 44 L 80 70"
        fill="none"
        stroke={T.accent}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The month-pie, in the mark's language. No calendar here uses it; kept
 *  because it is part of the mark's family and costs nothing. */
export function PieIcon({ size = 22, color = T.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 12 12 L 12 2 A 10 10 0 0 1 21.5 8.9 Z" fill={color} />
      <Path d="M 12 12 L 21.5 8.9 A 10 10 0 1 1 12 2 Z" fill="none" stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}
