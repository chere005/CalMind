/**
 * The Calendar: month grid over a day panel, the suite's split. Cells carry the
 * day's marks (event dots in calendar colors, the worst reminder state, a note
 * mark); the panel lists events → reminders → notes in the suite's order, ticks
 * roll repeats, and the add row files a reminder or event by kind. A day is
 * selected by a tap and nothing else.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  dayItems,
  dayMarks,
  monthGrid,
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
import { ItemModal, type ItemKind } from '../components/ItemModal';
import { CircleBtn, ConfirmDelete, Pill, Rule } from '../ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Calendar() {
  const { recs, mutate } = useStore();
  const today = todayStr();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; kind: ItemKind; rec: Rec<'event'> | Rec<'reminder'> | Rec<'note'> }>(null);

  const [year, month] = ym.split('-').map(Number) as [number, number];
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const marks = useMemo(() => new Map(cells.filter(Boolean).map((d) => [d!, dayMarks(recs, d!, today)])), [recs, cells, today]);
  const items = useMemo(() => dayItems(recs, day, today), [recs, day, today]);
  const calById = useMemo(() => new Map(recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [recs]);

  const page = (dir: -1 | 1) => {
    const m0 = month - 1 + dir;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, '0')}`);
  };

  const tick = (r: Rec<'reminder'>) => mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));

  const cellMark = (d: string) => {
    const m = marks.get(d)!;
    return (
      <View style={s.markRow}>
        {m.eventColors.slice(0, 3).map((c, i) => (
          <View key={i} style={[s.dot, { backgroundColor: c }]} />
        ))}
        {m.reminderState !== 'none' && (
          <Text style={[s.markGlyph, m.reminderState === 'overdue' && { color: T.overdue }, m.reminderState === 'done' && { color: T.muted }]}>☐</Text>
        )}
        {m.noteCount > 0 && <Text style={[s.markGlyph, { color: T.dim }]}>▤</Text>}
      </View>
    );
  };

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={s.page}>
      <TopBar title="Calendar" />
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

      <ScrollView style={s.panel} contentContainerStyle={s.panelInner}>
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>{dayLabel}</Text>
          <Pill label="+ Add" primary onPress={() => setModal({ mode: 'create' })} />
        </View>
        {items.events.map((e) => (
          <View key={e.id} style={s.row}>
            <View style={[s.dot, s.rowDot, { backgroundColor: calById.get(e.payload.calendarId)?.color ?? T.folderBlue }]} />
            <Text style={s.rowText}>{e.payload.text}</Text>
            {e.payload.time && <Text style={s.chip}>{e.payload.time}</Text>}
            <CircleBtn glyph="✎" size={24} onPress={() => setModal({ mode: 'edit', kind: 'event', rec: e })} />
            <ConfirmDelete onDelete={() => mutate((en) => en.del(e.id))} />
          </View>
        ))}
        {items.reminders.map(({ rec: r, overdue, rider }) => (
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
        {items.notes.map((n) => (
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
      {modal?.mode === 'create' && <ItemModal mode="create" kind="event" date={day} onClose={() => setModal(null)} />}
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
  markRow: { flexDirection: 'row', gap: 2, marginTop: 2, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
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
