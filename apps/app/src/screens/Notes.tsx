/**
 * Notes: folder blocks with gold sections, a note row opens the editor — title
 * plus a plain-text body autosaving on the store's debounce. Notes never
 * convert out and never repeat; a date in the title puts one on the calendar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteSection, renameSection, sectionNameTaken, byOrd, richLines, scaleRecipeBody, duplicateItem, formatRecipe, prefsPut, moveNote, moveSection, moveSectionEmptyingFolder, newId, nowStr, ordBetween, parseDateField, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { CircleBtn, ConfirmDelete, Field, Pill, Rule } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { useRowDrag } from '../components/rowdrag';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
import { useSwipeLeft } from '../components/swiperow';
import { Chevron } from '../components/Chevron';
import { RecipeEditor } from './RecipeEditor';

// Half, as written, and double — the three a cook actually asks for.
// The id stays ASCII: it reaches native as an accessibility identifier, and
// adb/XCUITest are no place to be matching on '½'.
const SCALES: [number, string, string][] = [[0.5, '½×', 'half'], [1, '1×', 'one'], [2, '2×', 'double']];

export function Notes({ openNoteId, onOpenConsumed }: { openNoteId?: string | null; onOpenConsumed?: () => void }) {
  const { recs, mutate, sharedRecs, sharedPartnerLabel } = useStore();
  const { view, visible: visibleFolders, visibleShared, sharedView, sharedPartner } = useFolderView('notes');
  const setNotePrefs = (lastView: string) => mutate((e) => e.put(prefsPut(recs, 'notes', { lastView })));
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [dateOpen, setDateOpen] = useState(false);
  const [bodyEditing, setBodyEditing] = useState(false);
  // While the cursor is in the body, the field holds its own copy of the text.
  // The record still gets every keystroke — this only stops the 30s poll from
  // pulling a newer version from another device out from under a half-typed
  // sentence. Reading stale text for as long as you are typing is the same
  // bargain every editor makes; losing the sentence is not.
  const [draft, setDraft] = useState<string | null>(null);
  // The title has no edit mode — it is always a live field — so it needs the
  // same shelter, scoped to having focus rather than to a mode.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  // Doubling a recipe is a way of READING it, not an edit — nothing is
  // written, and 1× is always one tap away.
  const [scale, setScale] = useState(1);
  const [recipeOpen, setRecipeOpen] = useState(false);

  const swipe = useSwipeLeft();
  // The suite's page edit mode: long-press a row to enter, tap away or
  // Escape to leave; grips and row controls exist only inside it.
  const [pageEdit, setPageEdit] = useState(false);
  const [nfolded, setNFolded] = useState<Set<string>>(new Set());
  const [foldedFolders, setFoldedFolders] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.foldedFolders.notes').then((raw) => raw && setFoldedFolders(new Set(JSON.parse(raw))));
  }, []);
  const toggleFolderFold = (id: string) => {
    const next = new Set(foldedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFoldedFolders(next);
    AsyncStorage.setItem('calmind.foldedFolders.notes', JSON.stringify([...next])).catch(() => {});
  };
  useEffect(() => {
    AsyncStorage.getItem('calmind.folded.notes').then((raw) => raw && setNFolded(new Set(JSON.parse(raw))));
  }, []);
  const foldSave = (next: Set<string>) => {
    setNFolded(next);
    AsyncStorage.setItem('calmind.folded.notes', JSON.stringify([...next])).catch(() => {});
  };
  const collapseAllNotes = () => {
    const all = folders.flatMap((f) => sectionsOf(f.id).map((x) => x.id));
    foldSave(all.every((id) => nfolded.has(id)) ? new Set<string>() : new Set(all));
  };
  const toggleNFold = (id: string) => {
    const next = new Set(nfolded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    foldSave(next);
  };
  useEffect(() => {
    if (!pageEdit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setPageEdit(false); };
    // Capture phase: a focused field can swallow Escape before it bubbles.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pageEdit]);
  const [dateField, setDateField] = useState('');
  const [goesOpen, setGoesOpen] = useState(false);
  const [delArmed, setDelArmed] = useState(false);

  // Another screen (the Add tab) created a note — land in its editor, as prod does.
  React.useEffect(() => {
    if (openNoteId) {
      setOpenId(openNoteId);
      onOpenConsumed?.();
    }
  }, [openNoteId, onOpenConsumed]);
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newSecName, setNewSecName] = useState('');
  const [adding, setAddingRaw] = useState<string | null>(null); // sectionId
  const [addText, setAddText] = useState('');
  const setAdding = (v: string | null) => {
    if (v !== null) addCommitted.current = false;
    setAddingRaw(v);
  };

  const { folders, sectionsOf, notesOf } = useMemo(() => {
    const folders = visibleFolders;
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const notes = recs.filter((r): r is Rec<'note'> => r.type === 'note').sort((a, b) => byOrd(a.payload, b.payload));
    return {
      folders,
      sectionsOf: (fid: string) => sections.filter((x) => x.payload.folderId === fid),
      notesOf: (sid: string) => notes.filter((x) => x.payload.sectionId === sid),
    };
  }, [recs, visibleFolders]);

  // Every visible row in render order, plus a placeholder per empty section
  // so an empty section is a drop target (row-height only while dragging).
  type FlatEntry = { kind: 'row'; rec: Rec<'note'>; sectionId: string } | { kind: 'empty'; sectionId: string };
  const flatRows = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const f of folders) {
      for (const sec of sectionsOf(f.id)) {
        const rows = notesOf(sec.id);
        if (rows.length === 0) out.push({ kind: 'empty', sectionId: sec.id });
        for (const n of rows) out.push({ kind: 'row', rec: n, sectionId: sec.id });
      }
    }
    return out;
  }, [folders, sectionsOf, notesOf]);
  const drag = useRowDrag(flatRows.length, (from, to) => {
    const src = flatRows[from];
    if (src?.kind !== 'row') return;
    const slotIdx = to > from ? to + 1 : to;
    const before = flatRows[slotIdx];
    const destSectionId = before?.sectionId ?? flatRows[flatRows.length - 1]?.sectionId ?? src.sectionId;
    const beforeId = before?.kind === 'row' ? before.rec.id : null;
    const res = moveNote(recs, src.rec.id, destSectionId, beforeId);
    if ('error' in res) return;
    mutate((e) => res.put.forEach((r) => e.put(r)));
  });
  const flatIdxOf = (id: string) => flatRows.findIndex((x) => x.kind === 'row' && x.rec.id === id);
  const emptyIdxOf = (sectionId: string) => flatRows.findIndex((x) => x.kind === 'empty' && x.sectionId === sectionId);

  const [emptyAsk, setEmptyAsk] = useState<{ sectionId: string; slot: SectionSlot } | null>(null);
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [renameSecText, setRenameSecText] = useState('');
  const lastSecTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveSection(recs, sectionId, slot.folderId, slot.beforeSectionId);
    if (!('error' in res)) {
      mutate((e) => res.put.forEach((r) => e.put(r)));
      return;
    }
    if (res.error === 'a folder keeps its last section') setEmptyAsk({ sectionId, slot });
  });

  const open = openId ? (recs.find((r) => r.id === openId) as Rec<'note'> | undefined) : undefined;
  useEffect(() => { setScale(1); }, [openId]);
  // Only OUR bodies scale — the markers are what say the ingredients have
  // been read and separated from the prose around them.
  const isRecipe = open ? /^\*\*Ingredients\*\*$/im.test(open.payload.body) : false;
  const shownBody = open ? (scale === 1 ? open.payload.body : scaleRecipeBody(open.payload.body, scale)) : '';

  const goesChoices = useMemo(() => {
    const allFolders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === 'notes')
      .sort((a, b) => byOrd(a.payload, b.payload));
    const allSections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    return allFolders.flatMap((f) =>
      allSections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` })),
    );
  }, [recs]);
  const goesLabel = open ? goesChoices.find((c) => c.sec.id === open.payload.sectionId)?.label ?? '—' : '—';
  const noteFolderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of goesChoices) {
      const fid = c.sec.payload.folderId;
      if (!seen.has(fid)) seen.set(fid, c.label.split(' · ')[0]!);
    }
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [goesChoices]);

  const addCommitted = React.useRef(false);
  // The suite carries the folder-head + in Notes as well as Reminders, always
  // shown rather than hidden in edit mode. Without it there was NO way to make
  // a note section at all: normalize seeds one per folder and that was that.
  const addSection = (folder: Rec<'folder'>) => {
    const name = newSecName.trim();
    setAddingSection(null);
    setNewSecName('');
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

  const addNote = (section: Rec<'section'>) => {
    // Enter fires submit AND blur on web — one field, one note.
    if (addCommitted.current) return;
    addCommitted.current = true;
    const raw = addText.trim();
    setAdding(null);
    setAddText('');
    if (!raw) return;
    const [title, date] = parseWhenFromText(raw, todayStr(), nowStr());
    const id = newId();
    mutate((e) => {
      const first = notesOf(section.id)[0];
      e.put({
        id, type: 'note', updated: 0,
        payload: { title: title || raw, body: '', date, folderId: section.payload.folderId, sectionId: section.id, ord: ordBetween(null, first?.payload.ord ?? null) },
      });
    });
    setOpenId(id);
  };

  const wrapSel = (before: string, after = before) => {
    if (!open) return;
    const b = open.payload.body;
    const { start, end } = sel;
    const next = b.slice(0, start) + before + b.slice(start, end) + after + b.slice(end);
    mutate((e) => e.put({ ...open, payload: { ...open.payload, body: next } }));
  };
  const linePrefix = (marker: string) => {
    if (!open) return;
    const b = open.payload.body;
    const at = b.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
    const next = b.slice(0, at) + marker + b.slice(at);
    mutate((e) => e.put({ ...open, payload: { ...open.payload, body: next } }));
  };

  if (sharedView && sharedPartner) {
    return <SharedNotes viewKey={sharedView} partner={sharedPartner} />;
  }

  if (open) {
    return (
      <View style={s.page}>
        <View style={s.edHead}>
          <Pressable style={s.ddPill} onPress={() => setOpenId(null)}>
            <Text style={s.backText}>← All notes</Text>
          </Pressable>
          <Dropdown
            value={open.payload.folderId}
            options={noteFolderOptions}
            onPick={(fid) => {
              const firstSec = goesChoices.find((c) => c.sec.payload.folderId === fid)?.sec;
              if (firstSec) mutate((e) => e.put({ ...open, payload: { ...open.payload, folderId: fid, sectionId: firstSec.id } }));
            }}
          />
          <Dropdown
            value={open.payload.sectionId}
            options={goesChoices.filter((c) => c.sec.payload.folderId === open.payload.folderId).map((c) => ({ id: c.sec.id, label: c.sec.payload.name }))}
            onPick={(sid) => {
              const sec = goesChoices.find((c) => c.sec.id === sid)?.sec;
              if (sec) mutate((e) => e.put({ ...open, payload: { ...open.payload, folderId: sec.payload.folderId, sectionId: sec.id } }));
            }}
            gold
          />
        </View>
        <ScrollView contentContainerStyle={s.editor}>
          <View style={s.titleRow}>
            <TextInput
              testID="note-title"
              style={s.title}
              value={titleDraft ?? open.payload.title}
              placeholder="Title"
              placeholderTextColor={T.muted}
              onFocus={() => setTitleDraft(open.payload.title)}
              onBlur={() => setTitleDraft(null)}
              onChangeText={(t) => {
                setTitleDraft(t);
                mutate((e) => e.put({ ...open, payload: { ...open.payload, title: t } }));
              }}
            />
            {open.payload.date ? (
              <Pressable style={s.addDate} onPress={() => mutate((e) => e.put({ ...open, payload: { ...open.payload, date: null } }))}>
                <Text style={s.addDateText}>{open.payload.date} ×</Text>
              </Pressable>
            ) : (
              <Pressable style={s.addDate} onPress={() => { setDateOpen(!dateOpen); setDateField(''); }}>
                <Text style={s.addDateText}>+ Add date</Text>
              </Pressable>
            )}
          </View>
          {/* The format pills live under the name, as prod places them. */}
          <View style={s.toolRow}>
            <Pill label={'”'} onPress={() => linePrefix('> ')} />
            <Pill label="B" onPress={() => wrapSel('**')} />
            <Pill label="I" onPress={() => wrapSel('*')} />
            <Pill label="U" onPress={() => wrapSel('__')} />
            <Pill label="· List" onPress={() => linePrefix('- ')} />
            <Pill testID="recipe-import" label="Recipe" onPress={() => setRecipeOpen(true)} />
          </View>
          {dateOpen && (
            <View style={s.metaRow}>
              <Pill
                label="Today"
                onPress={() => { mutate((e) => e.put({ ...open, payload: { ...open.payload, date: todayStr() } })); setDateOpen(false); }}
              />
              <Field
                value={dateField}
                onChangeText={setDateField}
                placeholder="m/d"
                style={s.dateField}
                onSubmitEditing={() => {
                  const d = parseDateField(dateField, todayStr());
                  if (d) mutate((e) => e.put({ ...open, payload: { ...open.payload, date: d } }));
                  setDateOpen(false);
                }}
              />
            </View>
          )}

          {isRecipe && (
            <View testID="scale-row" style={s.scaleRow}>
              {SCALES.map(([f, label, id]) => (
                <Pressable
                  key={id}
                  testID={`scale-${id}`}
                  style={[s.scalePill, scale === f && s.scalePillOn]}
                  onPress={() => setScale(f)}
                  hitSlop={6}
                >
                  <Text style={[s.scaleText, scale === f && s.scaleTextOn]}>{label}</Text>
                </Pressable>
              ))}
              {scale !== 1 && <Text style={s.scaleNote}>Scaled — 1× to edit</Text>}
            </View>
          )}
          {bodyEditing ? (
            <TextInput
              testID="note-body-edit"
              style={s.body}
              value={draft ?? open.payload.body}
              placeholder="Write…"
              placeholderTextColor={T.muted}
              multiline
              autoFocus
              onBlur={() => {
                setBodyEditing(false);
                setDraft(null);
              }}
              onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
              onChangeText={(t) => {
                setDraft(t);
                mutate((e) => e.put({ ...open, payload: { ...open.payload, body: t } }));
              }}
            />
          ) : (
            <Pressable
              testID="note-body-view"
              style={s.body}
              onPress={() => {
                // At 2× the text on screen is not the text in the note, so
                // tapping must not drop you into an editor showing something
                // else. 1× is right there.
                if (scale !== 1) return;
                setDraft(open.payload.body);
                setBodyEditing(true);
              }}
            >
              {shownBody === '' ? (
                <Text style={s.bodyPlaceholder}>Write…</Text>
              ) : (
                richLines(shownBody).map((ln, i) => (
                  <View key={i} style={[s.rtLine, ln.kind === 'quote' && s.rtQuote, ln.kind === 'number' && s.rtStep]}>
                    {ln.kind === 'bullet' && <Text style={s.rtDot}>•</Text>}
                    {ln.kind === 'number' && <Text style={s.rtNum}>{ln.num}</Text>}
                    <Text style={[s.rtText, ln.kind === 'quote' && s.rtQuoteText]}>
                      {ln.runs.map((r, j) => (
                        <Text
                          key={j}
                          style={[
                            r.bold && s.rtBold,
                            r.italic && s.rtItalic,
                            r.under && s.rtUnder,
                          ]}
                        >
                          {r.text || (ln.runs.length === 1 ? ' ' : '')}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))
              )}
            </Pressable>
          )}

          {recipeOpen && <RecipeEditor note={open} onClose={() => setRecipeOpen(false)} />}
          {/* Saved sits bottom-left; the two-press delete bottom-right. */}
          <View style={s.footRow}>
            <Text style={s.saved}>{'Saved'}</Text>
            <Pressable
              onPress={() => {
                if (delArmed) { setOpenId(null); mutate((e) => e.del(open.id)); setDelArmed(false); }
                else { setDelArmed(true); setTimeout(() => setDelArmed(false), 2500); }
              }}
            >
              <Text style={[s.delText, delArmed && s.delArmed]}>Delete</Text>
            </Pressable>
          </View>
        </ScrollView>

      </View>
    );
  }

  return (
    <View style={s.page}>
      <TopBar title="Notes" picker={<FolderPick app="notes" />} />
      {/* A live drag holds the scroll still — see Habits for the why. */}
      <ScrollView contentContainerStyle={s.scroll} scrollEnabled={drag.dragIdx === null && secDrag.dragging === null}>
        <View style={s.toolbarRow}>
          <Pressable onPress={collapseAllNotes} hitSlop={8} style={s.collapseAllBtn}><Chevron open size={15} /></Pressable>
        </View>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            <View style={s.folderHead}>
              <Pressable onPress={() => toggleFolderFold(f.id)} hitSlop={8} style={s.chevWrap}>
                <Chevron open={!foldedFolders.has(f.id)} size={15} color={T.text} />
              </Pressable>
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn testID={`foldadd-${f.payload.name}`} glyph="+" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewSecName(''); }} />
              <View style={s.folderRule} />
            </View>
            {addingSection === f.id && (
              <Field
                value={newSecName}
                onChangeText={setNewSecName}
                placeholder="New section"
                autoFocus
                onBlur={() => addSection(f)}
                onSubmitEditing={() => addSection(f)}
              />
            )}
            {!foldedFolders.has(f.id) && sectionsOf(f.id).map((sec) => (
              <View key={sec.id} style={s.section}>
                {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                <View
                  ref={secDrag.registerHeader(sec.id, f.id)}
                  style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                >
                  <View testID={`nsec-grip-${sec.payload.name}`} {...(pageEdit ? secDrag.gripFor(sec.id, f.id) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                    <Text style={s.rowGripText}>≡</Text>
                  </View>
                  <Pressable onPress={() => toggleNFold(sec.id)} hitSlop={8} style={s.chevWrap}>
                    <Chevron open={!nfolded.has(sec.id)} />
                  </Pressable>
                  {renamingSec === sec.id ? (
                    <Field
                      testID="nsec-rename"
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
                      testID={`nsec-name-${sec.payload.name}`}
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
                  <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
                  {pageEdit && (
                    <ConfirmDelete testID={`nsecdel-${sec.payload.name}`} size={22} onDelete={() => {
                      const res = deleteSection(recs, sec.id);
                      if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                    }} />
                  )}
                </View>
                {adding === sec.id && (
                  <Field value={addText} onChangeText={setAddText} placeholder="New note" autoFocus onBlur={() => addNote(sec)} onSubmitEditing={() => addNote(sec)} />
                )}
                {!nfolded.has(sec.id) && notesOf(sec.id).length === 0 && (
                  <View>
                    {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                    <View testID={`nsecempty-${sec.payload.name}`} ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot}>
                    </View>
                  </View>
                )}
                {!nfolded.has(sec.id) && notesOf(sec.id).map((n) => (
                  <View key={n.id}>
                    {drag.slot !== null && flatIdxOf(n.id) === drag.slot && <View style={s.dropLine} />}
                    <View ref={drag.registerRow(flatIdxOf(n.id))} {...(pageEdit ? {} : swipe.handlersFor(n.id))} style={[s.row, s.rowNoSelect, drag.dragIdx !== null && flatIdxOf(n.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                      <View testID="note-grip" {...(pageEdit ? drag.handleFor(flatIdxOf(n.id)) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                        <Text style={s.rowGripText}>≡</Text>
                      </View>
                      <Pressable
                        testID="note-row"
                        onPress={() => { if (swipe.justSwiped()) return; if (swipe.swiped) { swipe.clear(); return; } setOpenId(n.id); }}
                        onLongPress={() => setPageEdit(true)}
                        delayLongPress={350}
                        style={s.rowBody}
                      >
                        <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                        <Text style={s.chev}>›</Text>
                      </Pressable>
                      {pageEdit && (
                        <>
                          <CircleBtn testID="note-dup" glyph="⧉" size={22} onPress={() => {
                            const res = duplicateItem(recs, n.id, newId);
                            if (!('error' in res)) mutate((e) => res.put.forEach((p) => e.put(p)));
                          }} />
                          <ConfirmDelete onDelete={() => mutate((e) => e.del(n.id))} />
                        </>
                      )}
                      {swipe.swiped === n.id && !pageEdit && (
                        <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((e) => e.del(n.id)); }} />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {secDrag.lineKey === `end:${f.id}` && <View style={s.dropLine} />}
          </View>
        ))}
        {view === 'all' && sharedPartner &&
          visibleShared
            .slice()
            .sort((a, b) => byOrd(a.payload, b.payload))
            .map((f) => (
              <View key={`sh${f.id}`} style={s.folderBlock}>
                <View style={s.folderHead}>
                  <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
                  <View style={s.folderRule} />
                  <Text style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  <View style={s.folderRule} />
                </View>
                {sharedRecs
                  .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
                  .sort((a, b) => byOrd(a.payload, b.payload))
                  .map((sec) => (
                    <View key={sec.id} style={s.section}>
                      <View style={s.secHead}>
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </View>
                      {sharedRecs
                        .filter((r): r is Rec<'note'> => r.type === 'note' && r.payload.sectionId === sec.id)
                        .sort((a, b) => byOrd(a.payload, b.payload))
                        .map((n) => (
                          <View key={n.id} style={s.row}>
                            <Pressable
                              testID="all-shared-note"
                              onPress={() => setNotePrefs(`@${sharedPartner}:${f.id}`)}
                              style={s.rowBody}
                            >
                              <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                              <Text style={s.chev}>›</Text>
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  ))}
              </View>
            ))}
        {pageEdit && <Pressable style={s.editBackdropFill} onPress={() => setPageEdit(false)} />}
      </ScrollView>
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
 * A partner's shared note folder: their sections and rows, read-only — a tap
 * opens the note RENDERED (richLines), never the editor. Structure and body
 * both stay theirs; live shared note editing is a later milestone.
 */
function SharedNotes({ viewKey, partner }: { viewKey: string; partner: string }) {
  const { sharedRecs, sharedPut, sharedPartnerLabel } = useStore();
  const shown = sharedPartnerLabel ?? partner;
  const folderId = viewKey.slice(viewKey.indexOf(':') + 1);
  const folder = sharedRecs.find((r): r is Rec<'folder'> => r.type === 'folder' && r.id === folderId);
  const sections = sharedRecs
    .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === folderId)
    .sort((a, b) => byOrd(a.payload, b.payload));
  const notesOf = (sid: string) =>
    sharedRecs
      .filter((r): r is Rec<'note'> => r.type === 'note' && r.payload.sectionId === sid)
      .sort((a, b) => byOrd(a.payload, b.payload));
  const [openShared, setOpenShared] = useState<Rec<'note'> | null>(null);
  const [sharedBodyEdit, setSharedBodyEdit] = useState(false);
  const [draft, setDraft] = useState('');
  // A recipe someone shares with you is still a recipe to cook from.
  const [sharedScale, setSharedScale] = useState(1);
  useEffect(() => { setSharedScale(1); }, [openShared?.id]);

  if (openShared) {
    const commitBody = () => {
      setSharedBodyEdit(false);
      if (draft !== openShared.payload.body) {
        const next = { ...openShared, payload: { ...openShared.payload, body: draft } };
        setOpenShared(next);
        void sharedPut(next);
      }
    };
    return (
      <View style={s.page}>
        <View style={s.edHead}>
          <Pressable style={s.ddPill} onPress={() => setOpenShared(null)}>
            <Text style={s.backText}>← @{shown}: {folder?.payload.name ?? ''}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.editor}>
          <Text style={s.sharedTitle}>{openShared.payload.title}</Text>
          {openShared.payload.date && <Text style={s.sharedDate}>{openShared.payload.date}</Text>}
          {/^\*\*Ingredients\*\*$/im.test(openShared.payload.body) && (
            <View testID="shared-scale-row" style={s.scaleRow}>
              {SCALES.map(([f, label, id]) => (
                <Pressable
                  key={id}
                  testID={`shared-scale-${id}`}
                  style={[s.scalePill, sharedScale === f && s.scalePillOn]}
                  onPress={() => setSharedScale(f)}
                  hitSlop={6}
                >
                  <Text style={[s.scaleText, sharedScale === f && s.scaleTextOn]}>{label}</Text>
                </Pressable>
              ))}
              {sharedScale !== 1 && <Text style={s.scaleNote}>Scaled — 1× to edit</Text>}
            </View>
          )}
          {sharedBodyEdit ? (
            <TextInput
              testID="shared-note-edit"
              style={s.body}
              value={draft}
              multiline
              autoFocus
              onChangeText={setDraft}
              onBlur={commitBody}
            />
          ) : (
            <Pressable
              testID="shared-note-body"
              style={s.body}
              onPress={() => {
                // Same rule as your own notes: never open an editor on text
                // that is not what the note says.
                if (sharedScale !== 1) return;
                setDraft(openShared.payload.body);
                setSharedBodyEdit(true);
              }}
            >
              {richLines(sharedScale === 1 ? openShared.payload.body : scaleRecipeBody(openShared.payload.body, sharedScale)).map((ln, i) => (
                <View key={i} style={[s.rtLine, ln.kind === 'number' && s.rtStep, ln.kind === 'quote' && s.rtQuote]}>
                  {ln.kind === 'bullet' && <Text style={s.rtDot}>•</Text>}
                  {ln.kind === 'number' && <Text style={s.rtNum}>{ln.num}</Text>}
                  <Text style={[s.rtText, ln.kind === 'quote' && s.rtQuoteText]}>
                    {ln.runs.map((r, j) => (
                      <Text key={j} style={[r.bold && s.rtBold, r.italic && s.rtItalic, r.under && s.rtUnder]}>{r.text || ' '}</Text>
                    ))}
                  </Text>
                </View>
              ))}
            </Pressable>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.page}>
      <TopBar title="Notes" picker={<FolderPick app="notes" />} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.folderHead}>
          <Text style={s.sharedFolderChip}>@{shown}: {folder?.payload.name ?? '…'}</Text>
        </View>
        {sections.map((sec) => (
          <View key={sec.id} style={s.section}>
            <View style={s.secHead}>
              <Text style={s.secName}>{sec.payload.name}</Text>
            </View>
            {notesOf(sec.id).map((n) => (
              <View key={n.id} style={s.row}>
                <Pressable testID="shared-note-row" onPress={() => setOpenShared(n)} style={s.rowBody}>
                  <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                  <Text style={s.chev}>›</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  topbar: { height: 32, marginTop: 16, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
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
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  secRename: { flex: 1, paddingVertical: 4 },
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  chevron: { color: T.dim, fontSize: 16, width: 20, textAlign: 'center' },
  chevWrap: { width: 20, alignItems: 'center', justifyContent: 'center' },
  collapseAllBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  sharedTitle: { color: T.text, fontSize: 22, fontWeight: '800' },
  sharedDate: { color: T.dim, fontSize: 13, marginTop: 2 },
  sharedFolderChip: { color: T.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  gripHidden: { opacity: 0 },
  editBackdropFill: { minHeight: 160 },
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  rowGripText: { color: T.lineSoft, fontSize: 13, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 0, overflow: 'hidden' },
  askBackdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  askCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20, gap: 14 },
  askText: { color: T.text, fontSize: 15, lineHeight: 22 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  rowTitle: { color: T.text, fontSize: 16, flex: 1 },
  chev: { color: T.muted, fontSize: 16, marginLeft: 'auto' },
  editor: { padding: 16, gap: 10 },
  edHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginHorizontal: 16, marginBottom: 8, flexWrap: 'wrap' },
  ddPill: { borderWidth: 1, borderColor: T.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.surface },
  ddPillGold: { borderColor: T.gold },
  backText: { color: T.accent, fontSize: 15, fontWeight: '600' },
  ddText: { color: T.text, fontSize: 15, fontWeight: '600' },
  ddTextGold: { color: T.gold, fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addDate: { borderWidth: 1, borderColor: T.accent, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  addDateText: { color: T.accent, fontSize: 14, fontWeight: '600' },
  delText: { color: T.dim, fontSize: 15, borderWidth: 1, borderColor: T.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, overflow: 'hidden' },
  delArmed: { color: '#fff', backgroundColor: T.danger, borderColor: T.danger },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateField: { minWidth: 90, paddingVertical: 6 },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  saved: { color: T.muted, fontSize: 12 },
  goesMenu: { position: 'absolute', left: 16, right: 16, top: 140, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  title: {
    flex: 1,
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chip: { color: T.dim, fontSize: 12 },
  ocrBusy: { color: T.dim, fontSize: 13, alignSelf: 'center' },
  bodyPlaceholder: { color: T.muted, fontSize: 16, lineHeight: 24 },
  rtLine: { flexDirection: 'row', alignItems: 'flex-start' },
  rtQuote: { borderLeftWidth: 3, borderLeftColor: '#a78bfa', paddingLeft: 10, marginVertical: 2 },
  rtQuoteText: { color: T.dim, fontStyle: 'italic' },
  rtDot: { color: T.dim, fontSize: 16, lineHeight: 24, marginRight: 8 },
  // The number sits in a gutter so a wrapped step lines up as a block, and
  // the steps get a little air between them — a recipe is read a line at a
  // time, looking up from a pan and back.
  rtNum: { color: T.dim, fontSize: 16, lineHeight: 24, marginRight: 8, minWidth: 20 },
  rtStep: { marginTop: 6 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scalePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.line },
  scalePillOn: { borderColor: T.accent, backgroundColor: T.accent + '22' },
  scaleText: { color: T.dim, fontSize: 14 },
  scaleTextOn: { color: T.accent, fontWeight: '700' },
  scaleNote: { color: T.muted, fontSize: 12, flexShrink: 1 },
  rtText: { color: T.text, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  rtBold: { fontWeight: '700' },
  rtItalic: { fontStyle: 'italic' },
  rtUnder: { textDecorationLine: 'underline' },
  body: {
    color: T.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 280,
    textAlignVertical: 'top',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 12,
    padding: 12,
  },
}));
