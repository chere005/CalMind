/**
 * Manage folders — the suite's manager window: an add row with a green +, each
 * folder with a colour swatch (tap cycles the app palette), a pencil that
 * swaps the name for a rename field, and a two-press × (the rideAlong and last
 * folders refuse through core, and the refusal shows). Below, "Default for new
 * items" as folder·section pills. All rules come from core/manage.
 */
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  byOrd,
  deleteFolder,
  folderNameTaken,
  newId,
  ordBetween,
  prefsOf,
  prefsPut,
  renameFolder,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { APP_PALETTES, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';

export function FolderManager({ app, onClose }: { app: 'reminders' | 'notes'; onClose: () => void }) {
  const { recs, mutate } = useStore();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [err, setErr] = useState('');

  const { folders, sectionChoices, defaultSectionId } = useMemo(() => {
    const folders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app)
      .sort((a, b) => byOrd(a.payload, b.payload));
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    return {
      folders,
      sectionChoices: folders.flatMap((f) =>
        sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` })),
      ),
      defaultSectionId: prefsOf(recs, app).defaultSectionId,
    };
  }, [recs, app]);

  const flash = (m: string) => {
    setErr(m);
    setTimeout(() => setErr(''), 3000);
  };

  const add = () => {
    const name = newName.trim();
    setNewName('');
    if (!name) return;
    if (folderNameTaken(recs, app, name)) {
      flash('that name is taken');
      return;
    }
    mutate((e) => {
      const last = folders[folders.length - 1];
      e.put({
        id: newId(), type: 'folder', updated: 0,
        payload: { name, color: pal[folders.length % pal.length]!, ord: ordBetween(last?.payload.ord ?? null, null), app },
      });
    });
  };

  const pal = APP_PALETTES[app];
  const recolor = (f: Rec<'folder'>) => {
    const at = pal.indexOf(f.payload.color);
    const next = pal[(at + 1) % pal.length]!;
    mutate((e) => e.put({ ...f, payload: { ...f.payload, color: next } }));
  };

  const commitRename = (f: Rec<'folder'>) => {
    setRenaming(null);
    const res = renameFolder(recs, f.id, renameText);
    if ('error' in res) {
      if (renameText.trim() !== '' && renameText.trim() !== f.payload.name) flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  const remove = (f: Rec<'folder'>) => {
    const res = deleteFolder(recs, f.id);
    if ('error' in res) {
      flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Folders</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New folder" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" color={T.accent} size={34} onPress={add} />
            </View>

            {folders.map((f) => (
              <View key={f.id} style={s.row}>
                <CircleBtn glyph=" " size={22} color={f.payload.color} onPress={() => recolor(f)} bg={f.payload.color} />
                {renaming === f.id ? (
                  <Field
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    style={s.renameField}
                    onBlur={() => commitRename(f)}
                    onSubmitEditing={() => commitRename(f)}
                  />
                ) : (
                  <Text style={s.rowText}>
                    {f.payload.name}
                    {f.payload.rideAlong ? '  ·  rides on today' : ''}
                  </Text>
                )}
                <CircleBtn glyph="✎" size={26} onPress={() => { setRenaming(f.id); setRenameText(f.payload.name); }} />
                <ConfirmDelete onDelete={() => remove(f)} />
              </View>
            ))}

            <Text style={s.label}>Default for new items</Text>
            <View style={s.rowWrap}>
              {sectionChoices.map((c) => (
                <Pill
                  key={c.sec.id}
                  label={c.label}
                  primary={defaultSectionId ? defaultSectionId === c.sec.id : false}
                  onPress={() => mutate((e) => e.put(prefsPut(recs, app, { defaultSectionId: c.sec.id })))}
                />
              ))}
            </View>

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
  label: { color: T.dim, fontSize: 13, marginTop: 6 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
});
