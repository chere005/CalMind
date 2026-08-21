/**
 * The suite's swatch tray: tapping a row's colour swatch opens the app's
 * palette as a row of dots; tapping one sets it and the tray folds away.
 * The swatch never moves — the tray drops in beneath the row.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { themed, T } from '../theme';

export function SwatchTray({
  palette,
  color,
  onPick,
  size = 22,
  testID,
}: {
  palette: readonly string[];
  color: string;
  onPick: (hex: string) => void;
  size?: number;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={[s.swatch, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, open && s.swatchOpen]}
      />
      {open && (
        <View style={s.tray}>
          {palette.map((hex) => (
            <Pressable
              key={hex}
              testID={testID ? `${testID}-${hex.slice(1)}` : undefined}
              onPress={() => { onPick(hex); setOpen(false); }}
              hitSlop={4}
              style={[s.trayDot, { backgroundColor: hex }, hex === color && s.trayDotOn]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  swatch: { borderWidth: 1, borderColor: T.line },
  swatchOpen: { borderColor: T.accent, borderWidth: 2 },
  tray: {
    position: 'absolute', top: 26, left: -4, zIndex: 50,
    flexDirection: 'row', gap: 7, padding: 7,
    backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, borderRadius: 999,
  },
  trayDot: { width: 20, height: 20, borderRadius: 10 },
  trayDotOn: { borderWidth: 2, borderColor: T.text },
}));
