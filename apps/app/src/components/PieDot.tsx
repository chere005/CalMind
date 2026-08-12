/**
 * The picker button's face — the suite's rule: viewing ONE thing shows its
 * colour; viewing several shows a little pie of every visible colour, which
 * with everything switched on is the full rainbow.
 */
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { themed, T } from '../theme';

/** The suite's exact All-rainbow: conic-gradient(#60a5fa, accent, #facc15,
 *  #f472b6, #60a5fa) — an ANGULAR sweep. SVG has no conic primitive, so it
 *  renders as 48 interpolated slices, indistinguishable at dot size and
 *  identical on web, iOS and Android. */
const RAINBOW_ANCHORS = ['#60a5fa', '#34d399', '#facc15', '#f472b6', '#60a5fa'];
function conicColor(t: number): string {
  const seg = Math.min(3, Math.floor(t * 4));
  const f = t * 4 - seg;
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r0, g0, b0] = hex(RAINBOW_ANCHORS[seg]!);
  const [r1, g1, b1] = hex(RAINBOW_ANCHORS[seg + 1]!);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${mix(r0!, r1!)},${mix(g0!, g1!)},${mix(b0!, b1!)})`;
}

export function PieDot({ colors, size = 22, rainbow = false }: { colors: string[]; size?: number; rainbow?: boolean }) {
  const r = size / 2;
  if (rainbow) {
    const N = 48;
    const seams: string[] = [];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 2 * Math.PI - Math.PI / 2 - 0.02;
      const a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2 + 0.02;
      const large = 0;
      seams.push(`M ${r} ${r} L ${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`);
    }
    return (
      <Svg width={size} height={size}>
        {seams.map((d, i) => (
          <Path key={i} d={d} fill={conicColor((i + 0.5) / N)} />
        ))}
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
