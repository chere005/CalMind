/**
 * The suite's icon-only bottom tab bar: Reminders · Calendar · Add · Notes ·
 * Habits, the middle + a raised accent circle. The active tab wears a fixed
 * circle behind its icon — a highlight that can never move the tabs' spacing.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { T } from './theme';

export type Tab = 'reminders' | 'calendar' | 'add' | 'notes' | 'habits';

const TABS: { key: Tab; icon: string }[] = [
  { key: 'reminders', icon: '☑' },
  { key: 'calendar', icon: '📅' },
  { key: 'add', icon: '+' },
  { key: 'notes', icon: '📝' },
  { key: 'habits', icon: '🔥' },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View style={s.bar}>
      {TABS.map(({ key, icon }) =>
        key === 'add' ? (
          <Pressable key={key} onPress={() => onTab(key)} style={s.addBtn} hitSlop={6}>
            <Text style={s.addGlyph}>+</Text>
          </Pressable>
        ) : (
          <Pressable key={key} onPress={() => onTab(key)} style={s.tab} hitSlop={6}>
            <View style={[s.halo, tab === key && s.haloOn]}>
              <Text style={s.icon}>{icon}</Text>
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: T.line,
    backgroundColor: T.bg,
    paddingVertical: 6,
  },
  tab: { alignItems: 'center', justifyContent: 'center' },
  halo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  haloOn: { backgroundColor: T.surface2 },
  icon: { fontSize: 18 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyph: { color: T.accentInk, fontSize: 26, fontWeight: '700', lineHeight: 30 },
});
