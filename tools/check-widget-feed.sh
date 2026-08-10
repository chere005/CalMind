#!/bin/sh
# Does the PHONE widget decode what the phone actually writes?
#
# The same seam as tools/check-watch-feed.sh, one device over, and it has
# already produced two bugs on its own: nothing wrote the cache at all, and
# the day list ignored the calendar's tri-state. Both were invisible to every
# test on either side, because each side was correct about its own idea of the
# shape and nothing ran them against each other.
#
# core's watchFeed() writes the JSON that WatchBridge caches in the App Group;
# HomeWidget.swift's Codable structs read it. This generates the first with
# the real function — from a store whose folders carry real "Manage reminders"
# modes — and decodes it with the real structs lifted out of the widget.
#
#   sh tools/check-widget-feed.sh
set -e
cd "$(dirname "$0")/.."

TMP=$(mktemp -d -t widgetfeed)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/feed.mjs" <<'JS'
import { watchFeed } from '__CORE__';
import { prefsPut } from '__MANAGE__';
const f = (id, name, ord) => ({ id, type: 'folder', updated: 1, payload: { name, color: '#123456', ord, app: 'reminders' } });
const s = (id, folderId) => ({ id, type: 'section', updated: 1, payload: { name: id, folderId, ord: 'a' } });
const r = (id, due, time, folderId) => ({ id, type: 'reminder', updated: 1,
  payload: { text: id, due, time, done: false, repeat: null, folderId, sectionId: 's1', indent: 0, ord: id } });
const TODAY = '2026-08-09';
const recs = [
  f('f1', 'Shown', 'a'), s('s1', 'f1'),
  f('f2', 'Hidden', 'b'), s('s2', 'f2'),
  f('f3', 'Rides', 'c'), s('s3', 'f3'),
  { id: 'c1', type: 'calendar', updated: 1, payload: { name: 'Personal', color: '#60a5fa', ord: 'a' } },
  { id: 'e1', type: 'event', updated: 1, payload: { text: 'dentist', date: TODAY, time: '10:00', repeat: null, calendarId: 'c1', ord: 'a' } },
  r('shown', TODAY, '09:00', 'f1'),
  r('hidden', TODAY, null, 'f2'),      // its folder is 'none' — must NOT travel
  r('rider', null, null, 'f3'),        // undated, folder is 'all' — rides today
  r('late', '2026-08-01', null, 'f1'), // overdue — the calendar puts it on today
  prefsPut([], 'calendar', { folderModes: { f1: 'dated', f2: 'none', f3: 'all' } }),
];
process.stdout.write(JSON.stringify(watchFeed(recs, TODAY)));
JS
sed -i '' -e "s#__CORE__#$PWD/packages/core/src/watch.ts#" -e "s#__MANAGE__#$PWD/packages/core/src/manage.ts#" "$TMP/feed.mjs"
npx tsx "$TMP/feed.mjs" > "$TMP/feed.json"
[ -s "$TMP/feed.json" ] || { echo "the feed fixture came out empty" >&2; exit 1; }

python3 - "$TMP/decode.swift" "$TMP/feed.json" <<'PY'
import sys
src = open('apps/app/targets/appwidget/HomeWidget.swift').read()

def grab(name):
    i = src.index('struct %s' % name)
    depth, k = 0, src.index('{', i)
    while True:
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return src[i:k+1]

types = '\n'.join(grab(n) for n in ['WRow', 'WEvent', 'WFolder', 'WDay', 'WLine', 'Feed'])
# Identifiable needs SwiftUI/Foundation's protocol; the structs only use it
# for ForEach, so it is dropped for this compile.
types = types.replace(', Identifiable, Hashable', '').replace(', Identifiable', '')

# The widget's OWN logic: what it draws once core's days are in hand — the
# folder filter, the optimistic tick removal, the day headings, and the cap.
# It is static and pure for exactly this reason; as a method reaching into
# UserDefaults and a WidgetKit configuration it could only run inside a
# rendered widget on a phone.
def grab_func(name):
    i = src.index('static func %s(' % name)
    depth, k = 0, src.index('{', i)
    while True:
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return src[i:k+1].replace('static func', 'func')

def grab_priv(name):
    i = src.index('private func %s(' % name)
    depth, k = 0, src.index('{', i)
    while True:
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return src[i:k+1].replace('private func', 'func')

# Colour is SwiftUI; the check is about grouping and filtering, so Line's
# colour becomes a plain string and hexColor is stubbed to pass it through.
widget_logic = (grab_func('drawnDays') + '\n' + grab_priv('dayHeading'))
widget_logic = widget_logic.replace('Provider.drawnDays', 'drawnDays')
types += '''
struct Line { let id: String; let text: String; let time: String?; let isReminder: Bool; let overdue: Bool; let color: String? }
func hexColor(_ hex: String) -> String { hex }
let LABEL: String? = nil
''' + widget_logic

open(sys.argv[1], 'w').write('''
import Foundation
%s
let data = try Data(contentsOf: URL(fileURLWithPath: "%s"))
let feed = try JSONDecoder().decode(Feed.self, from: data)

var bad = 0
func check(_ ok: Bool, _ what: String) { if !ok { print("  x " + what); bad += 1 } }

let days = feed.days ?? []
check(!days.isEmpty, "the widget must be given days at all")

let today = "2026-08-09"
let todayLines = days.first(where: { $0.date == today })?.lines ?? []
let ids = todayLines.map { $0.id }

// Sean's rule, end to end: the widget shows what the CALENDAR shows.
check(ids.contains("shown"), "a 'dated' folder's dated reminder shows — got \\(ids)")
check(ids.contains("rider"), "an 'all' folder's undated reminder rides on today — got \\(ids)")
check(ids.contains("late"),  "an overdue reminder is gathered onto today — got \\(ids)")
check(ids.contains("e1"),    "the day's event shows beside its reminders — got \\(ids)")
check(!ids.contains("hidden"), "a folder set to 'none' must NOT reach the widget — got \\(ids)")

// …and nowhere else in the window either.
let everywhere = days.flatMap { $0.lines.map { $0.id } }
check(!everywhere.contains("hidden"), "'none' must not appear on any day — got \\(everywhere)")

// The shape the view actually reads off each line.
if let ev = todayLines.first(where: { $0.id == "e1" }) {
    check(!ev.isReminder, "an event is not a reminder")
    check(ev.color != nil, "an event carries its calendar colour")
    check(ev.time == "10:00", "an event keeps its time")
}
if let late = todayLines.first(where: { $0.id == "late" }) {
    check(late.overdue, "the overdue line is flagged overdue")
    check(late.color == nil, "a reminder carries no colour")
}
// The folder filter resolves through items, so every drawn reminder must be
// findable there — otherwise selecting a folder silently empties the widget.
let itemIds = Set(feed.items.map { $0.id })
for l in todayLines where l.isReminder {
    check(itemIds.contains(l.id), "reminder '\\(l.id)' is in items, so the folder picker can place it")
}

// The widget's own layer, both branches of every rule it applies.
let all = drawnDays(feed: feed, ticked: [], wanted: [], today: today)
check(!all.isEmpty, "with no folder selection the widget draws something — an empty picker must not mean an empty widget")
let firstHeading = all.first?.0 ?? ""
check(firstHeading.uppercased().contains("TODAY"), "the first day heading names today — got '\(firstHeading)'")

// A queued tick disappears at once, before the app has woken to apply it.
let afterTick = drawnDays(feed: feed, ticked: ["shown"], wanted: [], today: today)
let afterIds = afterTick.flatMap { $0.1.map { $0.id } }
check(!afterIds.contains("shown"), "a widget-ticked row goes immediately — got \(afterIds)")

// A folder selection filters REMINDERS and leaves events alone: an event has
// no folder, and dropping every event when a folder is picked would be a
// silent second rule nobody asked for.
let picked = drawnDays(feed: feed, ticked: [], wanted: ["f1"], today: today)
let pickedIds = picked.flatMap { $0.1.map { $0.id } }
check(pickedIds.contains("shown"), "the picked folder's reminder stays — got \(pickedIds)")
check(pickedIds.contains("e1"), "an event survives a folder selection — got \(pickedIds)")
check(!pickedIds.contains("rider"), "another folder's reminder goes — got \(pickedIds)")

print(bad == 0
      ? "widget feed: the phone's JSON and the widget's decoder agree"
      : "widget feed: \\(bad) MISMATCHES")
exit(bad == 0 ? 0 : 1)
''' % (types, sys.argv[2]))
PY

swift "$TMP/decode.swift"
