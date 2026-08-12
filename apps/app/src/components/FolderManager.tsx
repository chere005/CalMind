/**
 * Manage folders — the suite's manager window: an add row with a green +, each
 * folder with a colour swatch (tap opens the palette as a tray; see
 * SwatchTray — it used to cycle on tap, and this line still said so until
 * 2026-08-12, when the recolour helper it described turned up dead), a pencil that
 * swaps the name for a rename field, and a two-press × (the rideAlong and last
 * folders refuse through core, and the refusal shows). Below, "Default for new
 * items" as folder·section pills. All rules come from core/manage.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  byRecOrd,
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
import { themed, APP_PALETTES, APP_PALETTES_SHARED, T } from '../theme';
import { SwatchTray } from './SwatchTray';
import { CircleBtn, ConfirmDelete, Field, Pill, Scroll, WebHitSlop } from '../ui';
import { Dropdown } from './Dropdown';
import { ordForMove, useRowDrag } from './rowdrag';

export function FolderManager({ app, onClose }: { app: 'reminders' | 'notes'; onClose: () => void }) {
  const { recs, mutate, sharedRecs, sharedPartner, sharedPartnerLabel } = useStore();
  // The suite's shared recolour: a read-only row per shared folder whose
  // swatch cycles the LIGHTER shared palette — the override is mine, stored
  // in my prefs, and never touches the owner's data.
  const sharedFolders = sharedPartner
    ? sharedRecs.filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app)
    : [];
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [err, setErr] = useState('');

  const { folders, sectionChoices, defaultSectionId } = useMemo(() => {
    const folders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app)
      .sort(byRecOrd);
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
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

  const drag = useRowDrag(folders.length, (from: number, to: number) => {
    const item = folders[from];
    if (!item) return;
    const ord = ordForMove(folders, from, to);
    mutate((e) => e.put({ ...item, payload: { ...item.payload, ord } }));
  });

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
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Scroll contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Folders</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New folder" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" label="Add" color={T.accent} size={34} onPress={add} />
            </View>

            {folders.map((f, i) => (
              <View key={f.id}>
                {drag.slot === i && <View style={s.dropLine} />}
                <View testID="mgr-row" ref={drag.registerRow(i)} style={[s.row, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                <View testID="grip" {...drag.handleFor(i)} style={s.grip} hitSlop={8}><WebHitSlop /><Text style={s.gripText}>≡</Text></View>
                <SwatchTray testID={`mgr-swatch-${f.payload.name}`} palette={APP_PALETTES[app]} color={f.payload.color} onPick={(hex) => mutate((e) => e.put({ ...f, payload: { ...f.payload, color: hex } }))} />
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
                    
                  </Text>
                )}
                {!f.payload.rideAlong && (
                  <>
                    <CircleBtn glyph="✎" label="Edit" size={26} onPress={() => { setRenaming(f.id); setRenameText(f.payload.name); }} />
                    <ConfirmDelete testID="mgr-del" onDelete={() => remove(f)} />
                  </>
                )}
                </View>
              </View>
            ))}
            {drag.slot === folders.length && <View style={s.dropLine} />}

            {sharedFolders.length > 0 && (
              <>
                <Text style={s.label}>Shared with me</Text>
                {sharedFolders.map((f) => (
                  <View key={f.id} style={s.row}>
                    <SwatchTray testID={`shared-swatch-${f.payload.name}`} palette={APP_PALETTES_SHARED[app]} color={f.payload.color} onPick={(hex) => {
                      const key = `@${sharedPartner}:${f.id}`;
                      const cur = prefsOf(recs, app).sharedColors ?? {};
                      mutate((e) => e.put(prefsPut(recs, app, { sharedColors: { ...cur, [key]: hex } })));
                    }} />
                    <Text style={s.sharedName}>{f.payload.name}</Text>
                    <Text style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={s.label}>Default for new items</Text>
            <Dropdown
              value={defaultSectionId ?? null}
              options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label }))}
              onPick={(id) => mutate((e) => e.put(prefsPut(recs, app, { defaultSectionId: id })))}
              gold
            />

            <Text style={s.hint}>Deleting a folder keeps its items — they move to the default for new items.</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.lineSoft, borderRadius: 12, paddingHorizontal: 12, height: 52, marginBottom: 8 },
  grip: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gripText: { color: T.muted, fontSize: 15, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  renameField: { flex: 1, paddingVertical: 6 },
  sharedName: { color: T.dim, fontSize: 15, flex: 1 },
  label: { color: T.dim, fontSize: 13, marginTop: 6 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerBadge: { color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden', marginLeft: 'auto' },
  hint: { color: T.muted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
}));
