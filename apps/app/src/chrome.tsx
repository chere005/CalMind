/**
 * The shared chrome — the suite's rule made a component: the top bar is one
 * row, in the same place in every app: the app's name on the left; on the
 * right the screen's own controls, then the sync status dot (green online,
 * yellow offline), then the folder picker slot, then the username — whose tap
 * opens Settings. Every screen gets Settings for free.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from './store';
import { T } from './theme';
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
  const { session, syncState } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <View style={s.topbar}>
        <Text style={s.appname}>{title}</Text>
        <View style={s.right}>
          {controls}
          <View style={[s.status, { backgroundColor: syncState === 'offline' ? T.gold : T.accent }]} />
          {picker}
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={8}>
            <Text style={s.who}>{session?.username}</Text>
          </Pressable>
        </View>
      </View>
      <Rule />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

const s = StyleSheet.create({
  topbar: {
    height: 32,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { width: 8, height: 8, borderRadius: 4 },
  who: { color: T.accent, fontSize: 14, fontWeight: '600' },
});
