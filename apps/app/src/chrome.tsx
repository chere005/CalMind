/**
 * The shared chrome — the suite's rule made a component: the top bar is one
 * row, in the same place in every app: the app's name on the left; on the
 * right the screen's own controls, then the sync status dot (green online,
 * yellow offline), then the folder picker slot, then the username — whose tap
 * opens Settings. Every screen gets Settings for free.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { logout } from './api';
import { useStore } from './store';
import { themed, T } from './theme';
import { CircleBtn, Rule, TOPBAR_CTRL } from './ui';
import { Settings } from './screens/Settings';
import { SyncDot } from './components/SyncDot';
import { useNav } from './nav';
// A Modal is its own window, so an absolute `top` inside one is measured from
// the top of the SCREEN, not from where the app's content begins. Without the
// inset this menu hung level with the status bar instead of under the pill
// that opens it.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TopBar({
  title,
  controls,
  picker,
}: {
  title: string;
  controls?: React.ReactNode;
  picker?: React.ReactNode;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { session, signOut, undoLastDelete } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** What the last undo brought back, shown briefly under the bar. */
  const [undone, setUndone] = useState<string | null>(null);
  const undoTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * Where the username pill actually is on screen.
   *
   * The menu used to be `right: 16` inside its Modal — 16px from the right
   * edge of the WINDOW. The app is a 640px centred column, so on any window
   * wider than that the menu flew off to the side, nowhere near the pill that
   * opened it (Sean, on web and macOS, with a screenshot). A menu belongs
   * under its button, so the button is measured and the menu hung off it.
   */
  const pillRef = React.useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const openMenu = () => {
    // measureInWindow gives SCREEN coordinates, which is the space a Modal
    // lays out in — the same reason the inset is needed for `top`.
    //
    // Opened INSIDE the callback, not beside it: measuring is asynchronous,
    // and opening first meant the menu sometimes drew one frame before its
    // anchor existed and fell back to the window's corner. That is what made
    // the old bug look "random" — it reproduced at 1160px and not at 1440.
    const node = pillRef.current as unknown as
      { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, w, h) => { setAnchor({ x, y, w, h }); setMenuOpen(true); });
    } else {
      // No measurement available: the corner fallback is better than no menu.
      setAnchor(null);
      setMenuOpen(true);
    }
  };
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  return (
    <>
      <View style={s.topbar}>
        {/* Back sits top-LEFT, before the title, and is ALWAYS drawn — the
            suite's back_button() emits it unconditionally, wired straight to
            history.back(), with no test for whether there is anywhere to go.
            Ours was on the right and conditional, so every control in the row
            slid sideways depending on history; then it was left but invisible
            on a cold open, which left a gap where a button belongs. Pressing
            it with an empty stack pops nothing and does nothing, exactly as
            history.back() does on a fresh page. */}
        <View style={s.hleft}>
          <CircleBtn testID="nav-back" glyph="‹" size={TOPBAR_CTRL} label="Back" onPress={nav.goBack} />
          <Text style={s.appname} numberOfLines={1}>{title}</Text>
        </View>
        <View style={s.right}>
          {controls}
          {picker && <View style={s.pickerRing}>{picker}</View>}
          {/* The suite's `.who` is a <button>; ours was a bare Pressable, and
              react-native-web only emits role="button" when it is asked to —
              so the one way into Settings announced itself as nothing at all.
              The label names what it opens, since "sean ▾" read aloud does
              not say that a menu is behind it. */}
          <Pressable
            ref={pillRef}
            onPress={openMenu}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${session?.username ?? ''} — account menu`}
            style={s.whoPill}
          >
            <Text style={s.who}>{session?.username}</Text>
            <Text style={s.whoCaret}>▾</Text>
          </Pressable>
          {/* THE STATUS DOT, which this file's own header has described all
              along while nothing drew it: `syncState` was destructured here
              and never used. So the app's one honest signal that a note did
              not save — the red dot for a refused record — lived only inside
              Settings, which you have to go and open. A warning you have to
              go looking for is most of the way to no warning.

              Same component and same rule as Settings and the note editor,
              so the three cannot drift. It carries the full sentence as its
              accessibility label; the colour alone tells a screen reader, and
              a colour-blind reader, nothing.

              LAST in the row, on Sean's word (2026-08-12): far right of the
              top bar, outside the account pill rather than between the picker
              and it. */}
          <SyncDot testID="topbar-sync" />
        </View>
      </View>
      {/* The gap AFTER the divider belongs here, not to each screen.
          Every tab had invented its own: 1px on Calendar (pagerRow), 8 on
          Notes, 12 on Habits, 16 on Reminders and Add — four values across
          five tabs, which is what Sean saw switching between them. Each
          screen's own paddingTop is 0 now, so this is the only thing that
          sets it.

          10, because Sean chose it looking at the built app: "habits looks
          almost correct, i'd go with 10px" (Habits was the 12). The suite's
          own number is 8 — `header { …; margin-bottom: 0.5rem }` in
          lib/chrome.php, at its 16px root — so this is a deliberate
          departure from the spec, not an oversight in reading it. */}
      <View testID="top-rule" style={s.ruleWrap}><Rule /></View>
      {undone !== null && (
        <Text testID="undo-note" style={s.undoNote}>
          {undone === 'Nothing to undo' ? undone : `Restored “${undone}”`}
        </Text>
      )}
      {/* The username's own dropdown — the same two rows in every app. */}
      {menuOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={s.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View
              style={[
                s.menu,
                anchor
                  // Right edges aligned, hanging 6 under the pill. max(8) keeps
                  // it on screen if the window is narrower than the menu.
                  ? { top: anchor.y + anchor.h + 6, left: Math.max(8, anchor.x + anchor.w - MENU_W), width: MENU_W }
                  : { top: insets.top + 52, right: 16 },
              ]}
            >
              <Pressable style={s.menuRow} onPress={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                <Text style={s.menuText}>Settings</Text>
              </Pressable>
              {/* Sean, 2026-08-11. It says what came BACK rather than just
                  closing: the deleted thing is by definition not on screen,
                  so a silent restore looks like nothing happened — and if it
                  restored something older than he expected, being told which
                  is how he finds that out. */}
              <Pressable
                testID="undo-delete"
                style={s.menuRow}
                onPress={() => {
                  const back = undoLastDelete();
                  setMenuOpen(false);
                  setUndone(back ?? 'Nothing to undo');
                  clearTimeout(undoTimer.current);
                  undoTimer.current = setTimeout(() => setUndone(null), 2600);
                }}
              >
                <Text style={s.menuText}>Undo last delete</Text>
              </Pressable>
              <Pressable
                style={s.menuRow}
                onPress={async () => {
                  setMenuOpen(false);
                  if (session) void logout(session);
                  await signOut();
                }}
              >
                <Text style={s.menuText}>Log out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/** The menu's width, needed up front to right-align it against the pill. */
const MENU_W = 180;

const s = themed(() => StyleSheet.create({
  ruleWrap: { marginBottom: 10 },
  topbar: {
    height: 32,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The title is what gives at a narrow width — it can ellipsize; the back
  // control, the picker and the username cannot shrink without becoming
  // unhittable.
  appname: { color: T.text, fontSize: 24, fontWeight: '800', flexShrink: 1 },
  hleft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  status: { width: 8, height: 8, borderRadius: 4 },
  tip: { position: 'absolute', top: 14, right: 0, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, zIndex: 40, minWidth: 150 },
  tipText: { color: T.text, fontSize: 12 },
  // Prod's header controls: the picker sits in a dark ringed circle, the
  // username in a thin outlined pill — header nav .who, carried over.
  // One row, one scale — every control is TOPBAR_CTRL high, the suite's
  // `.backbtn, .titlebtn, .usermenu .who { height: 32px }`.
  // Icon-sized, ringed, with air between the pie and its border (Sean).
  pickerRing: { width: TOPBAR_CTRL, height: TOPBAR_CTRL, borderRadius: TOPBAR_CTRL / 2, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  whoPill: { height: TOPBAR_CTRL, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 13 },
  who: { color: T.accent, fontSize: 14, fontWeight: '600' },
  whoCaret: { color: T.accent, fontSize: 10, opacity: 0.8 },
  menuBackdrop: { flex: 1, backgroundColor: '#0007' },
  menu: {
    position: 'absolute',
    // top/left are set inline, measured off the username pill.
    minWidth: MENU_W,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 12,
    paddingVertical: 4,
  },
  undoNote: { color: T.muted, fontSize: 12, marginHorizontal: 16, marginTop: -4, marginBottom: 6 },
  menuRow: { paddingHorizontal: 16, paddingVertical: 11 },
  menuText: { color: T.text, fontSize: 15 },
}));
