#!/bin/sh
# Is what the SIMULATOR is running actually today's code?
#
# e2e/freshness.ts refuses to run the gesture suite against a stale web export,
# for a reason it states plainly: a suite that tests code which is not there
# gives "the worst kind of green — it looks like an answer". The simulator had
# no such guard, and on 2026-08-11 it cost exactly that.
#
# What happened: the user menu was checked on a booted simulator to settle
# whether it anchors correctly on iOS. It launched, it rendered beautifully,
# the menu hung neatly under its pill. It was a version behind. The installed
# .app dated from the previous day and — being a Debug build — was taking its
# JavaScript from a Metro that had been up for three days. Nothing on screen
# said so. A photograph of a working app is extremely convincing and proves
# only that SOMETHING works.
#
# So this compares three clocks against the newest source file:
#   · the installed .app on each booted simulator,
#   · the Metro dev server, if one is listening,
#   · and, for a Debug build, warns that the .app's own age is not the answer —
#     the server's is.
#
# It cannot see which bundle the app has already CACHED in memory. For that,
# pick a marker: something today's source renders and yesterday's did not, and
# look for it on the screen. Two free ones on 2026-08-11 were the "Undo last
# delete" row in the user menu and the sync dot in the top bar.
#
#   sh tools/check-sim-fresh.sh
set -u
cd "$(dirname "$0")/.."

BID=$(grep -oE '"bundleIdentifier": *"[^"]*"' apps/app/app.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$BID" ] || { echo "no bundleIdentifier in apps/app/app.json" >&2; exit 1; }

# The newest thing a build would have had to pick up.
NEWEST=$(find apps/app/src packages/core/src apps/app/App.tsx -type f \
  \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null | xargs -0 stat -f '%m %N' | sort -rn | head -1)
SRC_AT=${NEWEST%% *}
SRC_FILE=${NEWEST#* }
[ -n "$SRC_AT" ] || { echo "found no sources to compare against" >&2; exit 1; }

BAD=0
ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; BAD=$((BAD + 1)); }

echo "newest source: $(date -r "$SRC_AT" '+%Y-%m-%d %H:%M')  $SRC_FILE"
echo

BOOTED=$(xcrun simctl list devices booted 2>/dev/null | grep -oE '\(([0-9A-F-]{36})\) \(Booted\)' | grep -oE '[0-9A-F-]{36}')
[ -n "$BOOTED" ] || { echo "  (no booted simulator — nothing to check)"; exit 0; }

for UDID in $BOOTED; do
  NAME=$(xcrun simctl list devices | grep "$UDID" | sed 's/^ *//; s/ (.*//')
  APP=$(xcrun simctl get_app_container "$UDID" "$BID" 2>/dev/null)
  if [ -z "$APP" ] || [ ! -d "$APP" ]; then
    echo "$NAME: $BID not installed"
    continue
  fi
  APP_AT=$(stat -f '%m' "$APP")
  echo "$NAME"
  if [ "$APP_AT" -ge "$SRC_AT" ]; then
    ok "the installed .app is newer than the newest source"
  else
    bad "the installed .app is $(( (SRC_AT - APP_AT) / 3600 ))h older than $SRC_FILE"
  fi
  # A Debug build carries no bundle of its own: its JS comes from Metro, so the
  # .app's date says nothing about the code that will actually run.
  if [ -e "$APP/$(basename "$APP" .app).debug.dylib" ] || ! ls "$APP"/*.jsbundle >/dev/null 2>&1; then
    echo "     (Debug build — its JavaScript comes from Metro, so the date above is not the answer)"
  fi
done

echo
if curl -s -m 3 -o /dev/null "http://localhost:8081/status" 2>/dev/null; then
  PID=$(lsof -ti tcp:8081 2>/dev/null | head -1)
  if [ -n "$PID" ]; then
    START=$(ps -p "$PID" -o lstart= 2>/dev/null)
    START_AT=$(date -j -f '%a %b %e %T %Y' "$START" '+%s' 2>/dev/null || echo 0)
    if [ "$START_AT" -gt 0 ] && [ "$START_AT" -lt "$SRC_AT" ]; then
      bad "Metro on 8081 started $(date -r "$START_AT" '+%Y-%m-%d %H:%M'), before $SRC_FILE changed"
      echo "     It rebuilds on request, so this is a WARNING rather than proof — but a"
      echo "     server this old may be another session's. Two share this repo; check"
      echo "     before restarting it."
    else
      ok "Metro on 8081 started after the newest source changed"
    fi
  fi
else
  echo "  (no Metro on 8081 — a Debug build will not launch without one)"
fi

echo
if [ "$BAD" -gt 0 ]; then
  echo "$BAD reason(s) to distrust what the simulator shows." >&2
  echo "Confirm with a MARKER before believing a screenshot: something today's" >&2
  echo "source renders and yesterday's did not." >&2
  exit 1
fi
echo "simulator: what is installed and served is at least as new as the source."
