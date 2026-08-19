#!/bin/sh
# The between-runs suite (Sean, 2026-08-19: "make a mini-suite for
# development testing that can be run between deployments and full test
# runs"). Everything fast that needs NO browser and NO export: the two
# typechecks, core, the server suite, and the counts line. ~25 seconds.
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

echo "==> core"
npm run -s test:core -- --reporter=dot

echo "==> server"
npm run -s test:server

echo "==> suite counts"
npm run -s test:counts

echo "==> test:dev green — gestures/WebKit still owed before a deploy (the deploy runs them itself)"
