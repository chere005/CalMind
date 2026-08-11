#!/usr/bin/env bash
# Does the desktop shell's start page actually resolve everything it asks for?
#
# THE CHECK THAT WAS MISSING, and its absence cost the entire macOS app.
#
# The website is exported with a base path (`experiments.baseUrl` in
# apps/app/app.json = "/test/calmind"), so every asset URL in index.html is
# absolute. The shell embedded that export and served it at the ROOT of
# tauri://localhost, where no such prefix exists — so the bundle 404'd, Tauri's
# asset protocol answered with index.html, and the window read:
#
#   CalMind could not start.
#   SyntaxError: Unexpected token '<'
#
# The app had never rendered. ./desktop/smoke.sh passed all six of its checks
# throughout, because it built, carried the right bundle name, launched,
# survived six seconds and quit — every one of which a broken window does too.
#
# This one cannot pass on a blank app: it reads the window's start URL out of
# tauri.conf.json, finds that page in the staged tree that actually gets
# embedded, and requires every absolute asset it references to be a real file
# at exactly that path. It needs no GUI, so it runs anywhere.
#
#   sh desktop/check-assets.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$ROOT/desktop/dist-desktop"
CONF="$ROOT/desktop/src-tauri/tauri.conf.json"
BAD=0
ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { BAD=$((BAD+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

[ -d "$STAGE" ] || { bad "nothing staged at $STAGE — run: sh desktop/stage-dist.sh"; echo; exit 1; }

START="$(sed -n 's/.*"url": "\([^"]*\)".*/\1/p' "$CONF" | head -1)"
[ -n "$START" ] || { bad "tauri.conf.json names no window url — the shell opens the root"; echo; exit 1; }

if [ ! -f "$STAGE${START}" ]; then
  bad "the window opens $START and nothing is staged there"
  echo; exit 1
fi
ok "the window's start page exists ($START)"

# The export's own base path, read from the source of truth rather than
# repeated here — if app.json moves and the staging does not, these disagree
# and the loop below fails on every asset.
BASE="$(sed -n 's/.*"baseUrl": "\([^"]*\)".*/\1/p' "$ROOT/apps/app/app.json" | head -1)"
case "$START" in
  "$BASE"/*) ok "the start page sits under the export's base path ($BASE)" ;;
  *) bad "the window opens $START but the export is built for $BASE" ;;
esac

CHECKED=0
for REF in $(grep -oE '(src|href)="/[^"]+"' "$STAGE${START}" | sed -E 's/.*="([^"]+)"/\1/' | sed 's/?.*//' | sort -u); do
  CHECKED=$((CHECKED+1))
  [ -f "$STAGE$REF" ] || bad "index.html asks for $REF and it is not in the bundle"
done
# An empty alphabet is the failure mode this project keeps meeting: a loop
# over nothing reports success. The page has a script tag at the very least.
if [ "$CHECKED" -eq 0 ]; then
  bad "no absolute asset references found — this guard would pass on anything"
else
  [ "$BAD" -eq 0 ] && ok "all $CHECKED asset paths resolve inside the bundle"
fi

echo
[ "$BAD" -eq 0 ] && echo "desktop assets: the shell can load what it ships" \
                 || echo "desktop assets: $BAD PROBLEM(S)"
exit $([ "$BAD" -eq 0 ] && echo 0 || echo 1)
