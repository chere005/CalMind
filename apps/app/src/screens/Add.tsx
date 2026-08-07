/**
 * The Add tab — one line of text, a kind row, and where it goes: folder→section
 * for a reminder or note, a calendar for an event, defaults re-validated by
 * normalize on the way through. The parser runs on the text, as everywhere.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { byOrd, newId, ordBetween, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { TopBar } from '../chrome';
import { Field, Pill } from '../ui';

type Kind = 'reminder' | 'event' | 'note';

export function Add({ done }: { done: () => void }) {
  const { recs, mutate } = useStore();
  const [kind, setKind] = useState<Kind>('reminder');
  const [text, setText] = useState('');
  const [destId, setDestId] = useState<string | null>(null); // sectionId or calendarId
  const [flash, setFlash] = useState('');

  const { sectionChoices, calendars } = useMemo(() => {
    const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort((a, b) => byOrd(a.payload, b.payload));
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const app = kind === 'note' ? 'notes' : 'reminders';
    const choices = folders
      .filter((f) => (f.payload.app ?? 'reminders') === app)
      .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` })));
    return {
      sectionChoices: choices,
      calendars: recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort((a, b) => byOrd(a.payload, b.payload)),
    };
  }, [recs, kind]);

  const add = () => {
    const raw = text.trim();
    if (!raw) return;
    const today = todayStr();
    const [clean, date, time] = parseWhenFromText(raw, today);
    mutate((e) => {
      if (kind === 'event') {
        const cal = calendars.find((c) => c.id === destId) ?? calendars[0]!;
        e.put({ id: newId(), type: 'event', updated: 0, payload: { text: clean || raw, date: date ?? today, time, repeat: null, calendarId: cal.id, ord: ordBetween(null, null) } });
      } else {
        const pick = sectionChoices.find((c) => c.sec.id === destId) ?? sectionChoices[0]!;
        const { folderId } = pick.sec.payload;
        if (kind === 'reminder') {
          e.put({ id: newId(), type: 'reminder', updated: 0, payload: { text: clean || raw, due: date, time, done: false, repeat: null, folderId, sectionId: pick.sec.id, indent: 0, ord: ordBetween(null, null) } });
        } else {
          e.put({ id: newId(), type: 'note', updated: 0, payload: { title: clean || raw, body: '', date, folderId, sectionId: pick.sec.id, ord: ordBetween(null, null) } });
        }
      }
    });
    setText('');
    setFlash(`${kind[0]!.toUpperCase() + kind.slice(1)} added${date ? ' · ' + date : ''}`);
    setTimeout(() => setFlash(''), 2500);
  };

  return (
    <View style={s.page}>
      <TopBar title="Add" controls={<Pill label="Done" primary onPress={done} />} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Field value={text} onChangeText={setText} placeholder="What? — “Vet 8/3 2pm”" autoFocus onSubmitEditing={add} />
        <View style={s.kindRow}>
          {(['reminder', 'event', 'note'] as Kind[]).map((k) => (
            <Pill key={k} label={k[0]!.toUpperCase() + k.slice(1)} primary={kind === k} onPress={() => { setKind(k); setDestId(null); }} />
          ))}
        </View>
        <Text style={s.destLabel}>{kind === 'event' ? 'Calendar' : 'Goes in'}</Text>
        <View style={s.destWrap}>
          {kind === 'event'
            ? calendars.map((c, i) => (
                <Pill key={c.id} label={c.payload.name} primary={destId ? destId === c.id : i === 0} onPress={() => setDestId(c.id)} />
              ))
            : sectionChoices.map((c, i) => (
                <Pill key={c.sec.id} label={c.label} primary={destId ? destId === c.sec.id : i === 0} onPress={() => setDestId(c.sec.id)} />
              ))}
        </View>
        <Pill label="Add" primary onPress={add} />
        {flash !== '' && <Text style={s.flash}>{flash}</Text>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 16, gap: 12 },
  kindRow: { flexDirection: 'row', gap: 8 },
  destLabel: { color: T.dim, fontSize: 13 },
  destWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flash: { color: T.accent, fontSize: 14 },
});
