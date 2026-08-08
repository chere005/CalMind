/**
 * The calendar picker — the Calendar's twin of the folder picker: the pie
 * button by the username, a dropdown of All + every calendar with a show/hide
 * box, and Manage calendars… with add / rename / recolor / delete (rules from
 * core) and the default calendar for new events.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  byOrd,
  calendarNameTaken,
  deleteCalendar,
  newId,
  ordBetween,
  prefsOf,
  prefsPut,
  renameCalendar,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { APP_PALETTES, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';
import { Dropdown } from './Dropdown';
import { ordForMove, useRowDrag } from './rowdrag';
import { PieDot } from './PieDot';

export type CalendarView = { view: string; hidden: string[]; calendars: Rec<'calendar'>[]; visible: Rec<'calendar'>[] };

export function useCalendarView(): CalendarView {
  const { recs } = useStore();
  return useMemo(() => {
    const calendars = recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort((a, b) => byOrd(a.payload, b.payload));
    const prefs = prefsOf(recs, 'calendar');
    const ids = new Set(calendars.map((c) => c.id));
    const view = prefs.lastView && ids.has(prefs.lastView) ? prefs.lastView : 'all';
    const hidden = (prefs.hidden ?? []).filter((id) => ids.has(id));
    const visible = view === 'all' ? calendars.filter((c) => !hidden.includes(c.id)) : calendars.filter((c) => c.id === view);
    return { view, hidden, calendars, visible };
  }, [recs]);
}

export function CalendarPick() {
  const { recs, mutate } = useStore();
  const { view, hidden, calendars, visible } = useCalendarView();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, 'calendar', next)));

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        <PieDot colors={visible.map((c) => c.payload.color)} />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <ScrollView>
                <Pressable style={s.row} onPress={() => { setPrefs({ lastView: 'all' }); setOpen(false); }}>
                  <PieDot colors={calendars.map((c) => c.payload.color)} size={14} />
                  <Text style={[s.rowText, view === 'all' && s.rowActive]}>All</Text>
                </Pressable>
                {calendars.map((c) => {
                  const off = hidden.includes(c.id);
                  return (
                    <View key={c.id} style={s.row}>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: c.id }); setOpen(false); }}>
                        <View style={[s.dot, { backgroundColor: c.payload.color }]} />
                        <Text style={[s.rowText, view === c.id && s.rowActive]}>{c.payload.name}</Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setPrefs({ hidden: off ? hidden.filter((id) => id !== c.id) : [...hidden, c.id], lastView: 'all' })}
                      >
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage calendars…</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {manage && <CalendarManager onClose={() => setManage(false)} />}
    </>
  );
}

function CalendarManager({ onClose }: { onClose: () => void }) {
  const { recs, mutate } = useStore();
  const { calendars } = useCalendarView();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [err, setErr] = useState('');
  const defaultCalendarId = prefsOf(recs, 'calendar').defaultCalendarId;

  const flash = (m: string) => {
    setErr(m);
    setTimeout(() => setErr(''), 3000);
  };

  const ROW_H = 44;
  const drag = useRowDrag(calendars.length, (from: number, to: number) => {
    const item = calendars[from];
    if (!item) return;
    const ord = ordForMove(calendars, from, to);
    mutate((e) => e.put({ ...item, payload: { ...item.payload, ord } }));
  });

  const add = () => {
    const name = newName.trim();
    setNewName('');
    if (!name) return;
    if (calendarNameTaken(recs, name)) {
      flash('that name is taken');
      return;
    }
    mutate((e) => {
      const last = calendars[calendars.length - 1];
      e.put({
        id: newId(), type: 'calendar', updated: 0,
        payload: { name, color: APP_PALETTES.calendar[calendars.length % APP_PALETTES.calendar.length]!, ord: ordBetween(last?.payload.ord ?? null, null) },
      });
    });
  };

  const commitRename = (c: Rec<'calendar'>) => {
    setRenaming(null);
    const res = renameCalendar(recs, c.id, renameText);
    if ('error' in res) {
      if (renameText.trim() !== '' && renameText.trim() !== c.payload.name) flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  const remove = (c: Rec<'calendar'>) => {
    const res = deleteCalendar(recs, c.id);
    if ('error' in res) {
      flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  const recolor = (c: Rec<'calendar'>) => {
    const pal = APP_PALETTES.calendar;
    const at = pal.indexOf(c.payload.color);
    mutate((e) => e.put({ ...c, payload: { ...c.payload, color: pal[(at + 1) % pal.length]! } }));
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop2} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Calendars</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New calendar" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" color={T.accent} size={34} onPress={add} />
            </View>
            {calendars.map((c, i) => (
              <View key={c.id}>
                {drag.slot === i && <View style={s.dropLine} />}
                <View ref={drag.registerRow(i)} style={[s.mrow, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                <View {...drag.handleFor(i)} style={s.grip} hitSlop={8}><Text style={s.gripText}>≡</Text></View>
                <CircleBtn glyph=" " size={22} bg={c.payload.color} onPress={() => recolor(c)} />
                {renaming === c.id ? (
                  <Field
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    style={s.renameField}
                    onBlur={() => commitRename(c)}
                    onSubmitEditing={() => commitRename(c)}
                  />
                ) : (
                  <Text style={s.rowText}>{c.payload.name}</Text>
                )}
                <CircleBtn glyph="✎" size={26} onPress={() => { setRenaming(c.id); setRenameText(c.payload.name); }} />
                <ConfirmDelete onDelete={() => remove(c)} />
                </View>
              </View>
            ))}
            {drag.slot === calendars.length && <View style={s.dropLine} />}
            <Text style={s.label}>Default for new events</Text>
            <Dropdown
              value={defaultCalendarId ?? null}
              options={calendars.map((c) => ({ id: c.id, label: c.payload.name }))}
              onPick={(id) => mutate((e) => e.put(prefsPut(recs, 'calendar', { defaultCalendarId: id })))}
            />
            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.doneRow}>
              <Pill label="Done" primary onPress={onClose} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop2: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  menu: { width: '100%', maxWidth: 340, maxHeight: '70%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, paddingVertical: 6 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addField: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  mrow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  grip: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gripText: { color: T.muted, fontSize: 15, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
  box: { color: T.muted, fontSize: 16 },
  boxOn: { color: T.accent },
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
  renameField: { flex: 1, paddingVertical: 6 },
  label: { color: T.dim, fontSize: 13, marginTop: 6 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
});
