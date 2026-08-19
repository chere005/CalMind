/**
 * The PUBLIC meeting-request page (Sean, 2026-08-19): <app>/request is a
 * link to hand out — deliberately absent from the app's own navigation — that
 * shows his open hours and takes a request. Meetings run ABOUT AN HOUR and
 * only the start is chosen; requestable inside the day's window (his week:
 * 10am–8pm, Tuesdays from 2pm, Friday/Saturday to 11pm) unless his calendar
 * says otherwise. The open/closed arithmetic is the SERVER'S (the same rule that
 * validates the create — see app.php's meetreq section); this page only draws
 * what it is told and asks.
 *
 * No session, no store: the two API calls here are the anonymous pair. A
 * `?u=` override exists for the harness; the deployed page leaves it off and
 * the server answers for its configured owner.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthGridFilled, timeLabel, todayStr } from '@calmind/core';
import { apiPost } from '../api';
import { defaultServerUrl } from '../config';
import { CircleBtn, Field, Pill, Scroll } from '../ui';
import { themed, T } from '../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Every timeLabel below passes `false` DELIBERATELY: a stranger holding the
// link has no clock24 setting to honour, and 12-hour is the public default.
// The clocksetting guard is what makes this a decision instead of a slip.

/** The harness's account override, read once — absent on the real link. */
function userParam(): string {
  if (typeof location === 'undefined') return '';
  return new URLSearchParams(location.search).get('u') ?? '';
}

export function Request() {
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [days, setDays] = useState<Record<string, string[]>>({});
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const cells = monthGridFilled(year, month);

  // One fetch covers the whole drawn grid, neighbors included.
  useEffect(() => {
    const from = cells[0]!;
    const u = userParam();
    void apiPost<{ days: Record<string, string[]> }>(defaultServerUrl(), {
      action: 'meetreq_slots',
      ...(u ? { user: u } : {}),
      from,
      days: cells.length,
    })
      .then((r) => setDays((cur) => ({ ...cur, ...r.days })))
      .catch(() => setNote('Could not load the calendar — try again in a moment.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const page = (n: number) => {
    const d = new Date(Date.UTC(year, month - 1 + n, 15));
    setYm(d.toISOString().slice(0, 7));
    setPicked(null);
  };
  const ymLabel = new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const send = () => {
    if (!picked) return;
    setNote('');
    setBusy(true);
    const u = userParam();
    void apiPost(defaultServerUrl(), {
      action: 'meetreq_create',
      ...(u ? { user: u } : {}),
      name: name.trim(),
      email: email.trim(),
      date: picked.date,
      time: picked.time,
    })
      .then(() => {
        setSent(true);
        // The slot leaves the local view; the server never held it open.
        setDays((cur) => ({ ...cur, [picked.date]: (cur[picked.date] ?? []).filter((t) => t !== picked.time) }));
      })
      .catch((e: unknown) => setNote(e instanceof Error ? e.message : 'that did not send — try again'))
      .finally(() => setBusy(false));
  };

  if (sent) {
    return (
      <View style={[s.page, { paddingTop: insets.top }]}>
        <View style={s.inner}>
          <Text style={s.h1}>Request sent</Text>
          <Text style={s.sub}>
            {dayLabel(picked!.date)} · {timeLabel(picked!.time, false)} — about an hour.
          </Text>
          <Text style={s.note}>You&apos;ll get an email once it&apos;s answered.</Text>
          <Pill label="Request another time" onPress={() => { setSent(false); setPicked(null); }} />
        </View>
      </View>
    );
  }

  return (
    <Scroll style={[s.page, { paddingTop: insets.top }]} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Request a meeting</Text>
      <Text style={s.sub}>Meetings run about an hour — pick a day, then a start time.</Text>

      <View style={s.gridHead}>
        <CircleBtn testID="req-prev" glyph="‹" size={30} label="Previous month" onPress={() => page(-1)} />
        <Text testID="req-ym" style={s.ymLabel}>{ymLabel}</Text>
        <CircleBtn testID="req-next" glyph="›" size={30} label="Next month" onPress={() => page(1)} />
      </View>
      <View style={s.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={s.weekDay}>{w}</Text>
        ))}
      </View>
      <View style={s.grid}>
        {cells.map((iso) => {
          const open = (days[iso] ?? []).length > 0;
          const inMonth = iso.slice(0, 7) === ym;
          const isToday = iso === today;
          const on = picked?.date === iso;
          return (
            <Pressable
              key={iso}
              testID="req-cell"
              accessibilityLabel={iso}
              disabled={!open}
              onPress={() => setPicked({ date: iso, time: '' })}
              style={[s.cell, on && s.cellOn]}
            >
              <Text
                style={[
                  s.cellText,
                  !inMonth && s.cellDim,
                  !open && s.cellClosed,
                  isToday && s.cellToday,
                  on && s.cellTextOn,
                ]}
              >
                {Number(iso.slice(8, 10))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {picked && (
        <>
          <Text style={s.dayHead}>{dayLabel(picked.date)}</Text>
          <View style={s.slotWrap}>
            {(days[picked.date] ?? []).map((t) => (
              <Pressable
                key={t}
                testID="req-slot"
                accessibilityLabel={`${picked.date} ${t}`}
                onPress={() => setPicked({ date: picked.date, time: t })}
                style={[s.slot, picked.time === t && s.slotOn]}
              >
                <Text style={[s.slotText, picked.time === t && s.slotTextOn]}>{timeLabel(t, false)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {picked && picked.time !== '' && (
        <View style={s.form}>
          <Text style={s.formHead}>
            {dayLabel(picked.date)} · {timeLabel(picked.time, false)} — about an hour
          </Text>
          <Field testID="req-name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field
            testID="req-email"
            value={email}
            onChangeText={setEmail}
            placeholder="Your email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pill testID="req-send" label={busy ? 'Sending…' : 'Request this time'} primary onPress={send} />
        </View>
      )}
      {note !== '' && <Text testID="req-note" style={s.err}>{note}</Text>}
    </Scroll>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  inner: { padding: 20, paddingBottom: 60, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  h1: { color: T.text, fontSize: 24, fontWeight: '800' },
  sub: { color: T.dim, fontSize: 14, lineHeight: 20 },
  gridHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  ymLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', color: T.muted, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  cellOn: { backgroundColor: T.accentSoft },
  cellText: { color: T.text, fontSize: 15, fontWeight: '600' },
  cellTextOn: { color: T.accent },
  cellDim: { opacity: 0.45 },
  // A closed day reads as unavailable, not merely quiet.
  cellClosed: { color: T.muted, opacity: 0.35, textDecorationLine: 'line-through' },
  cellToday: { color: T.accent },
  dayHead: { color: T.gold, fontSize: 15, fontWeight: '700', marginTop: 6 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    borderWidth: 1, borderColor: T.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: T.surface,
  },
  slotOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  slotText: { color: T.text, fontSize: 14, fontWeight: '600' },
  slotTextOn: { color: T.accent },
  form: { gap: 10, marginTop: 8 },
  formHead: { color: T.text, fontSize: 14, fontWeight: '600' },
  err: { color: T.gold, fontSize: 13 },
  note: { color: T.dim, fontSize: 14 },
}));
