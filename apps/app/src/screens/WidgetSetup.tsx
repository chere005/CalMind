/**
 * The suite's widget setup page (calendar/feed.php), translated: install
 * Scriptable, copy the COMPLETE script — feed URL, token and the calendars
 * showing RIGHT NOW baked in as the suite's cals= pin — then the home-screen
 * steps and the token warning. Tapping the widget opens the web app (the PWA
 * if it's saved to the home screen); a reminder row opens its ?tick= page.
 * tools/scriptable-widget.js is the canonical copy of the script body — this
 * page carries the same text with the constants filled, as the suite's page
 * bakes its own.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { apiPost } from '../api';
import { useStore } from '../store';
import { useCalendarView } from '../components/CalendarPick';
import { themed, T } from '../theme';
import { Pill } from '../ui';

function scriptFor(feedUrl: string, appUrl: string): string {
  return `// CalMind widget — Scriptable
const FEED = "${feedUrl}";
const APP = "${appUrl}";

const res = await new Request(FEED).loadJSON();
const w = new ListWidget();
w.url = APP; // tap the widget -> open CalMind
w.backgroundColor = new Color("#111111");
w.setPadding(12, 14, 12, 14);
const days = Object.keys(res.days || {}).sort();
let shown = 0;
for (const d of days) {
  if (shown >= 9) break;
  const head = w.addText(d === res.today ? \`Today · \${fmt(d)}\` : fmt(d));
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#f0b429");
  for (const row of res.days[d]) {
    if (shown >= 9) break;
    const line = w.addStack();
    line.centerAlignContent();
    if (row.kind === "reminder") {
      const box = line.addImage(SFSymbol.named("square").image);
      box.imageSize = new Size(10, 10);
      box.tintColor = row.rolled ? new Color("#f0a860") : new Color("#34d399");
    } else {
      const dot = line.addText("• ");
      dot.font = Font.systemFont(11);
      dot.textColor = new Color("#60a5fa");
    }
    line.addSpacer(4);
    const t = line.addText((row.time ? row.time + " " : "") + row.text);
    t.font = Font.systemFont(11);
    t.textColor = new Color("#eeeeee");
    if (row.kind === "reminder" && row.id) line.url = APP + "?tick=" + row.id;
    shown++;
  }
  w.addSpacer(3);
}
function fmt(d) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
Script.setWidget(w);
Script.complete();
`;
}

export function WidgetSetup({ onClose }: { onClose: () => void }) {
  const { session } = useStore();
  const { calendars, visible } = useCalendarView();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiPost<{ token: string }>(session!.serverUrl, { action: 'widget_token' }, session!.token)
      .then((r) => setToken(r.token))
      .catch(() => setErr('could not mint the widget token — are you online?'));
  }, [session]);

  const base = session!.serverUrl.replace(/api\/index\.php$/, '');
  // The suite's pin: whatever the calendar is showing when you copy.
  const pin = visible.length === calendars.length ? 'all' : visible.map((c) => c.id).join(',');
  const feedUrl = token ? `${session!.serverUrl}?feed=1&t=${token}&cals=${pin}` : '…';
  const script = token ? scriptFor(feedUrl, base) : '';

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <ScrollView style={s.page} contentContainerStyle={s.inner}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={s.back}>← Calendar</Text>
        </Pressable>
        <Text style={s.h1}>Calendar widget</Text>
        <Text style={s.lede}>
          A home-screen widget for <Text style={s.bold}>{session?.username}</Text> that shows your agenda and opens
          CalMind when tapped.
        </Text>

        <Text style={s.h2}>1. Install Scriptable</Text>
        <Text style={s.step}>Get the free Scriptable app from the App Store.</Text>

        <Text style={s.h2}>2. Add the script</Text>
        <Text style={s.step}>
          This script is set to{' '}
          <Text style={s.accent}>{pin === 'all' ? 'every calendar' : `${visible.length} of your calendars`}</Text> —
          whatever the calendar was showing when you opened this page. To point the widget somewhere else, pick it on
          the calendar, come back here, and copy the script again.
        </Text>
        <Text style={s.step}>Open Scriptable → tap + (new script), delete the sample, then paste everything below:</Text>
        <View style={s.codeBox}>
          <ScrollView style={s.codeScroll} nestedScrollEnabled>
            <Text style={s.code}>{token ? script : 'Minting your token…'}</Text>
          </ScrollView>
        </View>
        <Pill
          testID="copy-script"
          label={copied ? 'Copied ✓' : 'Copy script'}
          primary
          onPress={() => {
            void Clipboard.setStringAsync(script);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        />
        <Text style={s.step}>Tap the script's title, name it CalMind, and tap Done.</Text>

        <Text style={s.h2}>3. Put it on your home screen</Text>
        <Text style={s.step}>Long-press the home screen → + → search Scriptable → pick a size → Add Widget.</Text>
        <Text style={s.step}>
          Long-press the new widget → Edit Widget → set Script to CalMind and When Interacting to Open URL.
        </Text>
        <Text style={s.step}>
          Tapping the widget opens CalMind in Safari — or your home-screen CalMind if you've saved it from Share →
          Add to Home Screen.
        </Text>

        <Text style={s.warn}>
          Your feed URL contains a secret token — anyone with it can read your agenda. It reads only; nothing can
          write through it.
        </Text>

        <Pressable onPress={() => setShowRaw(!showRaw)} hitSlop={6}>
          <Text style={s.rawToggle}>{showRaw ? '▾' : '▸'} Show raw feed URL</Text>
        </Pressable>
        {showRaw && <Text selectable style={s.raw}>{feedUrl}</Text>}
        {err !== '' && <Text style={s.err}>{err}</Text>}
      </ScrollView>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  inner: { padding: 20, paddingBottom: 60, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  back: { color: T.dim, fontSize: 15 },
  h1: { color: T.text, fontSize: 26, fontWeight: '800' },
  lede: { color: T.dim, fontSize: 15, lineHeight: 22 },
  bold: { fontWeight: '700', color: T.text },
  accent: { color: T.folderBlue, fontWeight: '600' },
  h2: { color: T.text, fontSize: 18, fontWeight: '700', marginTop: 14 },
  step: { color: T.dim, fontSize: 15, lineHeight: 22 },
  codeBox: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 10, padding: 10, maxHeight: 260 },
  codeScroll: { flexGrow: 0 },
  code: { color: T.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
  warn: { color: T.gold, fontSize: 14, lineHeight: 21, marginTop: 12 },
  rawToggle: { color: T.muted, fontSize: 14, marginTop: 6 },
  raw: { color: T.dim, fontSize: 12, fontFamily: 'Menlo' },
  err: { color: T.danger, fontSize: 14 },
}));
