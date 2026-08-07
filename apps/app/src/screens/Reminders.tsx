/**
 * The Reminders list — milestone 1's app. Folder blocks, gold section titles,
 * the section-header "+", tick circles that roll a repeat instead of finishing
 * it, inline edit that re-parses dates out of the text, and the two-press ×.
 * All behavior comes from @calmind/core; this file is layout and gestures.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import {
  byOrd,
  newId,
  ordBetween,
  parseWhenFromText,
  repeatLabel,
  repeatNext,
  sortByDate,
  todayStr,
  type AnyRec,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { T, FOLDER_PALETTE } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill, Rule } from '../ui';
import { Settings } from './Settings';

type FolderRec = Rec<'folder'>;
type SectionRec = Rec<'section'>;
type ReminderRec = Rec<'reminder'>;

export function Reminders() {
  const { recs, session, syncState, mutate } = useStore();
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // sectionId with the open add row
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // reminder id in inline edit
  const [editText, setEditText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newName, setNewName] = useState('');

  const { folders, sectionsOf, remindersOf } = useMemo(() => {
    const folders = recs.filter((r): r is FolderRec => r.type === 'folder').sort((a, b) => byOrd(a.payload, b.payload));
    const sections = recs.filter((r): r is SectionRec => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const reminders = recs.filter((r): r is ReminderRec => r.type === 'reminder').sort((a, b) => byOrd(a.payload, b.payload));
    return {
      folders,
      sectionsOf: (fid: string) => sections.filter((x) => x.payload.folderId === fid),
      remindersOf: (sid: string) =>
        sortByDate(
          reminders
            .filter((x) => x.payload.sectionId === sid)
            .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
        ).map((row) => row.rec),
    };
  }, [recs]);

  const addReminder = (section: SectionRec) => {
    const raw = addText.trim();
    if (!raw) {
      setAdding(null);
      return;
    }
    // The parser is an instruction, never part of the title — "Vet 8/3 2pm" files itself.
    const [text, due, time] = parseWhenFromText(raw, todayStr());
    mutate((e) => {
      const first = remindersOf(section.id)[0];
      e.put({
        id: newId(),
        type: 'reminder',
        updated: 0,
        payload: {
          text: text || raw,
          due,
          time,
          done: false,
          repeat: null,
          folderId: section.payload.folderId,
          sectionId: section.id,
          indent: 0,
          // Prepended, as on the web: new rows land at the top of their section.
          ord: ordBetween(null, first?.payload.ord ?? null),
        },
      });
    });
    setAddText('');
    setAdding(null);
  };

  const tick = (r: ReminderRec) => {
    mutate((e) => {
      if (r.payload.repeat && r.payload.due && !r.payload.done) {
        // Ticking a repeat rolls the due date instead of finishing the series.
        e.put({ ...r, payload: { ...r.payload, due: repeatNext(r.payload.due, r.payload.repeat, r.payload.due) } });
      } else {
        e.put({ ...r, payload: { ...r.payload, done: !r.payload.done } });
      }
    });
  };

  const saveEdit = (r: ReminderRec) => {
    const raw = editText.trim();
    setEditing(null);
    if (!raw || raw === r.payload.text) return;
    // Editing re-reads the text the same way adding does, so retyping a date moves it.
    const [text, due, time] = parseWhenFromText(raw, todayStr());
    mutate((e) =>
      e.put({
        ...r,
        payload: { ...r.payload, text: text || raw, due: due ?? r.payload.due, time: time ?? r.payload.time },
      }),
    );
  };

  const addFolder = () => {
    const name = newName.trim();
    setAddingFolder(false);
    setNewName('');
    if (!name) return;
    mutate((e) => {
      const last = folders[folders.length - 1];
      e.put({
        id: newId(),
        type: 'folder',
        updated: 0,
        payload: { name, color: FOLDER_PALETTE[folders.length % FOLDER_PALETTE.length]!, ord: ordBetween(last?.payload.ord ?? null, null) },
      });
    });
  };

  const addSection = (folder: FolderRec) => {
    const name = newName.trim();
    setAddingSection(null);
    setNewName('');
    if (!name) return;
    const secs = sectionsOf(folder.id);
    if (secs.some((x) => x.payload.name.toLowerCase() === name.toLowerCase())) return;
    mutate((e) => {
      // Prepend, as on the web: a new section lands at the top of its folder.
      e.put({
        id: newId(),
        type: 'section',
        updated: 0,
        payload: { name, folderId: folder.id, ord: ordBetween(null, secs[0]?.payload.ord ?? null) },
      });
    });
  };

  const dueChip = (r: ReminderRec) => {
    const { due, time, repeat, done } = r.payload;
    if (!due && !time && !repeat) return null;
    const overdue = !done && due !== null && due < todayStr();
    const bits = [
      due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      time ?? '',
      repeatLabel(r.payload.repeat),
    ].filter(Boolean);
    return <Text style={[s.chip, overdue && s.chipOverdue]}>{bits.join(' · ')}</Text>;
  };

  return (
    <View style={s.page}>
      <View style={s.topbar}>
        <Text style={s.appname}>Reminders</Text>
        <View style={s.topRight}>
          <Text style={s.syncdot}>{syncState === 'syncing' ? '↻' : syncState === 'offline' ? '⌁ offline' : ''}</Text>
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={8}>
            <Text style={s.who}>{session?.username}</Text>
          </Pressable>
        </View>
      </View>
      <Rule />

      <ScrollView contentContainerStyle={s.scroll}>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            <View style={s.folderHead}>
              {/* The folder's colour is the wash behind its name, not a dot beside it. */}
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewName(''); }} />
              <View style={s.folderRule} />
            </View>
            {addingSection === f.id && (
              <Field
                value={newName}
                onChangeText={setNewName}
                placeholder="New section"
                autoFocus
                onBlur={() => addSection(f)}
                onSubmitEditing={() => addSection(f)}
              />
            )}
            {sectionsOf(f.id).map((sec) => {
              const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done);
              return (
                <View key={sec.id} style={s.section}>
                  <View style={s.secHead}>
                    <Text style={s.secName}>{sec.payload.name}</Text>
                    <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
                  </View>
                  {adding === sec.id && (
                    <Field
                      value={addText}
                      onChangeText={setAddText}
                      placeholder="New reminder — try “Vet 8/3 2pm”"
                      autoFocus
                      onBlur={() => addReminder(sec)}
                      onSubmitEditing={() => addReminder(sec)}
                    />
                  )}
                  {rows.map((r) => (
                    <View key={r.id} style={[s.row, r.payload.indent > 0 && s.rowIndented]}>
                      <Pressable onPress={() => tick(r)} hitSlop={8} style={[s.tick, r.payload.done && s.tickDone]}>
                        {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                      </Pressable>
                      {editing === r.id ? (
                        <Field
                          value={editText}
                          onChangeText={setEditText}
                          autoFocus
                          style={s.editField}
                          onBlur={() => saveEdit(r)}
                          onSubmitEditing={() => saveEdit(r)}
                        />
                      ) : (
                        <Pressable
                          style={s.rowBody}
                          onLongPress={() => { setEditing(r.id); setEditText(r.payload.text); }}
                          delayLongPress={350}
                        >
                          <Text style={[s.rowText, r.payload.done && s.rowTextDone]}>{r.payload.text}</Text>
                          {dueChip(r)}
                        </Pressable>
                      )}
                      {editing === r.id && <ConfirmDelete onDelete={() => { setEditing(null); mutate((e) => e.del(r.id)); }} />}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer}>
          {addingFolder ? (
            <Field
              value={newName}
              onChangeText={setNewName}
              placeholder="New folder"
              autoFocus
              onBlur={addFolder}
              onSubmitEditing={addFolder}
            />
          ) : (
            <View style={s.footerRow}>
              <Pill label="+ Folder" onPress={() => { setAddingFolder(true); setNewName(''); }} />
              <Pill label={showDone ? '☑ Completed' : '☐ Completed'} onPress={() => setShowDone(!showDone)} />
            </View>
          )}
        </View>
      </ScrollView>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  topbar: {
    height: 32,
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncdot: { color: T.muted, fontSize: 12 },
  who: { color: T.accent, fontSize: 14, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 48, gap: 18 },
  folderBlock: { gap: 8 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderName: {
    color: T.text,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  folderRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  secName: { color: T.gold, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowIndented: { paddingLeft: 28 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowText: { color: T.text, fontSize: 16, flexShrink: 1 },
  rowTextDone: { color: T.muted, textDecorationLine: 'line-through' },
  editField: { flex: 1 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: { backgroundColor: T.accentInk, borderColor: T.accent },
  tickMark: { color: T.accent, fontSize: 13, fontWeight: '700' },
  chip: { color: T.dim, fontSize: 12 },
  chipOverdue: { color: T.overdue, fontWeight: '600' },
  footer: { marginTop: 8 },
  footerRow: { flexDirection: 'row', gap: 8 },
});
