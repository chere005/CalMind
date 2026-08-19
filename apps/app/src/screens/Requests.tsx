/**
 * The owner's side of the public request page (Sean, 2026-08-19): "Requests"
 * in the account dropdown lists everything the link brought in, each with
 * Accept / Decline / New time. Accept writes the ONE-HOUR event and ends the
 * request; Decline just deletes it; New time opens the day picker and a time
 * field and saves the request under the proposed slot ('proposed', so the
 * list shows which ones are waiting on the requester now).
 *
 * Every answer fires the STUBBED email (meetreq_mail: logged server-side,
 * sent for real once the host can send — "we'll fix that later"). No
 * notifications or badges yet, on the same word; core's meetreqBadgeCount
 * is the number a badge would wear when they arrive.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  byRecOrd, meetreqEvent, newId, ordBetween, parseTimeFromText, pendingRequests,
  prefsOf, timeLabel, type Rec,
} from '@calmind/core';
import { apiPost } from '../api';
import { useStore } from '../store';
import { DayPick } from '../components/DayPick';
import { CircleBtn, Field, Pill, Scroll } from '../ui';
import { themed, T } from '../theme';

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
  dateBtn: {
    borderWidth: 1, borderColor: T.line, borderRadius: 10, backgroundColor: T.surface2,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dateBtnText: { color: T.text, fontSize: 14, fontWeight: '600' },
  timeField: { width: 110 },
}));
