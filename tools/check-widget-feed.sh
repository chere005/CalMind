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
  // A LATER day, so the second-day assertions actually execute. Without one
  // the fixture had a single day, dropFirst().first was nil, and every check
  // about a non-today heading was skipped — it passed with the comma put
  // back, which is the bug it exists to catch.
  r('later', '2026-08-12', '14:00', 'f1'),
  // A day whose ONLY line is an event, so the calendar picker can empty it.
  // Every other day here carries a reminder, and a reminder survives every
  // selection — so without this day the "an emptied day disappears" rule
  // below could not fail, whatever the code did.
  { id: 'e2', type: 'event', updated: 1, payload: { text: 'solo', date: '2026-08-11', time: '11:00', repeat: null, calendarId: 'c1', ord: 'a' } },
  prefsPut([], 'calendar', { folderModes: { f1: 'dated', f2: 'none', f3: 'all' } }),
];
// The partner's store. Their calendar's colour is deliberately NOT '#60a5fa',
// which is the fallback an unresolved calendarId gets — with the same colour
// on both sides a shared event would look right while the colour map was
// missing it entirely.
const shared = [
  { id: 'p1', type: 'calendar', updated: 1, payload: { name: 'Personal', color: '#ff00aa', ord: 'a' } },
  // On TODAY on purpose: today already has reminders that outlive any calendar
  // selection, so adding this event changes no day's existence and the
  // emptied-day arithmetic further down still holds.
  { id: 'pe1', type: 'event', updated: 1, payload: { text: 'their thing', date: TODAY, time: '08:00', repeat: null, calendarId: 'p1', ord: 'a' } },
  // A partner REMINDER has to exist in the fixture or the assertion that they
  // stay off the widget cannot fail — an absence check against a store that
  // never held the thing is the "check that cannot fail" this repo keeps
  // catching. Proven: folding shared reminders into widgetDays makes it red.
  { id: 'theirrem', type: 'reminder', updated: 1,
    payload: { text: 'theirs', due: TODAY, time: null, done: false, repeat: null, folderId: 'pf1', sectionId: 'ps1', indent: 0, ord: 'a' } },
];
process.stdout.write(JSON.stringify(watchFeed(recs, TODAY, { recs: shared, partner: 'aki' })));
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

types = '\n'.join(grab(n) for n in ['WRow', 'WEvent', 'WFolder', 'WCalendar', 'WDay', 'WLine', 'Feed'])
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

def grab_top(name):
    """A free function at file scope — TickIntent's queue rule lives there so
    something can run it, and grab_func/grab_priv both assume a member."""
    i = src.index('\nfunc %s(' % name) + 1
    depth, k = 0, src.index('{', i)
    while True:
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return src[i:k+1]

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
# TICK_GRACE is a top-level `let`, not a func, so the grabbers cannot reach
# it — taken by line, the way check-watch-format.sh takes LATE_HOUR. Reading
# it rather than re-typing the 2 is the point: the check and the widget cannot
# disagree about how long the grace is.
_src_all = open('apps/app/targets/appwidget/HomeWidget.swift').read()
_grace = next(l for l in _src_all.splitlines() if l.startswith('let TICK_GRACE'))
widget_logic = (_grace + '\n' + grab_func('drawnDays') + '\n' + grab_func('packed') + '\n' + grab_top('toggledTicks') + '\n' + grab_func('drawnHeight') + '\n' + grab_priv('dayHeading') + '\n' + grab_priv('clock12'))
# The header is not part of packed() — it is subtracted in the view — so the
# only way to keep it charged is to read the view. Sean's card sliced its own
# "Calendar" title through the middle because the day list was handed the FULL
# card height; if that subtraction ever goes away again, this says so.
src_view = open('apps/app/targets/appwidget/HomeWidget.swift').read()
if 'geo.size.height - Self.HEADER_H' not in src_view:
    print("the day list is not being given the card height MINUS the header — the title will be sliced")
    raise SystemExit(1)
if 'GeometryReader' not in src_view:
    print("the card no longer measures itself; a per-family budget cannot be right on every device")
    raise SystemExit(1)

# Do the four cost constants still match what the view actually DRAWS?
#
# Without this the sweep below is self-referential: it packs with 20/20/12 and
# proves 20/20/12 never overflows, which stays green while the widget's own
# SEPARATOR_H drifts to 0 and the real card overflows again. Proven by setting
# it to 0 and watching this file stay green — so the numbers are re-derived
# here from the view's literals instead.
#
# The line heights are ascent+descent+leading of the exact system font/size,
# measured once (NSFont, and SF is the same family on iOS): 12pt regular = 15,
# 10pt bold = 12, 15pt bold = 18.
import re as _re
def _const(name):
    m = _re.search(r'static let %s: Double = ([0-9.]+)' % name, src_view)
    if not m:
        print("HomeWidget has no %s — the card's costs are no longer stated" % name); raise SystemExit(1)
    return float(m.group(1))

def _num(pat, what):
    m = _re.search(pat, src_view)
    if not m:
        print("could not read %s out of HomeWidget — the checker and the view have parted company" % what)
        raise SystemExit(1)
    return float(m.group(1))

# the divider drawn between two days
sep_rule = _num(r'Rectangle\(\)\.fill\(Color\.white\.opacity\(0\.16\)\)\.frame\(height: ([0-9.]+)\)', 'the day divider height')
sep_pad  = _num(r'opacity\(0\.16\)\)\.frame\(height: [0-9.]+\)\.padding\(\.vertical, ([0-9.]+)\)', 'the day divider padding')
# the heading's own rule and gaps
head_top = _num(r'\.frame\(height: 1\)\.padding\(\.top, ([0-9.]+)\)', 'the heading rule top padding')
head_bot = _num(r'\.frame\(height: 1\)\.padding\(\.top, [0-9.]+\)\.padding\(\.bottom, ([0-9.]+)\)', 'the heading rule bottom padding')
row_pad  = _num(r'\.padding\(\.bottom, ([0-9.]+)\)\n    \}\n\}', 'the row bottom padding')
head_pad = _num(r'\.padding\(\.bottom, ([0-9.]+)\)\n\n            if entry\.days\.isEmpty', 'the header bottom padding')

for name, want, how in [
    ('SEPARATOR_H', sep_rule + 2 * sep_pad,      '%gpt rule + 2 x %gpt' % (sep_rule, sep_pad)),
    ('HEADING_H',   12 + 1 + head_top + head_bot,'12pt line + 1pt rule + %g + %g' % (head_top, head_bot)),
    ('ROW_H',       15 + row_pad,                '15pt line + %gpt' % row_pad),
    ('HEADER_H',    18 + head_pad,               '18pt line + %gpt' % head_pad),
    ('ROW_TRAILING', row_pad,                    'the row bottom padding, %gpt' % row_pad),
]:
    got = _const(name)
    if abs(got - want) > 0.001:
        print("%s is %g but the view draws %g (%s) — the card will mis-fit by that much per item" % (name, got, want, how))
        raise SystemExit(1)

# The sweep uses the view's OWN numbers, so a drifted constant reaches it.
ROW_H, HEADING_H, SEPARATOR_H = _const('ROW_H'), _const('HEADING_H'), _const('SEPARATOR_H')
TRAILING = _const('ROW_TRAILING')

widget_logic = widget_logic.replace('Provider.drawnDays', 'drawnDays')
types += '''
struct Line { let id: String; let text: String; let time: String?; let isReminder: Bool; let overdue: Bool; let color: String?; var pending: Bool = false }
struct DaySection { let heading: String; let isToday: Bool; let lines: [Line] }
func hexColor(_ hex: String) -> String { hex }
let LABEL: String? = nil
''' + widget_logic + ('\nlet ROW: Double = %g\nlet HEAD: Double = %g\nlet SEP: Double = %g\nlet TRAIL: Double = %g\n' % (ROW_H, HEADING_H, SEPARATOR_H, TRAILING))

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
// Unconditional. An `if let` that finds nothing does not run, and a check
// that did not run reads exactly like one that passed — the same trap that
// let the middle-dot rule go unverified until a second day was added to this
// fixture. The contains() checks above would catch a missing row, but only
// while they exist; these no longer depend on that.
let ev = todayLines.first(where: { $0.id == "e1" })
check(ev != nil, "the event must be on today for the checks below to mean anything")
check(ev?.isReminder == false, "an event is not a reminder")
check(ev?.color != nil, "an event carries its calendar colour")
check(ev?.time == "10:00", "an event keeps its time")
check(ev?.calendarId == "c1", "an event names its calendar, so the picker can filter it")

let late = todayLines.first(where: { $0.id == "late" })
check(late != nil, "the overdue reminder must be on today for the checks below to mean anything")
check(late?.overdue == true, "the overdue line is flagged overdue")
check(late?.color == nil, "a reminder carries no colour")
check(late?.calendarId == nil, "a reminder names no calendar — its visibility is the tri-state's")
// The folder filter resolves through items, so every drawn reminder must be
// findable there — otherwise selecting a folder silently empties the widget.
let itemIds = Set(feed.items.map { $0.id })
for l in todayLines where l.isReminder {
    check(itemIds.contains(l.id), "reminder '\\(l.id)' is in items, so the folder picker can place it")
}

// The widget's own layer, both branches of every rule it applies.
let all = drawnDays(feed: feed, ticked: [], wanted: [], today: today)
check(!all.isEmpty, "with no folder selection the widget draws something — an empty picker must not mean an empty widget")
let firstHeading = all.first?.heading ?? ""
// Sean's reference: "TODAY · AUG 10", and a middle dot on every other day.
check(firstHeading.hasPrefix("TODAY · "), "today's heading keeps its DATE — got '\(firstHeading)'")
check(all.first?.isToday == true, "the first day knows it is today, so the view can colour it green")
check(!firstHeading.contains(","), "the separator is a middle dot, not a comma — got '\(firstHeading)'")
// Unconditional: an `if let` that finds nothing is a check that did not run,
// and reads exactly like one that passed.
check(all.count >= 2, "the fixture must produce a SECOND day, or the checks below never execute")
let later = all.dropFirst().first
check(later?.heading.contains(" · ") == true, "a later day uses the middle dot — got '\(later?.heading ?? "nil")'")
check(later?.heading.contains(",") == false, "…and no comma — got '\(later?.heading ?? "nil")'")
check(later?.isToday == false, "a later day is not today")
// 12-hour, the reference's style: the suffix always shown. NOT the watch's
// compact rule, which drops it below 8pm because a wrist has no room.
check(clock12("15:30") == "3:30pm", "3:30pm — got \(clock12("15:30"))")
check(clock12("14:00") == "2pm", "2pm — got \(clock12("14:00"))")
check(clock12("09:05") == "9:05am", "9:05am — got \(clock12("09:05"))")
check(clock12("00:00") == "12am", "midnight is 12am — got \(clock12("00:00"))")
check(clock12("12:00") == "12pm", "noon is 12pm — got \(clock12("12:00"))")

// A queued tick STAYS, drawn done, until the app drains it. This asserted the
// opposite until 2026-08-11 — the row vanished the instant it was tapped, and
// with it any way to take the tap back. Sean asked for a mis-tap to be
// undoable "in all apps", and the widget was the only surface with no route at
// all. The window was "until the app next comes forward" until 2026-08-12,
// when Sean asked for the widget to match the other two — it is two seconds
// here now as well, measured from the tick, and the cases below are that
// rule. A row with no recorded time is treated as just-ticked.
let afterTick = drawnDays(feed: feed, ticked: ["shown"], wanted: [], today: today)
let afterIds = afterTick.flatMap { $0.lines.map { $0.id } }
check(afterIds.contains("shown"), "a queued row stays, so the tap can be taken back — got \(afterIds)")
check(afterTick.flatMap { $0.lines }.first { $0.id == "shown" }?.pending == true,
      "…and is drawn as done while it waits")

// THE TWO-SECOND GRACE, the widget's copy of it. A queued row is drawn while
// the grace is running and gone once it has passed — still queued for the app
// either way, so nothing is lost by the row leaving. `now` is passed rather
// than read from the clock, which is the only reason this is checkable at all.
let graceDay = [WDay(date: today, lines: [
    WLine(id: "fresh", text: "just ticked", time: nil, isReminder: true, overdue: false, color: nil, calendarId: nil),
    WLine(id: "stale", text: "ticked a while ago", time: nil, isReminder: true, overdue: false, color: nil, calendarId: nil),
])]
let graceFeed = Feed(items: [], events: nil, folders: nil, calendars: nil, days: graceDay, clock24: nil)
let T0 = 1_000_000.0
let duringGrace = drawnDays(feed: graceFeed, ticked: ["fresh", "stale"], wanted: [], today: today,
                            tickedAt: ["fresh": T0, "stale": T0 - 5], now: T0 + 1)
let duringIds = duringGrace.flatMap { $0.lines.map { $0.id } }
check(duringIds.contains("fresh"), "a tick one second old is still drawn, so it can be taken back — got \(duringIds)")
check(!duringIds.contains("stale"), "one five seconds old is gone — got \(duringIds)")

let afterGrace = drawnDays(feed: graceFeed, ticked: ["fresh"], wanted: [], today: today,
                           tickedAt: ["fresh": T0], now: T0 + TICK_GRACE)
check(!afterGrace.flatMap { $0.lines.map { $0.id } }.contains("fresh"),
      "at exactly two seconds it has gone, not at 2.001")

// A tick with no recorded time is one queued by an older build. It must draw,
// not vanish on upgrade.
let legacy = drawnDays(feed: graceFeed, ticked: ["fresh"], wanted: [], today: today,
                       tickedAt: [:], now: T0 + 9_999)
check(legacy.flatMap { $0.lines.map { $0.id } }.contains("fresh"),
      "a tick from before this rule existed still draws")

// The picker chooses CALENDARS, so it filters EVENTS. A reminder is never
// filtered here — whether it appears was already decided by the tri-state in
// Manage reminders, and filtering it twice on an axis nobody chose is how the
// widget came to disagree with the calendar it is named after.
let picked = drawnDays(feed: feed, ticked: [], wanted: ["c1"], today: today)
let pickedIds = picked.flatMap { $0.lines.map { $0.id } }
check(pickedIds.contains("e1"), "the picked calendar's event stays — got \(pickedIds)")
check(pickedIds.contains("shown"), "a REMINDER survives a calendar selection — got \(pickedIds)")
check(pickedIds.contains("rider"), "…every reminder does, not just some — got \(pickedIds)")
check(!pickedIds.contains("pe1"), "a SHARED event on an unpicked calendar goes, like any other — got \(pickedIds)")

// Sean, 2026-08-10: "i don't see shared events in my widget". The picker had
// been offering his partner's calendars for a while, but the days were built
// from his records alone — so their events were never in the feed and picking
// their calendar showed nothing. Both halves are checked: that the event
// arrives at all, and that picking THEIR calendar is what selects it.
let theirs = todayLines.first(where: { $0.id == "pe1" })
check(theirs != nil, "a partner's shared event reaches the widget — got \(ids)")
check(theirs?.calendarId == "p1", "…naming THEIR calendar, so the picker can filter it")
check(theirs?.color == "#ff00aa", "…and wearing THEIR calendar's colour, not the fallback — got \(String(describing: theirs?.color))")
check(theirs?.isReminder == false, "a shared event is an event")

let pickedShared = drawnDays(feed: feed, ticked: [], wanted: ["p1"], today: today)
let sharedIds = pickedShared.flatMap { $0.lines.map { $0.id } }
check(sharedIds.contains("pe1"), "picking the SHARED calendar shows their event — got \(sharedIds)")
check(!sharedIds.contains("e1"), "…and drops mine, which was not picked — got \(sharedIds)")

// Their REMINDERS deliberately do not travel: a widget tick queues an id the
// app applies to MY store, so a partner's row would draw a box that does
// nothing. This is the assertion that will fail if that ever changes silently.
check(!everywhere.contains("theirrem"), "a partner's reminders stay off the widget — got \(everywhere)")

let other = drawnDays(feed: feed, ticked: [], wanted: ["nosuchcalendar"], today: today)
let otherIds = other.flatMap { $0.lines.map { $0.id } }
check(!otherIds.contains("e1"), "an event on an UNPICKED calendar goes — got \(otherIds)")
check(otherIds.contains("shown"), "…and the reminders still stay — got \(otherIds)")

// A day the filter empties must DISAPPEAR, not draw a bare heading with no
// rows under it. 'e2' is the only line on its day, and it is an event, so a
// calendar selection can strip that day to nothing — which is what makes the
// two checks after the precondition able to fail at all.
let soloDay = all.first(where: { $0.lines.contains(where: { $0.id == "e2" }) })
check(soloDay != nil, "the fixture must have a day whose only line is an event, or the rule below is untestable")
check(soloDay?.lines.count == 1, "…and only that one line — got \(soloDay?.lines.map { $0.id } ?? [])")
check(other.count == all.count - 1, "the emptied day is dropped, not drawn headless — \(all.count) days became \(other.count)")
check(other.allSatisfy { !$0.lines.isEmpty }, "no day is ever drawn with an empty line list")

// The picker's own list: mine first, then the partner's, theirs naming who
// shared it so the configuration sheet can say so.
let cals = feed.calendars ?? []
check(cals.count == 2, "the picker is offered my calendar AND the partner's — got \(cals.map { $0.name })")
check(cals.first?.sharedFrom == nil, "my own calendar names no sharer")
check(cals.last?.sharedFrom == "aki", "a partner's names them — got \(String(describing: cals.last?.sharedFrom))")

// How much of the card gets filled. Sean, 2026-08-10: "only show as many
// upcoming days as will fully fit on the size of the widget" — a later day is
// all-or-nothing, where it used to be truncated to the rows that were left.
// The first day is the deliberate exception; see packed() for why.
let big  = [DaySection(heading: "TODAY", isToday: true,  lines: (1...3).map { Line(id: "t\($0)", text: "t", time: nil, isReminder: true, overdue: false, color: nil) }),
            DaySection(heading: "TUE",   isToday: false, lines: (1...6).map { Line(id: "u\($0)", text: "u", time: nil, isReminder: true, overdue: false, color: nil) }),
            DaySection(heading: "WED",   isToday: false, lines: [Line(id: "w1", text: "w", time: nil, isReminder: true, overdue: false, color: nil)])]

// A QUEUED TICK KEEPS ITS ROW. Sean asked for the ability to uncheck a
// mis-tap in every app, and the widget was the one surface with no way back:
// drawnDays dropped the row the moment its id was queued, so there was
// nothing left to tap. It stays now, flagged pending, and the intent toggles
// the queue rather than only appending — see HomeWidget's TickIntent.
let tickedDay = [WDay(date: today, lines: [
    WLine(id: "keepme", text: "queued", time: nil, isReminder: true, overdue: false, color: nil, calendarId: nil),
    WLine(id: "other",  text: "not queued", time: nil, isReminder: true, overdue: false, color: nil, calendarId: nil),
])]
let withTick = drawnDays(feed: Feed(items: [], events: nil, folders: nil, calendars: nil, days: tickedDay, clock24: nil),
                         ticked: ["keepme"], wanted: [], today: today)
let keptIds = withTick.flatMap { $0.lines.map { $0.id } }
check(keptIds.contains("keepme"), "a queued tick keeps its row, or there is nothing left to untick — got \(keptIds)")
check(withTick.flatMap { $0.lines }.first { $0.id == "keepme" }?.pending == true,
      "…and it is marked pending, so it draws as done")
check(withTick.flatMap { $0.lines }.first { $0.id == "other" }?.pending == false,
      "…while an untouched row is not")

// The undo itself: a second tap takes the id back OUT of the queue, so the
// app never hears about it. Appending only — which is what this did until
// 2026-08-11 — makes the first tap final, and a widget has no timer with which
// to offer anything else.
check(toggledTicks([], "a") == ["a"], "a first tap queues it")
check(toggledTicks(["a"], "a") == [], "a second tap takes it back")
check(toggledTicks(["a", "b"], "a") == ["b"], "…and leaves the other queued ticks alone")
check(toggledTicks(["b"], "a") == ["b", "a"], "queuing a second row keeps the first")

// The card's real costs, in points, as HomeWidget.swift measures them:
// a row is 20 (12pt text = 15pt line + 5 padding), a heading 20 (10pt bold =
// 12pt line + 1 rule + 2 + 5), the divider between days 12 (2 + 5 + 5).

// 150pt of room: TODAY costs 20 + 3x20 = 80. TUE would need 12 + 20 + 6x20 =
// 152 more and must be dropped WHOLE rather than showing 1 of its 6.
let fit = packed(days: big, available: 150, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: TRAIL)
check(fit.count == 1, "a later day that cannot fit ENTIRELY is not drawn at all — got \(fit.map { $0.heading })")
check(fit.first?.lines.count == 3, "…and the day that did fit keeps every row — got \(fit.first?.lines.count ?? -1)")
// Not skipped-and-continued: WED would fit in what TUE left, and drawing it
// would tell Sean nothing is happening on Tuesday.
check(!fit.contains { $0.heading == "WED" }, "it stops at the first day that does not fit, rather than hopping over it")

// Given room, the same days all draw — otherwise the check above would pass
// on a packer that simply drew one day forever.
let roomy = packed(days: big, available: 400, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: TRAIL)
check(roomy.count == 3, "with room, every day is drawn — got \(roomy.count)")
check(roomy.map { $0.lines.count } == [3, 6, 1], "…each in full — got \(roomy.map { $0.lines.count })")

// The exception, stated as a test: a first day too big for the card still
// draws what fits. Whole-days-only here would mean a busy today shows nothing.
let flood = [DaySection(heading: "TODAY", isToday: true, lines: (1...30).map { Line(id: "f\($0)", text: "f", time: nil, isReminder: true, overdue: false, color: nil) })]
let partial = packed(days: flood, available: 150, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: TRAIL)
check(partial.count == 1, "an overflowing FIRST day is still drawn")
check(partial.first!.lines.count > 0 && partial.first!.lines.count < 30,
      "…filling the card, not emptying it and not overflowing it — got \(partial.first!.lines.count)")

// THE INVARIANT SEAN ACTUALLY REPORTED, twice: it must never draw more than
// the space it was handed. Swept across every height a real card can be —
// and every day count — because the overflow only showed up once enough day
// groups were on screen for their uncharged dividers to add up.
var worst = 0.0
for h in stride(from: 40.0, through: 420.0, by: 2.0) {
    for n in 1...8 {
        let days = (0..<n).map { d in
            DaySection(heading: "D\(d)", isToday: d == 0,
                       lines: (0..<((d & 3) + 1)).map { Line(id: "d\(d)-\($0)", text: "x", time: nil, isReminder: true, overdue: false, color: nil) })
        }
        let out = packed(days: days, available: h, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: TRAIL)
        // Two different questions, two different heights: how far the INK
        // reaches (trailing margin forgiven) is what must not overflow, but
        // what the packer has SPENT includes every row's margin.
        let drawn = drawnHeight(out, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: TRAIL)
        let full  = drawnHeight(out, rowH: ROW, headingH: HEAD, sepH: SEP, trailing: 0)
        worst = max(worst, drawn - h)
        if drawn > h {
            check(false, "overflows a \(h)pt card by \(drawn - h)pt with \(n) days — the bug Sean saw")
            break
        }
        // …and it must not be timid either: whatever was dropped has to be
        // something that genuinely did not fit. Otherwise "never overflow" is
        // satisfied by a packer that draws nothing at all. Free space left
        // over is FINE and expected — a later day is all-or-nothing, so a big
        // day can be refused while several rows' worth of room remains.
        if out.count < days.count {
            let next = days[out.count]
            let sep = out.isEmpty ? 0.0 : SEP
            // A first day takes what fits, so it is only absent if even one
            // row could not; a later day needs room for every row it has.
            let need = sep + HEAD + (out.isEmpty ? ROW : Double(next.lines.count) * ROW) - TRAIL
            if full + need <= h {
                check(false, "dropped \(next.heading) though \(h - full)pt was free and it needs \(need)pt")
            }
        }
    }
}
check(worst <= 0, "worst overflow across the sweep was \(worst)pt")

print(bad == 0
      ? "widget feed: the phone's JSON and the widget's decoder agree"
      : "widget feed: \\(bad) MISMATCHES")
exit(bad == 0 ? 0 : 1)
''' % (types, sys.argv[2]))
PY

swift "$TMP/decode.swift"
