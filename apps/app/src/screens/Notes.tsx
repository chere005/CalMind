/**
 * Notes: folder blocks with gold sections, a note row opens the editor — title
 * plus a plain-text body autosaving on the store's debounce. Notes never
 * convert out and never repeat; a date in the title puts one on the calendar.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { byOrd, newId, ordBetween, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { CircleBtn, ConfirmDelete, Field, Rule } from '../ui';

export function Notes({ openNoteId, onOpenConsumed }: { openNoteId?: string | null; onOpenConsumed?: () => void }) {
  const { recs, mutate } = useStore();
  const { visible: visibleFolders } = useFolderView('notes');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });

  // Another screen (the Add tab) created a note — land in its editor, as prod does.
  React.useEffect(() => {
    if (openNoteId) {
      setOpenId(openNoteId);
      onOpenConsumed?.();
    }
  }, [openNoteId, onOpenConsumed]);
  const [adding, setAdding] = useState<string | null>(null); // sectionId
  const [addText, setAddText] = useState('');

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

  const addNote = (section: Rec<'section'>) => {
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
        <View style={s.topbar}>
          <CircleBtn glyph="‹" onPress={() => setOpenId(null)} />
          <View style={s.toolRow}>
            <CircleBtn glyph="B" color={T.text} onPress={() => wrapSel('**')} />
            <CircleBtn glyph="I" color={T.text} onPress={() => wrapSel('*')} />
            <CircleBtn glyph="•" onPress={() => linePrefix('- ')} />
            <CircleBtn glyph="❝" onPress={() => linePrefix('> ')} />
            <ConfirmDelete onDelete={() => { setOpenId(null); mutate((e) => e.del(open.id)); }} />
          </View>
        </View>
        <Rule />
        <ScrollView contentContainerStyle={s.editor}>
          <TextInput
            style={s.title}
            value={open.payload.title}
            placeholder="Title"
            placeholderTextColor={T.muted}
            onChangeText={(t) => mutate((e) => e.put({ ...open, payload: { ...open.payload, title: t } }))}
          />
          {open.payload.date && <Text style={s.chip}>{open.payload.date}</Text>}
          <TextInput
            style={s.body}
            value={open.payload.body}
            placeholder="Write…"
            placeholderTextColor={T.muted}
            multiline
            onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
            onChangeText={(t) => mutate((e) => e.put({ ...open, payload: { ...open.payload, body: t } }))}
          />
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
                    {n.payload.body !== '' && <Text style={s.snippet} numberOfLines={1}>{n.payload.body.replace(/\n/g, ' ')}</Text>}
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
  rowTitle: { color: T.text, fontSize: 16, flexShrink: 0, maxWidth: '60%' },
  snippet: { color: T.muted, fontSize: 13, flex: 1 },
  chev: { color: T.muted, fontSize: 16, marginLeft: 'auto' },
  editor: { padding: 16, gap: 10 },
  title: { color: T.text, fontSize: 20, fontWeight: '700', paddingVertical: 4 },
  chip: { color: T.dim, fontSize: 12 },
  body: { color: T.text, fontSize: 16, lineHeight: 24, minHeight: 300, textAlignVertical: 'top' },
});
