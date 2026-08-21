/**
 * The search screen (Sean's ask, 2026-08-19): the 🔍 in the top bar opens
 * it; it always searches Reminders, Notes and Events with the best results
 * on top. Under the search bar: a kind filter with checks — remembered
 * ALWAYS, as a synced pref, so every device keeps his last choice — and a
 * sort (relevance · date · alphabetical) with a direction toggle. The
 * matching itself is core's searchRecords, where it is tested.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { prefsOf, prefsPut, searchRecords, type SearchHit, type SearchKind, type SearchSort } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { CircleBtn, Field, Scroll } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { PageIcon, TickCircleIcon } from '../components/KindIcons';

// No 'event' — the calendar is not in this app, so a filter offering Events
// would return nothing and read as a broken search rather than an absent one.
const ALL_KINDS: SearchKind[] = ['reminder', 'note'];
// 'note' is the record type; 'Recipes' is what this app calls it.
const KIND_LABEL: Record<SearchKind, string> = { reminder: 'Reminders', note: 'Recipes', event: 'Events' };

const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'date', label: 'Date' },
  { id: 'alpha', label: 'Alphabetical' },
];

export function Search({ onClose, onOpen }: { onClose: () => void; onOpen: (hit: SearchHit) => void }) {
  const insets = useSafeAreaInsets();
  const { recs, mutate } = useStore();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [desc, setDesc] = useState(false);
  const [kindsOpen, setKindsOpen] = useState(false);
  // The filter is a synced pref, validated on read like every stored id
  // list: junk drops out, and empty means all three.
  const stored = prefsOf(recs, 'suite').searchKinds ?? [];
  const kinds = ALL_KINDS.filter((k) => stored.includes(k));
  const active = kinds.length ? kinds : ALL_KINDS;
  const toggleKind = (k: SearchKind) => {
    const next = active.includes(k) ? active.filter((x) => x !== k) : [...active, k];
    // Unticking the last box would search nothing forever; snap back to all.
    mutate((e) => e.put(prefsPut(recs, 'suite', { searchKinds: next.length ? next : [] })));
  };
  const hits = useMemo(
    () => searchRecords(recs, query, { kinds: active, sort, desc }),
    [recs, query, active.join(','), sort, desc],
  );
  const filterLabel = active.length === ALL_KINDS.length ? 'All kinds' : active.map((k) => KIND_LABEL[k]).join(' · ');
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={[s.page, { paddingTop: insets.top }]}>
        <View style={s.head}>
          <CircleBtn testID="search-back" glyph="‹" size={32} label="Back" onPress={onClose} />
          <Field
            testID="search-field"
            value={query}
            onChangeText={setQuery}
            placeholder="Search reminders and recipes…"
            autoFocus
            style={s.field}
          />
        </View>
        <View style={s.controls}>
          <Pressable testID="search-kinds" style={s.kindsPill} onPress={() => setKindsOpen(true)}>
            <Text style={s.kindsText} numberOfLines={1}>{filterLabel}</Text>
            <Text style={s.chev}>⌄</Text>
          </Pressable>
          <Dropdown
            testID="search-sort"
            value={sort}
            options={SORT_OPTIONS}
            onPick={(id) => setSort(id as SearchSort)}
          />
          <Pressable
            testID="search-dir"
            style={s.dirBtn}
            onPress={() => setDesc(!desc)}
            accessibilityRole="button"
            accessibilityLabel={desc ? 'Largest first — tap for smallest first' : 'Smallest first — tap for largest first'}
          >
            <Text style={s.dirText}>{desc ? '↓' : '↑'}</Text>
          </Pressable>
        </View>
        <Scroll style={s.results} keyboardShouldPersistTaps="handled">
          {query.trim() !== '' && hits.length === 0 && (
            <Text testID="search-none" style={s.none}>Nothing matches.</Text>
          )}
          {hits.map((h) => (
            <Pressable key={`${h.kind}-${h.id}`} testID="search-row" style={s.row} onPress={() => onOpen(h)}>
              <View style={s.rowIcon}>
                {h.kind === 'reminder' && <TickCircleIcon size={16} />}
                {h.kind === 'note' && <PageIcon size={16} />}
              </View>
              <Text style={[s.rowText, h.done && s.rowDone]} numberOfLines={1}>{h.text}</Text>
              {h.date && <Text style={s.rowDate}>{h.date}</Text>}
            </Pressable>
          ))}
        </Scroll>
        {kindsOpen && (
          <Modal transparent animationType="fade" onRequestClose={() => setKindsOpen(false)}>
            <Pressable style={s.backdrop} onPress={() => setKindsOpen(false)}>
              <Pressable style={s.menu} onPress={() => {}}>
                {ALL_KINDS.map((k) => (
                  <Pressable key={k} testID={`search-kind-${k}`} style={s.menuRow} onPress={() => toggleKind(k)}>
                    <View style={[s.box, active.includes(k) && s.boxOn]}>
                      {active.includes(k) && <Text style={s.boxTick}>✓</Text>}
                    </View>
                    <Text style={s.menuText}>{KIND_LABEL[k]}</Text>
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  field: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  kindsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: T.line,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.surface, flexShrink: 1,
  },
  kindsText: { color: T.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  chev: { color: T.dim, fontSize: 13 },
  dirBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: T.line,
    backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center',
  },
  dirText: { color: T.text, fontSize: 16, fontWeight: '700' },
  results: { flex: 1, marginTop: 10, paddingHorizontal: 16 },
  none: { color: T.dim, fontSize: 14, marginTop: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: T.lineSoft,
  },
  rowIcon: { width: 20, alignItems: 'center' },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowDone: { color: T.dim, textDecorationLine: 'line-through' },
  rowDate: { color: T.dim, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#0007', alignItems: 'center', justifyContent: 'center' },
  menu: {
    minWidth: 220, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line,
    borderRadius: 12, paddingVertical: 6,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  menuText: { color: T.text, fontSize: 15 },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: T.line,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  boxTick: { color: T.accent, fontSize: 12, fontWeight: '800', lineHeight: 14 },
}));
