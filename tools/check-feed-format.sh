#!/bin/sh
# Does the WIDGET FEED say a time the way everything else does?
#
# There are four copies of this rule in the repo, not two. The watch app's
# WatchFormat and the complication's twin are checked against each other by
# tools/check-watch-format.sh; core's timeLabel is the TypeScript one; and the
# feed has a FOURTH, in PHP, because handle_feed formats its own rows rather
# than reading core. That one was found on 2026-08-11 already diverged — it
# always spoke 12-hour and ignored the account's clock24 entirely, while the
# app, the watch and the complication all honoured it.
#
# TESTING.md's rule, applied to the copy nobody had noticed: duplication that
# nothing checks is duplication that drifts, and this drift reads as a time
# showing one way on the home screen and another in the app, which nobody
# reports as a bug.
#
# It extracts the REAL closure out of server/lib/app.php — nothing is re-typed,
# so if the implementation changes this runs the change — and puts it through
# the same cases check-watch-format.sh gives WatchFormat.clockFull, plus the
# 24-hour rule from core's timeLabel.
#
#   sh tools/check-feed-format.sh
set -e
cd "$(dirname "$0")/.."
OUT=$(mktemp -t feedfmt).php
python3 - "$OUT" <<'PY'
import sys

src = open('server/lib/app.php').read()

# The closure, verbatim, from `$spoken = function` to the `};` that closes it.
i = src.index('$spoken = function')
depth, k = 0, src.index('{', i)
while True:
    if src[k] == '{':
        depth += 1
    elif src[k] == '}':
        depth -= 1
        if depth == 0:
            break
    k += 1
spoken = src[i:k + 1] + ';'

open(sys.argv[1], 'w').write('''<?php
// $clock24 is the closure's only capture; the harness supplies it so both
// branches can be driven.
$clock24 = false;
%s

$bad = 0;
$check = function (array $cases, bool $c24) use (&$bad) {
    // Rebuild the closure with the flag it captures set the way we want. The
    // closure captures by value at creation, so it has to be remade, not
    // re-called with a different variable.
    global $spoken;
    $GLOBALS['clock24'] = $c24;
    $fn = $GLOBALS['rebuild']($c24);
    foreach ($cases as [$in, $want]) {
        $got = $fn($in);
        if ($got !== $want) {
            printf("feed %%s: spoken(%%s) = %%s, want %%s\\n",
                $c24 ? 'clock24' : '12-hour', var_export($in, true), var_export($got, true), var_export($want, true));
            $bad++;
        }
    }
};

// The same cases check-watch-format.sh gives WatchFormat.clockFull. Noon and
// midnight are the two that catch a 12-hour clock out and are the reason this
// list is not three entries long.
$twelve = [
    ['14:00', '2pm'], ['15:30', '3:30pm'], ['09:00', '9am'], ['09:05', '9:05am'],
    ['00:00', '12am'], ['12:00', '12pm'], ['20:00', '8pm'], ['23:59', '11:59pm'],
];
// core's timeLabel: 24-hour keeps the leading zero AND the minutes always,
// because dropping ':00' is a 12-hour habit and '9' reads as a number.
$twentyfour = [
    ['14:00', '14:00'], ['15:30', '15:30'], ['09:00', '09:00'], ['09:05', '09:05'],
    ['00:00', '00:00'], ['12:00', '12:00'], ['20:00', '20:00'], ['23:59', '23:59'],
];

$check($twelve, false);
$check($twentyfour, true);

// An all-day row has no time at all, and must never become a midnight.
foreach ([false, true] as $c24) {
    $fn = $GLOBALS['rebuild']($c24);
    if ($fn(null) !== null) { print("an all-day row must keep a null time\\n"); $bad++; }
}

// The two branches must DISAGREE, or one has quietly become the other and
// every case above still passes.
if ($GLOBALS['rebuild'](false)('15:30') === $GLOBALS['rebuild'](true)('15:30')) {
    print("the 12-hour and 24-hour branches agree at 15:30 — one has swallowed the other\\n");
    $bad++;
}

if ($bad > 0) { printf("\\n%%d mismatch(es)\\n", $bad); exit(1); }
print("feed clock agrees with the watch, the complication and core.\\n");
''' % spoken)
PY

# The closure captures $clock24 by value, so it has to be built once per flag.
python3 - "$OUT" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("$clock24 = false;\n$spoken = function", "$rebuild = function (bool $clock24) { return function", 1)
s = s.replace("};\n\n$bad = 0;", "}; };\n$GLOBALS['rebuild'] = $rebuild;\n\n$bad = 0;", 1)
open(p, 'w').write(s)
PY

php "$OUT"
