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

# ONE SSH CONNECTION FOR THE WHOLE UPLOAD. Each instance makes seven calls —
# three ssh, four rsync — and each used to open its own connection, so a
# prod+test deploy paid fourteen handshakes. Now the first call opens a
# master and the rest ride it (ControlPersist keeps it up between calls;
# mux_close ends it with the run). Same commands, same files, same order:
# only how the session is opened changed.
#
# The socket sits in a private mktemp dir (0700: nobody else on this machine
# rides the connection) and its path stays short, because macOS refuses a
# socket path over 104 bytes and ssh adds 17 of its own while it sets the
# master up. A $TMPDIR long or odd enough to break that — a sandboxed
# session's can be — gets no multiplexing rather than a broken one: RSH is
# then plain ssh, which is exactly the old deploy.
#
# Every call still starts its line with `ssh ` or `rsync `, the spelling
# tools/check-deploy-guards.sh rewrites to echo in its tampered copies. Keep
# it that way: a call spelled any other way would reach the server from a
# guard check.
SSHMUX=""
MUX_TMP=${TMPDIR:-/tmp}
MUX_DIR=$(mktemp -d "${MUX_TMP%/}/calmind-ssh.XXXXXX" 2>/dev/null) || MUX_DIR=""
case "$MUX_DIR" in
  ''|*[!A-Za-z0-9._/-]*) ;;
  *)
    if [ ${#MUX_DIR} -le 80 ]; then
      SSHMUX="-o ControlMaster=auto -o ControlPath=$MUX_DIR/m -o ControlPersist=120"
    fi ;;
esac
RSH="ssh${SSHMUX:+ $SSHMUX}"
mux_close() {
  if [ -n "$SSHMUX" ]; then
    ssh -O exit $SSHMUX "$SSH_DEST" >/dev/null 2>&1 || true
  fi
  if [ -n "$MUX_DIR" ]; then rm -rf "$MUX_DIR"; fi
}

# THE GESTURE RUNS GO IN THE BACKGROUND, and none may outlive this script.
# Every Playwright process started below is in GATE_PIDS until it has been
# waited for; one still running when the script ends — a Ctrl-C, a kill, a
# set -e exit — is stopped here, before the script lets go.
#
# Stopped with INT, never TERM. INT is Playwright's "stop, and take your web
# server with you"; TERM kills node outright and leaves its php -S (in a
# process group of its own, out of reach of anything sent to ours) holding
# the port, so the next run fails on "already used" — the server-left-up
# trap in a new costume. ONE INT, then patience: a second one while it is
# shutting down is what Playwright reads as "now", and that is the one that
# can leave the server behind. So a second goes only after a minute, and
# KILL — which certainly leaves it — after two, naming the ports to check.
#
# Each entry is pid=start-time, and a pid is signalled only while it is still
# the process started here: the shell can reap a finished shard on its own,
# and a pid freed minutes ago may belong to something else by the time a
# Ctrl-C arrives.
SHARD_PORTS="8790 8793 8794"
GATE_PIDS=""
gate_start() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' '_'; }
gate_track() { GATE_PIDS="$GATE_PIDS $1=$(gate_start "$1")"; }
gate_untrack() { GATE_PIDS=$(printf '%s\n' $GATE_PIDS | grep -v "^$1=" | tr '\n' ' '); }

# One shard's own accounting, from its list-reporter log with any colour
# codes stripped: "<ran> <ok>" — the N of its "Running N tests" line (0 when
# there is none, which is exactly what an empty slice prints) and how many of
# them it reported passed, skipped or flaky. The last summary line of each
# kind wins, so a spec that prints something summary-shaped cannot inflate it.
shard_tally() {
  tr -d '\033' <"$1" | sed 's/\[[0-9;]*m//g' | awk '
    /^Running [0-9]+ tests? using / { ran = $2 }
    /^  [0-9]+ passed( \(.*\))?$/ { passed = $1 }
    /^  [0-9]+ skipped$/ { skipped = $1 }
    /^  [0-9]+ flaky$/ { flaky = $1 }
    END { printf "%d %d\n", ran, passed + skipped + flaky }'
}

gate_alive() { # <pid=start>
  st=$(ps -o stat= -p "${1%%=*}" 2>/dev/null) || return 1
  case "$st" in ''|*Z*) return 1 ;; esac
  [ -n "${1#*=}" ] && [ "$(gate_start "${1%%=*}")" = "${1#*=}" ]
}
stop_gates() {
  [ -n "$GATE_PIDS" ] || return 0
  for g in $GATE_PIDS; do
    if gate_alive "$g"; then kill -INT "${g%%=*}" 2>/dev/null || true; fi
  done
  n=0
  while :; do
    left=""
    for g in $GATE_PIDS; do
      if gate_alive "$g"; then left="$left $g"; fi
    done
    [ -n "$left" ] || break
    n=$((n + 1))
    if [ "$n" = 60 ]; then
      for g in $left; do kill -INT "${g%%=*}" 2>/dev/null || true; done
    elif [ "$n" -ge 120 ]; then
      echo "a gesture run would not stop — killed; its php -S may still hold one of $SHARD_PORTS" >&2
      for g in $left; do kill -KILL "${g%%=*}" 2>/dev/null || true; done
      break
    fi
    sleep 1
  done
  for g in $GATE_PIDS; do wait "${g%%=*}" 2>/dev/null || true; done
  GATE_PIDS=""
}

# What has to happen however this run ends. On INT or TERM it runs, then the
# signal is raised again, so whoever ran this still sees an interrupt rather
# than an ordinary failure.
cleanup() {
  stop_gates
  mux_close
}
on_signal() {
  cleanup
  trap - EXIT "$1"
  kill -s "$1" $$
  exit 1
}
trap cleanup EXIT
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM

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
    # Kept, not discarded. This gate stopped a deploy once with its output
    # going to /dev/null, so all anyone had was "gesture suite failed" — and
    # the suite then passed 117/117 on the very next run, which left no way to
    # tell a real regression from a flake, a port clash, or the harness's own
    # 15s server timeout under load. A gate that blocks without evidence costs
    # more than the minute it saves.
    #
    # IN SHARDS since 2026-10-01. One Playwright process ran every spec in
    # turn — eleven minutes, half of a whole tdtp. Now each shard runs one
    # slice (--shard=i/N) against ITS OWN php -S on its own port, over its own
    # wiped data dir, into its own output dir: still one worker over one fresh
    # server per slice, which is what workers:1 is for, and still this dist
    # through the same freshness gate. Shard 1 is 8790, so a plain `npx
    # playwright test` is unchanged; then 8793 and 8794, which nothing else in
    # the suite binds (8791 is WebKit's here and AcctMind's harness's, 8792
    # ChefMind's router, 8799 AcctMind's server suite). Specs take their port
    # from e2e/port.ts, and e2e/portguard.spec.ts keeps it that way.
    #
    # TWO shards unless CALMIND_E2E_SHARDS says 1 or 3. Some specs wait on
    # real clocks and say so ("read 0 once… on a loaded machine"); three
    # Chromiums, three servers and three runners come close to saturating
    # this laptop, and a flake costs a whole lane.
    #
    # THE COUNT IS CHECKED, because a shard can pass by running nothing:
    # Playwright suppresses "No tests found" whenever --shard is set, so an
    # empty or mis-split slice exits 0. Every shard must report "Running N
    # tests" with N > 0 and account for all N as passed or skipped, and the
    # N's must add up to what `--list` says the suite holds right now. A red
    # shard is waited out like the others, so every log is complete.
    PW=./node_modules/.bin/playwright
    [ -x "$PW" ] || { echo "no $PW — npm install, then deploy" >&2; exit 1; }
    SHARDS="${CALMIND_E2E_SHARDS:-2}"
    case "$SHARDS" in
      1|2|3) ;;
      *) echo "CALMIND_E2E_SHARDS must be 1, 2 or 3 (got '$SHARDS')" >&2; exit 1 ;;
    esac
    LISTED=$("$PW" test --list 2>/dev/null | sed -n 's/^Total: \([0-9][0-9]*\) tests\{0,1\} in .*/\1/p')
    case "$LISTED" in
      ''|*[!0-9]*|0) echo "could not count the gesture suite (playwright test --list) — not deploying" >&2; exit 1 ;;
    esac
    GDIR=$(mktemp -d -t calmind-gestures)
    echo "==> gestures: $LISTED tests in $SHARDS shards, WebKit beside them (--no-gestures to skip)"
    G0=$(date +%s)
    # perl only to undo one thing the shell does: a background job of a
    # non-interactive sh starts with INT IGNORED, and Playwright only installs
    # its handler over that once it is up — an INT before then would vanish.
    # Put back at default, a Ctrl-C reaches every shard the way it reached
    # the one foreground run, and stop_gates' INT always lands.
    UNIGNORE_INT='$SIG{INT} = "DEFAULT"; exec { $ARGV[0] } @ARGV or die "cannot run $ARGV[0]: $!\n"'

    # …AND WEBKIT, which this gate did not run. The suite exists because a
    # react-native-web `hitSlop` is a no-op in a browser and the browser that
    # matters here is Safari — "verifying that fix in Chromium alone would have
    # been checking it everywhere except where it matters", says its own
    # config. Leaving it out of the gate meant precisely that: a Safari-only
    # regression could ship. Sixteen specs, under thirty seconds, and the log
    # is kept for the same reason as the one above — a gate that blocks
    # without evidence costs more than the minute it saves.
    #
    # BESIDE the shards since 2026-10-01, not after them: it already had its
    # own port (8791), its own wiped data dir (/tmp/calmind-e2e-webkit) and
    # now its own output dir (test-results-webkit), so it shares nothing with
    # them but this dist and the freshness gate. Started first, as the
    # shortest; waited for, and judged, like any shard.
    perl -e "$UNIGNORE_INT" "$PW" test -c playwright.webkit.config.ts >"$GDIR/webkit.log" 2>&1 &
    WPID=$!
    gate_track "$WPID"

    i=0
    for PORT in $SHARD_PORTS; do
      i=$((i + 1))
      [ "$i" -le "$SHARDS" ] || break
      CALMIND_E2E_PORT=$PORT perl -e "$UNIGNORE_INT" "$PW" test --shard="$i/$SHARDS" \
        >"$GDIR/shard-$i.log" 2>&1 &
      eval "SHARD_PID_$i=\$!"
      gate_track $!
    done
    RAN_ALL=0; RED=0
    i=0
    for PORT in $SHARD_PORTS; do
      i=$((i + 1))
      [ "$i" -le "$SHARDS" ] || break
      eval "P=\$SHARD_PID_$i"
      RC=0; wait "$P" || RC=$?
      gate_untrack "$P"
      TALLY=$(shard_tally "$GDIR/shard-$i.log")
      RAN=${TALLY% *}; OK=${TALLY#* }
      RAN_ALL=$((RAN_ALL + RAN))
      if [ "$RC" != 0 ]; then
        echo "gesture shard $i/$SHARDS (port $PORT) failed — not deploying. Last lines:" >&2
        grep -E '✘|Error:|Timeout|[0-9]+ failed|webServer|already used|Failed to listen' "$GDIR/shard-$i.log" | tail -25 >&2
        RED=1
      elif [ "$RAN" = 0 ] || [ "$OK" != "$RAN" ]; then
        echo "gesture shard $i/$SHARDS (port $PORT) exited 0 having run $RAN test(s), $OK passed or skipped — not deploying" >&2
        RED=1
      fi
    done
    WRC=0; wait "$WPID" || WRC=$?
    gate_untrack "$WPID"
    if [ "$WRC" != 0 ]; then
      echo "WebKit suite failed — not deploying. Last lines:" >&2
      grep -E '✘|Error:|Timeout|[0-9]+ failed|webServer|already used|Failed to listen' "$GDIR/webkit.log" | tail -25 >&2
      RED=1
    fi
    if [ "$RED" = 0 ] && [ "$RAN_ALL" != "$LISTED" ]; then
      echo "the gesture shards ran $RAN_ALL tests between them; the suite holds $LISTED — not deploying" >&2
      RED=1
    fi
    if [ "$RED" = 1 ]; then
      echo "full output: $GDIR" >&2
      exit 1
    fi
    echo "    $LISTED tests, every one accounted for, and WebKit, in $(( $(date +%s) - G0 ))s"
    rm -rf "$GDIR"
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
    ssh $SSHMUX "$SSH_DEST" "mkdir -p $LIB_DEST $DATA_DEST $WEB_DEST/api"
  fi

  echo "==> [$INST] server/lib -> $LIB_DEST (config.php never sent)"
  rsync -avL $DRY -e "$RSH" --exclude 'config.php' server/lib/ "$SSH_DEST:$LIB_DEST/"

  echo "==> [$INST] api -> $WEB_DEST/api/"
  rsync -avL $DRY -e "$RSH" server/public/api/ "$SSH_DEST:$WEB_DEST/api/"

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
    ssh $SSHMUX "$SSH_DEST" "printf '%s\\n' '<?php return \"$LIB_DEST\";' > $WEB_DEST/api/instance.php"
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
    rsync -avL $DRY -e "$RSH" --exclude 'api' --exclude '.sources.json' apps/app/dist/ "$SSH_DEST:$WEB_DEST/"
    # index.html must revalidate; the hashed bundles cache forever.
    rsync -avL $DRY -e "$RSH" server/public/web.htaccess "$SSH_DEST:$WEB_DEST/.htaccess"
  fi

  # The web user must be able to CREATE the data dir's contents (it owns the data,
  # suite-style), and read lib; rsync leaves everything owned by the SSH login, so
  # hand the group over. Data contents themselves are never touched.
  if [ -z "$DRY" ]; then
    echo "==> [$INST] web-user perms (lib read, data dir writable)"
    ssh $SSHMUX "$SSH_DEST" "mkdir -p $DATA_DEST \
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

# PREFLIGHT, before anything is written: open the shared connection and use
# it twice. A host that refuses a second session on one connection (sshd's
# MaxSessions) stops the deploy HERE with nothing uploaded — not halfway
# through prod, with a new lib behind an old web client. Read-only, so a dry
# run makes it too; its rsyncs connect anyway.
if [ -n "$SSHMUX" ]; then
  echo "==> one ssh connection for the upload"
  ssh $SSHMUX "$SSH_DEST" true
  ssh $SSHMUX "$SSH_DEST" true
fi

for t in $TARGETS; do upload_to "$t"; done

echo "==> Done. Data contents are never touched."
