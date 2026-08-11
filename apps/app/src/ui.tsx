/**
 * The suite's control vocabulary as components: pill text buttons, circular
 * glyph buttons (always flex-centred — the rule the web checks by eye is the
 * default here), and the two-press delete that replaces every confirm box.
 */
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { themed, T } from './theme';
import { Chevron } from './components/Chevron';

/**
 * Every control in the top bar is this tall, and the square ones this wide.
 *
 * The suite says so in one rule over three selectors — `.backbtn, .titlebtn,
 * .usermenu .who { height: 32px }`, with `width: 32px` on the two round ones —
 * so back, the collapse-all, the picker ring and the username pill are one
 * scale, not four. Ours had drifted to three heights (back 28, collapse-all
 * 26, ring 32, pill 28) and Sean saw the row as ragged. The ring's own comment
 * already claimed "ring and pill both 32 high, the suite's bar height" while
 * the pill beside it was 28 — the comment was right and the code was not.
 *
 * It is exported, and the header's controls are components rather than
 * per-screen styles, so the next screen cannot quietly pick a fourth number.
 */
export const TOPBAR_CTRL = 32;

/**
 * The icons that are GEOMETRY rather than typography, drawn instead of typed.
 *
 * Measured on the rendered page: every text glyph in a CircleBtn sits LOW in
 * its circle, because the line box reserves descender space that '+' and '‹'
 * never use. '+' on the 44pt tab button was 2.56px below centre, the nav '‹'
 * 1.74px, the pager arrows 1.6–1.9px. Flexbox was centring the line box
 * perfectly the whole time — measuring THAT reported 0.01px and proved
 * nothing, which is why this went unnoticed.
 *
 * A stroked path has no bearings and no baseline: its ink is centred because
 * the coordinates say so. These four are the ones that were off by more than
 * a pixel plus '−', which is '+' minus a stroke and would look wrong beside a
 * drawn one. Everything else (✎ ⧉ ☑ ✓ ×) measured under a pixel and stays
 * text — drawing a pencil would be worse than the 0.75px it is off by.
 */
const DRAWN: Record<string, (c: number) => string[]> = {
  '+': (c) => [`${c * 0.18},${c / 2} ${c * 0.82},${c / 2}`, `${c / 2},${c * 0.18} ${c / 2},${c * 0.82}`],
  '−': (c) => [`${c * 0.18},${c / 2} ${c * 0.82},${c / 2}`],
  '‹': (c) => [`${c * 0.71},${c * 0.15} ${c * 0.29},${c / 2} ${c * 0.71},${c * 0.85}`],
  '›': (c) => [`${c * 0.29},${c * 0.15} ${c * 0.71},${c / 2} ${c * 0.29},${c * 0.85}`],
};

/** `size` is the CANVAS, not the button: a caller that is not a CircleBtn
 *  (the tab bar's big '+') has its own idea of how large the mark should be. */
export function DrawnGlyph({ glyph, size, color }: { glyph: string; size: number; color: string }) {
  const c = size;
  return (
    <Svg width={c} height={c} viewBox={`0 0 ${c} ${c}`}>
      {DRAWN[glyph]!(c).map((points) => (
        <Polyline
          key={points}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={c * 0.16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/**
 * A glyph button never steals focus: preventing mousedown's default keeps a
 * focused field (inline rename, note body) from blurring under it — the blur
 * handler would unmount the button mid-press and the tap would die. Touch has
 * no such default to prevent, so callers arm onPressIn instead (wired to
 * touchstart below, which fires before any blur).
 */
const noSteal =
  Platform.OS === 'web' ? ({ onMouseDown: (e: { preventDefault(): void }) => e.preventDefault() } as object) : null;

/**
 * What hitSlop was supposed to do, on the one platform that ignores it.
 *
 * react-native-web does not implement hitSlop, so a control there is exactly
 * as big as it is drawn, while the same control on the native builds is
 * sixteen pixels wider. Proven rather than assumed: a click five pixels
 * outside a 26px CircleBtn — plainly on the button to anyone looking — left
 * it untouched, and the same click at dead centre fired it. The platforms
 * disagreed silently, in the direction that hurts a phone in Safari.
 *
 * A transparent child, absolutely positioned past its parent's edges, is
 * clicked instead: it is INSIDE the pressable, so the press bubbles to the
 * same handler. Nothing moves — absolute children take no layout space — and
 * nothing changes colour, which matters because specs read a swatch's
 * background off the pressable itself.
 *
 * The extension matches hitSlop's 8 rather than bettering it, so web and
 * native now miss and hit in the same places. It does mean two controls ten
 * pixels apart overlap slightly at the edges; that is already true on native
 * and is the behaviour being matched.
 */
export function WebHitSlop({ slop = 8 }: { slop?: number }) {
  if (Platform.OS !== 'web') return null;
  return <View style={{ position: 'absolute', top: -slop, left: -slop, right: -slop, bottom: -slop }} />;
}

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
      {...noSteal}
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
  onPressIn,
  color = T.dim,
  size = 26,
  bg,
  active = false,
  testID,
  label,
}: {
  glyph: string;
  onPress: () => void;
  onPressIn?: () => void; // fires on pointerdown, BEFORE a focused field's blur
  color?: string;
  size?: number;
  bg?: string; // filled circle (colour swatches)
  active?: boolean; // accent state for icon toggles (Completed etc.)
  testID?: string;
  /** What a screen reader says. The suite gives every icon-only button an
   *  aria-label; a glyph like '‹' read aloud is no use to anybody. */
  label?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      {...noSteal}
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onTouchStart={onPressIn}
      hitSlop={8}
      style={({ pressed }) => [
        s.circle,
        { width: size, height: size, borderRadius: size / 2 },
        bg ? { backgroundColor: bg, borderColor: bg } : null,
        active && s.circleActive,
        pressed && s.pressed,
      ]}
    >
      <WebHitSlop />
      {DRAWN[glyph] ? (
        // The canvas the Text used: fontSize was size * 0.55 at weight 700.
        <DrawnGlyph glyph={glyph} size={size * 0.55} color={active ? T.accent : color} />
      ) : (
        <Text style={{ color: active ? T.accent : color, fontSize: size * 0.55, lineHeight: size * 0.62, fontWeight: '700' }}>{glyph}</Text>
      )}
    </Pressable>
  );
}

/**
 * The header's collapse-all toggle — the double chevron, in the top bar's own
 * circle.
 *
 * Reminders, Notes, Habits and Calendar each carried a byte-identical
 * `collapseAllBtn` style and a byte-identical Pressable around it. Four copies
 * is how the row came to disagree with itself in the first place, so there is
 * one here and the screens pass a handler.
 */
export function CollapseAllBtn({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Collapse all' : 'Expand all'}
      style={s.topbarCircle}
    >
      <WebHitSlop />
      <Chevron open={open} double />
    </Pressable>
  );
}

/** Two-press delete: first press fills red (label never changes), second fires. */
export function ConfirmDelete({ onDelete, onPressIn, size = 26, testID, forceArmed = false }: { onDelete: () => void; onPressIn?: () => void; size?: number; testID?: string; forceArmed?: boolean }) {
  // forceArmed: the swipe-to-delete flow — the swipe already counted as the
  // first press, so the control renders red and fires on one tap.
  const [selfArmed, setArmed] = useState(false);
  const armed = selfArmed || forceArmed;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <Pressable
      {...noSteal}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={armed ? 'Confirm delete' : 'Delete'}
      onPressIn={onPressIn}
      onTouchStart={onPressIn}
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
      <WebHitSlop />
      <Text style={{ color: armed ? '#fff' : T.dim, fontSize: size * 0.55, lineHeight: size * 0.62, fontWeight: '700' }}>×</Text>
    </Pressable>
  );
}

/**
 * The size a picker has always LOOKED.
 *
 * Each picker draws a 16px pie inside the 32px ring chrome.tsx puts around it,
 * and relied on hitSlop for the rest. hitSlop does nothing under
 * react-native-web: a click five pixels outside the pie — still well inside
 * the ring, still plainly on the button — misses entirely, while the same
 * click at dead centre opens the menu. On the native apps hitSlop works, so
 * this was a web-only gap, on the platform Sean actually holds in Safari, on
 * the control he named.
 *
 * Giving the pressable the ring's own dimensions closes it without moving a
 * pixel: the ring is already 32x32, so the button now fills exactly what it
 * draws. hitSlop stays for native, where it still adds.
 */
export const pickHit = { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' } as const;

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={T.muted} {...props} style={[s.field, props.style]} />;
}

export function ErrorLine({ text }: { text: string }) {
  return text ? <Text style={s.error}>{text}</Text> : null;
}

export function Rule() {
  return <View style={s.rule} />;
}

const s = themed(() => StyleSheet.create({
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
  topbarCircle: {
    width: TOPBAR_CTRL,
    height: TOPBAR_CTRL,
    borderRadius: TOPBAR_CTRL / 2,
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
}));
