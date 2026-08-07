/**
 * The Reminders list. Folder blocks, gold section titles with collapse
 * chevrons, the section-header "+", tick circles that roll a repeat instead of
 * finishing it, inline edit that re-parses dates out of the text, subtasks
 * (one level — a + on a task, a ‹ on a subtask), a repeat mini-editor, and the
 * two-press ×. All behavior comes from @calmind/core; this file is layout and
 * gestures.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  byOrd,
  newId,
  ordBetween,
  parseWhenFromText,
  repeatLabel,
  reminderToggle,
  sectionNameTaken,
  sortByDate,
  todayStr,
  type Rec,
  type Repeat,
  type RepeatUnit,
} from '@calmind/core';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { ItemModal } from '../components/ItemModal';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';

type FolderRec = Rec<'folder'>;
type SectionRec = Rec<'section'>;
type ReminderRec = Rec<'reminder'>;

const FOLD_KEY = 'calmind.folded.reminders';

export function Reminders() {
  const { recs, session, mutate } = useStore();
  const { visible: visibleFolders } = useFolderView('reminders');
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // sectionId with the open add row
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // reminder id in inline edit
  const [editText, setEditText] = useState('');
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newName, setNewName] = useState('');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [modalRec, setModalRec] = useState<ReminderRec | null>(null); // the full-edit window

  // Collapse state survives visits, per the suite's localStorage habit.
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

  const { folders, sectionsOf, remindersOf } = useMemo(() => {
    const folders = visibleFolders;
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
  }, [recs, visibleFolders]);

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

  // Ticking rolls a repeat instead of finishing it — the rule lives in core.
  const tick = (r: ReminderRec) => mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));

  const saveEdit = (r: ReminderRec) => {
    const raw = editText.trim();
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

  /** A blank subtask directly under its parent, opened for typing — the + on a task. */
  const addSubtask = (parent: ReminderRec) => {
    const siblings = recs
      .filter((x): x is ReminderRec => x.type === 'reminder' && x.payload.sectionId === parent.payload.sectionId)
      .sort((a, b) => byOrd(a.payload, b.payload));
    const at = siblings.findIndex((x) => x.id === parent.id);
    const next = siblings[at + 1];
    const id = newId();
    mutate((e) =>
      e.put({
        id, type: 'reminder', updated: 0,
        payload: {
          text: '', due: null, time: null, done: false, repeat: null,
          folderId: parent.payload.folderId, sectionId: parent.payload.sectionId,
          indent: 1, ord: ordBetween(parent.payload.ord, next?.payload.ord ?? null),
        },
      }),
    );
    setEditing(id);
    setEditText('');
  };

  /** The ‹ on a subtask: lift it back out to a task of its own. */
  const outdent = (r: ReminderRec) => mutate((e) => e.put({ ...r, payload: { ...r.payload, indent: 0 } }));

  const setRepeat = (r: ReminderRec, rep: Repeat | null) => mutate((e) => e.put({ ...r, payload: { ...r.payload, repeat: rep } }));

  const addSection = (folder: FolderRec) => {
    const name = newName.trim();
    setAddingSection(null);
    setNewName('');
    if (!name) return;
    const secs = sectionsOf(folder.id);
    if (sectionNameTaken(recs, folder.id, name)) return;
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

  const collapseAll = () => {
    const all = folders.flatMap((f) => sectionsOf(f.id).map((x) => x.id));
    const next = all.every((id) => folded.has(id)) ? new Set<string>() : new Set(all);
    setFolded(next);
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };

  /** The visible list as Markdown — sean's personal tool, as in prod. */
  const copyMarkdown = () => {
    const lines: string[] = [];
    for (const f of folders) {
      lines.push(`## ${f.payload.name}`);
      for (const sec of sectionsOf(f.id)) {
        lines.push(`### ${sec.payload.name}`);
        for (const r of remindersOf(sec.id)) {
          if (!showDone && r.payload.done) continue;
          const chip = [r.payload.due, r.payload.time, repeatLabel(r.payload.repeat)].filter(Boolean).join(' · ');
          const pad = r.payload.indent > 0 ? '  ' : '';
          lines.push(`${pad}- [${r.payload.done ? 'x' : ' '}] ${r.payload.text}${chip ? ` (${chip})` : ''}`);
        }
      }
    }
    Clipboard.setStringAsync(lines.join('\n')).catch(() => {});
  };

  const dueChip = (r: ReminderRec) => {
    const { due, time, repeat, done } = r.payload;
    if (!due && !time && !repeat) return null;
    const overdue = !done && due !== null && due < todayStr();
    const bits = [
      due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      time ?? '',
      repeatLabel(repeat),
    ].filter(Boolean);
    return <Text style={[s.chip, overdue && s.chipOverdue]}>{bits.join(' · ')}</Text>;
  };

  const repeatEditor = (r: ReminderRec) => {
    const rep = r.payload.repeat;
    return (
      <View style={s.repRow}>
        <Pill label="Once" primary={!rep} onPress={() => setRepeat(r, null)} />
        {(['day', 'week', 'month', 'year'] as RepeatUnit[]).map((u) => (
          <Pill key={u} label={u} primary={rep?.unit === u} onPress={() => setRepeat(r, { n: rep?.unit === u ? rep.n : 1, unit: u })} />
        ))}
        {rep && (
          <View style={s.repCount}>
            <CircleBtn glyph="−" size={22} onPress={() => setRepeat(r, { ...rep, n: Math.max(1, rep.n - 1) })} />
            <Text style={s.repN}>{rep.n}</Text>
            <CircleBtn glyph="+" size={22} onPress={() => setRepeat(r, { ...rep, n: Math.min(999, rep.n + 1) })} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.page}>
      <TopBar
        title="Reminders"
        controls={
          <View style={s.tools}>
            <CircleBtn glyph="⌄" onPress={collapseAll} />
            <CircleBtn glyph="☑" active={showDone} onPress={() => setShowDone(!showDone)} />
            {session?.username === 'sean' && <CircleBtn glyph="⧉" onPress={copyMarkdown} />}
            <FolderPick app="reminders" />
          </View>
        }
      />

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
              const isFolded = folded.has(sec.id);
              return (
                <View key={sec.id} style={s.section}>
                  <View style={s.secHead}>
                    <Pressable onPress={() => toggleFold(sec.id)} hitSlop={8}>
                      <Text style={s.chevron}>{isFolded ? '▸' : '▾'}</Text>
                    </Pressable>
                    <Text style={s.secName}>{sec.payload.name}</Text>
                    <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); if (isFolded) toggleFold(sec.id); }} />
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
                  {!isFolded &&
                    rows.map((r) => (
                      <View key={r.id}>
                        <View style={[s.row, r.payload.indent > 0 && s.rowIndented]}>
                          <Pressable onPress={() => tick(r)} hitSlop={8} style={[s.tick, r.payload.done && s.tickDone]}>
                            {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                          </Pressable>
                          {editing === r.id ? (
                            <>
                              <Field
                                value={editText}
                                onChangeText={setEditText}
                                autoFocus
                                style={s.editField}
                                onBlur={() => { saveEdit(r); if (editText.trim() === '' && r.payload.text === '') mutate((e) => e.del(r.id)); setEditing(null); }}
                                onSubmitEditing={() => { saveEdit(r); setEditing(null); }}
                              />
                              <CircleBtn glyph="✎" size={24} onPress={() => { saveEdit(r); setEditing(null); setModalRec(r); }} />
                              {r.payload.indent === 0 ? (
                                <CircleBtn glyph="+" size={24} onPress={() => { saveEdit(r); addSubtask(r); }} />
                              ) : (
                                <CircleBtn glyph="‹" size={24} onPress={() => { saveEdit(r); setEditing(null); outdent(r); }} />
                              )}
                              <ConfirmDelete onDelete={() => { setEditing(null); mutate((e) => e.del(r.id)); }} />
                            </>
                          ) : (
                            <Pressable
                              style={s.rowBody}
                              onLongPress={() => { setEditing(r.id); setEditText(r.payload.text); }}
                              delayLongPress={350}
                            >
                              <Text style={[s.rowText, r.payload.done && s.rowTextDone]}>{r.payload.text || '…'}</Text>
                              {dueChip(r)}
                            </Pressable>
                          )}
                        </View>
                        {editing === r.id && repeatEditor(r)}
                      </View>
                    ))}
                </View>
              );
            })}
          </View>
        ))}

      </ScrollView>

      {modalRec && <ItemModal mode="edit" kind="reminder" rec={modalRec} onClose={() => setModalRec(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
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
  chevron: { color: T.muted, fontSize: 12, width: 14, textAlign: 'center' },
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
  repRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 34, paddingBottom: 6, alignItems: 'center' },
  repCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
});
