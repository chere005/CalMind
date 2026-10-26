import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  hasCalendarFeed, newId, normalizeSubUrl, ordBetween, subCalendarName, subIdentity,
  type CalSub, type CalSubSource, type Rec,
} from '@calmind/core';
import { apiPost } from '../api';
import { useStore } from '../store';
import { APP_PALETTES, T, themed } from '../theme';
import { Field, Pill } from '../ui';

type RemoteCalendar = { url: string; name: string; color?: string };

/** Connections stay calsub records; remote events never enter the sync store. */
export function CalendarImport({ subs, colorOffset }: { subs: Rec<'calsub'>[]; colorOffset: number }) {
  const { session, mutate } = useStore();
  const [source, setSource] = useState<CalSubSource>('ical');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [found, setFound] = useState<RemoteCalendar[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const working = useRef(false);
  const currentSubs = useRef(subs);
  currentSubs.current = subs;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const duplicate = (candidate: Pick<CalSub, 'url' | 'source' | 'username'>) =>
    currentSubs.current.some((sub) => subIdentity(sub.payload) === subIdentity(candidate));
  const changeConnection = () => { setFound([]); setSelected([]); setError(''); setNotice(''); };
  const selectSource = (next: CalSubSource) => {
    if (working.current) return;
    setSource(next); setUrl(''); setUsername(''); setPassword(''); changeConnection();
  };
  const connectionUrl = () => {
    const normalized = normalizeSubUrl(url, source);
    if (!normalized) throw new Error(source === 'caldav'
      ? 'Enter an https:// CalDAV server or calendar URL.'
      : source === 'google' ? 'Paste the Google calendar’s Secret address in iCal format, or its public iCal link.'
        : 'Enter a calendar link starting with https:// or webcal://.');
    return normalized;
  };
  const credentials = () => {
    if (!username.trim() || !password) throw new Error('Enter your CalDAV username and password.');
    return { username: username.trim(), password };
  };
  const fetchCalendar = async (calendarUrl: string, auth?: { username: string; password: string }) => {
    if (!session) throw new Error('Sign in to import a calendar.');
    const response = await apiPost<{ ics: string }>(session.serverUrl, {
      action: 'calsub_fetch', url: calendarUrl, source, ...auth,
    }, session.token);
    if (typeof response.ics !== 'string' || !hasCalendarFeed(response.ics)) throw new Error('That link is not a complete calendar (.ics) feed.');
    return response;
  };
  const save = (calendars: Omit<CalSub, 'ord'>[]) => {
    // Recheck after the network await: sync may have brought this connection
    // from another device while the form was testing it.
    const fresh = calendars.filter((calendar) => !duplicate(calendar));
    if (fresh.length === 0) throw new Error('That calendar is already imported.');
    mutate((engine) => {
      let ord = currentSubs.current[currentSubs.current.length - 1]?.payload.ord ?? null;
      for (const calendar of fresh) {
        ord = ordBetween(ord, null);
        engine.put({ id: newId(), type: 'calsub', updated: 0, payload: { ...calendar, ord } });
      }
    });
    setNotice(fresh.length === 1 ? 'New read-only calendar folder created.' : `${fresh.length} new read-only calendar folders created.`);
    setUrl(''); setPassword(''); setFound([]); setSelected([]);
  };
  const run = async (label: string, task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(label); setError(''); setNotice('');
    try { await task(); }
    catch (err) { if (active.current) setError(err instanceof Error ? err.message : 'Could not import that calendar.'); }
    finally { working.current = false; if (active.current) setBusy(''); }
  };
  const color = (index: number) => APP_PALETTES.calendar[(colorOffset + index) % APP_PALETTES.calendar.length]!;

  const subscribe = () => void run('Checking calendar…', async () => {
    const normalized = connectionUrl();
    if (duplicate({ url: normalized, source })) throw new Error('That calendar is already imported.');
    const response = await fetchCalendar(normalized);
    if (!active.current) return;
    const fallback = source === 'google' ? 'Google Calendar' : new URL(normalized).hostname.replace(/^www\./, '');
    save([{ url: normalized, source, name: subCalendarName(response.ics, fallback), color: color(0) }]);
  });
  const discover = () => void run('Finding calendars…', async () => {
    const normalized = connectionUrl();
    const auth = credentials();
    if (!session) throw new Error('Sign in to import a calendar.');
    const response = await apiPost<{ calendars: RemoteCalendar[] }>(session.serverUrl, {
      action: 'calsub_discover', url: normalized, ...auth,
    }, session.token);
    if (!active.current) return;
    const calendars = response.calendars.filter((calendar, i, all) =>
      normalizeSubUrl(calendar.url, 'caldav') && all.findIndex((other) => other.url === calendar.url) === i);
    if (calendars.length === 0) throw new Error('No calendars found. Check the CalDAV URL and account permissions.');
    setFound(calendars);
    setSelected(calendars.filter((calendar) => !duplicate({ ...calendar, source: 'caldav', ...auth })).map((calendar) => calendar.url));
  });
  const importSelected = () => void run('Importing calendars…', async () => {
    const auth = credentials();
    const calendars = found.filter((calendar) => selected.includes(calendar.url));
    if (calendars.length === 0) throw new Error('Select at least one calendar.');
    const ready: Omit<CalSub, 'ord'>[] = [];
    for (const [index, calendar] of calendars.entries()) {
      setBusy(`Checking calendar ${index + 1} of ${calendars.length}…`);
      await fetchCalendar(calendar.url, auth);
      if (!active.current) return;
      ready.push({
        ...calendar, source: 'caldav', ...auth,
        color: /^#[\da-f]{6}$/i.test(calendar.color ?? '') ? calendar.color! : color(index),
      });
    }
    save(ready);
  });

  return (
    <View style={s.form}>
      <Text style={s.heading}>Import read-only calendars</Text>
      <Text testID="calsub-destination-help" style={s.help}>Each imported calendar creates its own new read-only folder. Events refresh automatically.</Text>
      <View style={s.providers}>
        {([['ical', 'Calendar link'], ['google', 'Google'], ['caldav', 'CalDAV']] as const).map(([id, label]) => (
          <Pill key={id} testID={`calsub-source-${id}`} label={label} primary={source === id} disabled={!!busy} onPress={() => selectSource(id)} />
        ))}
      </View>
      {source === 'google' && <Text style={s.help}>In Google Calendar settings, choose your calendar → Integrate calendar → Secret address in iCal format. Paste that link below. A public iCal link also works.</Text>}
      {source === 'caldav' && <Text style={s.help}>Enter your CalDAV server or calendar URL and account credentials. Use an app password if your provider requires one, then choose calendars to import.</Text>}
      <Field
        testID="calsub-url" accessibilityLabel={source === 'caldav' ? 'CalDAV URL' : 'Calendar link'}
        value={url} onChangeText={(text) => { setUrl(text); changeConnection(); }} editable={!busy}
        placeholder={source === 'caldav' ? 'https://… (CalDAV server)' : 'https://… or webcal://… (.ics link)'}
        autoCapitalize="none" autoCorrect={false} onSubmitEditing={source === 'caldav' ? discover : subscribe}
      />
      {source === 'caldav' ? <>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Username (required)</Text>
          <Field testID="calsub-username" accessibilityLabel="CalDAV username" placeholder="Username" value={username} editable={!busy} autoCapitalize="none" autoCorrect={false} onChangeText={(text) => { setUsername(text); changeConnection(); }} />
        </View>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Password (required)</Text>
          <Field testID="calsub-password" accessibilityLabel="CalDAV password" placeholder="Password or app password" value={password} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} onChangeText={(text) => { setPassword(text); changeConnection(); }} onSubmitEditing={discover} />
        </View>
        <Pill testID="calsub-discover" label={busy || 'Find calendars'} disabled={!!busy || !url.trim() || !username.trim() || !password} onPress={discover} />
        {found.map((calendar, index) => {
          const imported = duplicate({ ...calendar, source: 'caldav', username: username.trim() });
          const checked = selected.includes(calendar.url);
          return <Pressable key={calendar.url} testID={`calsub-discovered-${index}`} accessibilityRole="checkbox" accessibilityState={{ checked: imported || checked, disabled: !!busy || imported }} disabled={!!busy || imported} style={s.calendar} onPress={() => setSelected(checked ? selected.filter((item) => item !== calendar.url) : [...selected, calendar.url])}>
            <Text style={s.check}>{imported || checked ? '☑' : '☐'}</Text>
            <Text style={s.name}>{calendar.name}</Text>
            {imported && <Text style={s.help}>Imported</Text>}
          </Pressable>;
        })}
        {found.length > 0 && <Pill testID="calsub-import" label={busy || `Import selected (${selected.length})`} primary disabled={!!busy || selected.length === 0} onPress={importSelected} />}
      </> : <Pill testID="calsub-add" label={busy || 'Import calendar'} primary disabled={!!busy || !url.trim()} onPress={subscribe} />}
      {error !== '' && <Text testID="calsub-error" accessibilityRole="alert" style={s.error}>{error}</Text>}
      {notice !== '' && <Text testID="calsub-notice" style={s.help}>{notice}</Text>}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  form: { gap: 10 },
  heading: { color: T.gold, fontSize: 13, fontWeight: '800', marginTop: 12 },
  help: { color: T.muted, fontSize: 13 },
  field: { gap: 4 },
  fieldLabel: { color: T.dim, fontSize: 13 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calendar: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  check: { color: T.accent, fontSize: 20 },
  name: { color: T.text, fontSize: 15, flex: 1 },
  error: { color: T.danger, fontSize: 13 },
}));
