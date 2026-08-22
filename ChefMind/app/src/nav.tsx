/**
 * The icon-only bottom tab bar: Recipes · Add · Shopping, the
 * middle + a raised accent circle. The active tab wears a fixed circle behind its icon — a
 * highlight that can never move the tabs' spacing. The bar's contents cap at
 * the same width as the page column, so on a wide window the tabs stay under
 * the content instead of flying to the edges.
 *
 * Upstream this has five: the calendar and habits sit either side of the +.
 * ChefMind keeps the shopping list and nothing else — Sean, 2026-08-21:
 * "remove reminders from ChefMind". A cooking app that also held a general
 * reminders list was holding CalMind's job. The + keeps the middle it has
 * everywhere else, so the bar is now three: Recipes, +, Shopping.
 *
 * The `reminder` RECORD type stays, and is not a leftover: the shopping rows
 * are reminder records in a folder of their own. What went is the screen.
 */
import { Pressable, StyleSheet, View , Platform } from 'react-native';
import { themed, T, PAGE_MAX_WIDTH } from './theme';
import { BasketIcon, PageIcon } from './components/KindIcons';
import { DrawnGlyph } from './ui';

export type Tab = 'notes' | 'add' | 'shopping';

// Emoji presentation (VS16) so every glyph draws in colour — the plain-text
// checkbox was near-invisible on the dark bar.
// Each tab says its own name to a screen reader — the suite labels every
// icon-only control, and a bare glyph read aloud is no use to anybody.
// 'notes' keeps its key and gains a NAME: Sean, 2026-08-21 — "rename notes to
// recipes". The record type, the folder's `app` and every stored preference
// still say 'notes', because renaming those would be a migration of his data
// to change a label.
const TAB_LABEL: Record<Tab, string> = {
  notes: 'Recipes', add: 'Add', shopping: 'Shopping',
};

// No icon field: the bar draws its own SVG glyphs by key (see below), and
// these carried emoji that nothing has rendered since. Removed 2026-08-12 —
// a list of icons beside a bar that draws none is a thing to be misread.
const TABS: { key: Tab }[] = [
  { key: 'notes' },
  { key: 'add' },
  { key: 'shopping' },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View style={s.barOuter}>
      <View style={s.bar}>
        {TABS.map(({ key }) =>
          key === 'add' ? (
            <Pressable key={key} testID={`tab-${key}`} accessibilityRole="button" accessibilityLabel={TAB_LABEL[key]} onPress={() => onTab(key)} style={s.addBtn} hitSlop={6}>
              {/* Drawn, not typed. As a Text this '+' sat 2.56px BELOW the
                  circle's centre — the line box reserves descender space a
                  '+' never uses — which on a 44pt accent button is the most
                  visible instance of it in the app. A stroked cross has no
                  baseline to be low against. */}
              <DrawnGlyph glyph="+" size={26} color={T.accentInk} />
            </Pressable>
          ) : (
            <Pressable key={key} testID={`tab-${key}`} accessibilityRole="button" accessibilityLabel={TAB_LABEL[key]} onPress={() => onTab(key)} style={s.tab} hitSlop={6}>
              <View style={[s.halo, tab === key && s.haloOn]}>
                {/* One SVG language for the whole bar — no emoji. */}
                {key === 'notes' && <PageIcon color={tab === key ? T.text : T.dim} />}
                {key === 'shopping' && <BasketIcon color={tab === key ? T.text : T.dim} />}
              </View>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
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
    // Web spreads 640px wide; the suite's bar keeps its icons closer.
    // Four, not five, so the web bar narrows with them — 420px of
    // space-around around four icons parks them at the edges of a gap nothing
    // fills.
    ...(Platform.OS === 'web' ? { alignSelf: 'center' as const, width: 340, maxWidth: '100%' as const } : null),
    paddingVertical: 6,
  },
  tab: { alignItems: 'center', justifyContent: 'center' },
  halo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  haloOn: { backgroundColor: T.surface2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * The tiny tab-history context: App owns the stack, the TopBar's back
 * control pops it — Sean's always-goes-back button, and the remembered tab
 * a refresh restores.
 */
import { createContext, useContext } from 'react';
export const NavCtx = createContext<{ canBack: boolean; goBack: () => void; openSearch: () => void }>({
  canBack: false,
  goBack: () => {},
  openSearch: () => {},
});
export const useNav = () => useContext(NavCtx);
