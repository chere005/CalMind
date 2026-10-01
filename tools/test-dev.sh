#!/bin/sh
# The between-runs suite (Sean, 2026-08-19: "make a mini-suite for
# development testing that can be run between deployments and full test
# runs"). Everything fast that needs NO browser and NO export: the two
# typechecks, core, the server suite, and the counts line. About 30 seconds.
#
# Deliberately NOT here, and why: the gesture and WebKit suites need a
# fresh export first (the freshness gate refuses a stale one, rightly), and
# the export is most of a minute — so a "quick" suite carrying them stops
# being quick and starts being skipped. They already run on every deploy,
# which is the full run this one sits between. The native seam checkers
# need swift and stay manual for the same reason they always have.
#
# One suite at a time, as ever — this boots the server harness's own php.
set -e
cd "$(dirname "$0")/.."

echo "==> typecheck (core, app)"
for P in packages/core apps/app; do
  npx tsc --noEmit -p "$P" || { echo "$P typecheck failed" >&2; exit 1; }
done

# EACH SUITE RUNS ONCE, and the counts line below reads the numbers off that
# run instead of running all three again to count them. It used to: one
# test:dev ran the server suite three times — here, again in the counts check,
# and a third time inside the deploy-guards copy — for numbers already printed
# on the screen above. The counts are handed over only from a run that EXITED
# 0, so a red suite stops here, at its own step, under its own name — never
# further down as "TODO says 64, actually 63", which reads like an
# instruction to edit TODO.md.
#
# Captured to a file, not piped through tee: under plain sh there is no
# pipefail, and `suite | tee` has tee's status — a red suite would sail on.
OUT=$(mktemp -t calmind-testdev)
trap 'rm -f "$OUT"' EXIT
run_counted() { # <label> <npm script> [args...] — runs it, shows it, fails on red
  label="$1"; shift
  if ! npm run -s "$@" >"$OUT" 2>&1; then
    cat "$OUT"
    echo "$label failed" >&2
    exit 1
  fi
  cat "$OUT"
}
vitest_passed() { grep -oE 'Tests +[0-9]+ passed' "$OUT" | grep -oE '[0-9]+' | head -1; }

echo "==> core"
run_counted core test:core -- --reporter=dot
COUNT_CORE=$(vitest_passed)

# The app's own pure logic — no browser, no export. Small on purpose: only
# what a screen has handed to a plain function lives here (rowslots, the row
# drag's landing rule), because the gesture suites cost an export and this
# suite may not.
echo "==> app"
run_counted app test:app -- --reporter=dot
COUNT_APP=$(vitest_passed)

echo "==> server"
run_counted server test:server
COUNT_SERVER=$(grep -oE '[0-9]+ passed' "$OUT" | grep -oE '[0-9]+' | head -1)

echo "==> suite counts"
CALMIND_COUNT_CORE="$COUNT_CORE" CALMIND_COUNT_APP="$COUNT_APP" \
  CALMIND_COUNT_SERVER="$COUNT_SERVER" npm run -s test:counts

echo "==> test:dev green — gestures/WebKit still owed before a deploy (the deploy runs them itself)"
