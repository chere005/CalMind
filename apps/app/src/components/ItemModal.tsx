/**
 * The add/edit window — the suite's Calendar modal brought over: text, a kind
 * row (create only), a date row, +Time and +Repeat reveals with a × to fold
 * them away, a "Goes in" picker (calendar for an event, folder→section for a
 * reminder or note), and Delete (two-press) / Cancel / Save. An explicit date
 * or time field wins the VALUE, but a parsed token always leaves the title —
 * it was an instruction, not part of the name.
 */
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  byOrd,
  newId,
  ordBetween,
  parseDateFromText,
  parseTimeFromText,
  parseWhenFromText,
  prefsOf,
  todayStr,
  type AnyRec,
  type Rec,
  type Repeat,
  type RepeatUnit,
} from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';

export type ItemKind = 'event' | 'reminder' | 'note';
type ItemRec = Rec<'event'> | Rec<'reminder'> | Rec<'note'>;

export function ItemModal({
  mode,
  kind: kind0,
  rec,
  date: date0,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  kind: ItemKind;
  rec?: ItemRec;
  date?: string;
  onClose: () => void;
  onSaved?: (id: string, kind: ItemKind) => void;
}) {
  const { recs, mutate } = useStore();
  const today = todayStr();
  const [kind, setKind] = useState<ItemKind>(kind0);

  const init = useMemo(() => {
    if (mode === 'edit' && rec) {
      const p = rec.payload as { text?: string; title?: string; due?: string | null; date?: string | null; time?: string | null; repeat?: Repeat | null };
      return {
        text: p.text ?? p.title ?? '',
        date: (rec.type === 'reminder' ? p.due : p.date) ?? null,
        time: p.time ?? null,
        repeat: p.repeat ?? null,
        dest: rec.type === 'event' ? (rec.payload as Rec<'event'>['payload']).calendarId : (rec.payload as Rec<'reminder'>['payload']).sectionId,
      };
    }
    return { text: '', date: date0 ?? null, time: null, repeat: null, dest: null as string | null };
  }, [mode, rec, date0]);

  const [text, setText] = useState(init.text);
  const [date, setDate] = useState<string | null>(init.date);
  const [dateField, setDateField] = useState('');
  const [time, setTime] = useState<string | null>(init.time);
  const [timeField, setTimeField] = useState('');
  const [showTime, setShowTime] = useState(init.time !== null);
  const [repeat, setRepeat] = useState<Repeat | null>(init.repeat);
  const [showRepeat, setShowRepeat] = useState(init.repeat !== null);
  const [dest, setDest] = useState<string | null>(init.dest);
  const [err, setErr] = useState('');

  const { calendars, sectionChoices } = useMemo(() => {
    const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort((a, b) => byOrd(a.payload, b.payload));
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const app = kind === 'note' ? 'notes' : 'reminders';
    return {
      calendars: recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort((a, b) => byOrd(a.payload, b.payload)),
      sectionChoices: folders
        .filter((f) => (f.payload.app ?? 'reminders') === app)
        .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` }))),
    };
  }, [recs, kind]);

  /** The picked destination, falling back to the app default, then the first. */
  const resolvedDest = useMemo(() => {
    if (kind === 'event') {
      return calendars.find((c) => c.id === dest) ?? calendars.find((c) => c.id === prefsOf(recs, 'calendar').defaultCalendarId) ?? calendars[0];
    }
    const app = kind === 'note' ? ('notes' as const) : ('reminders' as const);
    return (
      sectionChoices.find((c) => c.sec.id === dest)?.sec ??
      sectionChoices.find((c) => c.sec.id === prefsOf(recs, app).defaultSectionId)?.sec ??
      sectionChoices[0]?.sec
    );
  }, [kind, dest, calendars, sectionChoices, recs]);

  const save = () => {
    const raw = text.trim();
    if (!raw) {
      setErr('it needs a name');
      return;
    }
    // Parsed tokens leave the title either way; explicit fields win the value.
    const [clean, pd, pt] = parseWhenFromText(raw, today);
    const [, fd] = parseDateFromText(dateField.trim(), today);
    const [, ft] = parseTimeFromText(timeField.trim());
    const finalDate = fd ?? date ?? pd;
    const finalTime = (showTime ? ft ?? time : null) ?? pt;
    const finalRepeat = kind === 'note' ? null : showRepeat ? repeat : null;
    const title = clean || raw;
    if (!resolvedDest) {
      setErr('nowhere to put it');
      return;
    }
    const id = mode === 'edit' && rec ? rec.id : newId();
    mutate((e) => {
      if (kind === 'event') {
        const payload: Rec<'event'>['payload'] = {
          text: title, date: finalDate ?? today, time: finalTime, repeat: finalRepeat,
          calendarId: resolvedDest.id,
          ord: mode === 'edit' && rec ? (rec.payload as { ord: string }).ord : ordBetween(null, null),
        };
        e.put({ id, type: 'event', updated: 0, payload });
      } else {
        const sec = resolvedDest as Rec<'section'>;
        if (kind === 'reminder') {
          const prev = mode === 'edit' && rec?.type === 'reminder' ? rec.payload : null;
          e.put({
            id, type: 'reminder', updated: 0,
            payload: {
              text: title, due: finalDate, time: finalTime, done: prev?.done ?? false, repeat: finalRepeat,
              folderId: sec.payload.folderId, sectionId: sec.id,
              indent: prev?.indent ?? 0, ord: prev?.ord ?? ordBetween(null, null),
            },
          });
        } else {
          const prev = mode === 'edit' && rec?.type === 'note' ? rec.payload : null;
          e.put({
            id, type: 'note', updated: 0,
            payload: {
              title, body: prev?.body ?? '', date: finalDate,
              folderId: sec.payload.folderId, sectionId: sec.id, ord: prev?.ord ?? ordBetween(null, null),
            },
          });
        }
      }
    });
    onSaved?.(id, kind);
    onClose();
  };

  const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.h2}>{mode === 'create' ? 'New' : 'Edit'}</Text>
            {mode === 'create' && (
              <View style={s.rowWrap}>
                {(['event', 'reminder', 'note'] as ItemKind[]).map((k) => (
                  <Pill key={k} label={k[0]!.toUpperCase() + k.slice(1)} primary={kind === k} onPress={() => { setKind(k); setDest(null); }} />
                ))}
              </View>
            )}
            <Field value={text} onChangeText={setText} placeholder="What? — “Vet 8/3 2pm”" autoFocus={mode === 'create'} onSubmitEditing={save} />

            <Text style={s.label}>Date</Text>
            <View style={s.rowWrap}>
              {kind !== 'event' && <Pill label="None" primary={!date && dateField === ''} onPress={() => { setDate(null); setDateField(''); }} />}
              <Pill label="Today" primary={date === today && dateField === ''} onPress={() => { setDate(today); setDateField(''); }} />
              {date && date !== today && dateField === '' && <Pill label={dateLabel(date)} primary onPress={() => {}} />}
              <Field value={dateField} onChangeText={setDateField} placeholder="m/d" style={s.miniField} />
            </View>

            {!showTime ? (
              <Pill label="+ Time" onPress={() => setShowTime(true)} />
            ) : (
              <View style={s.rowWrap}>
                <Text style={s.label}>Time</Text>
                <Field value={timeField} onChangeText={setTimeField} placeholder={time ?? '2:30pm'} style={s.miniField} />
                <CircleBtn glyph="×" size={22} onPress={() => { setShowTime(false); setTime(null); setTimeField(''); }} />
              </View>
            )}

            {kind !== 'note' &&
              (!showRepeat ? (
                <Pill label="+ Repeat" onPress={() => { setShowRepeat(true); setRepeat(repeat ?? { n: 1, unit: 'week' }); }} />
              ) : (
                <View style={s.rowWrap}>
                  <Text style={s.label}>every</Text>
                  <CircleBtn glyph="−" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.max(1, repeat.n - 1) })} />
                  <Text style={s.repN}>{repeat?.n ?? 1}</Text>
                  <CircleBtn glyph="+" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.min(999, repeat.n + 1) })} />
                  {(['day', 'week', 'month', 'year'] as RepeatUnit[]).map((u) => (
                    <Pill key={u} label={u} primary={repeat?.unit === u} onPress={() => setRepeat({ n: repeat?.n ?? 1, unit: u })} />
                  ))}
                  <CircleBtn glyph="×" size={22} onPress={() => { setShowRepeat(false); setRepeat(null); }} />
                </View>
              ))}

            <Text style={s.label}>{kind === 'event' ? 'Calendar' : 'Goes in'}</Text>
            <View style={s.rowWrap}>
              {kind === 'event'
                ? calendars.map((c) => (
                    <Pill key={c.id} label={c.payload.name} primary={resolvedDest?.id === c.id} onPress={() => setDest(c.id)} />
                  ))
                : sectionChoices.map((c) => (
                    <Pill key={c.sec.id} label={c.label} primary={resolvedDest?.id === c.sec.id} onPress={() => setDest(c.sec.id)} />
                  ))}
            </View>

            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.actions}>
              {mode === 'edit' && rec ? <ConfirmDelete onDelete={() => { mutate((e) => e.del(rec.id)); onClose(); }} /> : <View />}
              <View style={s.actRight}>
                <Pill label="Cancel" onPress={onClose} />
                <Pill label="Save" primary onPress={save} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  label: { color: T.dim, fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  miniField: { minWidth: 90, paddingVertical: 6 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
  err: { color: T.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  actRight: { flexDirection: 'row', gap: 8 },
});
