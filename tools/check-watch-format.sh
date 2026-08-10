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
    grab(comp, 'todayStr'), grab(comp, 'clock12'), grab(comp, 'dayLabel12'),
])
open(sys.argv[1], 'w').write('''
import Foundation
%s
%s
let cases: [(String?, String)] = [
    ("15:00", "3pm"), ("09:00", "9am"), ("15:30", "3:30pm"), ("09:05", "9:05am"),
    ("12:00", "12pm"), ("00:00", "12am"), ("00:30", "12:30am"),
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
if WatchFormat.line(date: other, time: "17:00", text: "Chase", today: today) != "\(otherLabel) 5pm Chase" { print("line should be '\(otherLabel) 5pm Chase'"); bad += 1 }
if WatchFormat.line(date: today, time: "15:00", text: "Chase", today: today) != "Today 3pm Chase" { print("line should be 'Today 3pm Chase'"); bad += 1 }
if WatchFormat.line(date: today, time: nil, text: "Chase", today: today) != "Today Chase" { print("all-day line should be 'Today Chase'"); bad += 1 }
print(bad == 0 ? "watch format: both copies agree with the core spec" : "watch format: \\(bad) MISMATCHES")
exit(bad == 0 ? 0 : 1)
''' % (fmt.replace('import Foundation', ''), twin))
PY
swift "$OUT"
