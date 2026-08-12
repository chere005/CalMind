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

// FROM spec/clock.json, not written out here. These cases lived in this file
// AND in tools/check-watch-format.sh, byte for byte — two copies that had not
// yet disagreed, which is not the same as two that cannot. Noon and midnight
// are in the file because they are what catch a 12-hour clock out.
//
// check-watch-format.sh still carries its own copy: it builds a Swift program
// from a python heredoc and threading JSON through that was three failed
// attempts at restructuring a checker that works, for a duplicate that has
// never actually drifted. So this compares the two instead, below, which
// catches the drift without touching it.
$spec = json_decode(file_get_contents('spec/clock.json'), true);
$twelve = $spec['full12'];
$twentyfour = $spec['clock24'];

// The other copy, read out of the Swift harness and held to the same file.
$swift = file_get_contents('tools/check-watch-format.sh');
// After the '=', not after the first '[': `let fullCases: [(String?, String)]`
// puts a bracket pair in the TYPE, and matching that captured an empty list —
// which the comparison then reported as a mismatch rather than passing on
// nothing, because the empty case is checked below.
if (preg_match('/let fullCases[^=]*=\s*\[(.*?)\]/s', $swift, $m)) {
    preg_match_all('/\("([^"]*)", "([^"]*)"\)/', $m[1], $pairs, PREG_SET_ORDER);
    $theirs = array_map(fn($p) => [$p[1], $p[2]], $pairs);
    if (count($theirs) === 0) {
        print("no cases extracted from check-watch-format.sh — the comparison is not running\n");
        $bad++;
    } elseif ($theirs !== $twelve) {
        print("check-watch-format.sh's fullCases no longer match spec/clock.json:\n");
        printf("  spec:  %%s\n  swift: %%s\n", json_encode($twelve), json_encode($theirs));
        $bad++;
    }
} else {
    print("could not find fullCases in check-watch-format.sh — this comparison is not running\n");
    $bad++;
}


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
