#!/usr/bin/env bash
# The Linux desktop smoke — the sibling of desktop/smoke.sh, which is macOS
# only (it looks for CalMind.app, launches with `open` and quits with
# `osascript`). Same bar: it builds, it carries THIS export, it launches, it
# survives, it quits.
#
# NEVER RUN. Written on a Mac on 2026-09-21 against a repo that has no Linux
# build yet. Every check below is a proposal; the first person to run this on
# Arch should expect to fix something, and should fix it here rather than
# lowering the bar.
#
#   bash smoke-linux.sh               # build from the repo, then check
#   bash smoke-linux.sh --no-build    # check whatever was built last
#   CALMIND_BIN=/usr/bin/calmind bash smoke-linux.sh --no-build
#                                     # check the INSTALLED package instead
#
# `bash`, not `sh`. This script finds itself with ${BASH_SOURCE[0]}, which a
# real POSIX shell cannot expand (dash: "Bad substitution", then an empty
# REPO). On Arch `sh` is bash and so `sh` happens to work; saying bash means
# it also works wherever that is not true.
#
# Run it from anywhere; point CALMIND_REPO at the checkout if it is not the
# parent of this script.
set -u

REPO="${CALMIND_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
[ -f "$REPO/desktop/src-tauri/tauri.conf.json" ] || REPO="$(cd "$REPO/.." && pwd)"
# Say so here rather than five checks later. Without this, a wrong REPO reads
# as "no exported bundle in apps/app/dist" and sends you off to re-run an
# export that was never the problem — and every check that depends on the
# checkout quietly turns into a failure about something else.
[ -f "$REPO/desktop/src-tauri/tauri.conf.json" ] || {
  echo "not a CalMind checkout: $REPO" >&2
  echo "point CALMIND_REPO at one (makepkg leaves it in ~/build/calmind/src/calmind-desktop-<ver>)" >&2
  exit 2
}
BIN="${CALMIND_BIN:-$REPO/desktop/src-tauri/target/release/calmind-desktop}"
PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
skip() { printf '  \033[33m-\033[0m %s\n' "$1"; }

echo "linux desktop smoke → $BIN"
echo

if [ "${1:-}" != "--no-build" ]; then
  # --no-bundle: this smoke is about the binary. Whether the deb/rpm/AppImage
  # bundlers work is a separate question and belongs in CI, where the AppImage
  # tooling's downloads are somebody else's problem.
  #
  # `npm -w`, run from the repo root, because tauri runs beforeBuildCommand
  # (`sh stage-dist.sh`) in the caller's cwd and npm sets that to the
  # workspace directory. This is the same trap desktop/smoke.sh documents.
  if ( cd "$REPO" \
       && PATH="$HOME/.cargo/bin:$PATH" npm run export:web \
       && PATH="$HOME/.cargo/bin:$PATH" npm -w @calmind/desktop run tauri -- build --no-bundle \
     ) >/tmp/calmind-desktop-build.log 2>&1; then
    ok "it builds"
  else
    bad "build failed — see /tmp/calmind-desktop-build.log"
    tail -5 /tmp/calmind-desktop-build.log
    echo; echo "$PASS passed, $FAIL failed"; exit 1
  fi
fi

[ -x "$BIN" ] && ok "the binary is there" || { bad "no binary at $BIN"; echo; echo "$PASS passed, $FAIL failed"; exit 1; }

# THE CHECK WORTH HAVING, lifted verbatim in spirit from the mac smoke: Tauri
# compresses the frontend into the binary, so the HTML cannot be grepped back
# out — but the content-hashed bundle NAME survives in the asset index. Read
# that name out of dist/index.html (not `find | head -1`: dist accumulates old
# bundles and an async chunk sits beside the entry), and the explicit
# emptiness guard is there because the mac version once grepped for the empty
# string and reported a confident YES.
#
# `strings` is binutils, which comes with base-devel on Arch.
DIST="$(grep -oE 'index-[a-f0-9]+\.js' "$REPO/apps/app/dist/index.html" 2>/dev/null | head -1)"
if [ -z "$DIST" ] || [ "$DIST" = "." ]; then
  bad "no exported bundle in apps/app/dist — run npm run export:web first"
elif ! command -v strings >/dev/null 2>&1; then
  skip "no \`strings\` (install binutils) — cannot prove this binary carries this export"
elif strings -a "$BIN" | grep -qF "$DIST"; then
  ok "it carries THIS export ($DIST)"
else
  bad "the binary was built from a different export than apps/app/dist holds"
  strings -a "$BIN" | grep -oE 'index-[a-f0-9]+\.js' | sort -u | head -3 | sed 's/^/      embedded: /'
fi

# Headless, and the one check here that cannot pass on a blank window.
# bash, not sh: check-assets.sh is bash (${BASH_SOURCE[0]} again), and
# calling it with `sh` only works on distros whose /bin/sh is bash.
if bash "$REPO/desktop/check-assets.sh" >/tmp/calmind-desktop-assets.log 2>&1; then
  ok "the shell can load what it ships"
else
  bad "the shell cannot load its own assets:"
  sed 's/^/      /' /tmp/calmind-desktop-assets.log
fi

# ------------------------------------------------------------------ the GUI
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  skip "no DISPLAY and no WAYLAND_DISPLAY — skipping launch/survive/quit"
  skip "  (in CI: xvfb-run -a bash smoke-linux.sh --no-build)"
  echo; echo "────────────────────────────────"; echo "$PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ] || exit 1
  exit 0
fi

"$BIN" >/tmp/calmind-desktop-run.log 2>&1 &
APP=$!
# A CHECK THAT COULD NOT FAIL, AND NOW CAN.
#
# This used to poll `kill -0 "$APP"` in a ten-second loop and break on the
# first success. The first look happens microseconds after `&`, and a
# background child that has ALREADY exited still answers `kill -0` until the
# shell reaps it — so the first poll always succeeded and "it launches" was
# green for a binary that died on exec. That is the same shape of lie the
# whole macOS scar is about, in the file that exists to catch it.
#
# MEASURED, not reasoned, on this Mac on 2026-09-21: with /usr/bin/false
# backgrounded in place of the app, ten polls out of ten reported the dead
# process alive; with one second of sleep first, three out of three correctly
# reported it dead. The sleep IS the check.
sleep 1
if kill -0 "$APP" 2>/dev/null; then
  LAUNCHED=1
  ok "it launches"
else
  LAUNCHED=0
  bad "it exited within a second — see /tmp/calmind-desktop-run.log"
  tail -5 /tmp/calmind-desktop-run.log 2>/dev/null | sed 's/^/      /'
fi

if [ "$LAUNCHED" = 1 ]; then
  ALIVE=1
  for _ in 1 2 3 4 5 6; do
    kill -0 "$APP" 2>/dev/null || { ALIVE=0; break; }
    sleep 1
  done
  [ "$ALIVE" = 1 ] && ok "it survives six seconds" || bad "it died on its own — see /tmp/calmind-desktop-run.log"

  # A REAL WINDOW, the way the Windows workflow checks MainWindowTitle. This
  # is the check that separates "the process is up" from "there is something
  # on screen", and it is exactly the gap that let a blank macOS app pass six
  # green checks. X11 only — xdotool cannot see Wayland windows, so under
  # Wayland this honestly skips rather than quietly passing.
  if [ -n "${DISPLAY:-}" ] && command -v xdotool >/dev/null 2>&1; then
    WIN=""
    for _ in 1 2 3; do
      WIN="$(xdotool search --name CalMind 2>/dev/null | head -1)"
      [ -n "$WIN" ] && break
      sleep 2
    done
    [ -n "$WIN" ] && ok "it puts up a window titled CalMind" \
                  || bad "the process is running but no CalMind window appeared"
  else
    skip "no xdotool on X11 — cannot tell a window from a running process"
  fi

  # The honest limitation the mac smoke also states: a window showing an
  # error page passes this. Only the render beacon closes that gap and it
  # needs a probe build.

  # Quitting. The mac smoke asks politely (`osascript -e 'quit app'`); the
  # X11 equivalent of that is a window-manager close, and SIGTERM is the
  # fallback. They are not the same test — SIGTERM proves the process dies,
  # not that the app handles a close request — so say which one ran.
  if [ -n "${WIN:-}" ]; then
    xdotool windowclose "$WIN" 2>/dev/null
    HOW="asked to close"
  else
    kill -TERM "$APP" 2>/dev/null
    HOW="SIGTERMed"
  fi
  GONE=0
  for _ in 1 2 3 4 5 6 7 8; do
    kill -0 "$APP" 2>/dev/null || { GONE=1; break; }
    sleep 1
  done
  [ "$GONE" = 1 ] && ok "it quits when $HOW" || { bad "it would not quit ($HOW)"; kill -KILL "$APP" 2>/dev/null; }
  wait "$APP" 2>/dev/null
fi

echo
echo "────────────────────────────────"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
