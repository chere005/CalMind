/**
 * The suite's control vocabulary as components: pill text buttons, circular
 * glyph buttons (always flex-centred — the rule the web checks by eye is the
 * default here), and the two-press delete that replaces every confirm box.
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { T } from './theme';

export function Pill({
  label,
  onPress,
  primary = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.pill, primary && s.pillPrimary, pressed && s.pressed, disabled && s.disabled]}
    >
      <Text style={[s.pillText, primary && s.pillTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function CircleBtn({
  glyph,
  onPress,
  color = T.dim,
  size = 26,
  bg,
  active = false,
  testID,
}: {
  glyph: string;
  onPress: () => void;
  color?: string;
  size?: number;
  bg?: string; // filled circle (colour swatches)
  active?: boolean; // accent state for icon toggles (Completed etc.)
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        s.circle,
        { width: size, height: size, borderRadius: size / 2 },
        bg ? { backgroundColor: bg, borderColor: bg } : null,
        active && s.circleActive,
        pressed && s.pressed,
      ]}
    >
      <Text style={{ color: active ? T.accent : color, fontSize: size * 0.55, lineHeight: size * 0.62, fontWeight: '700' }}>{glyph}</Text>
    </Pressable>
  );
}

/** Two-press delete: first press fills red (label never changes), second fires. */
export function ConfirmDelete({ onDelete, size = 26, testID }: { onDelete: () => void; size?: number; testID?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (armed) {
          clearTimeout(timer.current);
          onDelete();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 2500);
        }
      }}
      hitSlop={8}
      style={[s.circle, { width: size, height: size, borderRadius: size / 2 }, armed && s.armed]}
    >
      <Text style={{ color: armed ? '#fff' : T.dim, fontSize: size * 0.55, lineHeight: size * 0.62, fontWeight: '700' }}>×</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={T.muted} {...props} style={[s.field, props.style]} />;
}

export function ErrorLine({ text }: { text: string }) {
  return text ? <Text style={s.error}>{text}</Text> : null;
}

export function Rule() {
  return <View style={s.rule} />;
}

const s = StyleSheet.create({
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  pillPrimary: { backgroundColor: T.accentInk, borderColor: T.accentInk },
  pillText: { color: T.text, fontSize: 14 },
  pillTextPrimary: { color: T.accent, fontWeight: '700' },
  circle: {
    borderWidth: 1,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armed: { backgroundColor: T.danger, borderColor: T.danger },
  circleActive: { backgroundColor: T.accentInk, borderColor: T.accent },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  field: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    color: T.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16, // iOS doesn't zoom on focus at 16
  },
  error: { color: T.danger, marginTop: 8, fontSize: 13 },
  rule: { height: 1, backgroundColor: T.line, alignSelf: 'stretch' },
});
