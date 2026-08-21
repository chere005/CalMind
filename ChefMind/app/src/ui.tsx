/**
 * The suite's control vocabulary as components: pill text buttons, circular
 * glyph buttons (always flex-centred — the rule the web checks by eye is the
 * default here), and the two-press delete that replaces every confirm box.
 */
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, type ScrollViewProps, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
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

/** The sync dot's diameter, read by both the dot itself and the maths below. */
export const SYNC_DOT = 8;

/**
 * The top bar's own geometry, and where the status dot lands inside it.
 *
 * A screen that HIDES the top bar and draws its own dot — the note editor —
 * has to put it in the same place, or the dot jumps the moment you open a
 * note. It did: 28 in the bar, 20 in the editor, eight pixels up, which is
 * exactly the sort of shift you see without being able to name. The editor
 * pins its dot to TOPBAR_DOT_TOP now rather than to a number of its own, so
 * moving the bar moves both.
 */
export const TOPBAR_MARGIN_TOP = 16;
export const TOPBAR_DOT_TOP = TOPBAR_MARGIN_TOP + (TOPBAR_CTRL - SYNC_DOT) / 2;

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
  // Smaller and box-centred, on Sean's word (2026-08-12): the old chevron
  // spanned 0.15–0.85 of the canvas, which is 70% of the circle in a mark
  // only 42% wide — tall, thin and reading as slightly off. 0.24–0.76 by
  // 0.34–0.66 is the same shape at 52%, and its bounding box centres on 0.5
  // in both directions rather than merely its apex.
  '‹': (c) => [`${c * 0.66},${c * 0.24} ${c * 0.34},${c / 2} ${c * 0.66},${c * 0.76}`],
  '›': (c) => [`${c * 0.34},${c * 0.24} ${c * 0.66},${c / 2} ${c * 0.34},${c * 0.76}`],
  // The close ×, drawn for the same reason as the chevrons: the TEXT glyph
  // sits above centre on iOS (its box is baseline-placed, not box-centred),
  // and every remove/dismiss in the app wears it. Two diagonals of the +'s
  // weight, spanning 0.30–0.70 so the diagonal reads as wide as the + does.
  '×': (c) => [`${c * 0.3},${c * 0.3} ${c * 0.7},${c * 0.7}`, `${c * 0.7},${c * 0.3} ${c * 0.3},${c * 0.7}`],
  /**
   * The reminder row's Copy, and the first entry here for a reason other than
   * centring: there is no monochrome text glyph for a clipboard. The nearest
   * ones (⎘ ❐ ❏) are all two overlapping squares, which is exactly what ⧉
   * Duplicate already is two buttons along — so the drawn shape is what keeps
   * the two apart. It shipped as 📋 first and Sean asked for monochrome
   * (2026-08-20).
   *
   * A board and its clip, two closed rectangles, the clip standing ON the
   * board's top edge. The keys are semantic rather than a character because
   * nothing should ever fall back to typing this one.
   */
  clipboard: (c) => [
    `${c * 0.18},${c * 0.26} ${c * 0.82},${c * 0.26} ${c * 0.82},${c * 0.92} ${c * 0.18},${c * 0.92} ${c * 0.18},${c * 0.26}`,
    `${c * 0.34},${c * 0.26} ${c * 0.34},${c * 0.13} ${c * 0.66},${c * 0.13} ${c * 0.66},${c * 0.26}`,
  ],
};

/**
 * Stroke weight, where 0.16 is wrong for the shape.
 *
 * 0.16 is a stroke for marks made of two or three lines — a +, an ×. The
 * clipboard is an OUTLINE, and an outline at 0.16 on a 13px canvas leaves
 * about five pixels of interior: the clip comes out shorter than the line
 * drawing it and the whole thing reads as a blob. Measured on the render,
 * not guessed at.
 */
const STROKE: Record<string, number> = { clipboard: 0.11 };

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
          strokeWidth={c * (STROKE[glyph] ?? 0.16)}
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
/**
 * A ScrollView that does not scroll when there is nothing to scroll.
 *
 * Sean, 2026-08-12: "don't scroll if there's nothing to scroll on all of the
 * app". On iOS a ScrollView rubber-bands whether or not its content overflows,
 * so a half-empty screen still slides under the thumb and springs back — which
 * reads as the app being loose rather than as a feature.
 *
 * `alwaysBounceVertical={false}` is the exact rule: no bounce when everything
 * fits, ordinary scrolling AND ordinary bounce the moment it does not.
 * `bounces={false}` would have been the blunter version and is wrong — it
 * would kill the bounce on a long list too, where it is the platform telling
 * you that you have reached the end.
 *
 * It lives here, wrapped, rather than as a prop added to 21 call sites, for
 * the reason the collapse-all button was extracted after existing four times:
 * the twenty-second ScrollView would not have it. Props spread AFTER the
 * defaults, so any screen that needs the other behaviour can still say so.
 */
export function Scroll(props: ScrollViewProps) {
  return <ScrollView alwaysBounceVertical={false} alwaysBounceHorizontal={false} {...props} />;
}

export function WebHitSlop({ slop = 8 }: { slop?: number }) {
  if (Platform.OS !== 'web') return null;
  return <View style={{ position: 'absolute', top: -slop, left: -slop, right: -slop, bottom: -slop }} />;
}

export function Pill({
  label,
  onPress,
  primary = false,
  disabled = false,
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  /**
   * A shorter pill — 26 drawn instead of 32, WITHOUT a smaller tap target.
   *
   * The calendar's "+ Add", and it took three rounds to land, which is why the
   * whole path is written down rather than just the answer. Sean, 2026-08-13:
   *
   *   1. "add button shouldn't be quite so tall"  → 26, and top-aligned with
   *      the date, because he had also asked for aligned tops;
   *   2. "looks terrible.. make the add button the same height and center
   *      aligned vertically with the section" → read as "the same height as
   *      every other Pill", so back to 32, centred. Both were changed at once,
   *      which is the mistake: it threw away the height with the alignment;
   *   3. "the add button should be less tall, it looks bad still" → 26 again,
   *      centred. It was the TOP ALIGNMENT he disliked in (1), not the height.
   *
   * The lesson for the next reader is about the second step: when two things
   * change together and the result is rejected, reverting both discards the
   * half that was right. "The same height" most likely meant the same height as
   * the section row it sits in — which is this, not 32.
   *
   * THE SLOP IS THE POINT, and it is measured rather than reasoned. Losing 6pt
   * of drawn height would cost 6pt of real TARGET on the web, where hitSlop is
   * a no-op — the trap CLAUDE.md keeps and the reason WebHitSlop exists. Probed
   * with elementFromPoint walking out from the drawn edge: at slop 3 the target
   * came back 30 and at slop 4 it came back 31, because the box lands on a half
   * pixel. At 5 it measures back past the 32 a Pill has always been.
   */
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      // A Pill IS a button, and react-native-web only says so when asked.
      // Without this it renders a bare div: invisible to a screen reader, and
      // invisible to every "did the tap land on a control" rule in this app —
      // which is how Save inside the habit editor came to switch edit mode off
      // behind the sheet.
      //
      // Adding it was reverted twice because copymd.spec then failed. It was
      // never this line's fault: that spec decided whether signup had worked
      // the instant after clicking, while the request was still in flight, and
      // took the "name taken" branch on a form that was about to be replaced.
      // The race passed for as long as a bare div let Playwright click a
      // control it should have refused; the role only made it visible.
      accessibilityRole="button"
      {...noSteal}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={compact ? 5 : 0}
      style={({ pressed }) => [s.pill, compact && s.pillCompact, primary && s.pillPrimary, pressed && s.pressed, disabled && s.disabled]}
    >
      {compact && <WebHitSlop slop={5} />}
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

/**
 * The date control everywhere a date is PICKED rather than typed — Sean,
 * 2026-08-20: "the m/d shouldn't look like a text input field here or in
 * the add app.. (or anywhere) it should be a circle icon with a calendar."
 * A ringed circle wearing the calendar glyph, the chosen day named beside
 * it when there is one; the caller opens DayPick. One component so the
 * next screen cannot quietly draw a fourth date box.
 */
export function DayPickBtn({ value, onPress, testID }: {
  value: string | null;
  onPress: () => void;
  testID?: string;
}) {
  const label = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ? `Date: ${label}` : 'Pick a date'}
      onPress={onPress}
      hitSlop={6}
      style={s.dayPickWrap}
    >
      <WebHitSlop slop={6} />
      <View style={s.dayPickCircle}>
        {/* The kind vocabulary's calendar, drawn inline rather than imported —
            KindIcons imports nothing of ui's, and keeping it that way means
            neither file can grow a cycle. Same 24-grid shape. */}
        <Svg width={15} height={15} viewBox="0 0 24 24">
          <Polyline points="3,10 21,10" stroke={T.dim} strokeWidth={2} />
          <Polyline points="8,3 8,7" stroke={T.dim} strokeWidth={2} strokeLinecap="round" />
          <Polyline points="16,3 16,7" stroke={T.dim} strokeWidth={2} strokeLinecap="round" />
          <Polyline
            points="3,5 21,5 21,21 3,21 3,5"
            stroke={T.dim}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      {label && <Text style={s.dayPickLabel}>{label}</Text>}
    </Pressable>
  );
}

/**
 * The labeled two-press Delete the note editor has always worn — a word in
 * a pill, armed red for 2.5s — promoted here so the item sheet can wear THE
 * SAME control (Sean, 2026-08-20: "make the delete button on that edit
 * screen match the delete button from the notes screen"). ConfirmDelete
 * stays the row-sized ×; this is the full-screen surfaces' one.
 */
export function DeletePill({ onDelete, testID }: { onDelete: () => void; testID?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={armed ? 'Confirm delete' : 'Delete'}
      onPress={() => {
        clearTimeout(timer.current);
        if (armed) { setArmed(false); onDelete(); return; }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 2500);
      }}
    >
      <Text style={[s.delText, armed && s.delArmed]}>Delete</Text>
    </Pressable>
  );
}

const s = themed(() => StyleSheet.create({
  dayPickWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayPickCircle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  dayPickLabel: { color: T.text, fontSize: 15, fontWeight: '600' },
  // The note editor's numbers, verbatim — one source now (DeletePill).
  delText: { color: T.dim, fontSize: 15, borderWidth: 1, borderColor: T.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, overflow: 'hidden' },
  delArmed: { color: '#fff', backgroundColor: T.danger, borderColor: T.danger },
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
  // 26 drawn; the 5pt of slop above and below puts the target back past 32.
  // 26 drawn, and SETTLED there: "the add button looks fine now" (Sean,
  // 2026-08-13) after 32 → 26 → 32 → 26. A 22 was briefly tried on a misread
  // instruction and reverted unshipped.
  pillCompact: { height: 26, paddingVertical: 3 },
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
