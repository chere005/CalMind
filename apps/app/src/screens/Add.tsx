/**
 * The Add page, prod's shape: today's date line, the one big line of text,
 * three kind cards (Reminder / Event / Note), the three reveal pills
 * (+ Folder/Section, + Date/Time, + Repeat), a full-width accent Done that
 * adds and returns, and the typed-pattern help block underneath.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import { showAgain,
  byRecOrd,
  newId,
  ordBetween,
  REPEAT_UNITS,
  parseClockField,
  nowStr,
  parseWhenFromText,
  prefsOf,
  normalizeEndDate,
  todayStr,
  type Rec,
  type Repeat,
} from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { CalendarIcon, PageIcon, TickCircleIcon } from '../components/KindIcons';
import { CircleBtn, DayPickBtn, Field, Scroll } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { DayPick } from '../components/DayPick';

type Kind = 'reminder' | 'event' | 'note';

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
  const { recs, mutate, sharedRecs, sharedPut, sharedPartner, sharedPartnerLabel } = useStore();
  // EVENT first, on Sean's word (2026-08-12). The + used to open on Reminder
  // — the suite's order, kept because it was the suite's — and he asked for
  // the card that is actually reached for from this button.
  const [kind, setKind] = useState<Kind>('event');
  const [text, setText] = useState('');
  const [destId, setDestId] = useState<string | null>(null);
  // Folder/Section no longer reveals — the destination dropdown shows from
  // the start (Sean, 2026-09-15), defaulting to the app's default container.
  // Date/Time and Repeat stay reveals, but pressing the pill now REPLACES it
  // with the opened editor, and each panel carries its own × to fold away
  // (rather than the pill staying lit beside the panel).
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  // The date is PICKED, not typed, since 2026-08-19 ("m/d should be a
  // calendar picker in the add page") — 'YYYY-MM-DD' straight from the grid,
  // no parse step to disagree with anything. Typing a date still works where
  // the typing hand already is: the line itself ("Dentist 8/3 2pm").
  const [datePicked, setDatePicked] = useState<string | null>(null);
  // The end DAY of a span (events only). null = ends the same day; a day at
  // or before the start collapses back to same-day in core (normalizeEndDate).
  const [endDatePicked, setEndDatePicked] = useState<string | null>(null);
  // Which day the picker is editing — start or end — so one DayPick serves
  // both rows of the open Date/Time editor.
  const [dayPick, setDayPick] = useState<'start' | 'end' | null>(null);
  const [timeField, setTimeField] = useState('');
  const [endField, setEndField] = useState('');
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [err, setErr] = useState('');
  const lastFiled = useRef<{ text: string; at: number } | null>(null);

  const today = todayStr();
  // The date line names the day this Add will file on — today, unless the
  // screen was launched from another day on the calendar.
  const baseDay = date0 ?? today;
  const todayLabel = new Date(`${baseDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  /**
   * Mine, then the partner's shared containers, each of theirs labelled
   * @partner — the same menu ItemModal draws, for the same reason (Sean,
   * 2026-09-15: "allow users to… add events/reminders/notes to shared
   * events/reminders/notes"; his 2026-08-20 word that took them out of this
   * menu is superseded by it). Picking one of theirs sends the add through
   * sharedPut into THEIR store; `sharedIds` is how the save knows.
   */
  const { sectionChoices, calendars, sharedIds } = useMemo(() => {
    const app = kind === 'note' ? 'notes' : 'reminders';
    const choicesOf = (pool: typeof recs, prefix: string) => {
      const folders = pool.filter((r): r is Rec<'folder'> => r.type === 'folder').sort(byRecOrd);
      const sections = pool.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
      return {
        sectionChoices: folders
          .filter((f) => (f.payload.app ?? 'reminders') === app)
          .flatMap((f) => sections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${prefix}${f.payload.name} · ${x.payload.name}`, color: f.payload.color }))),
        calendars: pool.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort(byRecOrd)
          .map((c) => ({ cal: c, label: `${prefix}${c.payload.name}` })),
      };
    };
    const mine = choicesOf(recs, '');
    const theirs = sharedPartner ? choicesOf(sharedRecs, `@${sharedPartnerLabel ?? sharedPartner} · `) : { sectionChoices: [], calendars: [] };
    return {
      sectionChoices: [...mine.sectionChoices, ...theirs.sectionChoices],
      calendars: [...mine.calendars, ...theirs.calendars],
      sharedIds: new Set([...theirs.calendars.map((c) => c.cal.id), ...theirs.sectionChoices.map((c) => c.sec.id)]),
    };
  }, [recs, sharedRecs, sharedPartner, sharedPartnerLabel, kind]);

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
    const ft = parseClockField(timeField);
    // Manual-beats-parsed (Sean, 2026-08-18): a category the fields settled
    // is not lifted from the line — the token stays, unused.
    const [clean, pd, pt, pe, pEndDate] = parseWhenFromText(raw, today, nowStr(), { date: fd === null, time: ft === null });
    // The launch day (date0) is an INCUMBENT, ranked as ItemModal ranks its
    // own: an explicit typed token beats it, but a bare "2pm" only IMPLIES a
    // day and that implication is a fallback, not an instruction — it must
    // not drag an add made from Aug 25 back to today. The time-less parse
    // cannot imply, so its date is the explicit token alone.
    const [, pdExplicit] = parseWhenFromText(raw, today, nowStr(), { date: fd === null, time: false });
    const date = fd ?? pdExplicit ?? date0 ?? pd;
    const time = ft ?? pt;
    // Only events carry an end, and only after a start (Sean, 2026-08-18). The
    // end-time field is always in view now (no +End reveal), so an empty field
    // means no end; a typed RANGE ("lunch 12-1pm") still fills it via pe, and
    // an end put in BY HAND wins, like every other manual-beats-parsed pair.
    const fe = parseClockField(endField);
    const end = kind === 'event' && time !== null ? fe ?? pe : null;
    // The end DAY (events only), kept only when it is after the start day —
    // core drops an equal-or-earlier one back to same-day. A day picked by
    // hand outranks one written in the line ("conference mon-wed"), the same
    // order every other pair here follows.
    const endDate = kind === 'event' ? normalizeEndDate(date ?? today, endDatePicked ?? pEndDate) : null;
    const title = clean || raw;
    let createdNoteId: string | null = null;
    // The record is built once and handed to the store it belongs to — mine
    // through the engine, the partner's through sharedPut when the chosen
    // container is one of theirs. Un-hiding the destination is a preference
    // of MINE, so it happens only on my side.
    let out: Rec<'event'> | Rec<'reminder'> | Rec<'note'>;
    let toShared = false;
    if (kind === 'event') {
      const cal =
        calendars.find((c) => c.cal.id === destId)?.cal ??
        calendars.find((c) => c.cal.id === prefsOf(recs, 'calendar').defaultCalendarId)?.cal ??
        calendars[0]!.cal;
      toShared = sharedIds.has(cal.id);
      out = { id: newId(), type: 'event', updated: 0, payload: { text: title, date: date ?? today, time, end, endDate, repeat, calendarId: cal.id, ord: ordBetween(null, null) } };
      if (!toShared) {
        // Whatever you just added has to be visible afterwards.
        const widen = showAgain(recs, 'calendar', cal.id);
        if (widen) mutate((e) => e.put(widen));
      }
    } else {
      const app = kind === 'note' ? ('notes' as const) : ('reminders' as const);
      const pick =
        sectionChoices.find((c) => c.sec.id === destId) ??
        sectionChoices.find((c) => c.sec.id === prefsOf(recs, app).defaultSectionId) ??
        sectionChoices[0]!;
      const { folderId } = pick.sec.payload;
      toShared = sharedIds.has(pick.sec.id);
      if (!toShared) {
        const widen = showAgain(recs, kind === 'reminder' ? 'reminders' : 'notes', folderId);
        if (widen) mutate((e) => e.put(widen));
      }
      if (kind === 'reminder') {
        // `date ?? today`, matching what the event above has always done.
        // A reminder filed from here with no date landed undated, which puts
        // it in the all-view and on no day — Sean asked for today, which is
        // also the only day this button can mean.
        out = { id: newId(), type: 'reminder', updated: 0, payload: { text: title, due: date ?? today, time, done: false, repeat, folderId, sectionId: pick.sec.id, indent: 0, ord: ordBetween(null, null) } };
      } else {
        const noteId = newId();
        out = { id: noteId, type: 'note', updated: 0, payload: { title, body: '', date, folderId, sectionId: pick.sec.id, ord: ordBetween(null, null) } };
        // A note of MINE opens in the editor; one filed into the partner's
        // folder stays where it landed — the editor is for my store.
        if (!toShared) createdNoteId = noteId;
      }
    }
    if (toShared) void sharedPut(out);
    else mutate((e) => e.put(out));
    setText('');
    if (createdNoteId) {
      onNoteCreated?.(createdNoteId);
      return false; // navigation already happened
    }
    return true;
  };

  const kindCard = (k: Kind, label: string, icon: React.ReactNode) => (
    // The three cards are a radio group and said so to nobody: bare
    // Pressables with an icon and a word, so which one is CHOSEN existed only
    // as a background colour. Same fault the account pill had, and the same
    // fix — it is also the only way a spec can read which card is selected.
    <Pressable
      key={k}
      testID={`add-kind-${k}`}
      accessibilityRole="radio"
      aria-checked={kind === k}
      accessibilityLabel={label}
      onPress={() => { setKind(k); setDestId(null); }}
      style={[s.card, kind === k && s.cardOn]}
    >
      {icon}
      <Text style={[s.cardLabel, kind === k && s.cardLabelOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.page}>
      <TopBar title="Add" />
      <Scroll contentContainerStyle={s.scroll}>
        <Text testID="add-date-line" style={s.dateLine}>{todayLabel}</Text>
        <Field testID="add-text" value={text} onChangeText={(t) => { setText(t); setErr(''); }} placeholder="e.g. Dentist 8/3 2pm…" autoFocus onSubmitEditing={() => add() && done()} />

        <View style={s.cards}>
          {kindCard('reminder', 'Reminder', <TickCircleIcon size={24} color={kind === 'reminder' ? T.accent : T.dim} />)}
          {kindCard('event', 'Event', <CalendarIcon size={24} color={kind === 'event' ? T.accent : T.dim} />)}
          {kindCard('note', 'Note', <PageIcon size={24} color={kind === 'note' ? T.accent : T.dim} />)}
        </View>

        {/* Folder/Section: always shown, full width (Sean, 2026-09-15),
            defaulting to the app's default container. Calendar for an event,
            folder→section for a reminder or note. */}
        <View style={s.panel}>
          {kind === 'event' ? (
            <Dropdown
              testID="add-dest"
              value={destId ?? calendars[0]?.cal.id ?? null}
              options={calendars.map((c) => ({ id: c.cal.id, label: c.label, color: c.cal.payload.color }))}
              onPick={setDestId}
            />
          ) : (
            <Dropdown
              testID="add-dest"
              value={destId ?? sectionChoices[0]?.sec.id ?? null}
              options={sectionChoices.map((c) => ({ id: c.sec.id, label: c.label, color: c.color }))}
              onPick={setDestId}
            />
          )}
          {/* Said out loud once the choice is the partner's: this add is a
              write into THEIR store. */}
          {destId !== null && sharedIds.has(destId) && (
            <Text testID="add-shared-note" style={s.sharedNote}>Saves to @{sharedPartnerLabel ?? sharedPartner}'s list</Text>
          )}
        </View>

        {/* Date, Time and Repeat each reveal on their OWN line (Sean,
            2026-09-15): the stacked button is replaced by its start/end
            editor, which carries an × to fold back. The start still defaults
            from context (date0 ?? today, and the typed line); the end starts
            empty. */}
        {!showDate ? (
          <Pressable testID="add-show-date" style={s.revealBtn} onPress={() => setShowDate(true)}>
            <Text style={s.revealBtnText}>+ Date</Text>
          </Pressable>
        ) : (
          // Label, selectors and × on ONE line (Sean, 2026-09-15). A circle
          // wearing the calendar, never a box that looks typed-in (Sean,
          // 2026-08-20); the shared DayPick is told which day it edits by
          // `dayPick`, and events get an end day for a span.
          <View style={s.panelInline}>
            <View style={s.panelInlineMain}>
              <Text style={s.panelLabel}>Date</Text>
              <DayPickBtn testID="add-date" value={datePicked} onPress={() => setDayPick('start')} />
              {kind === 'event' && (
                <>
                  <Text style={s.panelLabel}>to</Text>
                  <DayPickBtn testID="add-end-date" value={endDatePicked} onPress={() => setDayPick('end')} />
                </>
              )}
            </View>
            <CircleBtn glyph="×" label="Remove date" size={22} onPress={() => { setShowDate(false); setDatePicked(null); setEndDatePicked(null); }} />
          </View>
        )}

        {!showTime ? (
          <Pressable testID="add-show-time" style={s.revealBtn} onPress={() => setShowTime(true)}>
            <Text style={s.revealBtnText}>+ Time</Text>
          </Pressable>
        ) : (
          <View style={s.panelInline}>
            <View style={s.panelInlineMain}>
              <Text style={s.panelLabel}>Time</Text>
              <Field value={timeField} onChangeText={setTimeField} placeholder="2:30pm" style={s.miniField} />
              {kind === 'event' && (
                <>
                  <Text style={s.panelLabel}>to</Text>
                  <Field value={endField} onChangeText={setEndField} placeholder="3:30pm" style={s.miniField} />
                </>
              )}
            </View>
            <CircleBtn glyph="×" label="Remove time" size={22} onPress={() => { setShowTime(false); setTimeField(''); setEndField(''); }} />
          </View>
        )}

        {kind !== 'note' && (!showRepeat ? (
          <Pressable
            testID="add-show-repeat"
            style={s.revealBtn}
            onPress={() => {
              // Opening FILES a weekly repeat (Sean, 2026-08-19: "repeat picker
              // should default to week"); the × clears it again.
              setRepeat({ n: 1, unit: 'week' });
              setShowRepeat(true);
            }}
          >
            <Text style={s.revealBtnText}>+ Repeat</Text>
          </Pressable>
        ) : (
          <View style={s.panelCol}>
            <View style={s.panelHead}>
              <Text style={s.panelLabel}>Repeat</Text>
              <CircleBtn glyph="×" label="Remove repeat" size={22} onPress={() => { setShowRepeat(false); setRepeat(null); }} />
            </View>
            <View style={s.panel}>
              <Text style={s.panelLabel}>every</Text>
              <CircleBtn glyph="−" label="Fewer" size={22} onPress={() => repeat && setRepeat({ ...repeat, n: Math.max(1, repeat.n - 1) })} />
              <Text style={s.repN}>{repeat?.n ?? 1}</Text>
              {/* Math.min matches ItemModal's stepper, which has always had a
                  ceiling this one lacked — the floor was clamped in both. */}
              <CircleBtn glyph="+" label="Add" size={22} onPress={() => setRepeat({ n: Math.min(999, (repeat?.n ?? 1) + 1), unit: repeat?.unit ?? 'week' })} />
              {/* core's list, in a dropdown — Sean's word, 2026-08-18. */}
              <Dropdown
                testID="repeat-unit"
                value={repeat?.unit ?? 'week'}
                options={REPEAT_UNITS.map((u) => ({ id: u, label: u }))}
                onPick={(u) => setRepeat({ n: repeat?.n ?? 1, unit: u as Repeat['unit'] })}
              />
            </View>
          </View>
        ))}

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
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>mon-wed</Text> or <Text style={s.helpBold}>Monday to Wed</Text> — an all-day event across those days</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>in 2 weeks</Text>, <Text style={s.helpBold}>3 days</Text>, <Text style={s.helpBold}>1 month</Text> — that far from today</Text>
          <Text style={s.helpRow}>·  <Text style={s.helpBold}>in an hour</Text> or <Text style={s.helpBold}>in 30mins</Text> — a time from now</Text>
          <Text style={s.helpRow}>·  e.g. <Text style={s.helpBold}>Vet 8/3 2pm</Text> → “Vet”, Aug 3, 2:00pm</Text>
          <Text style={s.helpNote}>A time on its own lands on today — or tomorrow, if it has already gone by.</Text>
        </View>
      </Scroll>
      {dayPick && (
        <DayPick
          value={dayPick === 'end' ? endDatePicked : datePicked}
          onPick={dayPick === 'end' ? setEndDatePicked : setDatePicked}
          onClose={() => setDayPick(null)}
        />
      )}
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
  // Each reveal is its own full-width button on its own line (Sean,
  // 2026-09-15), pressed to swap in its editor.
  revealBtn: {
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: T.surface,
  },
  revealBtnText: { color: T.dim, fontSize: 15, fontWeight: '600' },
  panel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  // A revealed section stacks its × header over its controls; the pill it
  // replaced is gone, so the × is the only way to fold it away.
  panelCol: { gap: 8 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Header label + selectors on one line, the × trailing at the right; the
  // inner group wraps when narrow while the × stays put.
  panelInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelInlineMain: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  panelLabel: { color: T.dim, fontSize: 13 },
  // A time is at most seven characters ("12:30pm"), so the field is sized to
  // that and no wider — Sean, 2026-09-15: "make the time fields smaller so
  // they fit on one line." Field's own flex made each one take the row, so
  // Time, its start, "to" and its end wrapped onto two lines at 480.
  miniField: { flex: 0, flexGrow: 0, flexBasis: 'auto', width: 92, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10 },
  repN: { color: T.text, fontSize: 14, minWidth: 20, textAlign: 'center' },
  err: { color: T.danger, fontSize: 13 },
  sharedNote: { color: T.accent, fontSize: 12, fontWeight: '600', marginTop: 6 },
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
