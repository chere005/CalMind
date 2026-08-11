#!/bin/sh
# Do the watch app and the complication still say a time the same way?
#
# The two Swift copies exist because a widget extension is its own target and
# cannot see the app's sources. Duplication that nothing checks is duplication
# that drifts, and the drift would show as a time reading one way on the face
# and another in the list — the kind of thing nobody reports as a bug.
#
# This extracts BOTH real implementations and runs them against the same cases
# pinned in packages/core/test/watch.test.ts. Nothing is re-typed here: if a
# copy changes, this runs the change.
#
#   sh tools/check-watch-format.sh
set -e
cd "$(dirname "$0")/.."
OUT=$(mktemp -t watchfmt).swift
python3 - "$OUT" <<'PY'
import sys, re
fmt = open('apps/app/targets/watch/WatchFormat.swift').read()
comp = open('apps/app/targets/watchwidget/ComplicationWidget.swift').read()

def grab(src, name):
    i = src.index('func %s(' % name)
    depth, k = 0, src.index('{', i)
    while True:
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return src[i:k+1]

twin = '\n'.join([
    'private let ymdFmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f }()',
    'struct Ev { let id: String; let text: String; let date: String; let time: String? }',
    grab(comp, 'todayStr'), grab(comp, 'clock12'), grab(comp, 'dayLabel12'), grab(comp, 'when'),
    # LATE_HOUR is a top-level `let`, not a func, so grab() cannot reach it.
    next(l for l in comp.splitlines() if l.startswith('let LATE_HOUR')),
    next(l for l in comp.splitlines() if l.startswith('var CLOCK24')),
])
open(sys.argv[1], 'w').write('''
import Foundation
%s
%s
// Sean's compact clock: no am/pm below 8pm, "pm" from 8pm on. The boundary
// cases are the point — 19:xx must be bare and 20:00 must not.
let cases: [(String?, String)] = [
    ("15:00", "3"), ("09:00", "9"), ("15:30", "3:30"), ("09:05", "9:05"),
    ("12:00", "12"), ("00:00", "12"), ("00:30", "12:30"),
    ("19:00", "7"), ("19:59", "7:59"), ("20:00", "8pm"), ("20:30", "8:30pm"),
    ("21:00", "9pm"), ("23:59", "11:59pm"),
]
var bad = 0
for (input, want) in cases {
    let a = WatchFormat.clock(input) ?? "nil"
    let b = clock12(input) ?? "nil"
    if a != want { print("watch app: clock(\\(input ?? "nil")) = \\(a), want \\(want)"); bad += 1 }
    if b != want { print("complication: clock12(\\(input ?? "nil")) = \\(b), want \\(want)"); bad += 1 }
}
if WatchFormat.clock(nil) != nil || clock12(nil) != nil { print("an all-day event must show NO time"); bad += 1 }

// The APP's clock, which is a DIFFERENT rule from the complication's and has
// to stay that way. Sean, 2026-08-10: "only use the super short time notation
// on the complication, the rest should be a full 2pm, 3:30pm etc". A full
// page has room for the suffix; a face complication does not, and "11" alone
// on a wrist is genuinely ambiguous.
let fullCases: [(String?, String)] = [
    ("14:00", "2pm"), ("15:30", "3:30pm"), ("09:00", "9am"), ("09:05", "9:05am"),
    ("00:00", "12am"), ("12:00", "12pm"), ("20:00", "8pm"), ("23:59", "11:59pm"),
]
for (input, want) in fullCases {
    let a = WatchFormat.clockFull(input) ?? "nil"
    if a != want { print("watch app: clockFull(\\(input ?? "nil")) = \\(a), want \\(want)"); bad += 1 }
}
if WatchFormat.clockFull(nil) != nil { print("an all-day event still shows NO time"); bad += 1 }
// The point of having two: below 8pm they must DISAGREE. Without this, one
// function quietly becoming the other would pass every case above.
if WatchFormat.clockFull("15:30") == WatchFormat.clock("15:30") {
    print("clockFull and clock are the same below 8pm — the compact rule has leaked into the app"); bad += 1
}
// …and above it they agree, because there was never a suffix to add.
if WatchFormat.clockFull("20:00") != WatchFormat.clock("20:00") {
    print("after 8pm the two clocks should agree"); bad += 1
}
// whenFull carries it through: this is what a reminder chip on the app's
// pages actually renders.
if WatchFormat.whenFull(date: today, time: "15:30", today: today) != "3:30pm" {
    print("whenFull on today is the bare full time, got \\(WatchFormat.whenFull(date: today, time: "15:30", today: today))"); bad += 1
}
// Derived, never hardcoded. A literal date here passed until midnight and
// then failed for a reason that had nothing to do with the code — which is
// exactly the kind of test that wastes an hour. The complication computes
// its own today internally, so the comparison has to use the real one.
let ymdNow: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f }()
let today = ymdNow.string(from: Date())
let other = ymdNow.string(from: Date().addingTimeInterval(6 * 86400))
let otherLabel: String = {
    let c = Calendar.current.dateComponents([.month, .day], from: Date().addingTimeInterval(6 * 86400))
    return "\(c.month!)/\(c.day!)"
}()
if WatchFormat.day(today, today: today) != "Today" { print("today should read Today"); bad += 1 }
if WatchFormat.day(other, today: today) != otherLabel { print("other days read m/d"); bad += 1 }
if dayLabel12(other) != otherLabel { print("complication: other days read m/d"); bad += 1 }
if dayLabel12(today) != "Today" { print("complication: today should read Today"); bad += 1 }
if WatchFormat.line(date: other, time: "17:00", text: "Chase", today: today) != "\(otherLabel) 5 Chase" { print("line should be '\(otherLabel) 5 Chase'"); bad += 1 }
if WatchFormat.line(date: today, time: "15:00", text: "Chase", today: today) != "Today 3 Chase" { print("line should be 'Today 3 Chase'"); bad += 1 }
if WatchFormat.line(date: today, time: "20:00", text: "Dinner", today: today) != "Today 8pm Dinner" { print("late line keeps its pm"); bad += 1 }
if WatchFormat.line(date: today, time: nil, text: "Chase", today: today) != "Today Chase" { print("all-day line should be 'Today Chase'"); bad += 1 }

// The COMPLICATION drops "Today" and shows the time alone — Sean's second
// pass. Checked on both copies, since the widget target keeps its own.
if WatchFormat.when(date: today, time: "15:00", today: today) != "3" { print("complication when(today 15:00) should be '3'"); bad += 1 }
if WatchFormat.when(date: today, time: "20:00", today: today) != "8pm" { print("complication when(today 20:00) should be '8pm'"); bad += 1 }
// Sean, 2026-08-10: an all-day event today reads "now", not "Today", and the
// face draws it in the today tint. Only the words are checkable here.
if WatchFormat.when(date: today, time: nil, today: today) != "now" { print("an all-day event today reads 'now'"); bad += 1 }
if WatchFormat.when(date: other, time: "17:00", today: today) != "\(otherLabel) 5" { print("a later day still names itself"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: today, time: "15:00")) != "3" { print("complication copy: today should be time only"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: today, time: nil)) != "now" { print("complication copy: all-day today reads 'now'"); bad += 1 }
// "now" belongs to TODAY only — a later all-day event still names its date.
// Without this, `when` returning "now" unconditionally would pass everything
// above, and every future event on the face would claim to be happening.
if when(Ev(id: "x", text: "Chase", date: other, time: nil)) != otherLabel { print("complication copy: a later all-day event keeps its date, got \\(when(Ev(id: "x", text: "Chase", date: other, time: nil)))"); bad += 1 }
if WatchFormat.when(date: other, time: nil, today: today) != otherLabel { print("watch app: a later all-day event keeps its date"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: other, time: "17:00")) != "\(otherLabel) 5" { print("complication copy: a later day names itself"); bad += 1 }
// Sean's Settings choice, which BOTH copies must honour: the wrist and the
// complication are separate processes and each carries its own flag, so this
// is exactly the kind of duplication that drifts.
WatchFormat.clock24 = true
CLOCK24 = true
for (input, want) in [("15:30", "15:30"), ("09:05", "09:05"), ("00:00", "00:00"), ("20:00", "20:00")] {
    let a = WatchFormat.clock(input) ?? "nil"
    let b = clock12(input) ?? "nil"
    if a != want { print("watch app 24h: clock(\\(input)) = \\(a), want \\(want)"); bad += 1 }
    if b != want { print("complication 24h: clock12(\\(input)) = \\(b), want \\(want)"); bad += 1 }
}
WatchFormat.clock24 = false
CLOCK24 = false

print(bad == 0 ? "watch format: both copies agree with the core spec" : "watch format: \\(bad) MISMATCHES")
exit(bad == 0 ? 0 : 1)
''' % (fmt.replace('import Foundation', ''), twin))
PY
swift "$OUT"
