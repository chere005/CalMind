/**
 * The CalMind mark: a C whose mouth is a pie slice, an M nested inside — the
 * calendar's pie and the two letters in one shape. Chosen from five drafts
 * (V3 "pie-C"); assets/logo.svg is the canonical copy for icons and favicons.
 */
import React from 'react';
import Svg, { Path, Polyline } from 'react-native-svg';
import { T } from './theme';

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Path d="M 48 48 L 73 33 A 29 29 0 1 0 73 63 Z" fill={T.accentInk} />
      <Path d="M 72.5 33.8 A 29 29 0 1 0 72.5 62.2" fill="none" stroke={T.accent} strokeWidth={9} strokeLinecap="round" />
      <Polyline
        points="35,60 35,40 47,52 59,40 59,60"
        fill="none"
        stroke={T.text}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The Calendar tab's icon: the month-pie, in the mark's language. */
export function PieIcon({ size = 22, color = T.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 12 12 L 12 2 A 10 10 0 0 1 21.5 8.9 Z" fill={color} />
      <Path d="M 12 12 L 21.5 8.9 A 10 10 0 1 1 12 2 Z" fill="none" stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}
