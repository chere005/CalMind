/**
 * The picker button's face — the suite's rule: viewing ONE thing shows its
 * colour; viewing several shows a little pie of every visible colour, which
 * with everything switched on is the full rainbow.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { themed, T } from '../theme';

export function PieDot({ colors, size = 22, rainbow = false }: { colors: string[]; size?: number; rainbow?: boolean }) {
  const r = size / 2;
  // Everything switched on wears the RAINBOW — one smooth gradient disc, not
  // a pie of segments (Sean's call; the pie means a subset is showing).
  if (rainbow) {
    return (
      <Svg width={size} height={size}>
        <Defs>
          {/* Stops compressed into the circle's visible band — a diagonal
              gradient's 0/1 corners get CLIPPED by the disc, which is how a
              rainbow reads as plain orange. Pastels per Sean's reference. */}
          <LinearGradient id="pierainbow" x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor="#f9a8d4" />
            <Stop offset="0.33" stopColor="#fdba74" />
            <Stop offset="0.6" stopColor="#fde68a" />
            <Stop offset="1" stopColor="#86efac" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#pierainbow)" />
      </Svg>
    );
  }
  if (colors.length === 0) {
    return <View style={[s.ring, { width: size, height: size, borderRadius: r }]} />;
  }
  if (colors.length === 1) {
    return <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors[0] }} />;
  }
  const c = r;
  const slice = (i: number) => {
    const a0 = (i / colors.length) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / colors.length) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill={T.surface2} />
      {colors.map((col, i) => (
        <Path key={i} d={slice(i)} fill={col} />
      ))}
    </Svg>
  );
}

const s = themed(() => StyleSheet.create({
  ring: { borderWidth: 2, borderColor: T.dim },
}));
