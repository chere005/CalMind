/**
 * The Add page: today's date line, the one big line of text, two reveal pills
 * (+ Folder/Section, + Date/Time), a full-width accent Done that adds and
 * returns, and the typed-pattern help block underneath.
 *
 * Upstream there are THREE kind cards — Event, Reminder, Recipe. ChefMind
 * lost the calendar on 2026-08-21 and reminders the same day ("remove
 * reminders from ChefMind"), which leaves ONE kind, so there are no cards:
 * a radio group of one is a decoration that reads like a choice. Add makes a
 * recipe, and the repeat pill went with the reminders — a recipe does not
 * recur.
 *
 * Shopping rows are still `reminder` records, and they are still added from
 * the Shopping screen's own +, which is where a thing to buy belongs.
 */
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import { showAgain,
  byRecOrd,
  newId,
  ordBetween,
  nowStr,
  parseWhenFromText,
  prefsOf,
  todayStr,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { DayPickBtn, Field, Pill, Scroll } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { DayPick } from '../components/DayPick';

export function Add({
  done,
  onNoteCreated,
  date0 = null,
}: {
  done: () => void;
  onNoteCreated?: (id: string) => void;
  /** The day this screen was launched FROM — the calendar's selected day
   *  when the Add tab is pressed there (Sean, 2026-08-20: "the add app when
   *  launched from a particular day should default from that day"). An
   *  INCUMBENT, not a manual choice: the picker and an explicit typed date
   *  both outrank it, exactly as ItemModal ranks its own date. */
  date0?: string | null;
}) {
  const { recs, mutate } = useStore();
  const [text, setText] = useState('');
  const [destId, setDestId] = useState<string | null>(null);
  const [showDest, setShowDest] = useState(false);
  const [showWhen, setShowWhen] = useState(false);
  // The date is PICKED, not typed, since 2026-08-19 ("m/d should be a
  // calendar picker in the add page") — 'YYYY-MM-DD' straight from the grid,
  // no parse step to disagree with anything. Typing a date still works where
  // the typing hand already is: the line itself ("Dentist 8/3 2pm").
  const [datePicked, setDatePicked] = useState<string | null>(null);
  const [dayPickOpen, setDayPickOpen] = useState(false);
  const [err, setErr] = useState('');
  const lastFiled = useRef<{ text: string; at: number } | null>(null);

  const today = todayStr();
  // The date line names the day this Add will file on — today, unless the
  // screen was launched from another day on the calendar.
  const baseDay = date0 ?? today;
  const todayLabel = new Date(`${baseDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const sectionChoices = useMemo(() => {
    const folders = recs.filter((r): r is Rec<'folder'> => r.type === 'folder').sort(byRecOrd);
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
    const app = 'notes';
    return folders
      .filter((f) => (f.payload.app ?? 'reminders') === app)
      .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` })));
  }, [recs]);

  const add = (): boolean => {
    const raw = text.trim();
    if (!raw) {
      setErr('type the line first');
      return false;
    }
    // A deliberate guard, because the accidental one is a race. Nothing here
    // stopped a second press except the screen navigating away and the field
    // clearing, and both of those happen a render later — so two taps inside
    // one frame filed the line twice. Adding the same words twice within a
    // second and a half is a thumb, not an intention; wait, or change a
    // character, and it files again.
    const now = Date.now();
    if (lastFiled.current && lastFiled.current.text === raw && now - lastFiled.current.at < 1500) {
      return false;
    }
    lastFiled.current = { text: raw, at: now };
    const fd = datePicked;
    // Manual-beats-parsed (Sean, 2026-08-18): a category the fields settled
    // is not lifted from the line — the token stays, unused. Only the DATE
    // can be settled by a field now; a typed time is still lifted out of the
    // name, exactly as it always was for a recipe, which has nowhere to keep
    // one.
    const [clean, pd] = parseWhenFromText(raw, today, nowStr(), { date: fd === null, time: true });
    // The launch day (date0) is an INCUMBENT, ranked as ItemModal ranks its
    // own: an explicit typed token beats it, but a bare "2pm" only IMPLIES a
    // day and that implication is a fallback, not an instruction — it must
    // not drag an add made from Aug 25 back to today. The time-less parse
    // cannot imply, so its date is the explicit token alone.
    const [, pdExplicit] = parseWhenFromText(raw, today, nowStr(), { date: fd === null, time: false });
    const date = fd ?? pdExplicit ?? date0 ?? pd;
    const title = clean || raw;
    let createdNoteId: string | null = null;
    mutate((e) => {
      const app = 'notes' as const;
      const pick =
        sectionChoices.find((c) => c.sec.id === destId) ??
        sectionChoices.find((c) => c.sec.id === prefsOf(recs, app).defaultSectionId) ??
        sectionChoices[0]!;
      const { folderId } = pick.sec.payload;
      const widen = showAgain(recs, app, folderId);
      if (widen) e.put(widen);
      const noteId = newId();
      e.put({ id: noteId, type: 'note', updated: 0, payload: { title, body: '', date, folderId, sectionId: pick.sec.id, ord: ordBetween(null, null) } });
      createdNoteId = noteId;
    });
    setText('');
    if (createdNoteId) {
      onNoteCreated?.(createdNoteId);
      return false; // navigation already happened
    }
    return true;
  };

  return (
    <View style={s.page}>
      <TopBar title="Add" />
      <Scroll contentContainerStyle={s.scroll}>
        <Text testID="add-date-line" style={s.dateLine}>{todayLabel}</Text>
        <Field testID="add-text" value={text} onChangeText={(t) => { setText(t); setErr(''); }} placeholder="e.g. Dentist 8/3 2pm…" autoFocus onSubmitEditing={() => add() && done()} />

        <View style={s.revealRow}>
          <Pill label="+ Folder/Section" primary={showDest} onPress={() => setShowDest(!showDest)} />
          <Pill label="+ Date" primary={showWhen} onPress={() => setShowWhen(!showWhen)} />
        </View>

        {showDest && (
          <View style={s.panel}>
            <Dropdown
              testID="add-dest"
              value={destId ?? sectionChoices[0]?.sec.id ?? null}
              options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label }))}
              onPick={setDestId}
              gold
            />
          </View>
        )}
        {showWhen && (
          <View style={s.panel}>
            {/* A circle wearing the calendar, never a box that looks typed-in
                — Sean, 2026-08-20. DayPickBtn names the chosen day beside
                the icon; the picker is the same DayPick as everywhere. */}
            {/* No time field, and no "+ End": a time belongs to a reminder
                and an end to an event, and this app has neither. */}
            <DayPickBtn testID="add-date" value={datePicked} onPress={() => setDayPickOpen(true)} />
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
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>tomorrow</Text>, <Text style={s.helpBold}>today</Text> or <Text style={s.helpBold}>yesterday</Text></Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>friday</Text> or <Text style={s.helpBold}>fri</Text> — the next one to come</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>in 2 weeks</Text>, <Text style={s.helpBold}>3 days</Text>, <Text style={s.helpBold}>1 month</Text> — that far from today</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>in an hour</Text> or <Text style={s.helpBold}>in 30mins</Text> — a time from now</Text>
          <Text style={s.helpRow}>·  e.g. <Text style={s.helpBold}>Vet 8/3 2pm</Text> → “Vet”, Aug 3, 2:00pm</Text>
          <Text style={s.helpNote}>A time on its own lands on today — or tomorrow, if it has already gone by.</Text>
        </View>
      </Scroll>
      {dayPickOpen && <DayPick value={datePicked} onPick={setDatePicked} onClose={() => setDayPickOpen(false)} />}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  // paddingTop 0: the gap below the divider is TopBar's, one value for
  // every tab (chrome.tsx's ruleWrap). It used to be set here at 16.
  scroll: { padding: 16, paddingTop: 0, gap: 14 },
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
  helpNote: { color: T.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
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
}));
