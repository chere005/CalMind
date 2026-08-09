/**
 * The add/edit window — the suite's Calendar modal brought over: text, a kind
 * row (create only), a date row, +Time and +Repeat reveals with a × to fold
 * them away, a "Goes in" picker (calendar for an event, folder→section for a
 * reminder or note), and Delete (two-press) / Cancel / Save. An explicit date
 * or time field wins the VALUE, but a parsed token always leaves the title —
 * it was an instruction, not part of the name.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  byOrd,
  showAgain,
  convertEventToReminder,
  convertReminderToEvent,
  convertToNote,
  newId,
  ordBetween,
  parseDateField,
  parseDateFromText,
  parseTimeFromText,
  nowStr,
  parseWhenFromText,
  prefsOf,
  todayStr,
  type AnyRec,
  type Rec,
  type Repeat,
  type RepeatUnit,
} from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';
import { Dropdown } from './Dropdown';

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
  const { recs, mutate, sharedRecs, sharedPartner, sharedPut } = useStore();
  const today = todayStr();
  const [kind, setKind] = useState<ItemKind>(kind0);
  const lastFiled = useRef<{ text: string; at: number } | null>(null);

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

  // The partner's shared destinations, the suite's second picker pair: ids
  // wear a '~' so a shared choice can never be mistaken for one of mine —
  // exactly one owner is ever selected, and a shared pick writes THEIR store.
  const sharedChoices = useMemo(() => {
    if (mode !== 'create' || !sharedPartner) return { cals: [] as Rec<'calendar'>[], secs: [] as { sec: Rec<'section'>; label: string }[] };
    const folders = sharedRecs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort((a, b) => byOrd(a.payload, b.payload));
    const sections = sharedRecs.filter((r): r is Rec<'section'> => r.type === 'section').sort((a, b) => byOrd(a.payload, b.payload));
    const app = kind === 'note' ? 'notes' : 'reminders';
    return {
      cals: sharedRecs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort((a, b) => byOrd(a.payload, b.payload)),
      secs: folders
        .filter((f) => (f.payload.app ?? 'reminders') === app)
        .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` }))),
    };
  }, [mode, sharedPartner, sharedRecs, kind]);
  const sharedDest = useMemo(() => {
    if (!dest?.startsWith('~')) return null;
    const id = dest.slice(1);
    return kind === 'event' ? sharedChoices.cals.find((c) => c.id === id) ?? null : sharedChoices.secs.find((c) => c.sec.id === id)?.sec ?? null;
  }, [dest, kind, sharedChoices]);

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
    // Creating mints a fresh id every call, so two taps inside one frame make
    // two items. The Add tab had exactly this shape and the race was seen for
    // real there; here the browser harness cannot force it, because the second
    // click finds the modal already gone. The evidence is the sibling path,
    // and the guard is the same: the same words twice inside a second and a
    // half is a thumb. EDIT is left alone — it writes the same id, so saving
    // twice is simply saving.
    if (mode === 'create') {
      const now = Date.now();
      if (lastFiled.current && lastFiled.current.text === raw && now - lastFiled.current.at < 1500) return;
      lastFiled.current = { text: raw, at: now };
    }
    // Parsed tokens leave the title either way; explicit fields win the value.
    const [clean, pd, pt] = parseWhenFromText(raw, today, nowStr());
    const fd = parseDateField(dateField, today);
    const [, ft] = parseTimeFromText(timeField.trim());
    const finalDate = fd ?? date ?? pd;
    const finalTime = (showTime ? ft ?? time : null) ?? pt;
    const finalRepeat = kind === 'note' ? null : showRepeat ? repeat : null;
    const title = clean || raw;
    if (!resolvedDest) {
      setErr('nowhere to put it');
      return;
    }
    // A changed kind on an existing item is a conversion — core's rules:
    // one-way into notes, reminder⇄event, subtasks keep the reminder home.
    if (mode === 'edit' && rec && kind !== rec.type) {
      const freshId = newId();
      const res =
        kind === 'note'
          ? convertToNote(recs, rec.id, (resolvedDest as Rec<'section'>).id, freshId)
          : kind === 'event'
            ? convertReminderToEvent(recs, rec.id, (resolvedDest as Rec<'calendar'>).id, today, freshId)
            : convertEventToReminder(recs, rec.id, (resolvedDest as Rec<'section'>).id, freshId);
      if ('error' in res) {
        setErr(res.error);
        return;
      }
      mutate((e) => res.put.forEach((r) => e.put(r)));
      onSaved?.(freshId, kind);
      onClose();
      return;
    }
    if (sharedDest) {
      const id = newId();
      const record: AnyRec =
        kind === 'event'
          ? { id, type: 'event', updated: 0, payload: { text: title, date: finalDate ?? today, time: finalTime, repeat: finalRepeat, calendarId: sharedDest.id, ord: ordBetween(null, null) } }
          : kind === 'reminder'
            ? { id, type: 'reminder', updated: 0, payload: { text: title, due: finalDate, time: finalTime, done: false, repeat: finalRepeat, folderId: (sharedDest as Rec<'section'>).payload.folderId, sectionId: sharedDest.id, indent: 0, ord: ordBetween(null, null) } }
            : { id, type: 'note', updated: 0, payload: { title: title, body: '', date: finalDate, folderId: (sharedDest as Rec<'section'>).payload.folderId, sectionId: sharedDest.id, ord: ordBetween(null, null) } };
      void sharedPut(record);
      onClose();
      return;
    }
    const id = mode === 'edit' && rec ? rec.id : newId();
    if (mode === 'create' && resolvedDest) {
      const app = kind === 'event' ? ('calendar' as const) : kind === 'note' ? ('notes' as const) : ('reminders' as const);
      const container = kind === 'event' ? resolvedDest.id : (resolvedDest as Rec<'section'>).payload.folderId;
      const widen = showAgain(recs, app, container);
      if (widen) mutate((e) => e.put(widen));
    }
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
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.h2}>{mode === 'create' ? 'New' : 'Edit'}</Text>
            {(mode === 'create' || rec?.type !== 'note') && (
              <View style={s.rowWrap}>
                {(['event', 'reminder', 'note'] as ItemKind[]).map((k) => (
                  <Pill key={k} testID={`kind-${k}`} label={k[0]!.toUpperCase() + k.slice(1)} primary={kind === k} onPress={() => { setKind(k); setDest(null); }} />
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
              {kind === 'event' ? (
                <Dropdown
                  testID="item-dest"
                  value={sharedDest ? null : resolvedDest?.id ?? null}
                  options={calendars.map((c) => ({ id: c.id, label: c.payload.name }))}
                  onPick={setDest}
                />
              ) : (
                <Dropdown
                  value={sharedDest ? null : resolvedDest?.id ?? null}
                  options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label }))}
                  onPick={setDest}
                  gold
                />
              )}
            </View>
            {mode === 'create' && sharedPartner && (kind === 'event' ? sharedChoices.cals.length : sharedChoices.secs.length) > 0 && (
              <>
                <Text style={s.ownerBadge}>{sharedPartner}</Text>
                <View style={s.rowWrap}>
                  <Dropdown
                    value={sharedDest ? `~${sharedDest.id}` : null}
                    options={[
                      { id: '', label: '—' },
                      ...(kind === 'event'
                        ? sharedChoices.cals.map((c) => ({ id: `~${c.id}`, label: c.payload.name }))
                        : sharedChoices.secs.map((c) => ({ id: `~${c.sec.id}`, label: c.label }))),
                    ]}
                    onPick={(id) => setDest(id === '' ? null : id)}
                  />
                </View>
              </>
            )}

            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.actions}>
              {mode === 'edit' && rec ? <ConfirmDelete onDelete={() => { mutate((e) => e.del(rec.id)); onClose(); }} /> : <View />}
              <View style={s.actRight}>
                <Pill label="Cancel" onPress={onClose} />
                <Pill label="Save" primary onPress={save} />
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  ownerBadge: { alignSelf: 'flex-start', color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  label: { color: T.dim, fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  miniField: { minWidth: 90, paddingVertical: 6 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
  err: { color: T.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  actRight: { flexDirection: 'row', gap: 8 },
}));
