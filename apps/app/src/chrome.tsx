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
import { Rule } from './ui';
import { Settings } from './screens/Settings';

export function TopBar({
  title,
  controls,
  picker,
}: {
  title: string;
  controls?: React.ReactNode;
  picker?: React.ReactNode;
}) {
  const { session, syncState, signOut } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <View style={s.topbar}>
        <Text style={s.appname}>{title}</Text>
        <View style={s.right}>
          {controls}
          {picker && <View style={s.pickerRing}>{picker}</View>}
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={s.whoPill}>
            <Text style={s.who}>{session?.username}</Text>
            <Text style={s.whoCaret}>▾</Text>
          </Pressable>
          <View style={[s.status, { backgroundColor: syncState === 'offline' ? T.gold : T.accent }]} />
        </View>
      </View>
      <Rule />
      {/* The username's own dropdown — the same two rows in every app. */}
      {menuOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={s.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={s.menu}>
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
  topbar: {
    height: 32,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appname: { color: T.text, fontSize: 24, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { width: 8, height: 8, borderRadius: 4 },
  // Prod's header controls: the picker sits in a dark ringed circle, the
  // username in a thin outlined pill — header nav .who, carried over.
  // One row, one scale: ring and pill both 32 high, the suite's bar height.
  pickerRing: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  whoPill: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 12 },
  who: { color: T.accent, fontSize: 15, fontWeight: '600' },
  whoCaret: { color: T.accent, fontSize: 10, opacity: 0.8 },
  menuBackdrop: { flex: 1, backgroundColor: '#0007' },
  menu: {
    position: 'absolute',
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
