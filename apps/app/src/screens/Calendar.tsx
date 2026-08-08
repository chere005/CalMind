/**
 * The Calendar: month grid over a day panel, the suite's split. Cells carry the
 * day's marks (event dots in calendar colors, the worst reminder state, a note
 * mark); the panel lists events → reminders → notes in the suite's order, ticks
 * roll repeats, and the add row files a reminder or event by kind. A day is
 * selected by a tap and nothing else.
 */
import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  cellMarks,
  dayItems,
  monthGrid,
  monthLegend,
  newId,
  ordBetween,
  parseWhenFromText,
  reminderToggle,
  todayStr,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { CalendarPick, useCalendarView } from '../components/CalendarPick';
import { CalGlyph, PageGlyph, TickBoxGlyph } from '../components/KindIcons';
import { ItemModal, type ItemKind } from '../components/ItemModal';
import { CircleBtn, ConfirmDelete, Pill, Rule } from '../ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Calendar({ onNoteCreated }: { onNoteCreated?: (id: string) => void }) {
  const { recs, mutate } = useStore();
  const { visible: visibleCals, calendars } = useCalendarView();
  const today = todayStr();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.calFold').then((raw) => raw && setFolded(new Set(JSON.parse(raw))));
  }, []);
  const toggleFold = (kind: string) => {
    const next = new Set(folded);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setFolded(next);
    AsyncStorage.setItem('calmind.calFold', JSON.stringify([...next])).catch(() => {});
  };
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; kind: ItemKind; rec: Rec<'event'> | Rec<'reminder'> | Rec<'note'> }>(null);

  const [year, month] = ym.split('-').map(Number) as [number, number];
  // The picker's ticks are what's on screen: events on switched-off calendars
  // leave the grid and the panel together.
  const drawn = useMemo(() => {
    const on = new Set(visibleCals.map((c) => c.id));
    return on.size === calendars.length ? recs : recs.filter((r) => r.type !== 'event' || on.has(r.payload.calendarId));
  }, [recs, visibleCals, calendars]);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const marks = useMemo(() => new Map(cells.filter(Boolean).map((d) => [d!, cellMarks(drawn, d!, today)])), [drawn, cells, today]);
  const legend = useMemo(() => monthLegend(drawn, cells, today), [drawn, cells, today]);
  const items = useMemo(() => dayItems(drawn, day, today), [drawn, day, today]);
  const calById = useMemo(() => new Map(recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [recs]);

  const page = (dir: -1 | 1) => {
    const m0 = month - 1 + dir;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, '0')}`);
  };

  const tick = (r: Rec<'reminder'>) => mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));

  const cellMark = (d: string) => {
    const all = marks.get(d) ?? [];
    const shown = all.length > 6 ? all.slice(0, 5) : all;
    return (
      <View style={s.markWell}>
        {shown.map((m, i) => {
          if (m.kind === 'event') return <CalGlyph key={i} color={m.color} />;
          if (m.kind === 'note') return <PageGlyph key={i} color={m.color} />;
          const color = m.state === 'overdue' ? T.overdue : m.state === 'done' ? T.muted : m.color;
          return <TickBoxGlyph key={i} color={color} done={m.state === 'done'} />;
        })}
        {all.length > 6 && <Text style={s.markMore}>+</Text>}
      </View>
    );
  };

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={s.page}>
      <TopBar title="Calendar" picker={<CalendarPick />} />
      {/* The date centred over the grid; ◉ jumps home to today. */}
      <View style={s.pagerRow}>
        <CircleBtn glyph="‹" onPress={() => page(-1)} />
        <Text style={s.ymLabel}>{new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <CircleBtn glyph="›" onPress={() => page(1)} />
        <CircleBtn glyph="◉" color={T.accent} onPress={() => { setYm(today.slice(0, 7)); setDay(today); }} />
      </View>

      <View style={s.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={s.weekday}>{w}</Text>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <View key={`b${i}`} style={s.cell} />
          ) : (
            <Pressable key={d} onPress={() => setDay(d)} style={[s.cell, d === day && s.cellPicked]}>
              <Text style={[s.cellNum, d === today && s.cellToday]}>{Number(d.slice(8))}</Text>
              {cellMark(d)}
            </Pressable>
          ),
        )}
      </View>
      <Rule />
      {legend.length > 0 && (
        <ScrollView style={s.legend} contentContainerStyle={s.legendInner} horizontal={false}>
          <View style={s.legendWrap}>
            {legend.map((l) => (
              <View key={`${l.kind}:${l.id}`} style={s.legendItem}>
                {l.kind === 'event' ? <CalGlyph color={l.color} /> : l.kind === 'reminder' ? <TickBoxGlyph color={l.color} /> : <PageGlyph color={l.color} />}
                <Text style={s.legendText}>{l.name}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <Rule />

      <ScrollView style={s.panel} contentContainerStyle={s.panelInner}>
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>{dayLabel}</Text>
          <Pill label="+ Add" primary onPress={() => setModal({ mode: 'create' })} />
        </View>
        {items.events.length > 0 && (
          <Pressable style={s.groupHead} onPress={() => toggleFold('events')}>
            <Text style={s.chev}>{folded.has('events') ? '▸' : '▾'}</Text>
            <Text style={s.groupTitle}>Events</Text>
          </Pressable>
        )}
        {!folded.has('events') && items.events.map((e) => (
          <View key={e.id} style={s.row}>
            <View style={[s.dot, s.rowDot, { backgroundColor: calById.get(e.payload.calendarId)?.color ?? T.folderBlue }]} />
            <Text style={s.rowText}>{e.payload.text}</Text>
            {e.payload.time && <Text style={s.chip}>{e.payload.time}</Text>}
            <CircleBtn glyph="✎" size={24} onPress={() => setModal({ mode: 'edit', kind: 'event', rec: e })} />
            <ConfirmDelete onDelete={() => mutate((en) => en.del(e.id))} />
          </View>
        ))}
        {items.reminders.length > 0 && (
          <Pressable style={s.groupHead} onPress={() => toggleFold('reminders')}>
            <Text style={s.chev}>{folded.has('reminders') ? '▸' : '▾'}</Text>
            <Text style={s.groupTitle}>Reminders</Text>
          </Pressable>
        )}
        {!folded.has('reminders') && items.reminders.map(({ rec: r, overdue, rider }) => (
          <View key={r.id} style={s.row}>
            <Pressable onPress={() => tick(r)} hitSlop={8} style={[s.tickBox, r.payload.done && s.tickDone, overdue && s.tickOverdue]}>
              {r.payload.done && <Text style={s.tickMark}>✓</Text>}
            </Pressable>
            <Text style={[s.rowText, r.payload.done && s.rowDone]}>{r.payload.text}</Text>
            {overdue && <Text style={[s.chip, { color: T.overdue }]}>{r.payload.due}</Text>}
            {rider && <Text style={s.chip}>every day</Text>}
            {r.payload.time && <Text style={s.chip}>{r.payload.time}</Text>}
            <CircleBtn glyph="✎" size={24} onPress={() => setModal({ mode: 'edit', kind: 'reminder', rec: r })} />
          </View>
        ))}
        {items.notes.length > 0 && (
          <Pressable style={s.groupHead} onPress={() => toggleFold('notes')}>
            <Text style={s.chev}>{folded.has('notes') ? '▸' : '▾'}</Text>
            <Text style={s.groupTitle}>Notes</Text>
          </Pressable>
        )}
        {!folded.has('notes') && items.notes.map((n) => (
          <View key={n.id} style={s.row}>
            <Text style={[s.markGlyph, { color: T.dim }]}>▤</Text>
            <Text style={s.rowText}>{n.payload.title}</Text>
            <CircleBtn glyph="✎" size={24} onPress={() => setModal({ mode: 'edit', kind: 'note', rec: n })} />
          </View>
        ))}
        {items.events.length + items.reminders.length + items.notes.length === 0 && (
          <Text style={s.empty}>Nothing on this day</Text>
        )}
      </ScrollView>
      {modal?.mode === 'create' && (
        <ItemModal
          mode="create"
          kind="event"
          date={day}
          onClose={() => setModal(null)}
          onSaved={(id, kind) => kind === 'note' && onNoteCreated?.(id)}
        />
      )}
      {modal?.mode === 'edit' && <ItemModal mode="edit" kind={modal.kind} rec={modal.rec} onClose={() => setModal(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  ymLabel: { color: T.text, fontSize: 15, fontWeight: '600', minWidth: 150, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 6 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  cell: { width: `${100 / 7}%`, minHeight: 52, alignItems: 'center', paddingTop: 4, borderRadius: 8 },
  cellPicked: { backgroundColor: T.surface2 },
  cellNum: { color: T.text, fontSize: 13 },
  cellToday: { color: T.accentInk, backgroundColor: T.accent, borderRadius: 9, minWidth: 18, height: 18, textAlign: 'center', lineHeight: 18, fontWeight: '700', overflow: 'hidden' },
  markWell: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2, alignItems: 'center', justifyContent: 'center', maxWidth: 44, minHeight: 24 },
  markMore: { color: T.dim, fontSize: 10, lineHeight: 11 },
  legend: { maxHeight: 88 },
  legendInner: { paddingHorizontal: 16, paddingVertical: 6 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { color: T.dim, fontSize: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  chev: { color: T.muted, fontSize: 12, width: 14, textAlign: 'center' },
  groupTitle: { color: T.gold, fontSize: 13, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
  markGlyph: { fontSize: 10, color: T.dim },
  panel: { flex: 1 },
  panelInner: { padding: 16, gap: 8 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: T.gold, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowDone: { color: T.muted, textDecorationLine: 'line-through' },
  chip: { color: T.dim, fontSize: 12 },
  tickBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: T.accentInk, borderColor: T.accent },
  tickOverdue: { borderColor: T.overdue },
  tickMark: { color: T.accent, fontSize: 12, fontWeight: '700' },
  empty: { color: T.muted, fontSize: 13, marginTop: 8 },
});
