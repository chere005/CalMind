#!/usr/bin/env bash
# The desktop smoke: builds, carries THIS export, launches, survives, quits.
#
# The middle check is the one worth having. Tauri compiles the frontend into
# the binary and compresses it, so the html and the app's own strings cannot be
# grepped back out — which makes "it built" very easy to mistake for "it has
# tonight's work in it". The bundle filename is content-hashed by the export
# and DOES survive as a plain string in the asset index, so matching it against
# apps/app/dist is a real link between the .app and the code.
#
# A first, embarrassing version of this check globbed a path that did not
# exist, so it grepped the binary for the empty string and reported a
# confident YES. Hence the explicit emptiness guard below.
#
#   ./desktop/smoke.sh            # build, then check
#   ./desktop/smoke.sh --no-build # check whatever was built last
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/desktop/src-tauri/target/release/bundle/macos/CalMind.app"
BIN="$APP/Contents/MacOS/calmind-desktop"
PASS=0
FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

echo "desktop smoke → $APP"
echo

if [ "${1:-}" != "--no-build" ]; then
  # cargo is not always on a non-login PATH; rustup's home is where it lives.
  if PATH="$HOME/.cargo/bin:$PATH" npx --prefix "$ROOT/desktop" tauri build >/tmp/calmind-desktop-build.log 2>&1; then
    ok "it builds"
  else
    bad "build failed — see /tmp/calmind-desktop-build.log"
    tail -5 /tmp/calmind-desktop-build.log
    echo; echo "$PASS passed, $FAIL failed"; exit 1
  fi
fi

[ -x "$BIN" ] && ok "the bundle is there" || { bad "no bundle at $BIN"; echo; echo "$PASS passed, $FAIL failed"; exit 1; }

# Read the bundle NAME OUT OF index.html rather than picking a file out of the
# directory. The export does not clean up after itself, so dist/ accumulates
# old bundles — and `find | head -1` will happily choose a stale one, match it
# against a stale binary, and print a confident tick. index.html names the one
# that actually loads, which is the only one worth checking.
DIST="$(grep -oE 'index-[a-f0-9]+\.js' "$ROOT/apps/app/dist/index.html" 2>/dev/null | head -1)"
if [ -z "$DIST" ] || [ "$DIST" = "." ]; then
  bad "no exported bundle in apps/app/dist — run npm run export:web first"
elif strings -a "$BIN" | grep -qF "$DIST"; then
  ok "it carries THIS export ($DIST)"
else
  bad "the .app was built from a different export than apps/app/dist holds"
  strings -a "$BIN" | grep -oE 'index-[a-f0-9]+\.js' | sort -u | head -3 | sed 's/^/      embedded: /'
fi

# Everything index.html asks for must exist where it asks for it. Split out
# so it can run with no GUI at all — see desktop/check-assets.sh for the bug
# it exists for, which is the one that made this whole smoke test a liar.
if sh "$ROOT/desktop/check-assets.sh" >/tmp/calmind-desktop-assets.log 2>&1; then
  ok "the shell can load what it ships"
else
  bad "the shell cannot load its own assets:"
  sed 's/^/      /' /tmp/calmind-desktop-assets.log
fi

open "$APP"
LAUNCHED=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pgrep -f calmind-desktop >/dev/null && { LAUNCHED=1; break; }
  sleep 1
done
[ "$LAUNCHED" = 1 ] && ok "it launches" || bad "it never appeared"

if [ "$LAUNCHED" = 1 ]; then
  ALIVE=1
  for _ in 1 2 3 4 5 6; do
    pgrep -f calmind-desktop >/dev/null || { ALIVE=0; break; }
    sleep 1
  done
  [ "$ALIVE" = 1 ] && ok "it survives six seconds" || bad "it died on its own"

  osascript -e 'quit app "CalMind"' >/dev/null 2>&1
  GONE=0
  for _ in 1 2 3 4 5 6 7 8; do
    pgrep -f calmind-desktop >/dev/null || { GONE=1; break; }
    sleep 1
  done
  [ "$GONE" = 1 ] && ok "it quits when asked" || { bad "it would not quit"; pkill -f calmind-desktop; }
fi

echo
echo "────────────────────────────────"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
