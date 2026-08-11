#!/usr/bin/env bash
# Stage the web export where the desktop shell can actually load it.
#
# THE BUG THIS EXISTS FOR. The website is exported with a base path —
# `experiments.baseUrl: "/test/calmind"` in apps/app/app.json — so every asset
# URL in index.html is absolute: `/test/calmind/_expo/static/js/web/index-*.js`.
# The desktop shell embedded that same export and served it at the ROOT of
# `tauri://localhost/`, where no such prefix exists. The bundle request 404'd,
# Tauri's asset protocol answered with index.html, and the JS parser met a `<`:
#
#   CalMind could not start.
#   SyntaxError: Unexpected token '<'
#   tauri://localhost/test/calmind/_expo/static/js/web/index-….js:1
#
# So the macOS app had never once rendered, while ./desktop/smoke.sh passed
# every check it had — it built, it carried the right bundle name, it launched,
# it survived six seconds and it quit. All true of a window showing an error.
#
# THE FIX, AND WHY THIS SHAPE. The base path is baked into the JS as well as
# the HTML (three occurrences, used for loading async chunks at runtime), so
# rewriting index.html alone would still break the moment a lazy chunk loaded.
# Rewriting the bundle would mean the desktop runs bytes the web suite never
# tested. Instead the export is staged UNDER the path it was built for, and the
# window opens it there — not one byte differs from what the site serves.
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/apps/app/dist"
# Read from app.json rather than repeated here: this path is the whole bug,
# and a second copy of it is a second thing to forget. check-assets.sh holds
# the window `url` in tauri.conf.json to the same value.
BASE="$(sed -n 's/.*"baseUrl": "\([^"]*\)".*/\1/p' "$ROOT/apps/app/app.json" | head -1 | sed 's|^/||')"
[ -n "$BASE" ] || { echo "no experiments.baseUrl in apps/app/app.json" >&2; exit 1; }
STAGE="$ROOT/desktop/dist-desktop"

[ -f "$DIST/index.html" ] || { echo "no export at $DIST — run: npm run export:web" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE/$BASE"
# -a so the copy is exact; the smoke test matches the .app's embedded bundle
# name against apps/app/dist, and that only means anything if this is a copy
# rather than a re-export.
cp -a "$DIST/." "$STAGE/$BASE/"

echo "staged $(cd "$STAGE" && find . -type f | wc -l | tr -d ' ') files under $BASE/"
