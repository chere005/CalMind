/**
 * A wrapping row that balances its lines instead of cramming them.
 *
 * Ordinary flexWrap fills each line to the brim and lets whatever is left
 * fall onto the next one, which is how the legend ended up with four chips
 * above and a single stranded "Calendar" below. This measures instead: every
 * item reports its width, the row reports its own, and core's balanceLines
 * decides the breaks — fewest lines first, then the evenest split. Nothing
 * is hardcoded, so it holds at any width and any number of chips.
 *
 * Until every item has reported a width it renders as a plain wrap, so the
 * first frame looks like the old behaviour rather than a flash of nothing.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { balanceLines, groupedLines } from '@calmind/core';

export function BalancedRow({
  children,
  gap = 14,
  rowGap = 4,
  style,
  testID,
  groups,
}: {
  children: React.ReactNode;
  gap?: number;
  rowGap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** One number per child naming its kind. When given and a wrap is forced,
   *  lines break on kind boundaries instead of the balance point. */
  groups?: number[];
}) {
  const items = useMemo(() => React.Children.toArray(children), [children]);
  const [rowW, setRowW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});

  const onRow = useCallback((e: LayoutChangeEvent) => setRowW(e.nativeEvent.layout.width), []);
  // Keyed by index-and-count: a legend that gains or loses a chip re-measures
  // rather than laying the new set out against the old set's widths.
  const keyOf = (i: number) => `${items.length}:${i}`;
  const onItem = (i: number) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const k = keyOf(i);
    setWidths((cur) => (Math.abs((cur[k] ?? -1) - w) < 0.5 ? cur : { ...cur, [k]: w }));
  };

  const measured = items.length > 0 && items.every((_x, i) => widths[keyOf(i)] !== undefined);
  const lines = useMemo(() => {
    if (!measured || rowW <= 0) return null;
    const ws = items.map((_x, i) => widths[keyOf(i)]!);
    return groups && groups.length === items.length
      ? groupedLines(ws, rowW, gap, groups)
      : balanceLines(ws, rowW, gap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, rowW, widths, items.length, gap, groups]);

  // Measured or not, every item is rendered with its onLayout attached — the
  // two branches differ only in how they are grouped.
  const wrap = (i: number, node: React.ReactNode) => (
    <View key={i} onLayout={onItem(i)}>
      {node}
    </View>
  );

  if (!lines) {
    return (
      <View testID={testID} style={[s.fallback, { columnGap: gap, rowGap }, style]} onLayout={onRow}>
        {items.map((node, i) => wrap(i, node))}
      </View>
    );
  }

  return (
    <View testID={testID} style={[{ rowGap }, style]} onLayout={onRow}>
      {lines.map(([from, to], li) => (
        <View key={li} testID="balanced-line" style={[s.line, { columnGap: gap }]}>
          {items.slice(from, to).map((node, k) => wrap(from + k, node))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  fallback: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center' },
});
