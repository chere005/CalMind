/**
 * The Reminders list. Folder blocks, gold section titles with collapse
 * chevrons, the section-header "+", tick circles that roll a repeat instead of
 * finishing it, inline edit that re-parses dates out of the text, subtasks
 * (one level — a + on a task, a ‹ on a subtask), a repeat mini-editor, and the
 * two-press ×. All behavior comes from @calmind/core; this file is layout and
 * gestures.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  byOrd,
  moveReminderBlock,
  moveSection,
  moveSectionEmptyingFolder,
  newId,
  renameSection,
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
import { useRowDrag } from '../components/rowdrag';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
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
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [renameSecText, setRenameSecText] = useState('');
  const lastSecTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const lastTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
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

  // Every visible row in render order — plus one placeholder per EMPTY
  // section, so an empty section is a drop target. Placeholders take a row's
  // height only while a drag is live, which keeps the index math uniform.
  type FlatEntry = { kind: 'row'; rec: ReminderRec; sectionId: string } | { kind: 'empty'; sectionId: string };
  const flatRows = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const f of folders) {
      for (const sec of sectionsOf(f.id)) {
        if (folded.has(sec.id)) continue;
        const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done);
        if (rows.length === 0) out.push({ kind: 'empty', sectionId: sec.id });
        for (const r of rows) out.push({ kind: 'row', rec: r, sectionId: sec.id });
      }
    }
    return out;
  }, [folders, sectionsOf, remindersOf, folded, showDone]);

  const ROW_H = 46;
  const drag = useRowDrag(flatRows.length, ROW_H, (from, to) => {
    const src = flatRows[from];
    if (src?.kind !== 'row') return;
    const slotIdx = to > from ? to + 1 : to;
    const before = flatRows[slotIdx];
    const destSectionId = before?.sectionId ?? flatRows[flatRows.length - 1]?.sectionId ?? src.sectionId;
    const beforeId = before?.kind === 'row' ? before.rec.id : null;
    const res = moveReminderBlock(recs, src.rec.id, destSectionId, beforeId);
    if ('error' in res) return;
    mutate((e) => res.put.forEach((r) => e.put(r)));
  });
  const flatIdxOf = (id: string) => flatRows.findIndex((x) => x.kind === 'row' && x.rec.id === id);
  const emptyIdxOf = (sectionId: string) => flatRows.findIndex((x) => x.kind === 'empty' && x.sectionId === sectionId);

  // Level 0: sections travel as blocks and land only between sections. When
  // the move would empty a folder, the suite asks first — so do we.
  const [emptyAsk, setEmptyAsk] = useState<{ sectionId: string; slot: SectionSlot } | null>(null);
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveSection(recs, sectionId, slot.folderId, slot.beforeSectionId);
    if (!('error' in res)) {
      mutate((e) => res.put.forEach((r) => e.put(r)));
      return;
    }
    if (res.error === 'a folder keeps its last section') setEmptyAsk({ sectionId, slot });
  });

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
      <TopBar title="Reminders" picker={<FolderPick app="reminders" />} />
      {/* The suite's toolbar row: under the divider, immediately above the folders. */}
      <View style={s.toolbar}>
        <CircleBtn glyph="⌄" onPress={collapseAll} />
        <CircleBtn glyph="☑" active={showDone} onPress={() => setShowDone(!showDone)} />
        {session?.username === 'sean' && <CircleBtn glyph="⧉" onPress={copyMarkdown} />}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            <View style={s.folderHead}>
              {/* The folder's colour is the wash behind its name, not a dot beside it. */}
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn testID={`foldadd-${f.payload.name}`} glyph="+" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewName(''); }} />
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
            {/* level-0 landing at this folder's end */}
            {sectionsOf(f.id).map((sec) => {
              const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done);
              const isFolded = folded.has(sec.id);
              return (
                <View key={sec.id} style={s.section}>
                  {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                  <View
                    ref={secDrag.registerHeader(sec.id, f.id)}
                    style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                  >
                    <View testID={`sec-grip-${sec.payload.name}`} {...secDrag.gripFor(sec.id, f.id)} style={s.rowGrip} hitSlop={6}>
                      <Text style={s.rowGripText}>≡</Text>
                    </View>
                    <Pressable onPress={() => toggleFold(sec.id)} hitSlop={8}>
                      <Text style={s.chevron}>{isFolded ? '▸' : '▾'}</Text>
                    </Pressable>
                    {renamingSec === sec.id ? (
                      <Field
                        value={renameSecText}
                        onChangeText={setRenameSecText}
                        autoFocus
                        style={s.secRename}
                        onBlur={() => {
                          setRenamingSec(null);
                          const res = renameSection(recs, sec.id, renameSecText);
                          if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                        }}
                        onSubmitEditing={() => {
                          setRenamingSec(null);
                          const res = renameSection(recs, sec.id, renameSecText);
                          if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                        }}
                      />
                    ) : (
                      <Pressable
                        onPress={() => {
                          const now = Date.now();
                          if (lastSecTap.current.id === sec.id && now - lastSecTap.current.at < 300) {
                            setRenamingSec(sec.id);
                            setRenameSecText(sec.payload.name);
                          }
                          lastSecTap.current = { id: sec.id, at: now };
                        }}
                        onLongPress={() => { setRenamingSec(sec.id); setRenameSecText(sec.payload.name); }}
                        delayLongPress={350}
                      >
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                    )}
                    <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); if (isFolded) toggleFold(sec.id); }} />
                  </View>
                  {adding === sec.id && (
                    <Field
                      testID="rem-add-field"
                      value={addText}
                      onChangeText={setAddText}
                      placeholder="New reminder — try “Vet 8/3 2pm”"
                      autoFocus
                      onBlur={() => addReminder(sec)}
                      onSubmitEditing={() => addReminder(sec)}
                    />
                  )}
                  {!isFolded && rows.length === 0 && (
                    <View>
                      {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                      <View style={[s.emptySlot, drag.dragIdx !== null && s.emptySlotLive]}>
                        {drag.dragIdx !== null && <Text style={s.emptySlotText}>drop here</Text>}
                      </View>
                    </View>
                  )}
                  {!isFolded &&
                    rows.map((r) => (
                      <View key={r.id}>
                        {drag.slot !== null && flatIdxOf(r.id) === drag.slot && <View style={s.dropLine} />}
                        <View
                          testID="rem-row"
                          style={[
                            s.row,
                            r.payload.indent > 0 && s.rowIndented,
                            drag.dragIdx !== null && flatIdxOf(r.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] },
                          ]}
                        >
                          <View testID="row-grip" {...drag.handleFor(flatIdxOf(r.id))} style={s.rowGrip} hitSlop={6}>
                            <Text style={s.rowGripText}>≡</Text>
                          </View>
                          <Pressable testID="tick" onPress={() => tick(r)} hitSlop={8} style={[s.tick, r.payload.done && s.tickDone]}>
                            {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                          </Pressable>
                          {editing === r.id ? (
                            <>
                              <Field
                                testID="rem-edit"
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
                              testID="rem-body"
                              style={s.rowBody}
                              onPress={() => {
                                // Double-click on desktop, as prod: two taps inside 300ms.
                                const now = Date.now();
                                if (lastTap.current.id === r.id && now - lastTap.current.at < 300) {
                                  setEditing(r.id);
                                  setEditText(r.payload.text);
                                }
                                lastTap.current = { id: r.id, at: now };
                              }}
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
            {secDrag.lineKey === `end:${f.id}` && <View style={s.dropLine} />}
          </View>
        ))}

      </ScrollView>

      {modalRec && <ItemModal mode="edit" kind="reminder" rec={modalRec} onClose={() => setModalRec(null)} />}
      {emptyAsk && (
        <Modal transparent animationType="fade" onRequestClose={() => setEmptyAsk(null)}>
          <Pressable style={s.askBackdrop} onPress={() => setEmptyAsk(null)}>
            <Pressable style={s.askCard} onPress={() => {}}>
              <Text style={s.askText}>That's the folder's last section — move it and delete the emptied folder?</Text>
              <View style={s.askRow}>
                <Pill label="Cancel" onPress={() => setEmptyAsk(null)} />
                <Pill
                  label="Move & delete"
                  primary
                  onPress={() => {
                    const res = moveSectionEmptyingFolder(recs, emptyAsk.sectionId, emptyAsk.slot.folderId, emptyAsk.slot.beforeSectionId);
                    if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                    setEmptyAsk(null);
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
    fontSize: 15,
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
  secName: { color: T.gold, fontSize: 15, fontWeight: '700' },
  secRename: { flex: 1, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46 },
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  rowGripText: { color: T.lineSoft, fontSize: 13, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 0, overflow: 'hidden' },
  emptySlotLive: { height: 46, borderWidth: 1, borderColor: T.lineSoft, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { color: T.muted, fontSize: 13 },
  askBackdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  askCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20, gap: 14 },
  askText: { color: T.text, fontSize: 15, lineHeight: 22 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  rowIndented: { paddingLeft: 28 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowText: { color: T.text, fontSize: 17, flexShrink: 1 },
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
  chip: { color: T.dim, fontSize: 13 },
  chipOverdue: { color: T.overdue, fontWeight: '600' },
  repRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 34, paddingBottom: 6, alignItems: 'center' },
  repCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
});
