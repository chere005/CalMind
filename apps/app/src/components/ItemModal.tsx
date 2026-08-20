/**
 * The add/edit window — the suite's Calendar modal brought over: text, a kind
 * row (create only), a date row, +Time and +Repeat reveals with a × to fold
 * them away, a "Goes in" picker (calendar for an event, folder→section for a
 * reminder or note), and Delete (two-press) / Cancel / Save. An explicit date
 * or time field wins the VALUE, but a parsed token always leaves the title —
 * it was an instruction, not part of the name.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  byRecOrd,
  REPEAT_UNITS,
  showAgain,
  convertEventToReminder,
  convertReminderToEvent,
  convertToNote,
  newId,
  ordBetween,
  parseTimeFromText,
  nowStr,
  parseWhenFromText,
  prefsOf,
  timeLabel,
  timePlus,
  todayStr,
  type Rec,
  type Repeat,
} from '@calmind/core';
import { useStore } from '../store';
import { useClock24 } from '../useClock24';
import { themed, T } from '../theme';
import { CircleBtn, DayPickBtn, DeletePill, Field, Pill, Scroll } from '../ui';
import { DayPick } from './DayPick';
import { Dropdown } from './Dropdown';

export type ItemKind = 'event' | 'reminder' | 'note';
type ItemRec = Rec<'event'> | Rec<'reminder'> | Rec<'note'>;

export function ItemModal({
  mode,
  kind: kind0,
  rec,
  date: date0,
  text0,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  kind: ItemKind;
  rec?: ItemRec;
  date?: string;
  /** Pre-filled line for create mode — a tapped recipe ingredient or step
   *  arriving as a reminder-to-be (Sean, 2026-08-18). */
  text0?: string;
  onClose: () => void;
  onSaved?: (id: string, kind: ItemKind) => void;
}) {
  const { recs, mutate, sharedRecs } = useStore();
  const clock24 = useClock24();
  const today = todayStr();
  const [kind, setKind] = useState<ItemKind>(kind0);
  const lastFiled = useRef<{ text: string; at: number } | null>(null);

  const init = useMemo(() => {
    if (mode === 'edit' && rec) {
      const p = rec.payload as { text?: string; title?: string; due?: string | null; date?: string | null; time?: string | null; end?: string | null; repeat?: Repeat | null };
      return {
        text: p.text ?? p.title ?? '',
        date: (rec.type === 'reminder' ? p.due : p.date) ?? null,
        time: p.time ?? null,
        end: (rec.type === 'event' ? p.end : null) ?? null,
        repeat: p.repeat ?? null,
        dest: rec.type === 'event' ? (rec.payload as Rec<'event'>['payload']).calendarId : (rec.payload as Rec<'reminder'>['payload']).sectionId,
      };
    }
    return { text: text0 ?? '', date: date0 ?? null, time: null, end: null, repeat: null, dest: null as string | null };
  }, [mode, rec, date0, text0]);

  const [text, setText] = useState(init.text);
  const [date, setDate] = useState<string | null>(init.date);
  const [pickOpen, setPickOpen] = useState(false);
  const [time, setTime] = useState<string | null>(init.time);
  const [timeField, setTimeField] = useState('');
  // Manual-beats-parsed (Sean, 2026-08-18): what the hand chose IN THIS
  // SHEET outranks anything typed into the line, and a token that lost
  // stays in the text — it was not used. Defaults and incumbents rank
  // below both, so "typing a date overrides a default selected date".
  const [dateTouched, setDateTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [showTime, setShowTime] = useState(init.time !== null);
  const [end, setEnd] = useState<string | null>(init.end);
  const [endField, setEndField] = useState('');
  const [showEnd, setShowEnd] = useState(init.end !== null);
  const [repeat, setRepeat] = useState<Repeat | null>(init.repeat);
  const [showRepeat, setShowRepeat] = useState(init.repeat !== null);
  const [dest, setDest] = useState<string | null>(init.dest);
  const [err, setErr] = useState('');

  const { calendars, sectionChoices } = useMemo(() => {
    const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort(byRecOrd);
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
    const app = kind === 'note' ? 'notes' : 'reminders';
    return {
      calendars: recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort(byRecOrd),
      sectionChoices: folders
        .filter((f) => (f.payload.app ?? 'reminders') === app)
        .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` }))),
    };
  }, [recs, kind]);

  // NO shared destinations here any more. The suite's second picker pair —
  // the partner's folders under mine, ids wearing a '~' — was carried over
  // and then removed on Sean's word (2026-08-20: "adding events or reminders
  // shouldn't show shared lists in the dropdown"). Adding INTO a partner's
  // list still exists where the partner's list is what you are looking at:
  // the shared folder view's own + (SharedReminders, sharedPut). Shared
  // calendars were never offered (his earlier word, 2026-08-19).

  // The record can go while this sheet is open — deleted on the phone while
  // the desktop still has it up, which the 30s pull brings in underneath.
  // `rec` is a SNAPSHOT taken when the sheet opened, so Save wrote it back
  // with a fresh `updated`, LWW beat the tombstone, and the deletion was
  // silently undone on every device. The note editor already answers this by
  // looking its record up on each render and falling back to the list; this
  // leaves the same way rather than resurrecting what someone deleted.
  const gone =
    mode === 'edit' && !!rec && !recs.some((r) => r.id === rec.id) && !sharedRecs.some((r) => r.id === rec.id);
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

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
    // The date is PICKED now, never typed into a box (Sean, 2026-08-20) —
    // dateTouched is the whole story of "the hand chose in this sheet".
    // Typing a date still works where the typing hand already is: the line.
    const [, ft] = parseTimeFromText(timeField.trim());
    const manualDate = dateTouched;
    const manualTime = timeTouched || ft !== null;
    // A category the hand settled is not lifted: the token stays in the
    // title, unused. A category left to the line is lifted and wins over
    // the incumbent — which is what makes editing parse like adding.
    const [clean, pd, pt, pe] = parseWhenFromText(raw, today, nowStr(), { date: !manualDate, time: !manualTime });
    // …but only an EXPLICIT date token outranks the sheet's own date. A bare
    // "2pm" IMPLIES a day (today, or tomorrow once 2pm has gone) and that
    // implication is a fallback, not an instruction — letting it beat the
    // selected day sent a day-panel event to tomorrow. The time-less parse
    // cannot imply, so its date is the explicit token alone.
    const [, pdExplicit] = parseWhenFromText(raw, today, nowStr(), { date: !manualDate, time: false });
    const finalDate = manualDate ? date : pdExplicit ?? date ?? pd;
    const finalTime = manualTime ? (showTime ? ft ?? time : null) : pt ?? (showTime ? time : null);
    // An end only means something after a start; an empty field keeps the
    // presumed one (+1 hour, set when the row was revealed).
    const [, fe] = parseTimeFromText(endField.trim());
    // A typed range carries its end, as on the Add screen; a hand-set end
    // still outranks it.
    const finalEnd = kind === 'event' && finalTime !== null ? (showEnd ? fe ?? end : null) ?? pe : null;
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
      // The conversion works from the STORED record, so anything retyped in
      // this sheet before the kind was changed was thrown away with it —
      // change a reminder's text and make it a note in one visit, and the note
      // arrived with the words you had replaced. The fields below are the same
      // ones the ordinary save applies a few lines down; the new record gets
      // them too rather than only the ones core carried across.
      const edited = res.put.map((r) => {
        if (r.id !== freshId) return r;
        if (r.type === 'note') {
          return { ...r, payload: { ...r.payload, title, date: finalDate } };
        }
        if (r.type === 'event') {
          return { ...r, payload: { ...r.payload, text: title, date: finalDate ?? today, time: finalTime, end: finalEnd, repeat: finalRepeat } };
        }
        if (r.type === 'reminder') {
          return { ...r, payload: { ...r.payload, text: title, due: finalDate, time: finalTime, repeat: finalRepeat } };
        }
        // Anything else core produced (the tombstone, a re-homed sibling) is
        // not the converted record and is passed through untouched.
        return r;
      });
      mutate((e) => edited.forEach((r) => e.put(r)));
      onSaved?.(freshId, kind);
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
          text: title, date: finalDate ?? today, time: finalTime, end: finalEnd, repeat: finalRepeat,
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


  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Scroll contentContainerStyle={s.scroll}>
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
              {kind !== 'event' && <Pill label="None" primary={!date} onPress={() => { setDate(null); setDateTouched(true); }} />}
              <Pill label="Today" primary={date === today} onPress={() => { setDate(today); setDateTouched(true); }} />
              {/* The circle-with-a-calendar, never an m/d box (Sean,
                  2026-08-20); it names the picked day itself, so no chip. */}
              <DayPickBtn testID="item-date" value={date && date !== today ? date : null} onPress={() => setPickOpen(true)} />
            </View>

            {!showTime ? (
              <Pill label="+ Time" onPress={() => setShowTime(true)} />
            ) : (
              <View style={s.rowWrap}>
                <Text style={s.label}>Time</Text>
                <Field value={timeField} onChangeText={(v) => { setTimeField(v); if (v.trim() !== '') setTimeTouched(true); }} placeholder={time ? timeLabel(time, clock24) : '2:30pm'} style={s.miniField} />
                <CircleBtn glyph="×" label="Remove" size={22} onPress={() => { setShowTime(false); setTime(null); setTimeField(''); setShowEnd(false); setEnd(null); setEndField(''); }} />
              </View>
            )}
            {/* An end is an event's thing — reminders have none (Sean,
                2026-08-18) — and only means something once a start exists.
                Revealing it PRESUMES an hour past the start; the presumption
                sits as the placeholder and saves unless overtyped. */}
            {kind === 'event' && showTime &&
              (!showEnd ? (
                <Pill
                  label="+ End"
                  onPress={() => {
                    const [, ft] = parseTimeFromText(timeField.trim());
                    const start = ft ?? time;
                    setEnd(start ? timePlus(start, 60) : null);
                    setShowEnd(true);
                  }}
                />
              ) : (
                <View style={s.rowWrap}>
                  <Text style={s.label}>End</Text>
                  <Field value={endField} onChangeText={setEndField} placeholder={end ? timeLabel(end, clock24) : '3:30pm'} style={s.miniField} />
                  <CircleBtn glyph="×" label="Remove end" size={22} onPress={() => { setShowEnd(false); setEnd(null); setEndField(''); }} />
                </View>
              ))}

            {kind !== 'note' &&
              (!showRepeat ? (
                <Pill label="+ Repeat" onPress={() => { setShowRepeat(true); setRepeat(repeat ?? { n: 1, unit: 'week' }); }} />
              ) : (
                <View style={s.rowWrap}>
                  <Text style={s.label}>every</Text>
                  <CircleBtn glyph="−" label="Fewer" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.max(1, repeat.n - 1) })} />
                  <Text style={s.repN}>{repeat?.n ?? 1}</Text>
                  <CircleBtn glyph="+" label="Add" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.min(999, repeat.n + 1) })} />
                  {/* core's list, not a copy of it — a unit added to the type
                      reaches the menu by construction. A dropdown, not four
                      pills: Sean's word, 2026-08-18. */}
                  <Dropdown
                    testID="repeat-unit"
                    value={repeat?.unit ?? 'week'}
                    options={REPEAT_UNITS.map((u) => ({ id: u, label: u }))}
                    onPick={(u) => setRepeat({ n: repeat?.n ?? 1, unit: u as Repeat['unit'] })}
                  />
                  <CircleBtn glyph="×" label="Remove repeat" size={22} onPress={() => { setShowRepeat(false); setRepeat(null); }} />
                </View>
              ))}

            <Text style={s.label}>{kind === 'event' ? 'Calendar' : 'Goes in'}</Text>
            <View style={s.rowWrap}>
              {kind === 'event' ? (
                <Dropdown
                  testID="item-dest"
                  value={resolvedDest?.id ?? null}
                  options={calendars.map((c) => ({ id: c.id, label: c.payload.name }))}
                  onPick={setDest}
                />
              ) : (
                <Dropdown
                  value={resolvedDest?.id ?? null}
                  options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label }))}
                  onPick={setDest}
                  gold
                />
              )}
            </View>

            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.actions}>
              {/* The note editor's Delete, exactly — a word in a pill, armed
                  red — on Sean's word (2026-08-20): "make the delete button
                  on that edit screen match the delete button from the notes
                  screen." One component now, ui's DeletePill. */}
              {mode === 'edit' && rec ? <DeletePill onDelete={() => { mutate((e) => e.del(rec.id)); onClose(); }} /> : <View />}
              <View style={s.actRight}>
                <Pill label="Cancel" onPress={onClose} />
                <Pill label="Save" primary onPress={save} />
              </View>
            </View>
          </Scroll>
        </Pressable>
      </Pressable>
      {pickOpen && (
        <DayPick
          value={date}
          onPick={(d) => { setDate(d); setDateTouched(true); }}
          onClose={() => setPickOpen(false)}
        />
      )}
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
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
}));
