/**
 * The shared chrome — the suite's rule made a component: the top bar is one
 * row, in the same place in every app: the app's name on the left; on the
 * right the screen's own controls, then the sync status dot (green online,
 * yellow offline), then the folder picker slot, then the username — whose tap
 * opens Settings. Every screen gets Settings for free.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useStore } from './store';
import { themed, T } from './theme';
import { CircleBtn, Rule, TOPBAR_CTRL, TOPBAR_MARGIN_TOP } from './ui';
import { Settings } from './screens/Settings';
import { useToast } from './components/Toast';
import { useNav } from './nav';
// A Modal is its own window, so an absolute `top` inside one is measured from
// the top of the SCREEN, not from where the app's content begins. Without the
// inset this menu hung level with the status bar instead of under the pill
// that opens it.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TopBar({
  title,
  controls,
  completed,
  copyMarkdown,
  picker,
}: {
  title: string;
  controls?: React.ReactNode;
  /**
   * What this screen would put on the clipboard as Markdown, or nothing if it
   * has none. Sean, 2026-08-12: every tab, every user — it used to be one
   * button on Reminders, visible only to him.
   *
   * A FUNCTION rather than a string: building the markdown means walking the
   * whole screen's rows, and doing that on every render of every top bar to
   * fill a menu row nobody has opened is work for nothing.
   */
  copyMarkdown?: () => string;
  /** The show-completed toggle, between collapse-all and the folder picker.
   *  Sean's placement, 2026-08-12: it used to sit in a toolbar row under the
   *  divider, which is a second row of controls for one button. */
  completed?: React.ReactNode;
  picker?: React.ReactNode;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { undoLastDelete, persistFailed } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * What just happened, said in a popup in the middle of the screen.
   *
   * It used to be a `<Text>` under the bar, which Sean named exactly right —
   * "text that randomly inserts itself", 2026-08-12. It was a laid-out child,
   * so it pushed the whole list down when it appeared and pulled it back up
   * two seconds later: copying something moved the thing you were reading.
   * See components/Toast for why the host is at the root rather than here.
   */
  const toast = useToast();
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
  // One rule, one place: the dot, Settings, the note editor and this border
  // all read the same function.
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
          {/* Completed FIRST, then collapse-all — Sean swapped them
              2026-08-12, having seen the two side by side. */}
          {completed}
          {controls}
          {picker && <View style={s.pickerRing}>{picker}</View>}
          {/* Search, to the left of the username and the right of the folder
              picker — Sean's placement, 2026-08-19. One screen for all
              three kinds, so it lives in the shared bar, not on a tab. */}
          <CircleBtn testID="topbar-search" glyph="🔍" size={TOPBAR_CTRL} label="Search" onPress={nav.openSearch} />
          {/* The account button, and the STATUS INDICATOR in one control.
              Sean, 2026-08-12: same size as every other button, the
              username's first letter as its icon, and "the color of the
              button border is the status indicator, so the status indicator
              can be removed".

              That is a real simplification rather than a saving of pixels:
              the dot had to live somewhere, and it had been moved twice in a
              day — between the picker and the pill, then past it, then held
              still against the note editor's copy. A border has no position
              of its own to get wrong.

              */}
          <Pressable
            ref={pillRef}
            testID="topbar-menu"
            onPress={openMenu}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={persistFailed ? 'Menu. This device cannot save its copy.' : 'Menu'}
            style={[s.whoBtn, persistFailed && s.whoBtnTrouble]}
          >
            {/* Three lines, and nothing else.
                Upstream this circle is the account: its BORDER carries the
                sync state (green online, yellow offline) and its letter is the
                username's initial. Neither says anything here — there is no
                server to be online with and no account to be the initial of —
                so a green ring would be a signal that means nothing and an "L"
                would be an answer to a question nobody asked. It is the menu
                button it actually is. */}
            {/* The ring is gone, but the ONE failure this build can actually
                have must not go with it: a device that cannot write its own
                copy works perfectly all day and loses the day on relaunch.
                The lines go red and the label says so. */}
            <View style={s.burger}>
              <View style={[s.burgerLine, persistFailed && s.burgerLineTrouble]} />
              <View style={[s.burgerLine, persistFailed && s.burgerLineTrouble]} />
              <View style={[s.burgerLine, persistFailed && s.burgerLineTrouble]} />
            </View>
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
              {copyMarkdown && (
                <Pressable
                  testID="menu-copymd"
                  style={s.menuRow}
                  onPress={() => {
                    setMenuOpen(false);
                    // Say something either way. A refusal — a browser that
                    // will not hand the clipboard to a page it thinks is
                    // unfocused — used to be swallowed whole, and a button
                    // with no answer is a button you press twice.
                    Clipboard.setStringAsync(copyMarkdown())
                      .then(() => toast('Copied as Markdown'))
                      .catch(() => toast('Could not copy'));
                  }}
                >
                  <Text style={s.menuText}>Copy as Markdown</Text>
                </Pressable>
              )}
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
                  // Only a RESTORE gets the quotes — the other messages are
                  // whole sentences of their own.
                  toast(back === null ? 'Nothing to undo' : `Restored “${back}”`, 2600);
                }}
              >
                <Text style={s.menuText}>Undo last delete</Text>
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
    height: TOPBAR_CTRL,
    marginTop: TOPBAR_MARGIN_TOP,
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
  // 8 between every button, Sean's number. It was 10 here with a further 4
  // either side of the picker, so the row had three different gaps in it.
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  status: { width: 8, height: 8, borderRadius: 4 },
  tip: { position: 'absolute', top: 14, right: 0, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, zIndex: 40, minWidth: 150 },
  tipText: { color: T.text, fontSize: 12 },
  // Prod's header controls: the picker sits in a dark ringed circle, the
  // username in a thin outlined pill — header nav .who, carried over.
  // One row, one scale — every control is TOPBAR_CTRL high, the suite's
  // `.backbtn, .titlebtn, .usermenu .who { height: 32px }`.
  // Icon-sized, ringed, with air between the pie and its border (Sean).
  pickerRing: { width: TOPBAR_CTRL, height: TOPBAR_CTRL, borderRadius: TOPBAR_CTRL / 2, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  // The same circle as every other control in the row, and a plain one:
  // upstream its border was the sync status, which this build does not have.
  whoBtn: {
    width: TOPBAR_CTRL, height: TOPBAR_CTRL, borderRadius: TOPBAR_CTRL / 2,
    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  burger: { width: 15, height: 11, justifyContent: 'space-between' },
  burgerLine: { height: 1.5, borderRadius: 1, backgroundColor: T.dim },
  whoBtnTrouble: { borderColor: T.danger },
  burgerLineTrouble: { backgroundColor: T.danger },
  // Out of the flex flow entirely: the button is TOPBAR_CTRL square whether
  // or not anything is waiting, so a request arriving mid-session cannot
  // nudge the top bar. Overhangs the top-right corner, as a badge does.
  whoBadge: {
    position: 'absolute', top: -5, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: T.overdue,
    alignItems: 'center', justifyContent: 'center',
    // A ring in the bar's own colour, so the badge reads as ON the button
    // rather than as a loose dot behind it.
    borderWidth: 1.5, borderColor: T.bg,
  },
  whoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
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
  menuRow: { paddingHorizontal: 16, paddingVertical: 11 },
  /**
   * The Requests row's label and count, side by side — an INNER view rather
   * than flexDirection on menuRow itself.
   *
   * Putting it on menuRow re-laid-out all six rows: a Text that had been a
   * block filling the row became a flex item as wide as its words, and
   * menuanchor.spec went red at all three widths. That spec measures the "Log
   * out" TEXT as its stand-in for the menu's right edge — so a change made
   * for the badge moved the thing it measures. The menu was still anchored
   * correctly; the proxy had shifted. Scoped here, no other row is touched.
   */
  menuRowInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuText: { color: T.text, fontSize: 15 },
  menuBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: T.overdue, alignItems: 'center', justifyContent: 'center',
  },
}));
