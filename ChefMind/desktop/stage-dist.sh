#!/usr/bin/env bash
# Stage the web export where the desktop shell can actually load it.
#
# THE BUG THIS EXISTS FOR — inherited from CalMind's copy, which learned it the
# hard way. The web app is exported with a base path (`experiments.baseUrl` in
# app/app.json), so every asset URL in index.html is absolute:
# `/ChefMind/_expo/static/js/web/index-*.js`. Serve that same export at the
# ROOT of `tauri://localhost/` and the bundle request 404s, Tauri's asset
# protocol answers with index.html, and the JS parser meets a `<`:
#
#   ChefMind could not start.
#   SyntaxError: Unexpected token '<'
#
# The base path is baked into the JS as well as the HTML (async chunks resolve
# against it at runtime), so rewriting index.html alone still breaks the moment
# a lazy chunk loads, and rewriting the bundle would mean the desktop runs
# bytes nothing else tested. Instead the export is staged UNDER the path it was
# built for and the window opens it there — not one byte differs from what the
# site serves.
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/app/dist"
# Read from app.json rather than repeated here: this path is the whole bug, and
# a second copy of it is a second thing to forget.
BASE="$(sed -n 's/.*"baseUrl": "\([^"]*\)".*/\1/p' "$ROOT/app/app.json" | head -1 | sed 's|^/||')"
[ -n "$BASE" ] || { echo "no experiments.baseUrl in app/app.json" >&2; exit 1; }
STAGE="$ROOT/desktop/dist-desktop"

[ -f "$DIST/index.html" ] || { echo "no export at $DIST — run: npm run export:web" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE/$BASE"
cp -a "$DIST/." "$STAGE/$BASE/"

echo "staged $(cd "$STAGE" && find . -type f | wc -l | tr -d ' ') files under $BASE/"
