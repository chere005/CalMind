/**
 * The shared chrome — the suite's rule made a component: the top bar is one
 * row, in the same place in every app, with the app's name on the left and,
 * on the right, the app's own controls, then the sync state, then the
 * username — whose tap opens Settings. Every screen gets Settings for free.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from './store';
import { T } from './theme';
import { Rule } from './ui';
import { Settings } from './screens/Settings';

export function TopBar({ title, controls }: { title: string; controls?: React.ReactNode }) {
  const { session, syncState } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <View style={s.topbar}>
        <Text style={s.appname}>{title}</Text>
        <View style={s.right}>
          {controls}
          <Text style={s.syncdot}>{syncState === 'syncing' ? '↻' : syncState === 'offline' ? '⌁ offline' : ''}</Text>
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
  syncdot: { color: T.muted, fontSize: 12 },
  who: { color: T.accent, fontSize: 14, fontWeight: '600' },
});
