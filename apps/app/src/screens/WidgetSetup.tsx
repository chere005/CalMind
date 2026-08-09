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
  // The SUITE's widget, value for value (its source is the old repo's
  // calmind/public/calendar/feed.php): a header row, uppercase day headings
  // with today in green over its own rule, a heavier rule between days, and
  // the time right-aligned at the far edge rather than crammed in front of
  // the title. This page and tools/scriptable-widget.js carry the same body;
  // the widget spec below holds them to it, because they drifted apart once
  // and the flat version is what shipped.
  return `// CalMind widget — Scriptable
const FEED = "${feedUrl}";
const OPEN = "${appUrl}";
const COLORS = { reminder: "#34d399", event: "#60a5fa", note: "#8b6ef0" };
const META = new Color("#777777");
const OVERDUE = "#ff7755";

let data;
try { data = await new Request(FEED).loadJSON(); }
catch (e) { data = { days: {}, error: true }; }

const w = new ListWidget();
w.backgroundColor = new Color("#111111");
w.url = OPEN;
w.setPadding(12, 14, 12, 14);

const head = w.addStack();
const title = head.addText("Calendar");
title.font = Font.boldSystemFont(15);
title.textColor = Color.white();
head.addSpacer();
const dl = head.addText(new Date().toLocaleDateString([], { month: "short", day: "numeric" }));
dl.font = Font.mediumSystemFont(13);
dl.textColor = new Color("#8a8a8a");
w.addSpacer(8);

if (data.error) {
  const t = w.addText("Couldn't load.");
  t.textColor = new Color("#ff6666");
  t.font = Font.systemFont(12);
} else {
  const max = config.widgetFamily === "large" ? 8 : (config.widgetFamily === "small" ? 3 : 5);
  const RANK = { reminder: 0, event: 1, note: 2 };
  const byDay = Object.keys(data.days || {}).sort().map(function (date) {
    return { date: date, list: (data.days[date] || []).slice().sort(function (a, b) {
      return (RANK[a.kind] === undefined ? 9 : RANK[a.kind]) - (RANK[b.kind] === undefined ? 9 : RANK[b.kind]);
    }) };
  });
  if (!byDay.length || byDay[0].date !== data.today) byDay.unshift({ date: data.today, list: [] });
  let budget = max;

  const rule = (weight, color) => {
    const div = w.addStack();
    div.size = new Size(0, weight);
    div.backgroundColor = new Color(color);
    div.addSpacer();
  };

  const drawRow = (it) => {
    const row = w.addStack();
    row.centerAlignContent();
    const late = !!it.rolled;
    if (it.kind === "reminder") {
      if (it.id) row.url = OPEN + "?tick=" + encodeURIComponent(it.id);
      const box = row.addImage(SFSymbol.named("square").image);
      box.imageSize = new Size(11, 11);
      box.tintColor = new Color(late ? OVERDUE : COLORS.reminder);
      box.resizable = true;
    } else {
      const dot = row.addText("●");
      dot.textColor = new Color(COLORS[it.kind] || "#888888");
      dot.font = Font.systemFont(9);
    }
    row.addSpacer(6);
    const label = row.addText(it.text || "");
    label.font = Font.systemFont(12);
    label.textColor = new Color(late ? OVERDUE : "#eeeeee");
    label.lineLimit = 1;
    row.addSpacer();
    if (it.time) {
      const t = row.addText(it.time);
      t.font = Font.systemFont(11);
      t.textColor = META;
    }
    w.addSpacer(5);
  };

  let first = true;
  for (const day of byDay) {
    if (budget <= 0) break;
    if (!first) { w.addSpacer(7); rule(2, "#3a3a3a"); w.addSpacer(8); }
    first = false;
    const isToday = day.date === data.today;
    const h = w.addText(longDate(day.date, data.today).toUpperCase());
    h.font = Font.boldSystemFont(10);
    h.textColor = new Color(isToday ? COLORS.reminder : "#9a9a9a");
    w.addSpacer(3);
    rule(1, isToday ? "#2f5f4d" : "#242424");
    w.addSpacer(6);
    if (!day.list.length) {
      const t = w.addText("No more items today.");
      t.textColor = META;
      t.font = Font.systemFont(12);
      w.addSpacer(5);
      continue;
    }
    for (const it of day.list) {
      if (budget <= 0) break;
      drawRow(it);
      budget--;
    }
  }
}

function longDate(ymd, today) {
  const parts = String(ymd).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const md = date.toLocaleDateString([], { month: "short", day: "numeric" });
  if (ymd === today) return "Today · " + md;
  return date.toLocaleDateString([], { weekday: "short" }) + " · " + md;
}

if (config.runsInWidget) { Script.setWidget(w); } else { await w.presentMedium(); }
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
            <Text testID="script-body" style={s.code}>{token ? script : 'Minting your token…'}</Text>
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
