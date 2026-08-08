/**
 * Manage sections — the folder manager's shape borrowed for habits, as the
 * suite does: an add row with a green +, each section with a colour swatch
 * (tap cycles the habits palette), a pencil rename, and a two-press × whose
 * refusals (the last section stays) surface from core.
 */
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { byOrd, deleteHabitSection, newId, ordBetween, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { APP_PALETTES, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';

export function HabitSectionManager({ onClose }: { onClose: () => void }) {
  const { recs, mutate } = useStore();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [err, setErr] = useState('');

  const sections = useMemo(
    () => recs.filter((r): r is Rec<'habitsection'> => r.type === 'habitsection').sort((a, b) => byOrd(a.payload, b.payload)),
    [recs],
  );
  const pal = APP_PALETTES.habits;

  const flash = (m: string) => {
    setErr(m);
    setTimeout(() => setErr(''), 3000);
  };

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
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Sections</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New section" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" color={T.accent} size={34} onPress={add} />
            </View>
            {sections.map((sec) => (
              <View key={sec.id} style={s.row}>
                <CircleBtn
                  glyph=" "
                  size={22}
                  bg={sec.payload.color}
                  onPress={() => {
                    const at = pal.indexOf(sec.payload.color);
                    mutate((e) => e.put({ ...sec, payload: { ...sec.payload, color: pal[(at + 1) % pal.length]! } }));
                  }}
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
                <CircleBtn glyph="✎" size={26} onPress={() => { setRenaming(sec.id); setRenameText(sec.payload.name); }} />
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
            ))}
            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.doneRow}>
              <Pill label="Done" primary onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addField: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  renameField: { flex: 1, paddingVertical: 6 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
});
