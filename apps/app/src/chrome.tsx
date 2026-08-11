/**
 * The shared chrome — the suite's rule made a component: the top bar is one
 * row, in the same place in every app: the app's name on the left; on the
 * right the screen's own controls, then the sync status dot (green online,
 * yellow offline), then the folder picker slot, then the username — whose tap
 * opens Settings. Every screen gets Settings for free.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { logout } from './api';
import { useStore } from './store';
import { themed, T } from './theme';
import { CircleBtn, Rule, TOPBAR_CTRL } from './ui';
import { Settings } from './screens/Settings';
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
  const { session, syncState, signOut } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${session?.username ?? ''} — account menu`}
            style={s.whoPill}
          >
            <Text style={s.who}>{session?.username}</Text>
            <Text style={s.whoCaret}>▾</Text>
          </Pressable>

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
      {/* The username's own dropdown — the same two rows in every app. */}
      {menuOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={s.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={[s.menu, { top: insets.top + 52 }]}>
              <Pressable style={s.menuRow} onPress={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                <Text style={s.menuText}>Settings</Text>
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
    // top is set inline: 52 below where the app's content actually starts.
    top: 52,
    right: 16,
    minWidth: 160,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 12,
    paddingVertical: 4,
  },
  menuRow: { paddingHorizontal: 16, paddingVertical: 11 },
  menuText: { color: T.text, fontSize: 15 },
}));
