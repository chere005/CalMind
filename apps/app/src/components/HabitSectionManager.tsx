/**
 * Manage sections — the folder manager's shape borrowed for habits, as the
 * suite does: an add row with a green +, each section with a colour swatch
 * (tap cycles the habits palette), a pencil rename, and a two-press × whose
 * refusals (the last section stays) surface from core.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { byRecOrd, deleteHabitSection, newId, ordBetween, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, APP_PALETTES, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill, Scroll, WebHitSlop } from '../ui';
import { SwatchTray } from './SwatchTray';
import { ordForMove, useRowDrag } from './rowdrag';

export function HabitSectionManager({ onClose }: { onClose: () => void }) {
  const { recs, mutate } = useStore();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [err, setErr] = useState('');

  const sections = useMemo(
    () => recs.filter((r): r is Rec<'habitsection'> => r.type === 'habitsection').sort(byRecOrd),
    [recs],
  );
  const pal = APP_PALETTES.habits;

  const flash = (m: string) => {
    setErr(m);
    setTimeout(() => setErr(''), 3000);
  };

  const drag = useRowDrag(sections.length, (from: number, to: number) => {
    const item = sections[from];
    if (!item) return;
    const ord = ordForMove(sections, from, to);
    mutate((e) => e.put({ ...item, payload: { ...item.payload, ord } }));
  });

  const add = () => {
    const name = newName.trim();
    setNewName('');
    if (!name) return;
    if (sections.some((s) => s.payload.name.trim().toLowerCase() === name.toLowerCase())) {
      flash('that name is taken');
      return;
    }
    mutate((e) => {
      const last = sections[sections.length - 1];
      e.put({
        id: newId(), type: 'habitsection', updated: 0,
        payload: { name, color: pal[sections.length % pal.length]!, ord: ordBetween(last?.payload.ord ?? null, null) },
      });
    });
  };

  const commitRename = (sec: Rec<'habitsection'>) => {
    setRenaming(null);
    const name = renameText.trim();
    if (name === '' || name === sec.payload.name) return;
    if (sections.some((s) => s.id !== sec.id && s.payload.name.trim().toLowerCase() === name.toLowerCase())) {
      flash('that name is taken');
      return;
    }
    mutate((e) => e.put({ ...sec, payload: { ...sec.payload, name } }));
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Scroll contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Sections</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New section" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" label="Add" color={T.accent} size={34} onPress={add} />
            </View>
            {sections.map((sec, i) => (
              <View key={sec.id}>
                {drag.slot === i && <View style={s.dropLine} />}
                <View ref={drag.registerRow(i)} style={[s.row, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                <View {...drag.handleFor(i)} style={s.grip} hitSlop={8}><WebHitSlop /><Text style={s.gripText}>≡</Text></View>
                {/* The tray, not the cycle — Sean's word, 2026-08-18:
                    "habits should bring up the swatch tray." This was the one
                    manager still advancing one palette step per tap; the
                    migration that brought SwatchTray to folders and calendars
                    stopped one file short of here (TODO §1 has the story). */}
                <SwatchTray
                  testID={`habit-swatch-${sec.payload.name}`}
                  palette={pal}
                  color={sec.payload.color}
                  onPick={(hex) => mutate((e) => e.put({ ...sec, payload: { ...sec.payload, color: hex } }))}
                />
                {renaming === sec.id ? (
                  <Field
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    style={s.renameField}
                    onBlur={() => commitRename(sec)}
                    onSubmitEditing={() => commitRename(sec)}
                  />
                ) : (
                  <Text style={s.rowText}>{sec.payload.name}</Text>
                )}
                <CircleBtn glyph="✎" label="Edit" size={26} onPress={() => { setRenaming(sec.id); setRenameText(sec.payload.name); }} />
                <ConfirmDelete
                  onDelete={() => {
                    const res = deleteHabitSection(recs, sec.id);
                    if ('error' in res) {
                      flash(res.error);
                      return;
                    }
                    mutate((e) => res.put.forEach((r) => e.put(r)));
                  }}
                />
                </View>
              </View>
            ))}
            {drag.slot === sections.length && <View style={s.dropLine} />}
            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.doneRow}>
              <Pill label="Done" primary onPress={onClose} />
            </View>
          </Scroll>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addField: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  grip: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gripText: { color: T.muted, fontSize: 15, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  renameField: { flex: 1, paddingVertical: 6 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
}));
