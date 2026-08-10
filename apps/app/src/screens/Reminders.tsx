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
import { byOrd, deleteSection, duplicateItem, moveReminderBlock, moveSection, moveSectionEmptyingFolder, newId, nowStr, ordBetween, parseWhenFromText, reminderToggle, remindersMarkdown, renameSection, repeatLabel, sectionNameTaken, sortByDate, timeLabel, todayStr, type Rec, type Repeat, type RepeatUnit } from '@calmind/core';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { useRowDrag } from '../components/rowdrag';
import { useSwipeLeft } from '../components/swiperow';
import { Chevron } from '../components/Chevron';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
import { ItemModal } from '../components/ItemModal';
import { CircleBtn, ConfirmDelete, Field, Pill, WebHitSlop } from '../ui';

type FolderRec = Rec<'folder'>;
type SectionRec = Rec<'section'>;
type ReminderRec = Rec<'reminder'>;

const FOLD_KEY = 'calmind.folded.reminders';

export function Reminders() {
  const { recs, session, mutate, sharedRecs, sharedPut, sharedPartnerLabel } = useStore();
  const { view, visible: visibleFolders, visibleShared, sharedView, sharedPartner } = useFolderView('reminders');
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // sectionId with the open add row
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // reminder id in inline edit
  const [editText, setEditText] = useState('');
  const holdCluster = React.useRef(false);
  const swipe = useSwipeLeft();
  const [pageEdit, setPageEdit] = useState(false);
  const exitEdit = () => { setPageEdit(false); setEditing(null); };
  useEffect(() => {
    if (!pageEdit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') exitEdit(); };
    // Capture phase: a focused field can swallow Escape before it bubbles.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pageEdit]);
  const enterEdit = (r: ReminderRec) => { setPageEdit(true); setEditing(r.id); setEditText(r.payload.text); };
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newName, setNewName] = useState('');
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [renameSecText, setRenameSecText] = useState('');
  const lastSecTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [foldedFolders, setFoldedFolders] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.foldedFolders.reminders')
      .then((raw) => raw && setFoldedFolders(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const toggleFolderFold = (id: string) => {
    const next = new Set(foldedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFoldedFolders(next);
    // Swallowed deliberately, and this is the triage: what is lost when a
    // fold write fails is which sections were collapsed, next launch. No
    // user content, nothing unrecoverable, and an alert about a collapsed
    // folder would be worse than the loss. The failures worth surfacing in
    // this app are the ones that lose DATA or lie about state — see
    // store.tsx's persistFailed and the shared-write reconcile.
    AsyncStorage.setItem('calmind.foldedFolders.reminders', JSON.stringify([...next])).catch(() => {});
  };
  const lastTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const [modalRec, setModalRec] = useState<ReminderRec | null>(null); // the full-edit window

  // Collapse state survives visits, per the suite's localStorage habit.
  useEffect(() => {
    AsyncStorage.getItem(FOLD_KEY)
      .then((raw) => raw && setFolded(new Set(JSON.parse(raw))))
      .catch(() => {});
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

  const drag = useRowDrag(flatRows.length, (from, to) => {
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
    const [text, due, time] = parseWhenFromText(raw, todayStr(), nowStr());
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
  // A ticked repeat doesn't check off — it ROLLS to its next date, and the
  // roll must be visible or the checkbox reads as dead: the row flashes for
  // the suite's 2.2s and its date chip lights in the accent.
  const [rolledId, setRolledId] = useState<string | null>(null);
  const rollTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const tick = (r: ReminderRec) => {
    mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));
    if (r.payload.repeat && !r.payload.done) {
      setRolledId(r.id);
      clearTimeout(rollTimer.current);
      rollTimer.current = setTimeout(() => setRolledId(null), 2200);
    }
  };

  const saveEdit = (r: ReminderRec) => {
    const raw = editText.trim();
    if (!raw || raw === r.payload.text) return;
    // Editing re-reads the text the same way adding does, so retyping a date moves it.
    const [text, due, time] = parseWhenFromText(raw, todayStr(), nowStr());
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

  /** Every section, so the button can both act and show which way it points. */
  const allSectionIds = folders.flatMap((f) => sectionsOf(f.id).map((x) => x.id));
  const allCollapsed = allSectionIds.length > 0 && allSectionIds.every((id) => folded.has(id));
  const collapseAll = () => {
    const next = allCollapsed ? new Set<string>() : new Set(allSectionIds);
    setFolded(next);
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };

  /** The visible list as Markdown — sean's personal tool, as in prod. */
  const [copyNote, setCopyNote] = useState('');
  const copyMarkdown = () => {
    // The shaping lives in core so it can be tested; this only says WHICH
    // folders, sections and rows are on screen.
    const md = remindersMarkdown(
      folders.map((f) => ({
        name: f.payload.name,
        sections: sectionsOf(f.id).map((sec) => ({
          name: sec.payload.name,
          rows: remindersOf(sec.id).map((r) => ({
            text: r.payload.text,
            due: r.payload.due,
            time: r.payload.time,
            repeat: repeatLabel(r.payload.repeat),
            done: r.payload.done,
            indent: r.payload.indent,
          })),
        })),
      })),
      showDone,
    );
    // Pressing it used to do nothing visible whether it worked or not: no
    // "copied", and a refusal — a browser that will not give the clipboard to
    // a page it thinks is unfocused — swallowed whole. A button with no
    // answer is a button you press twice.
    Clipboard.setStringAsync(md)
      .then(() => setCopyNote('Copied'))
      .catch(() => setCopyNote('Could not copy'))
      .finally(() => setTimeout(() => setCopyNote(''), 2000));
  };

  const dueChip = (r: ReminderRec) => {
    const { due, time, repeat, done } = r.payload;
    if (!due && !time && !repeat) return null;
    const overdue = !done && due !== null && due < todayStr();
    const bits = [
      due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      timeLabel(time),
      repeatLabel(repeat),
    ].filter(Boolean);
    return <Text style={[s.chip, overdue && s.chipOverdue, rolledId === r.id && s.chipRolled]}>{bits.join(' · ')}</Text>;
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
            <CircleBtn glyph="−" label="Fewer" size={22} onPress={() => setRepeat(r, { ...rep, n: Math.max(1, rep.n - 1) })} />
            <Text style={s.repN}>{rep.n}</Text>
            <CircleBtn glyph="+" label="Add" size={22} onPress={() => setRepeat(r, { ...rep, n: Math.min(999, rep.n + 1) })} />
          </View>
        )}
      </View>
    );
  };

  if (sharedView && sharedPartner) {
    return <SharedReminders viewKey={sharedView} partner={sharedPartner} />;
  }

  return (
    <View style={s.page}>
      <TopBar title="Reminders" picker={<FolderPick app="reminders" />} />
      {/* The suite's toolbar row: under the divider, immediately above the folders. */}
      <View style={s.toolbar}>
        <Pressable onPress={collapseAll} hitSlop={8} accessibilityRole="button" accessibilityLabel={allCollapsed ? 'Expand all' : 'Collapse all'} style={s.collapseAllBtn}><WebHitSlop /><Chevron open={!allCollapsed} double /></Pressable>
        <CircleBtn glyph="☑" label="Completed" active={showDone} onPress={() => setShowDone(!showDone)} />
        {session?.username === 'sean' && <CircleBtn testID="rem-copymd" glyph="⧉" label="Duplicate" onPress={copyMarkdown} />}
        {copyNote !== '' && <Text testID="rem-copynote" style={s.copyNote}>{copyNote}</Text>}
      </View>

      {/* A live drag holds the scroll still — see Habits for the why. */}
      <ScrollView contentContainerStyle={s.scroll} scrollEnabled={drag.dragIdx === null && secDrag.dragging === null}>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            <View style={s.folderHead}>
              {/* The folder's colour is the wash behind its name, not a dot beside it. */}
              <Pressable onPress={() => toggleFolderFold(f.id)} hitSlop={8} style={s.chevWrap}>
                <WebHitSlop />
                <Chevron open={!foldedFolders.has(f.id)} color={T.text} />
              </Pressable>
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn testID={`foldadd-${f.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewName(''); }} />
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
            {!foldedFolders.has(f.id) && sectionsOf(f.id).map((sec) => {
              const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done);
              const isFolded = folded.has(sec.id);
              return (
                <View key={sec.id} style={s.section}>
                  {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                  <View
                    ref={secDrag.registerHeader(sec.id, f.id)}
                    style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                  >
                    <View testID={`sec-grip-${sec.payload.name}`} {...(pageEdit ? secDrag.gripFor(sec.id, f.id) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                    <WebHitSlop slop={6} />
                      <Text style={s.rowGripText}>≡</Text>
                    </View>
                    <Pressable onPress={() => toggleFold(sec.id)} hitSlop={8} style={s.chevWrap}>
                      <WebHitSlop />
                      <Chevron open={!isFolded} />
                    </Pressable>
                    {renamingSec === sec.id ? (
                      <Field
                        testID="sec-rename"
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
                        testID={`sec-name-${sec.payload.name}`}
                        onPress={() => {
                          const now = Date.now();
                          if (lastSecTap.current.id === sec.id && now - lastSecTap.current.at < 300) {
                            setPageEdit(true);
                            setRenamingSec(sec.id);
                            setRenameSecText(sec.payload.name);
                          }
                          lastSecTap.current = { id: sec.id, at: now };
                        }}
                        onLongPress={() => { setPageEdit(true); setRenamingSec(sec.id); setRenameSecText(sec.payload.name); }}
                        delayLongPress={350}
                      >
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                    )}
                    <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); if (isFolded) toggleFold(sec.id); }} />
                    {pageEdit && (
                      <ConfirmDelete testID={`secdel-${sec.payload.name}`} size={22} onDelete={() => {
                        const res = deleteSection(recs, sec.id);
                        if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                      }} />
                    )}
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
                      <View testID={`secempty-${sec.payload.name}`} ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot}>
                      </View>
                    </View>
                  )}
                  {!isFolded &&
                    rows.map((r, ri) => (
                      <View key={r.id}>
                        {drag.slot !== null && flatIdxOf(r.id) === drag.slot && <View style={s.dropLine} />}
                        <View
                          testID="rem-row"
                          ref={drag.registerRow(flatIdxOf(r.id))}
                          {...(pageEdit ? {} : swipe.handlersFor(r.id))}
                          style={[
                            s.row,
                            rolledId === r.id && s.rowRolled,
                            ri === rows.length - 1 && s.rowLast,
                            editing !== r.id && s.rowNoSelect,
                            r.payload.indent > 0 && s.rowIndented,
                            drag.dragIdx !== null && flatIdxOf(r.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] },
                          ]}
                        >
                          <View
                            testID="row-grip"
                            {...(pageEdit ? drag.handleFor(flatIdxOf(r.id)) : {})}
                            style={[s.rowGrip, !pageEdit && s.gripHidden]}
                            pointerEvents={pageEdit ? 'auto' : 'none'}
                            hitSlop={6}
                          >
                            <Text style={s.rowGripText}>≡</Text>
                          </View>
                          <Pressable testID="tick" onPress={() => tick(r)} hitSlop={8} style={[s.tick, r.payload.done && s.tickDone]}>
                            <WebHitSlop />
                            {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                          </Pressable>
                          {editing === r.id ? (
                            <Field
                              testID="rem-edit"
                              value={editText}
                              onChangeText={setEditText}
                              autoFocus
                              style={s.editField}
                              onBlur={() => {
                                saveEdit(r);
                                // A pointer already down on a cluster button: keep the
                                // cluster mounted so its press can land (blur fires between
                                // pointerdown and click, and unmounting kills the tap).
                                if (holdCluster.current) { holdCluster.current = false; return; }
                                if (editText.trim() === '' && r.payload.text === '') mutate((e) => e.del(r.id));
                                setEditing(null);
                              }}
                              onSubmitEditing={() => { saveEdit(r); setEditing(null); }}
                            />
                          ) : (
                            <Pressable
                              testID="rem-body"
                              style={s.rowBody}
                              onPress={() => {
                                if (swipe.justSwiped()) return;
                                if (swipe.swiped) { swipe.clear(); return; }
                                if (pageEdit) { setEditing(r.id); setEditText(r.payload.text); return; }
                                // Double-click on desktop, as prod: two taps inside 300ms.
                                const now = Date.now();
                                if (lastTap.current.id === r.id && now - lastTap.current.at < 300) enterEdit(r);
                                lastTap.current = { id: r.id, at: now };
                              }}
                              onLongPress={() => enterEdit(r)}
                              delayLongPress={350}
                            >
                              <Text style={[s.rowText, r.payload.done && s.rowTextDone]}>{r.payload.text || '…'}</Text>
                            </Pressable>
                          )}
                          {editing !== r.id && dueChip(r)}
                          {pageEdit && (
                            <>
                              <CircleBtn testID="rem-pencil" glyph="✎" label="Edit" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { if (editing === r.id) saveEdit(r); setEditing(null); setModalRec(r); }} />
                              {r.payload.indent === 0 && (
                                <CircleBtn testID="rem-dup" glyph="⧉" label="Duplicate" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => {
                                  if (editing === r.id) saveEdit(r);
                                  setEditing(null);
                                  const res = duplicateItem(recs, r.id, newId);
                                  if (!('error' in res)) mutate((e) => res.put.forEach((p) => e.put(p)));
                                }} />
                              )}
                              {r.payload.indent === 0 ? (
                                <CircleBtn glyph="+" label="Add" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { if (editing === r.id) saveEdit(r); addSubtask(r); }} />
                              ) : (
                                <CircleBtn glyph="‹" label="Previous" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { if (editing === r.id) saveEdit(r); setEditing(null); outdent(r); }} />
                              )}
                              <ConfirmDelete onPressIn={() => { holdCluster.current = true; }} onDelete={() => { setEditing(null); mutate((e) => e.del(r.id)); }} />
                            </>
                          )}
                          {swipe.swiped === r.id && !pageEdit && (
                            <ConfirmDelete
                              testID="swipe-del"
                              forceArmed
                              onDelete={() => { swipe.clear(); mutate((e) => e.del(r.id)); }}
                            />
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

        {view === 'all' && sharedPartner &&
          visibleShared
            .slice()
            .sort((a, b) => byOrd(a.payload, b.payload))
            .map((f) => (
              <View key={`sh${f.id}`} style={s.folderBlock}>
                {/* A partner's folder collapses like my own. It had no control
                    at all, so the one list I cannot reorder was also the one I
                    could not put away. The state is MINE: it lives in this
                    device's AsyncStorage under the same key as my own folds,
                    is never written to their store and never synced, so
                    folding Aki's list away changes nothing on Aki's screen. */}
                <Pressable style={s.folderHead} onPress={() => toggleFolderFold(`sh:${f.id}`)} hitSlop={8}>
                  <View style={s.chevWrap}><WebHitSlop /><Chevron open={!foldedFolders.has(`sh:${f.id}`)} color={T.text} /></View>
                  <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
                  <View style={s.folderRule} />
                  <Text style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  <View style={s.folderRule} />
                </Pressable>
                {!foldedFolders.has(`sh:${f.id}`) && sharedRecs
                  .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
                  .sort((a, b) => byOrd(a.payload, b.payload))
                  .map((sec) => (
                    <View key={sec.id} style={s.section}>
                      {/* A partner's section collapses like my own. The
                          folder above it already did; the sections inside it
                          did not, so the only way to put one away was to put
                          the whole partner away. Keyed 'sh:' so a shared
                          section id can never collide with one of mine, and
                          the fold is MINE — device-local, never written to
                          their store, never synced. */}
                      <Pressable testID={`shared-secfold-${sec.payload.name}`} style={s.secHead} onPress={() => toggleFold(`sh:${sec.id}`)} hitSlop={8}>
                        <View style={s.chevWrap}><WebHitSlop /><Chevron open={!folded.has(`sh:${sec.id}`)} /></View>
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                      {!folded.has(`sh:${sec.id}`) && sortByDate(
                        sharedRecs
                          .filter((r): r is ReminderRec => r.type === 'reminder' && r.payload.sectionId === sec.id && !r.payload.done)
                          .sort((a, b) => byOrd(a.payload, b.payload))
                          .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
                      ).map(({ rec: r }, ri, arr) => (
                        <View key={r.id} style={[s.row, ri === arr.length - 1 && s.rowLast, r.payload.indent > 0 && s.rowIndented]}>
                          <Pressable
                            testID="all-shared-tick"
                            onPress={() => void sharedPut({ ...r, payload: reminderToggle(r.payload, todayStr()) })}
                            hitSlop={8}
                            style={s.tick}
                          />
                          <Text style={s.rowText}>{r.payload.text}</Text>
                          {dueChipStatic(r, todayStr())}
                        </View>
                      ))}
                    </View>
                  ))}
              </View>
            ))}
        {pageEdit && <Pressable style={s.editBackdropFill} onPress={exitEdit} />}
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

/**
 * A partner's shared folder: their sections and rows, MY tick — the one view
 * where every write goes to their store (sharedPut), and structure is
 * read-only: no edit mode, no grips, no cluster, no swipe. The section +
 * still adds a row into their section, as the suite allows.
 */
function SharedReminders({ viewKey, partner }: { viewKey: string; partner: string }) {
  const { sharedRecs, sharedPut, sharedPartnerLabel } = useStore();
  const shown = sharedPartnerLabel ?? partner;
  const today = todayStr();
  const folderId = viewKey.slice(viewKey.indexOf(':') + 1);
  const folder = sharedRecs.find((r): r is Rec<'folder'> => r.type === 'folder' && r.id === folderId);
  const sections = sharedRecs
    .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === folderId)
    .sort((a, b) => byOrd(a.payload, b.payload));
  const rowsOf = (secId: string) =>
    sortByDate(
      sharedRecs
        .filter((r): r is ReminderRec => r.type === 'reminder' && r.payload.sectionId === secId && !r.payload.done)
        .sort((a, b) => byOrd(a.payload, b.payload))
        .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
    ).map((row) => row.rec);
  const [adding, setAdding] = useState<string | null>(null);
  const [addText, setAddText] = useState('');

  return (
    <View style={s.page}>
      <TopBar title="Reminders" picker={<FolderPick app="reminders" />} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.folderHead}>
          <Text style={[s.folderName, { backgroundColor: (folder?.payload.color ?? '#888888') + '33' }]}>@{shown}: {folder?.payload.name ?? '…'}</Text>
        </View>
        {sections.map((sec) => (
          <View key={sec.id} style={s.section}>
            <View style={s.secHead}>
              <Text style={s.secName}>{sec.payload.name}</Text>
              <CircleBtn glyph="+" label="Add" size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
            </View>
            {adding === sec.id && (
              <Field
                testID="shared-add-field"
                value={addText}
                onChangeText={setAddText}
                autoFocus
                placeholder="New reminder"
                onSubmitEditing={() => {
                  const text = addText.trim();
                  setAdding(null);
                  if (!text) return;
                  const [title, due, time] = parseWhenFromText(text, today, nowStr());
                  void sharedPut({
                    id: newId(), type: 'reminder', updated: 0,
                    payload: { text: title, due, time, done: false, repeat: null, folderId, sectionId: sec.id, indent: 0, ord: ordBetween(null, rowsOf(sec.id)[0]?.payload.ord ?? null) },
                  } as Rec<'reminder'>);
                }}
              />
            )}
            {rowsOf(sec.id).map((r) => (
              <View key={r.id} style={[s.row, r.payload.indent > 0 && s.rowIndented]}>
                <Pressable
                  testID="shared-tick"
                  onPress={() => void sharedPut({ ...r, payload: reminderToggle(r.payload, today) })}
                  hitSlop={8}
                  style={[s.tick, r.payload.done && s.tickDone]}
                >
                  {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                </Pressable>
                <Text style={s.rowText}>{r.payload.text}</Text>
                {dueChipStatic(r, today)}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function dueChipStatic(r: ReminderRec, today: string) {
  if (!r.payload.due) return null;
  const overdue = r.payload.due < today && !r.payload.done;
  return <Text style={[s.chip, overdue && s.chipOverdue]}>{r.payload.due}{r.payload.time ? ` ${timeLabel(r.payload.time)}` : ''}</Text>;
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 16, paddingBottom: 48, gap: 18 },
  folderBlock: { gap: 8 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderName: {
    color: T.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  ownerBadge: { color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  folderRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chevron: { color: T.dim, fontSize: 16, width: 20, textAlign: 'center' },
  // An explicit HEIGHT, not the glyph's. This box had width 20 and no
  // height, so its height WAS the chevron — and on the web, where
  // hitSlop does nothing, taking the chevron from 11 to 7 would have
  // taken the tap target with it. 20x20 regardless of what is drawn.
  chevWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  copyNote: { color: T.dim, fontSize: 12, alignSelf: 'center' },
  // ONE collapse-all across the app: Notes drew it at 24 and Reminders at
  // 26, and Habits drew a text '⌃' in a 30pt CircleBtn instead. Same
  // control, three sizes and two symbols. 26 is the largest of them, and
  // the circle IS the tap target here — the chevron inside is decoration.
  collapseAllBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  secRename: { flex: 1, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.lineSoft },
  rowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  rowGripText: { color: T.lineSoft, fontSize: 13, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 0, overflow: 'hidden' },
  askBackdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  askCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20, gap: 14 },
  askText: { color: T.text, fontSize: 15, lineHeight: 22 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  // A swipe target never starts a text selection (a selection terminates the pan).
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  // visibility, not display: entering edit mode must not nudge text sideways.
  gripHidden: { opacity: 0 },
  editBackdropFill: { minHeight: 160 },
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
  chip: { color: T.dim, fontSize: 13, backgroundColor: T.surface2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', marginLeft: 'auto' },
  chipOverdue: { color: T.overdue, fontWeight: '600' },
  rowRolled: { backgroundColor: T.accentSoft, borderRadius: 8 },
  chipRolled: { color: T.accent, fontWeight: '700' },
  repRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 34, paddingBottom: 6, alignItems: 'center' },
  repCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
}));
