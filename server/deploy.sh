#!/bin/sh
# Deploy the CalMind sync API + web client to ONE OR MORE named instances.
#
#   ./server/deploy.sh                 test          (a bare run is TEST, always)
#   ./server/deploy.sh test dev
#   ./server/deploy.sh prod --yes-prod
#   ./server/deploy.sh prod test dev --yes-prod
#
# Flags: --dry-run --no-web --no-gestures --quick   (as deploy-test.sh)
#
# WHY A MODE FLAG NOW, having refused one before. deploy-prod.sh says it in
# its own header: "Deliberately NOT deploy-test.sh with a `prod` mode … a mode
# flag is one typo away from being chosen by accident." Sean asked for one
# (2026-08-20) once CalMind gained real prod and dev instances, and the answer
# to the original objection is that the typo has to be a DIFFERENT typo:
#
#   · a bare run, and any run whose targets are unrecognised, is test
#   · prod additionally needs --yes-prod, spelled out, in the same command.
#     `./server/deploy.sh prod` alone refuses. There is no bare form, exactly
#     as deploy-prod.sh has no bare form.
#   · the paths are a constant TABLE, matched against a hardcoded allow-list
#     after resolution. Nothing is built from the argument.
#
# The gates run ONCE for all targets — the same lint, typechecks, tests,
# export and suites — and then the upload runs per instance. Shipping the same
# proven tree to two places is the point; re-running a twenty-minute suite per
# destination would only tempt people to skip it.
#
# The host lives in server/deploy.conf (gitignored).

set -e
cd "$(dirname "$0")/.."

DRY=""; WEB=1; GESTURES=1; QUICK=0; YES_PROD=0; TARGETS=""
for a in "$@"; do
  case "$a" in
    --dry-run)     DRY="--dry-run" ;;
    --no-web)      WEB=0 ;;
    --no-gestures) GESTURES=0 ;;
    --quick)       QUICK=1 ;;
    --yes-prod)    YES_PROD=1 ;;
    test|dev|prod) TARGETS="$TARGETS $a" ;;
    *) echo "unknown argument: $a" >&2; exit 1 ;;
  esac
done
# A bare run is test. Never anything else, and never nothing.
[ -n "$TARGETS" ] || TARGETS=" test"

# Deduplicate, so `prod prod` is one upload rather than two.
UNIQ=""
for t in $TARGETS; do
  case " $UNIQ " in *" $t "*) ;; *) UNIQ="$UNIQ $t" ;; esac
done
TARGETS="$UNIQ"

case " $TARGETS " in
  *" prod "*)
    if [ "$YES_PROD" != 1 ]; then
      echo "refusing: prod needs --yes-prod spelled out in the same command" >&2
      exit 1
    fi ;;
esac

# The TABLE. Constants, one row per instance — nothing here is built from an
# argument, so no argument can aim an upload somewhere new.
paths_for() {
  case "$1" in
    test) LIB_DEST="/home/protected/calmind/lib";      WEB_DEST="/home/public/test/calmind" ;;
    dev)  LIB_DEST="/home/protected/calmind-dev/lib";  WEB_DEST="/home/public/dev/calmind" ;;
    prod) LIB_DEST="/home/protected/calmind-prod/lib"; WEB_DEST="/home/public/calmind" ;;
    *) echo "guard: unknown instance '$1'" >&2; exit 1 ;;
  esac
  # What the world calls it — the served page is proved at the instance's OWN
  # address. Defaulting to test's would have let a prod upload be "verified"
  # by fetching test, which is the shape of check that passes while the thing
  # it checks is broken.
  #
  # NOT derived from WEB_DEST any more. test and dev moved to subdomains on
  # 2026-08-20 and the apex paths they used to live at now 404 BY DESIGN, so
  # https://seancheren.com/test/calmind — which is exactly what deriving it
  # produced — failed all twelve checks the moment that shipped. Where a file
  # sits on disk and what the world calls it are two different facts now, and
  # this table holds both.
  case "$1" in
    test) SITE_URL="https://test.seancheren.com/calmind" ;;
    dev)  SITE_URL="https://dev.seancheren.com/calmind" ;;
    prod) SITE_URL="https://seancheren.com/calmind" ;;
  esac
  DATA_DEST="$(dirname "$LIB_DEST")/data"
  INST_DIR="$(dirname "$LIB_DEST")"
  WEB_PATH="${WEB_DEST#/home/public}"
  # `if`, not `[ … ] && …` — deploy-test.sh's own header explains why, and
  # this script tripped over it anyway: as a bare list under `set -e` the
  # FALSE case (which is every correct run) is a non-zero status, and the
  # whole deploy exited silently before printing a single line.
  if [ "$WEB_PATH" = "$WEB_DEST" ]; then
    WEB_PATH=""
  fi
}

# Every row is checked against the allow-list AFTER resolution, so a mistyped
# table entry is caught here rather than on the server. Runs before
# deploy.conf is read, like deploy-test.sh's, so it needs no credentials.
guard_paths() {
  inst="$1"
  if [ "$WEB_DEST" = "/home/public" ]; then
    echo "guard: that is the site root" >&2; exit 1
  fi
  case "$inst:$LIB_DEST:$WEB_DEST" in
    test:/home/protected/calmind/lib:/home/public/test/calmind) ;;
    dev:/home/protected/calmind-dev/lib:/home/public/dev/calmind) ;;
    prod:/home/protected/calmind-prod/lib:/home/public/calmind) ;;
    *) echo "guard: $inst resolved to paths that are not its own ($LIB_DEST, $WEB_DEST)" >&2; exit 1 ;;
  esac
}

for t in $TARGETS; do paths_for "$t"; guard_paths "$t"; done
echo "==> targets:$TARGETS"

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

echo "==> lint"
# php -l exits non-zero PER FILE, but the old form piped every file through one
# grep and ended in `|| true`, so the pipeline's status was grep's — and grep
# SUCCEEDS when it finds a line, i.e. when there are errors. Inverted and then
# discarded: a file with a syntax error printed its error and shipped anyway.
# Proven by breaking store.php and watching the whole thing exit 0.
phpsum() { find server -name '*.php' -type f -exec shasum {} \; | sort | shasum | cut -c1-12; }
LINT=$(find server -name '*.php' -print0 | xargs -0 -n1 php -l 2>&1 | grep -v 'No syntax errors' || true)
# What was linted, so the upload can prove it is still shipping THAT. The gates
# below take minutes — an export, a full gesture suite — and the rsync happens
# at the end of them. Anything edited in that window used to ship having been
# linted in neither sense: not checked, and not the thing that was checked.
# Demonstrated by accident, editing app.php while a deploy of it was running.
PHP_BEFORE=$(phpsum)
if [ -n "$LINT" ]; then
  echo "$LINT" >&2
  echo "PHP syntax errors above — not deploying" >&2
  exit 1
fi

echo "==> typecheck"
# The core suite runs through vitest, which strips types without checking
# them, so tsc was the only thing that could see a fixture the app cannot
# produce — and nothing ran tsc. It had drifted to six errors, one of them an
# Event literal with no `ord`, a record no client ever writes.
#
# Output is captured and printed rather than sent to /dev/null: a gate whose
# reason is hidden gets deleted by whoever it blocks first.
#
# apps/app joined on 2026-08-12, for the same reason one step further out: it
# is the larger half of the code and the half this script actually SHIPS, and
# nothing was checking it either. It happens to be clean today, which is the
# cheapest possible moment to gate it — waiting until it has drifted turns a
# free check into a day's work, which is how core got its six errors.
# Three seconds.
TSLOG=$(mktemp)
for P in packages/core apps/app; do
  if ! npx tsc --noEmit -p "$P" >"$TSLOG" 2>&1; then
    cat "$TSLOG" >&2
    rm -f "$TSLOG"
    echo "$P typecheck failed — not deploying" >&2
    exit 1
  fi
done
rm -f "$TSLOG"

echo "==> tests"
# The server suite was the only gate here, so a red CORE suite could still ship.
# Core is the behaviour every client runs and it takes about a second.
npm run test:core --silent >/dev/null 2>&1 || { echo "core tests failed — not deploying" >&2; exit 1; }
php server/tools/test.php >/dev/null || { echo "server tests failed — not deploying" >&2; exit 1; }
# The feed's own clock formatter, which this script SHIPS. It is a fourth copy
# of a rule the watch app, the complication and core each hold, and it was
# found already diverged — always 12-hour while every other surface honoured
# the account's clock24. The Swift copies gate each other in `npm run
# test:watch`; nothing gated this one, and it is the only one of the four that
# goes out of this script.

if [ "$WEB" = 1 ]; then
  echo "==> web export"
  # One export path for deploys and the gesture harness alike, so the HTML the
  # specs drive is the HTML that ships — head patch included.
  npm run export:web

  # The bundle this deploy is ABOUT, read out of index.html rather than found
  # by globbing: dist holds more than one index-*.js (the entry bundle and an
  # async chunk), so `find | head -1` picks between them arbitrarily.
  [ -f apps/app/dist/index.html ] || { echo "the export produced no dist/index.html — not deploying" >&2; exit 1; }
  BEFORE=$(grep -o 'index-[a-zA-Z0-9]*\.js' apps/app/dist/index.html | head -1)
  [ -n "$BEFORE" ] || { echo "dist/index.html names no bundle — not deploying" >&2; exit 1; }

  # TESTING.md's rule — all three suites green before a deploy — was a human
  # one, and humans in a hurry are exactly who it exists for. It runs AFTER the
  # export because the specs drive dist, not the source. --no-gestures is the
  # way out if the harness itself is the thing that's broken.
  if [ "$GESTURES" = 1 ] && [ "$QUICK" = 1 ]; then
    # The spot test, not no test: the two specs that prove the exported
    # bundle boots, makes an account against the real API, and writes a
    # record that renders. A broken export, a broken head patch, or a broken
    # store all fail here in under a minute.
    echo "==> spot gestures (--quick: the full suites wait for a tdtp)"
    QLOG=$(mktemp -t calmind-quick)
    if ! npx playwright test e2e/app.spec.ts -g "signing up lands on the calendar|a reminder adds into its section" >"$QLOG" 2>&1; then
      echo "spot test failed — not deploying. Last lines:" >&2
      grep -E '✘|Error:|Timeout|[0-9]+ failed|webServer' "$QLOG" | tail -15 >&2
      echo "full output: $QLOG" >&2
      exit 1
    fi
    rm -f "$QLOG"
  elif [ "$GESTURES" = 1 ]; then
    echo "==> gestures (--no-gestures to skip)"
    # Kept, not discarded. This gate stopped a deploy once with its output
    # going to /dev/null, so all anyone had was "gesture suite failed" — and
    # the suite then passed 117/117 on the very next run, which left no way to
    # tell a real regression from a flake, a port clash, or the harness's own
    # 15s server timeout under load. A gate that blocks without evidence costs
    # more than the minute it saves.
    GLOG=$(mktemp -t calmind-gestures)
    if ! npx playwright test >"$GLOG" 2>&1; then
      echo "gesture suite failed — not deploying. Last lines:" >&2
      grep -E '✘|Error:|Timeout|[0-9]+ failed|webServer' "$GLOG" | tail -25 >&2
      echo "full output: $GLOG" >&2
      exit 1
    fi
    rm -f "$GLOG"

    # …AND WEBKIT, which this gate did not run. The suite exists because a
    # react-native-web `hitSlop` is a no-op in a browser and the browser that
    # matters here is Safari — "verifying that fix in Chromium alone would have
    # been checking it everywhere except where it matters", says its own
    # config. Leaving it out of the gate meant precisely that: a Safari-only
    # regression could ship. Sixteen specs, under thirty seconds, and the log
    # is kept for the same reason as the one above — a gate that blocks
    # without evidence costs more than the minute it saves.
    WLOG=$(mktemp -t calmind-webkit)
    if ! npx playwright test -c playwright.webkit.config.ts >"$WLOG" 2>&1; then
      echo "WebKit suite failed — not deploying. Last lines:" >&2
      grep -E '✘|Error:|Timeout|[0-9]+ failed|webServer' "$WLOG" | tail -25 >&2
      echo "full output: $WLOG" >&2
      exit 1
    fi
    rm -f "$WLOG"
  fi

  # A native build's bundling step writes over dist, and an xcodebuild that
  # overlaps a deploy has now DELETED the export between the gate and the
  # upload — leaving a run that passed its tests and then shipped nothing, or
  # worse, shipped half.
  #
  # This used to read AFTER and then only check it was non-empty, with a
  # comment claiming it "still names the bundle the gate ran against". It
  # never captured a BEFORE, so it could not tell a rebuilt dist from the
  # original one and passed either way — the check could not fail in the way
  # it described. Compare the two names.
  [ -f apps/app/dist/index.html ] || { echo "dist/index.html vanished after the gate — something else rebuilt over it; not deploying" >&2; exit 1; }
  AFTER=$(grep -o 'index-[a-zA-Z0-9]*\.js' apps/app/dist/index.html | head -1)
  [ "$AFTER" = "$BEFORE" ] || {
    echo "dist was rebuilt under this deploy: gated $BEFORE, now $AFTER — not deploying" >&2; exit 1; }
fi

# The PHP half of the same question the bundle check asks: is this still the
# tree the gates ran against? Checked here, immediately before the first
# upload, because everything between the lint and this point takes minutes.
PHP_AFTER=$(phpsum)
if [ "$PHP_AFTER" != "$PHP_BEFORE" ]; then
  echo "server/*.php changed under this deploy: linted $PHP_BEFORE, now $PHP_AFTER" >&2
  echo "something edited the PHP after the gates ran — not deploying" >&2
  exit 1
fi

upload_to() {
  INST="$1"
  paths_for "$INST"
  guard_paths "$INST"
  # rsync only creates the final path element, so make the parents first.
  if [ -z "$DRY" ]; then
    ssh "$SSH_DEST" "mkdir -p $LIB_DEST $DATA_DEST $WEB_DEST/api"
  fi

  echo "==> [$INST] server/lib -> $LIB_DEST (config.php never sent)"
  rsync -avL $DRY --exclude 'config.php' server/lib/ "$SSH_DEST:$LIB_DEST/"

  echo "==> [$INST] api -> $WEB_DEST/api/"
  rsync -avL $DRY server/public/api/ "$SSH_DEST:$WEB_DEST/api/"

  # WHICH lib this instance's API loads. Without it the API falls back to a
  # hardcoded /home/protected/calmind/lib — the TEST instance's — because the
  # repo-relative candidate cannot exist on the server. Prod and dev served
  # their own bundles and then read and wrote TEST's data: one store behind
  # three front doors, found when prod knew an account it had never been told
  # about and its own data dir was empty.
  #
  # Written here rather than shipped in the repo, because its contents are the
  # one thing that differs per instance. Uploaded AFTER the api/ rsync, which
  # would otherwise not delete it but would race it.
  if [ -z "$DRY" ]; then
    echo "==> [$INST] api instance -> $LIB_DEST"
    ssh "$SSH_DEST" "printf '%s\\n' '<?php return \"$LIB_DEST\";' > $WEB_DEST/api/instance.php"
  fi

  if [ "$WEB" = 1 ]; then
    # Not `&& [ -d apps/app/dist ]`: a missing export used to skip this block
    # silently, so a run that shipped the API and NO web client still printed
    # "Done". The export is checked above, so getting here without it means
    # something removed it — say so rather than half-deploy quietly.
    [ -d apps/app/dist ] || { echo "apps/app/dist is gone — the API shipped, the web client did not" >&2; exit 1; }
    echo "==> [$INST] web client -> $WEB_DEST/"
    ICOV=$(shasum apps/app/dist/favicon.ico | cut -c1-8)
    perl -i -pe "s|favicon\.ico(\?v=[0-9a-f]*)?|favicon.ico?v=$ICOV|" apps/app/dist/index.html
    # The home-screen icon: iOS reads apple-touch-icon, which expo doesn't emit.
    sips -z 180 180 apps/app/assets/icon.png --out apps/app/dist/apple-touch-icon.png >/dev/null 2>&1
    # …and the manifest's pair, for Android and desktop installs. The manifest
    # itself is written by the export's head patch; these are what it names.
    sips -z 192 192 apps/app/assets/icon.png --out apps/app/dist/icon-192.png >/dev/null 2>&1
    sips -z 512 512 apps/app/assets/icon.png --out apps/app/dist/icon-512.png >/dev/null 2>&1
    # REWRITTEN, not inserted-if-absent: one dist is uploaded to every target
    # in turn, so an insert-once rule hands every later instance whatever the
    # FIRST one wrote.
    #
    # The href is the export's OWN base path, read from app.json — not
    # WEB_PATH, which is where the files live on the server's disk. Those were
    # the same string until test and dev moved to subdomains: the files still
    # sit in /home/public/test/calmind, but the browser is at /calmind on
    # test.seancheren.com, and the desktop shell has no /test/ anywhere in it.
    # So the icon href has been wrong on test, on dev, and inside the Mac app
    # ever since, which is what the desktop asset check finally said out loud.
    # Every instance serves the app at baseUrl now, so there is one right
    # answer and app.json holds it.
    URL_BASE=$(node -p "require('./apps/app/app.json').expo.experiments.baseUrl || ''")
    perl -i -pe "s|<link rel=\"apple-touch-icon\"[^>]*/?>||g" apps/app/dist/index.html
    perl -i -pe "s|</head>|<link rel=\"apple-touch-icon\" href=\"$URL_BASE/apple-touch-icon.png\"/></head>|" apps/app/dist/index.html
    # .sources.json is the export's record of what it was built from — a path
    # and a content hash for all 67 source files — and it exists for
    # e2e/freshness.ts on THIS machine. dist goes up wholesale, so without this
    # exclude the repo's file listing would be served publicly beside the app.
    # It lives in dist deliberately (a bare `expo export` clears dist and takes
    # it with it, so a manifest can never outlive the bundle it measured), which
    # is exactly why the exclude has to be here rather than solved by moving it.
    rsync -avL $DRY --exclude 'api' --exclude '.sources.json' apps/app/dist/ "$SSH_DEST:$WEB_DEST/"
    # index.html must revalidate; the hashed bundles cache forever.
    rsync -avL $DRY server/public/web.htaccess "$SSH_DEST:$WEB_DEST/.htaccess"
  fi

  # The web user must be able to CREATE the data dir's contents (it owns the data,
  # suite-style), and read lib; rsync leaves everything owned by the SSH login, so
  # hand the group over. Data contents themselves are never touched.
  if [ -z "$DRY" ]; then
    echo "==> [$INST] web-user perms (lib read, data dir writable)"
    ssh "$SSH_DEST" "mkdir -p $DATA_DEST \
      && chgrp -R web $INST_DIR \
      && chmod -R g+rX $LIB_DEST \
      && chmod g+rwx $INST_DIR $DATA_DEST"
  fi

  # Prove what was just uploaded, rather than trusting rsync's word for it: the
  # served head is where the deploy-shaped bugs show (a bare export ships an
  # index.html with no manifest and no status-bar metas). --static makes no
  # account, so a routine deploy leaves no residue behind it.
  if [ -z "$DRY" ] && [ "$WEB" = 1 ]; then
    echo "==> [$INST] proving the served page"
    # Retried once, deliberately. A deploy that has just finished rsyncing can
    # serve a moment of inconsistency — that happened here: four checks red,
    # then 9/9 immediately after with nothing changed. A gate that cries wolf is
    # one people learn to ignore, so the retry exists to tell a settling upload
    # apart from a broken one. It is NOT a way to pass by trying twice: a second
    # failure still stops the deploy, and a first failure is printed either way
    # so an intermittent fault cannot hide behind a green second attempt.
    if ! ./server/tools/smoke-live.sh --static "$SITE_URL"; then
      echo "   first pass failed — giving the upload a moment and re-checking once" >&2
      sleep 5
      ./server/tools/smoke-live.sh --static "$SITE_URL" || {
        echo "the deployed page is wrong — look before shipping further" >&2; exit 1; }
      echo "   (it passed on the retry: the first run caught a settling upload, not a fault)" >&2
    fi
  fi

}

for t in $TARGETS; do upload_to "$t"; done

echo "==> Done. Data contents are never touched."
