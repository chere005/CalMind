#!/bin/sh
# Does every App Group key that something READS have something that WRITES it,
# on the same device?
#
# The phone's home-screen widget read "watchlist.json" out of the shared App
# Group. Nothing on the phone ever wrote it. The only writer of that key was
# WatchStore.swift — which runs on the WATCH, writing the watch's own
# container on a different device entirely. So the complication had data and
# the phone widget sat on its waiting state forever, and opening the app as
# many times as you like could not change that.
#
# Nothing caught it because every piece was individually correct: the
# entitlements matched on all three targets, the group name matched, the key
# matched. What was missing was a writer, and "missing" is exactly what no
# test asserts unless it is asked to. The target's own config comment even
# said "written by WatchBridge on every store change" — a comment describing
# something nobody implemented reads exactly like something that works.
#
# Devices, because a shared App Group is NOT shared across them:
#   phone : apps/app/modules/watch-bridge, apps/app/targets/appwidget
#   watch : apps/app/targets/watch,        apps/app/targets/watchwidget
#
#   sh tools/check-appgroup.sh
set -e
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re, sys, pathlib

PHONE = ['apps/app/modules/watch-bridge', 'apps/app/targets/appwidget']
WATCH = ['apps/app/targets/watch', 'apps/app/targets/watchwidget']

def swift_files(roots):
    out = []
    for r in roots:
        out += [str(p) for p in pathlib.Path(r).rglob('*.swift')]
    return out

# The key is usually a literal at the call site, or a constant defined nearby.
# Resolve single-file constants so `data(forKey: CACHE)` is not invisible.
CONST = re.compile(r'(?:let|var)\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"')
READ  = re.compile(r'\.(?:data|stringArray|string|object|array|bool|integer)\(forKey:\s*([^)]+)\)')
WRITE = re.compile(r'\.(?:set|setValue)\(\s*[^,]+,\s*for(?:Key|UndefinedKey)?:\s*([^)]+)\)')
REMOVE = re.compile(r'\.removeObject\(forKey:\s*([^)]+)\)')

def keys(files):
    reads, writes = {}, {}
    for f in files:
        src = open(f).read()
        if 'suiteName' not in src:
            continue
        consts = dict(CONST.findall(src))
        def resolve(tok):
            tok = tok.strip()
            if tok.startswith('"') and tok.endswith('"'):
                return tok[1:-1]
            return consts.get(tok)
        for m in READ.finditer(src):
            k = resolve(m.group(1))
            if k: reads.setdefault(k, []).append(f)
        for rx in (WRITE, REMOVE):
            for m in rx.finditer(src):
                k = resolve(m.group(1))
                if k: writes.setdefault(k, []).append(f)
    return reads, writes

bad = 0
for label, roots in (('phone', PHONE), ('watch', WATCH)):
    reads, writes = keys(swift_files(roots))
    print(f'--- {label} ---')
    if not reads:
        print('  (no App Group reads found — check the parser, not the code)')
        bad += 1
        continue
    for k in sorted(reads):
        w = writes.get(k)
        if w:
            print(f"  ok   '{k}' read and written on the {label}")
        else:
            print(f"  FAIL '{k}' is READ on the {label} by {', '.join(sorted(set(reads[k])))}")
            print(f"       but nothing on the {label} writes it — a shared App Group is not shared across devices")
            bad += 1

print()
print('app group: every key that is read has a writer on its own device' if bad == 0
      else f'app group: {bad} key(s) with no writer')
sys.exit(0 if bad == 0 else 1)
PY
