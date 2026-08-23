/**
 * The owner's side of the public request page (Sean, 2026-08-19): "Requests"
 * in the account dropdown lists everything the link brought in, each with
 * Accept / Decline / New time. Accept writes the ONE-HOUR event and ends the
 * request; Decline just deletes it; New time opens the day picker and a time
 * field and saves the request under the proposed slot ('proposed', so the
 * list shows which ones are waiting on the requester now).
 *
 * Every answer fires the STUBBED email (meetreq_mail: logged server-side;
 * server/lib/mail.php is the single stub, its transport one uncomment away
 * — "we'll fix that later"). No notifications or badges yet, on the same
 * word; core's meetreqBadgeCount is the number a badge would wear when
 * they arrive.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  byRecOrd, dayAnyOpen, dayToggleAll, meetAvailId, meetAvailOf, meetreqEvent, monthGridFilled,
  newId, ordBetween, parseTimeFromText, pendingRequests, prefsOf, slotOpen, slotToggle, timeLabel,
  todayStr, type MeetAvail, type Rec,
} from '@calmind/core';
import { apiPost } from '../api';
import { useStore } from '../store';
import { DayPick } from '../components/DayPick';
import { CircleBtn, Field, Pill, Scroll } from '../ui';
import { themed, T } from '../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Requests({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { recs, mutate, session } = useStore();
  const reqs = pendingRequests(recs);
  const clock24 = prefsOf(recs, 'suite').clock24 === true;
  const [msg, setMsg] = useState('');
  // The New-time flow, one request at a time: pick a day, type a start.
  const [retiming, setRetiming] = useState<Rec<'meetreq'> | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [timeField, setTimeField] = useState('');

  // ---- availability (Sean, 2026-08-21) --------------------------------
  //
  // A month to tap, the day's hours underneath, blue for offered and red for
  // not. The COLOUR is read locally — meetAvailOf over the synced records —
  // so a tap answers instantly and works with no network; only the two
  // things his device cannot know come from the server, and they come
  // together in one call: which hours are in the window at all, and which
  // ones his calendar has already taken.
  //
  // `owner` decides whether any of this is drawn. It is the server's answer,
  // not a username compiled in here: the account whose page the internet
  // actually reaches is a fact of the instance, and an editor drawn for
  // anyone else would write records nothing would ever read.
  const [avOwner, setAvOwner] = useState<boolean | null>(null);
  const [avDate, setAvDate] = useState(todayStr());
  const [avYm, setAvYm] = useState(todayStr().slice(0, 7));
  const [avSlots, setAvSlots] = useState<{ time: string; busy: boolean }[]>([]);
  const [avNote, setAvNote] = useState('');
  const av = meetAvailOf(recs, avDate);

  useEffect(() => {
    if (!session) return;
    setAvNote('');
    void apiPost<{ owner: boolean; slots: { time: string; busy: boolean }[] }>(
      session.serverUrl, { action: 'meetreq_day', date: avDate }, session.token,
    )
      .then((r) => {
        setAvOwner(r.owner);
        setAvSlots(Array.isArray(r.slots) ? r.slots : []);
      })
      // The section is left as it was rather than torn down: a dropped
      // connection is not evidence that the request page stopped being his.
      .catch(() => setAvNote('Could not read that day — the hours below may be out of date.'));
  }, [avDate, session]);

  const putAv = (next: MeetAvail) =>
    mutate((e) => e.put({ id: meetAvailId(avDate), type: 'meetavail', updated: 0, payload: next }));

  const cells = monthGridFilled(Number(avYm.slice(0, 4)), Number(avYm.slice(5, 7)));
  const monthLabel = new Date(`${avYm}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const pageMonth = (n: number) => {
    const d = new Date(Date.UTC(Number(avYm.slice(0, 4)), Number(avYm.slice(5, 7)) - 1 + n, 15));
    setAvYm(d.toISOString().slice(0, 7));
  };

  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  /** The stub, fired and forgotten: the answer must not hang on the log. */
  const mail = (to: string, kind: 'accepted' | 'declined' | 'newtime', when: string) => {
    if (!session) return;
    void apiPost(session.serverUrl, { action: 'meetreq_mail', to, kind, when }, session.token).catch(() => {});
  };

  const accept = (r: Rec<'meetreq'>) => {
    // The event lands on the default calendar, at the end of its order —
    // the same landing an Add-screen event gets.
    const cals = recs.filter((x): x is Rec<'calendar'> => x.type === 'calendar' && !x.deleted).sort(byRecOrd);
    const calId = prefsOf(recs, 'calendar').defaultCalendarId ?? cals[0]?.id;
    if (!calId) {
      setMsg('No calendar to put it on.');
      return;
    }
    const last = recs.filter((x): x is Rec<'event'> => x.type === 'event' && !x.deleted).sort(byRecOrd).pop();
    const ord = ordBetween(last?.payload.ord ?? null, null);
    mutate((e) => {
      e.put({ id: newId(), type: 'event', updated: 0, payload: meetreqEvent(r.payload, calId, ord) });
      e.del(r.id);
    });
    mail(r.payload.email, 'accepted', `${r.payload.date} ${timeLabel(r.payload.time, clock24)}`);
    setMsg(`Accepted — on the calendar, ${dayLabel(r.payload.date)} ${timeLabel(r.payload.time, clock24)}.`);
  };

  const decline = (r: Rec<'meetreq'>) => {
    mutate((e) => e.del(r.id));
    mail(r.payload.email, 'declined', '');
    setMsg('Declined.');
  };

  const saveNewTime = () => {
    if (!retiming) return;
    const [, t] = parseTimeFromText(timeField.trim());
    const date = newDate ?? retiming.payload.date;
    if (!t) {
      setMsg('Type a start time — like 2:30pm.');
      return;
    }
    mutate((e) => e.put({ ...retiming, payload: { ...retiming.payload, date, time: t, status: 'proposed' } }));
    mail(retiming.payload.email, 'newtime', `${date} ${timeLabel(t, clock24)}`);
    setMsg(`Proposed ${dayLabel(date)} ${timeLabel(t, clock24)} to ${retiming.payload.name}.`);
    setRetiming(null);
    setNewDate(null);
    setTimeField('');
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={[s.page, { paddingTop: insets.top }]}>
        <View style={s.head}>
          <CircleBtn testID="requests-back" glyph="‹" size={32} label="Back" onPress={onClose} />
          <Text style={s.h1}>Requests</Text>
        </View>
        <Scroll style={s.list} contentContainerStyle={s.listInner}>
          {reqs.length === 0 && <Text style={s.empty}>No meeting requests.</Text>}
          {msg !== '' && <Text testID="requests-msg" style={s.msg}>{msg}</Text>}
          {reqs.map((r) => (
            <View key={r.id} testID="request-row" style={s.row}>
              <View style={s.rowTop}>
                <Text style={s.rowName}>{r.payload.name}</Text>
                {(r.payload.status ?? 'new') === 'proposed' && (
                  <Text style={s.proposed}>new time proposed</Text>
                )}
              </View>
              <Text style={s.rowMeta}>{r.payload.email}</Text>
              <Text style={s.rowWhen}>
                {dayLabel(r.payload.date)} · {timeLabel(r.payload.time, clock24)} — about an hour
              </Text>
              {retiming?.id === r.id ? (
                <View style={s.retime}>
                  <Pressable testID="request-pickday" style={s.dateBtn} onPress={() => setDayOpen(true)}>
                    <Text style={s.dateBtnText}>{dayLabel(newDate ?? r.payload.date)}</Text>
                  </Pressable>
                  <Field
                    testID="request-time"
                    value={timeField}
                    onChangeText={setTimeField}
                    placeholder="2:30pm"
                    style={s.timeField}
                    onSubmitEditing={saveNewTime}
                  />
                  <Pill testID="request-savetime" label="Propose" primary onPress={saveNewTime} />
                </View>
              ) : (
                <View style={s.btnRow}>
                  <Pill testID="request-accept" label="Accept" primary onPress={() => accept(r)} />
                  <Pill testID="request-decline" label="Decline" onPress={() => decline(r)} />
                  <Pill
                    testID="request-newtime"
                    label="New time"
                    onPress={() => {
                      setRetiming(r);
                      setNewDate(r.payload.date);
                      setTimeField('');
                    }}
                  />
                </View>
              )}
            </View>
          ))}

          {avOwner === true && (
            <View testID="avail" style={s.avail}>
              <Text style={s.avHead}>Availability</Text>
              <Text style={s.avSub}>
                Blue is offered on your request page; red is not. Tap an hour to change it — a
                dot means you already have something then.
              </Text>
              <View style={s.gridHead}>
                <CircleBtn testID="av-prev" glyph="‹" size={30} label="Previous month" onPress={() => pageMonth(-1)} />
                <Text testID="av-ym" style={s.ymLabel}>{monthLabel}</Text>
                <CircleBtn testID="av-next" glyph="›" size={30} label="Next month" onPress={() => pageMonth(1)} />
              </View>
              <View style={s.weekRow}>
                {WEEKDAYS.map((w, i) => <Text key={i} style={s.weekDay}>{w}</Text>)}
              </View>
              <View style={s.grid}>
                {cells.map((iso) => (
                  <Pressable
                    key={iso}
                    testID="av-cell"
                    accessibilityLabel={iso}
                    onPress={() => setAvDate(iso)}
                    style={[s.cell, avDate === iso && s.cellOn]}
                  >
                    <Text
                      style={[
                        s.cellText,
                        iso.slice(0, 7) !== avYm && s.cellDim,
                        iso === todayStr() && s.cellToday,
                        avDate === iso && s.cellTextOn,
                      ]}
                    >
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text testID="av-dayhead" style={s.avDayHead}>
                {new Date(`${avDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              <View style={s.slotWrap}>
                {/* All sits LEFT of the hours, on his word, and reads the same
                    way they do: blue while any hour is still on offer. */}
                {avSlots.length > 0 && (
                  <Pressable
                    testID="av-all"
                    accessibilityLabel={`All ${avDate}`}
                    onPress={() => putAv(dayToggleAll(av, avSlots))}
                    style={[s.slot, s.allBtn, dayAnyOpen(av, avSlots) ? s.slotOpen : s.slotShut]}
                  >
                    <Text style={s.slotText}>All</Text>
                  </Pressable>
                )}
                {avSlots.map((sl) => {
                  const open = slotOpen(av, sl.time, sl.busy);
                  return (
                    <Pressable
                      key={sl.time}
                      testID="av-slot"
                      accessibilityLabel={`${avDate} ${sl.time} ${open ? 'open' : 'closed'}`}
                      onPress={() => putAv(slotToggle(av, sl.time, sl.busy))}
                      style={[s.slot, open ? s.slotOpen : s.slotShut]}
                    >
                      <Text style={s.slotText}>{timeLabel(sl.time, clock24)}</Text>
                      {sl.busy && <View testID="av-busy" style={s.busyDot} />}
                    </Pressable>
                  );
                })}
                {avSlots.length === 0 && (
                  <Text style={s.avEmpty}>Nothing can be requested that day.</Text>
                )}
              </View>
              {avNote !== '' && <Text testID="av-note" style={s.avErr}>{avNote}</Text>}
            </View>
          )}
        </Scroll>
        {dayOpen && (
          <DayPick
            value={newDate}
            onPick={(d) => setNewDate(d ?? newDate)}
            onClose={() => setDayOpen(false)}
          />
        )}
      </View>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  h1: { color: T.text, fontSize: 22, fontWeight: '800' },
  list: { flex: 1, marginTop: 8 },
  listInner: { paddingHorizontal: 16, paddingBottom: 40, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  empty: { color: T.dim, fontSize: 14, marginTop: 16, textAlign: 'center' },
  msg: { color: T.accent, fontSize: 13 },
  row: {
    borderWidth: 1, borderColor: T.line, borderRadius: 12,
    backgroundColor: T.surface, padding: 14, gap: 4,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { color: T.text, fontSize: 16, fontWeight: '700' },
  proposed: { color: T.gold, fontSize: 12, fontWeight: '600' },
  rowMeta: { color: T.dim, fontSize: 13 },
  rowWhen: { color: T.text, fontSize: 14, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  retime: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  // ---- availability ---------------------------------------------------
  avail: { gap: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: T.line, paddingTop: 16 },
  avHead: { color: T.text, fontSize: 18, fontWeight: '800' },
  avSub: { color: T.dim, fontSize: 13, lineHeight: 18 },
  gridHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  ymLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', color: T.muted, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  cellOn: { backgroundColor: T.accentSoft },
  cellText: { color: T.text, fontSize: 15, fontWeight: '600' },
  cellTextOn: { color: T.accent },
  cellDim: { opacity: 0.45 },
  cellToday: { color: T.accent },
  avDayHead: { color: T.gold, fontSize: 15, fontWeight: '700', marginTop: 6 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  slot: {
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  allBtn: { paddingHorizontal: 16 },
  // Blue and red are the two literals in the palette that never theme, which
  // is what he asked for by naming colours rather than states: the meaning
  // has to survive a theme switch.
  slotOpen: { borderColor: T.folderBlue, backgroundColor: T.folderBlue + '33' },
  slotShut: { borderColor: T.danger, backgroundColor: T.danger + '33' },
  slotText: { color: T.text, fontSize: 14, fontWeight: '600' },
  // Why an hour is red, or why a blue one is worth a second look: his own
  // calendar has something in it. Without this the two reds — "I closed it"
  // and "I am busy" — are indistinguishable.
  busyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.text, opacity: 0.55 },
  avEmpty: { color: T.dim, fontSize: 13 },
  avErr: { color: T.gold, fontSize: 13 },
  dateBtn: {
    borderWidth: 1, borderColor: T.line, borderRadius: 10, backgroundColor: T.surface2,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dateBtnText: { color: T.text, fontSize: 14, fontWeight: '600' },
  timeField: { width: 110 },
}));
