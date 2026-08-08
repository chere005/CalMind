/**
 * Notes: folder blocks with gold sections, a note row opens the editor — title
 * plus a plain-text body autosaving on the store's debounce. Notes never
 * convert out and never repeat; a date in the title puts one on the calendar.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { byOrd, newId, ordBetween, parseDateFromText, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { CircleBtn, ConfirmDelete, Field, Pill, Rule } from '../ui';
import { Dropdown } from '../components/Dropdown';

export function Notes({ openNoteId, onOpenConsumed }: { openNoteId?: string | null; onOpenConsumed?: () => void }) {
  const { recs, mutate } = useStore();
  const { visible: visibleFolders } = useFolderView('notes');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [dateOpen, setDateOpen] = useState(false);
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

          <TextInput
            style={s.body}
            value={open.payload.body}
            placeholder="Write…"
            placeholderTextColor={T.muted}
            multiline
            onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
            onChangeText={(t) => mutate((e) => e.put({ ...open, payload: { ...open.payload, body: t } }))}
          />

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
                <View style={s.secHead}>
                  <Text style={s.secName}>{sec.payload.name}</Text>
                  <CircleBtn glyph="+" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
                </View>
                {adding === sec.id && (
                  <Field value={addText} onChangeText={setAddText} placeholder="New note" autoFocus onBlur={() => addNote(sec)} onSubmitEditing={() => addNote(sec)} />
                )}
                {notesOf(sec.id).map((n) => (
                  <Pressable key={n.id} onPress={() => setOpenId(n.id)} style={s.row}>
                    <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                    <Text style={s.chev}>›</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
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
});
