/**
 * Habits — the suite's two views. WEEK is the tick grid: one row per habit
 * under its coloured section, seven circles, ‹ › paging whole weeks, today
 * pilled on the column head and ringed on its cells. MONTH draws one pie per
 * day — the day's ticks sliced out of the whole counted set, each slice in
 * its habit's section colour, an outline for days still ahead — with its own
 * key underneath so a pie reads back to its sections. The view choice lives
 * in the synced habits pref. Sections are managed from the ☰ window; a
 * habit renames in place while the pencil is on.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Path } from 'react-native-svg';
import { byOrd, monthGrid, newId, ordBetween, prefsOf, prefsPut, tickId, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { HabitSectionManager } from '../components/HabitSectionManager';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';

const pad = (n: number) => String(n).padStart(2, '0');
const FOLD_KEY = 'calmind.folded.habits';

function weekDates(offset: number): string[] {
  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

/** The day pie: every counted habit is an equal slice, filled when ticked. */
function DayPie({ slices, future, size = 30 }: { slices: { color: string; on: boolean }[]; future: boolean; size?: number }) {
  const r = size / 2 - 1.5;
  const c = size / 2;
  const n = Math.max(1, slices.length);
  const path = (i: number) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={future ? T.lineSoft : T.line} strokeWidth={1.5} />
      {!future && slices.map((sl, i) => (sl.on ? <Path key={i} d={path(i)} fill={sl.color} /> : null))}
    </Svg>
  );
}

export function Habits() {
  const { recs, mutate } = useStore();
  const today = todayStr();
  const [w, setW] = useState(0);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [manage, setManage] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(FOLD_KEY).then((raw) => raw && setFolded(new Set(JSON.parse(raw))));
  }, []);
  const toggleFold = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFolded(next);
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const view = prefsOf(recs, 'habits').view ?? 'week';
  const setView = (v: 'week' | 'month') => mutate((e) => e.put(prefsPut(recs, 'habits', { view: v })));

  const days = useMemo(() => weekDates(w), [w]);
  const [year, month] = ym.split('-').map(Number) as [number, number];
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const { sections, habitsOf, allHabits, ticked } = useMemo(() => {
    const sections = recs.filter((r): r is Rec<'habitsection'> => r.type === 'habitsection').sort((a, b) => byOrd(a.payload, b.payload));
    const habits = recs.filter((r): r is Rec<'habit'> => r.type === 'habit').sort((a, b) => byOrd(a.payload, b.payload));
    const secOrd = new Map(sections.map((s, i) => [s.id, i]));
    // Pie-slice order: grouped by section, sections in their drag order.
    const allHabits = [...habits].sort((a, b) =>
      (secOrd.get(a.payload.sectionId) ?? 99) - (secOrd.get(b.payload.sectionId) ?? 99) || byOrd(a.payload, b.payload),
    );
    const ticks = new Set(recs.filter((r) => r.type === 'tick').map((r) => r.id));
    return {
      sections,
      allHabits,
      habitsOf: (sid: string) => habits.filter((h) => h.payload.sectionId === sid),
      ticked: (habitId: string, date: string) => ticks.has(tickId(habitId, date)),
    };
  }, [recs]);

  const secColor = useMemo(() => new Map(sections.map((s) => [s.id, s.payload.color])), [sections]);
  const countedSections = useMemo(
    () => sections.filter((s) => habitsOf(s.id).length > 0),
    [sections, habitsOf],
  );

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

  const commitRename = (h: Rec<'habit'>) => {
    setRenaming(null);
    const name = renameText.trim();
    if (name === '' || name === h.payload.name) return;
    mutate((e) => e.put({ ...h, payload: { ...h.payload, name } }));
  };

  const page = (dir: -1 | 1) => {
    if (view === 'week') {
      setW(w + dir);
      return;
    }
    const m0 = month - 1 + dir;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, '0')}`);
  };

  return (
    <View style={s.page}>
      <TopBar
        title="Habits"
        controls={
          <View style={s.pager}>
            <CircleBtn glyph="‹" onPress={() => page(-1)} />
            <CircleBtn glyph="›" onPress={() => page(1)} />
            <CircleBtn glyph="☰" onPress={() => setManage(true)} />
            <Pressable onPress={() => setEditing(!editing)} hitSlop={8}>
              <Text style={[s.editPencil, editing && { color: T.accent }]}>✎</Text>
            </Pressable>
          </View>
        }
      />

      {/* The bar above the grid picks the view, remembered in the synced pref. */}
      <View style={s.viewRow}>
        <Pill label="Week" primary={view === 'week'} onPress={() => setView('week')} />
        <Pill label="Month" primary={view === 'month'} onPress={() => setView('month')} />
        {view === 'month' && <Text style={s.ymLabel}>{new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {view === 'week' && (
          <>
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
                  <Pressable onPress={() => toggleFold(sec.id)} hitSlop={8}>
                    <Text style={s.chev}>{folded.has(sec.id) ? '▸' : '▾'}</Text>
                  </Pressable>
                  <View style={[s.secDot, { backgroundColor: sec.payload.color }]} />
                  <Text style={s.secName}>{sec.payload.name}</Text>
                  <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAddingIn(sec.id); setAddText(''); }} />
                </View>
                {addingIn === sec.id && (
                  <Field value={addText} onChangeText={setAddText} placeholder="New habit" autoFocus onBlur={() => addHabit(sec)} onSubmitEditing={() => addHabit(sec)} />
                )}
                {!folded.has(sec.id) &&
                  habitsOf(sec.id).map((h) => (
                    <View key={h.id} style={s.habitRow}>
                      <View style={s.nameCol}>
                        {renaming === h.id ? (
                          <Field
                            value={renameText}
                            onChangeText={setRenameText}
                            autoFocus
                            style={s.renameField}
                            onBlur={() => commitRename(h)}
                            onSubmitEditing={() => commitRename(h)}
                          />
                        ) : (
                          <Pressable
                            style={s.nameTap}
                            onPress={() => editing && (setRenaming(h.id), setRenameText(h.payload.name))}
                            onLongPress={() => { setRenaming(h.id); setRenameText(h.payload.name); }}
                            delayLongPress={350}
                          >
                            <Text style={s.habitName} numberOfLines={1}>{h.payload.name}</Text>
                          </Pressable>
                        )}
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
          </>
        )}

        {view === 'month' && (
          <>
            <View style={s.monthGridRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
                <Text key={i} style={s.monthHead}>{wd}</Text>
              ))}
              {cells.map((d, i) =>
                d === null ? (
                  <View key={`b${i}`} style={s.monthCell} />
                ) : (
                  <View key={d} style={s.monthCell}>
                    <Text style={[s.monthNum, d === today && s.monthNumToday]}>{Number(d.slice(8))}</Text>
                    <View style={d === today ? s.pieToday : null}>
                      <DayPie
                        future={d > today}
                        slices={allHabits.map((h) => ({ color: secColor.get(h.payload.sectionId) ?? T.accent, on: ticked(h.id, d) }))}
                      />
                    </View>
                  </View>
                ),
              )}
            </View>
            {/* The month view's own key: each counted section, in pie-slice order. */}
            <View style={s.keyRow}>
              {countedSections.map((sec) => (
                <View key={sec.id} style={s.keyItem}>
                  <View style={[s.secDot, { backgroundColor: sec.payload.color }]} />
                  <Text style={s.keyText}>{sec.payload.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {manage && <HabitSectionManager onClose={() => setManage(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editPencil: { color: T.dim, fontSize: 18, paddingHorizontal: 4 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  ymLabel: { color: T.text, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end' },
  nameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  nameTap: { flexShrink: 1 },
  renameField: { flex: 1, paddingVertical: 4 },
  dayCol: { width: 34, alignItems: 'center' },
  dayHead: { color: T.muted, fontSize: 11, minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden' },
  dayHeadToday: { color: T.accentInk, backgroundColor: T.accent, fontWeight: '700' },
  dayNum: { color: T.dim, fontSize: 10 },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chev: { color: T.muted, fontSize: 12, width: 14, textAlign: 'center' },
  secDot: { width: 11, height: 11, borderRadius: 6 },
  secName: { color: T.gold, fontSize: 14, fontWeight: '700' },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  habitName: { color: T.text, fontSize: 15, flexShrink: 1 },
  tickCell: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  tickCellToday: { borderColor: T.accent, borderWidth: 2 },
  tickCellFuture: { opacity: 0.35 },
  tickGlyph: { color: T.bg, fontSize: 13, fontWeight: '700' },
  monthGridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  monthHead: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  monthCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6, gap: 3 },
  monthNum: { color: T.dim, fontSize: 11, minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden' },
  monthNumToday: { color: T.accentInk, backgroundColor: T.accent, fontWeight: '700' },
  pieToday: { borderWidth: 2, borderColor: T.accent, borderRadius: 19, padding: 1 },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyText: { color: T.dim, fontSize: 12 },
});
