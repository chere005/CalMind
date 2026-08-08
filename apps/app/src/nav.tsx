/**
 * The suite's icon-only bottom tab bar: Reminders · Calendar · Add · Notes ·
 * Habits, the middle + a raised accent circle. The active tab wears a fixed
 * circle behind its icon — a highlight that can never move the tabs' spacing.
 * The bar's contents cap at the same width as the page column, so on a wide
 * window the five tabs stay under the content instead of flying to the edges.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { T, PAGE_MAX_WIDTH } from './theme';
import { CalendarIcon, FlameIcon, PageIcon, TickCircleIcon } from './components/KindIcons';

export type Tab = 'reminders' | 'calendar' | 'add' | 'notes' | 'habits';

// Emoji presentation (VS16) so every glyph draws in colour — the plain-text
// checkbox was near-invisible on the dark bar.
const TABS: { key: Tab; icon: string }[] = [
  { key: 'reminders', icon: '✅' },
  { key: 'calendar', icon: '📅' },
  { key: 'add', icon: '+' },
  { key: 'notes', icon: '📝' },
  { key: 'habits', icon: '🔥' },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View style={s.barOuter}>
      <View style={s.bar}>
        {TABS.map(({ key, icon }) =>
          key === 'add' ? (
            <Pressable key={key} testID={`tab-${key}`} onPress={() => onTab(key)} style={s.addBtn} hitSlop={6}>
              <Text style={s.addGlyph}>+</Text>
            </Pressable>
          ) : (
            <Pressable key={key} testID={`tab-${key}`} onPress={() => onTab(key)} style={s.tab} hitSlop={6}>
              <View style={[s.halo, tab === key && s.haloOn]}>
                {/* One SVG language for the whole bar — no emoji. */}
                {key === 'reminders' && <TickCircleIcon />}
                {key === 'calendar' && <CalendarIcon color={tab === key ? T.text : T.dim} />}
                {key === 'notes' && <PageIcon color={tab === key ? T.text : T.dim} />}
                {key === 'habits' && <FlameIcon />}
              </View>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barOuter: {
    borderTopWidth: 1,
    borderTopColor: T.line,
    backgroundColor: T.bg,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: PAGE_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  tab: { alignItems: 'center', justifyContent: 'center' },
  halo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  haloOn: { backgroundColor: T.surface2 },
  icon: { fontSize: 20, lineHeight: 24 },
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
