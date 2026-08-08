/**
 * The Add page, prod's shape: today's date line, the one big line of text,
 * three kind cards (Reminder / Event / Note), the three reveal pills
 * (+ Folder/Section, + Date/Time, + Repeat), a full-width accent Done that
 * adds and returns, and the typed-pattern help block underneath.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import {
  byOrd,
  newId,
  ordBetween,
  parseDateFromText,
  parseTimeFromText,
  parseWhenFromText,
  prefsOf,
  todayStr,
  type Rec,
  type Repeat,
  type RepeatUnit,
} from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { CalendarIcon, PageIcon, TickCircleIcon } from '../components/KindIcons';
import { CircleBtn, Field, Pill } from '../ui';
import { Dropdown } from '../components/Dropdown';

type Kind = 'reminder' | 'event' | 'note';

export function Add({ done, onNoteCreated }: { done: () => void; onNoteCreated?: (id: string) => void }) {
  const { recs, mutate } = useStore();
  const [kind, setKind] = useState<Kind>('reminder');
  const [text, setText] = useState('');
  const [destId, setDestId] = useState<string | null>(null);
  const [showDest, setShowDest] = useState(false);
  const [showWhen, setShowWhen] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [dateField, setDateField] = useState('');
  const [timeField, setTimeField] = useState('');
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [err, setErr] = useState('');

  const today = todayStr();
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const { sectionChoices, calendars } = useMemo(() => {
    const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort((a, b) => byOrd(a.payload, b.payload));
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const app = kind === 'note' ? 'notes' : 'reminders';
    return {
      sectionChoices: folders
        .filter((f) => (f.payload.app ?? 'reminders') === app)
        .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` }))),
      calendars: recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort((a, b) => byOrd(a.payload, b.payload)),
    };
  }, [recs, kind]);

  const add = (): boolean => {
    const raw = text.trim();
    if (!raw) {
      setErr('type the line first');
      return false;
    }
    const [clean, pd, pt] = parseWhenFromText(raw, today);
    const [, fd] = parseDateFromText(dateField.trim(), today);
    const [, ft] = parseTimeFromText(timeField.trim());
    const date = fd ?? pd;
    const time = ft ?? pt;
    const title = clean || raw;
    let createdNoteId: string | null = null;
    mutate((e) => {
      if (kind === 'event') {
        const cal = calendars.find((c) => c.id === destId) ?? calendars.find((c) => c.id === prefsOf(recs, 'calendar').defaultCalendarId) ?? calendars[0]!;
        e.put({ id: newId(), type: 'event', updated: 0, payload: { text: title, date: date ?? today, time, repeat, calendarId: cal.id, ord: ordBetween(null, null) } });
      } else {
        const app = kind === 'note' ? ('notes' as const) : ('reminders' as const);
        const pick =
          sectionChoices.find((c) => c.sec.id === destId) ??
          sectionChoices.find((c) => c.sec.id === prefsOf(recs, app).defaultSectionId) ??
          sectionChoices[0]!;
        const { folderId } = pick.sec.payload;
        if (kind === 'reminder') {
          e.put({ id: newId(), type: 'reminder', updated: 0, payload: { text: title, due: date, time, done: false, repeat, folderId, sectionId: pick.sec.id, indent: 0, ord: ordBetween(null, null) } });
        } else {
          const noteId = newId();
          e.put({ id: noteId, type: 'note', updated: 0, payload: { title, body: '', date, folderId, sectionId: pick.sec.id, ord: ordBetween(null, null) } });
          createdNoteId = noteId;
        }
      }
    });
    setText('');
    if (createdNoteId) {
      onNoteCreated?.(createdNoteId);
      return false; // navigation already happened
    }
    return true;
  };

  const kindCard = (k: Kind, label: string, icon: React.ReactNode) => (
    <Pressable key={k} onPress={() => { setKind(k); setDestId(null); }} style={[s.card, kind === k && s.cardOn]}>
      {icon}
      <Text style={[s.cardLabel, kind === k && s.cardLabelOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.page}>
      <TopBar title="Add" />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.dateLine}>{todayLabel}</Text>
        <Field value={text} onChangeText={(t) => { setText(t); setErr(''); }} placeholder="e.g. Dentist 8/3 2pm…" autoFocus onSubmitEditing={() => add() && done()} />

        <View style={s.cards}>
          {kindCard('reminder', 'Reminder', <TickCircleIcon size={24} color={kind === 'reminder' ? T.accent : T.dim} />)}
          {kindCard('event', 'Event', <CalendarIcon size={24} color={kind === 'event' ? T.accent : T.dim} />)}
          {kindCard('note', 'Note', <PageIcon size={24} color={kind === 'note' ? T.accent : T.dim} />)}
        </View>

        <View style={s.revealRow}>
          <Pill label="+ Folder/Section" primary={showDest} onPress={() => setShowDest(!showDest)} />
          <Pill label="+ Date/Time" primary={showWhen} onPress={() => setShowWhen(!showWhen)} />
          {kind !== 'note' && <Pill label="+ Repeat" primary={showRepeat} onPress={() => setShowRepeat(!showRepeat)} />}
        </View>

        {showDest && (
          <View style={s.panel}>
            {kind === 'event' ? (
              <Dropdown
                value={destId ?? calendars[0]?.id ?? null}
                options={calendars.map((c) => ({ id: c.id, label: c.payload.name }))}
                onPick={setDestId}
              />
            ) : (
              <Dropdown
                value={destId ?? sectionChoices[0]?.sec.id ?? null}
                options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label }))}
                onPick={setDestId}
                gold
              />
            )}
          </View>
        )}
        {showWhen && (
          <View style={s.panel}>
            <Field value={dateField} onChangeText={setDateField} placeholder="m/d" style={s.miniField} />
            <Field value={timeField} onChangeText={setTimeField} placeholder="2:30pm" style={s.miniField} />
          </View>
        )}
        {showRepeat && kind !== 'note' && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>every</Text>
            <CircleBtn glyph="−" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.max(1, repeat.n - 1) })} />
            <Text style={s.repN}>{repeat?.n ?? 1}</Text>
            <CircleBtn glyph="+" size={22} onPress={() => setRepeat({ n: (repeat?.n ?? 1) + 1, unit: repeat?.unit ?? 'week' })} />
            {(['day', 'week', 'month', 'year'] as RepeatUnit[]).map((u) => (
              <Pill key={u} label={u} primary={repeat?.unit === u} onPress={() => setRepeat({ n: repeat?.n ?? 1, unit: u })} />
            ))}
          </View>
        )}

        {err !== '' && <Text style={s.err}>{err}</Text>}
        <Pressable style={s.doneBtn} onPress={() => add() && done()}>
          <Text style={s.doneText}>Done</Text>
        </Pressable>

        <View style={s.help}>
          <Text style={s.helpHead}>You can also type the date and time into the line:</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>2pm</Text> or <Text style={s.helpBold}>2:30pm</Text> — a time</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>8/3</Text> — a date this year (the next one to come)</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>8/3/26</Text> or <Text style={s.helpBold}>8/3/2026</Text> — a full date</Text>
          <Text style={s.helpRow}>·  e.g. <Text style={s.helpBold}>Vet 8/3 2pm</Text> → “Vet”, Aug 3, 2:00pm</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 16, gap: 14 },
  dateLine: { color: T.dim, fontSize: 15 },
  cards: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  cardOn: { borderColor: T.accent, backgroundColor: T.accentInk },
  cardLabel: { color: T.dim, fontSize: 14, fontWeight: '600' },
  cardLabelOn: { color: T.accent },
  revealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  panelLabel: { color: T.dim, fontSize: 13 },
  miniField: { minWidth: 100, paddingVertical: 8 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
  err: { color: T.danger, fontSize: 13 },
  doneBtn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  doneText: { color: T.accentInk, fontSize: 17, fontWeight: '700' },
  help: { gap: 6, marginTop: 6 },
  helpHead: { color: T.dim, fontSize: 14 },
  helpRow: { color: T.muted, fontSize: 13, lineHeight: 20 },
  helpBold: { color: T.text, fontWeight: '700' },
});
