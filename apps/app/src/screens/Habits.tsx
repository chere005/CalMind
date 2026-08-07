/**
 * Habits: the week tick grid — one row per habit under its coloured section,
 * seven circles, ‹ › paging whole weeks. Today wears the accent pill on its
 * column head and a ring on its cells. Ticks are records with deterministic
 * ids, so the same tick from two devices converges instead of doubling.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { byOrd, newId, ordBetween, tickId, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Rule } from '../ui';

const pad = (n: number) => String(n).padStart(2, '0');

function weekDates(offset: number): string[] {
  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

export function Habits() {
  const { recs, mutate } = useStore();
  const [w, setW] = useState(0);
  const [addingIn, setAddingIn] = useState<string | null>(null); // habitsection id
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState(false);
  const today = todayStr();
  const days = useMemo(() => weekDates(w), [w]);

  const { sections, habitsOf, ticked } = useMemo(() => {
    const sections = recs.filter((r): r is Rec<'habitsection'> => r.type === 'habitsection').sort((a, b) => byOrd(a.payload, b.payload));
    const habits = recs.filter((r): r is Rec<'habit'> => r.type === 'habit').sort((a, b) => byOrd(a.payload, b.payload));
    const ticks = new Set(recs.filter((r) => r.type === 'tick').map((r) => r.id));
    return {
      sections,
      habitsOf: (sid: string) => habits.filter((h) => h.payload.sectionId === sid),
      ticked: (habitId: string, date: string) => ticks.has(tickId(habitId, date)),
    };
  }, [recs]);

  const toggle = (habitId: string, date: string) => {
    const id = tickId(habitId, date);
    mutate((e) => {
      if (ticked(habitId, date)) e.del(id);
      else e.put({ id, type: 'tick', updated: 0, payload: { habitId, date } });
    });
  };

  const addHabit = (section: Rec<'habitsection'>) => {
    const name = addText.trim();
    setAddingIn(null);
    setAddText('');
    if (!name) return;
    mutate((e) => {
      const last = habitsOf(section.id).slice(-1)[0];
      e.put({ id: newId(), type: 'habit', updated: 0, payload: { name, sectionId: section.id, ord: ordBetween(last?.payload.ord ?? null, null) } });
    });
  };

  return (
    <View style={s.page}>
      <View style={s.topbar}>
        <Text style={s.appname}>Habits</Text>
        <View style={s.pager}>
          <CircleBtn glyph="‹" onPress={() => setW(w - 1)} />
          <CircleBtn glyph="›" onPress={() => setW(w + 1)} />
          <Pressable onPress={() => setEditing(!editing)} hitSlop={8}>
            <Text style={[s.editPencil, editing && { color: T.accent }]}>✎</Text>
          </Pressable>
        </View>
      </View>
      <Rule />

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.headRow}>
          <View style={s.nameCol} />
          {days.map((d) => (
            <View key={d} style={s.dayCol}>
              <Text style={[s.dayHead, d === today && s.dayHeadToday]}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${d}T12:00:00`).getDay()]}
              </Text>
              <Text style={s.dayNum}>{Number(d.slice(8))}</Text>
            </View>
          ))}
        </View>

        {sections.map((sec) => (
          <View key={sec.id} style={s.section}>
            <View style={s.secHead}>
              <View style={[s.secDot, { backgroundColor: sec.payload.color }]} />
              <Text style={s.secName}>{sec.payload.name}</Text>
              <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAddingIn(sec.id); setAddText(''); }} />
            </View>
            {addingIn === sec.id && (
              <Field value={addText} onChangeText={setAddText} placeholder="New habit" autoFocus onBlur={() => addHabit(sec)} onSubmitEditing={() => addHabit(sec)} />
            )}
            {habitsOf(sec.id).map((h) => (
              <View key={h.id} style={s.habitRow}>
                <View style={s.nameCol}>
                  <Text style={s.habitName} numberOfLines={1}>{h.payload.name}</Text>
                  {editing && <ConfirmDelete size={22} onDelete={() => mutate((e) => e.del(h.id))} />}
                </View>
                {days.map((d) => {
                  const on = ticked(h.id, d);
                  const future = d > today;
                  return (
                    <View key={d} style={s.dayCol}>
                      <Pressable
                        disabled={future}
                        onPress={() => toggle(h.id, d)}
                        style={[s.tickCell, on && { backgroundColor: sec.payload.color, borderColor: sec.payload.color }, d === today && s.tickCellToday, future && s.tickCellFuture]}
                      >
                        {on && <Text style={s.tickGlyph}>✓</Text>}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  topbar: { height: 32, marginTop: 24, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editPencil: { color: T.dim, fontSize: 18, paddingHorizontal: 4 },
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end' },
  nameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  dayCol: { width: 34, alignItems: 'center' },
  dayHead: { color: T.muted, fontSize: 11, minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden' },
  dayHeadToday: { color: T.accentInk, backgroundColor: T.accent, fontWeight: '700' },
  dayNum: { color: T.dim, fontSize: 10 },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  secDot: { width: 11, height: 11, borderRadius: 6 },
  secName: { color: T.gold, fontSize: 14, fontWeight: '700' },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  habitName: { color: T.text, fontSize: 15, flexShrink: 1 },
  tickCell: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  tickCellToday: { borderColor: T.accent, borderWidth: 2 },
  tickCellFuture: { opacity: 0.35 },
  tickGlyph: { color: T.bg, fontSize: 13, fontWeight: '700' },
});
