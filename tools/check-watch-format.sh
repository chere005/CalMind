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
if WatchFormat.when(date: today, time: nil, today: today) != "Today" { print("an all-day event today has only the word"); bad += 1 }
if WatchFormat.when(date: other, time: "17:00", today: today) != "\(otherLabel) 5" { print("a later day still names itself"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: today, time: "15:00")) != "3" { print("complication copy: today should be time only"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: today, time: nil)) != "Today" { print("complication copy: all-day today keeps the word"); bad += 1 }
if when(Ev(id: "x", text: "Chase", date: other, time: "17:00")) != "\(otherLabel) 5" { print("complication copy: a later day names itself"); bad += 1 }
print(bad == 0 ? "watch format: both copies agree with the core spec" : "watch format: \\(bad) MISMATCHES")
exit(bad == 0 ? 0 : 1)
''' % (fmt.replace('import Foundation', ''), twin))
PY
swift "$OUT"
