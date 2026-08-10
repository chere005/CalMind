/**
 * The habits picker — the folder picker's shape over habit sections: the pie
 * button by the username, All + each section with a show/hide box, and
 * "Manage sections…" as the last row, exactly the suite's filter dropdown.
 * Visibility lives in the synced habits pref.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { byOrd, prefsOf, prefsPut, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { pickHit, WebHitSlop } from '../ui';
import { HabitSectionManager } from './HabitSectionManager';
import { PieDot } from './PieDot';

export function useHabitSections(): { sections: Rec<'habitsection'>[]; hidden: string[]; visible: Rec<'habitsection'>[] } {
  const { recs } = useStore();
  return useMemo(() => {
    const sections = recs
      .filter((r): r is Rec<'habitsection'> => r.type === 'habitsection')
      .sort((a, b) => byOrd(a.payload, b.payload));
    const ids = new Set(sections.map((s) => s.id));
    const hidden = (prefsOf(recs, 'habits').hidden ?? []).filter((id) => ids.has(id));
    return { sections, hidden, visible: sections.filter((s) => !hidden.includes(s.id)) };
  }, [recs]);
}

export function SectionPick() {
  const { recs, mutate } = useStore();
  const { sections, hidden, visible } = useHabitSections();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, 'habits', next)));

  return (
    <>
      <Pressable testID="pick-habits" style={pickHit} onPress={() => setOpen(true)} hitSlop={8}>
        <PieDot colors={visible.map((s) => s.payload.color)} />
      </Pressable>
      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <ScrollView>
                <Pressable style={s.row} onPress={() => { setPrefs({ hidden: [] }); setOpen(false); }}>
                  <PieDot colors={sections.map((x) => x.payload.color)} size={14} />
                  <Text style={[s.rowText, hidden.length === 0 && s.rowActive]}>All</Text>
                </Pressable>
                {sections.map((sec) => {
                  const off = hidden.includes(sec.id);
                  return (
                    <View key={sec.id} style={s.row}>
                      <View style={[s.dot, { backgroundColor: sec.payload.color }]} />
                      <Text style={s.rowText}>{sec.payload.name}</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setPrefs({ hidden: off ? hidden.filter((id) => id !== sec.id) : [...hidden, sec.id] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage sections…</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {manage && <HabitSectionManager onClose={() => setManage(false)} />}
    </>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 340, maxHeight: '70%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
  box: { color: T.muted, fontSize: 16 },
  boxOn: { color: T.accent },
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
}));
