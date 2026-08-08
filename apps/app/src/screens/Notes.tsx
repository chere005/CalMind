/**
 * Notes: folder blocks with gold sections, a note row opens the editor — title
 * plus a plain-text body autosaving on the store's debounce. Notes never
 * convert out and never repeat; a date in the title puts one on the calendar.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { byOrd, richLines, duplicateItem, moveNote, moveSection, moveSectionEmptyingFolder, newId, ordBetween, parseDateFromText, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { CircleBtn, ConfirmDelete, Field, Pill, Rule } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { useRowDrag } from '../components/rowdrag';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
import { useSwipeLeft } from '../components/swiperow';

export function Notes({ openNoteId, onOpenConsumed }: { openNoteId?: string | null; onOpenConsumed?: () => void }) {
  const { recs, mutate } = useStore();
  const { visible: visibleFolders } = useFolderView('notes');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [dateOpen, setDateOpen] = useState(false);
  const [bodyEditing, setBodyEditing] = useState(false);
  const swipe = useSwipeLeft();
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
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveSection(recs, sectionId, slot.folderId, slot.beforeSectionId);
    if (!('error' in res)) {
      mutate((e) => res.put.forEach((r) => e.put(r)));
      return;
    }
    if (res.error === 'a folder keeps its last section') setEmptyAsk({ sectionId, slot });
  });

  const open = openId ? (recs.find((r) => r.id === openId) as Rec<'note'> | undefined) : undefined;

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
  const addNote = (section: Rec<'section'>) => {
    // Enter fires submit AND blur on web — one field, one note.
    if (addCommitted.current) return;
    addCommitted.current = true;
    const raw = addText.trim();
    setAdding(null);
    setAddText('');
    if (!raw) return;
    const [title, date] = parseWhenFromText(raw, todayStr());
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
              style={s.title}
              value={open.payload.title}
              placeholder="Title"
              placeholderTextColor={T.muted}
              onChangeText={(t) => mutate((e) => e.put({ ...open, payload: { ...open.payload, title: t } }))}
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
                  const [, d] = parseDateFromText(dateField.trim(), todayStr());
                  if (d) mutate((e) => e.put({ ...open, payload: { ...open.payload, date: d } }));
                  setDateOpen(false);
                }}
              />
            </View>
          )}

          {bodyEditing ? (
            <TextInput
              testID="note-body-edit"
              style={s.body}
              value={open.payload.body}
              placeholder="Write…"
              placeholderTextColor={T.muted}
              multiline
              autoFocus
              onBlur={() => setBodyEditing(false)}
              onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
              onChangeText={(t) => mutate((e) => e.put({ ...open, payload: { ...open.payload, body: t } }))}
            />
          ) : (
            <Pressable testID="note-body-view" style={s.body} onPress={() => setBodyEditing(true)}>
              {open.payload.body === '' ? (
                <Text style={s.bodyPlaceholder}>Write…</Text>
              ) : (
                richLines(open.payload.body).map((ln, i) => (
                  <View key={i} style={[s.rtLine, ln.kind === 'quote' && s.rtQuote]}>
                    {ln.kind === 'bullet' && <Text style={s.rtDot}>•</Text>}
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
      <ScrollView contentContainerStyle={s.scroll}>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            <View style={s.folderHead}>
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <View style={s.folderRule} />
            </View>
            {sectionsOf(f.id).map((sec) => (
              <View key={sec.id} style={s.section}>
                {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                <View
                  ref={secDrag.registerHeader(sec.id, f.id)}
                  style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                >
                  <View testID={`nsec-grip-${sec.payload.name}`} {...secDrag.gripFor(sec.id, f.id)} style={s.rowGrip} hitSlop={6}>
                    <Text style={s.rowGripText}>≡</Text>
                  </View>
                  <Text style={s.secName}>{sec.payload.name}</Text>
                  <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
                </View>
                {adding === sec.id && (
                  <Field value={addText} onChangeText={setAddText} placeholder="New note" autoFocus onBlur={() => addNote(sec)} onSubmitEditing={() => addNote(sec)} />
                )}
                {notesOf(sec.id).length === 0 && (
                  <View>
                    {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                    <View testID={`nsecempty-${sec.payload.name}`} ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot}>
                    </View>
                  </View>
                )}
                {notesOf(sec.id).map((n) => (
                  <View key={n.id}>
                    {drag.slot !== null && flatIdxOf(n.id) === drag.slot && <View style={s.dropLine} />}
                    <View ref={drag.registerRow(flatIdxOf(n.id))} {...swipe.handlersFor(n.id)} style={[s.row, s.rowNoSelect, drag.dragIdx !== null && flatIdxOf(n.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                      <View testID="note-grip" {...drag.handleFor(flatIdxOf(n.id))} style={s.rowGrip} hitSlop={6}>
                        <Text style={s.rowGripText}>≡</Text>
                      </View>
                      <Pressable testID="note-row" onPress={() => { if (swipe.justSwiped()) return; if (swipe.swiped) { swipe.clear(); return; } setOpenId(n.id); }} style={s.rowBody}>
                        <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                        <Text style={s.chev}>›</Text>
                      </Pressable>
                      <CircleBtn glyph="⧉" size={22} onPress={() => {
                        const res = duplicateItem(recs, n.id, newId);
                        if (!('error' in res)) mutate((e) => res.put.forEach((p) => e.put(p)));
                      }} />
                      {swipe.swiped === n.id && (
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

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  topbar: { height: 32, marginTop: 16, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48, gap: 18 },
  folderBlock: { gap: 8 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderName: { color: T.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  folderRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  secName: { color: T.gold, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
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
  delText: { color: T.dim, fontSize: 14 },
  delArmed: { color: T.danger, fontWeight: '700' },
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
  bodyPlaceholder: { color: T.muted, fontSize: 16, lineHeight: 24 },
  rtLine: { flexDirection: 'row', alignItems: 'flex-start' },
  rtQuote: { borderLeftWidth: 3, borderLeftColor: '#a78bfa', paddingLeft: 10, marginVertical: 2 },
  rtQuoteText: { color: T.dim, fontStyle: 'italic' },
  rtDot: { color: T.dim, fontSize: 16, lineHeight: 24, marginRight: 8 },
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
