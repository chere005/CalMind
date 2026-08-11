#!/bin/sh
# Do the deploy scripts' guards still refuse what they claim to refuse?
#
# Every check here works by BREAKING a copy of the real script and watching it
# stop — never by reading it. Two of the gates this repo shipped could not
# fail at all: the PHP lint piped every file through one grep and ended in
# `|| true` (so the pipeline's status was grep's, which SUCCEEDS when it finds
# an error), and the post-gate bundle check read the bundle name but never
# captured one to compare it against. Both printed reassuring output for
# months. So: no assertion here passes unless the tampered copy exits non-zero.
#
# Nothing here needs SSH_DEST, credentials or a network — the guards run
# before deploy.conf is read, deliberately, so this is runnable by anyone.
#
#   sh tools/check-deploy-guards.sh
set -e
cd "$(dirname "$0")/.."

TMP=$(mktemp -d -t deployguards)
trap 'rm -rf "$TMP" server/_guardcheck-*.sh' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

# A tampered copy has to live in server/, because every script does
# `cd "$(dirname "$0")/.."` to find the repo.
#
# EVERY copy also has its ssh and rsync calls replaced with echo. This is not
# belt-and-braces: the point of each case is that a guard has been removed, so
# the copy WILL reach the transfer step whenever the check is doing its job and
# finding a real hole. The first version of this file did not do it, and the
# run that proved the --yes consent gate works — by removing the consent gate —
# went on to rsync the real files to the production well-known dir. Identical
# bytes, so nothing served changed; it was still a production write from a test.
# A test harness must not be one bug away from the thing it is testing.
try() { # try <label> <sed expr> <script> <args...>
  label="$1"; expr="$2"; script="$3"; shift 3
  copy="server/_guardcheck-$$.sh"
  sed -e "$expr" \
      -e 's|^\( *\)ssh |\1echo "   [guardcheck] would ssh: " |' \
      -e 's|^\( *\)rsync |\1echo "   [guardcheck] would rsync: " |' \
      "server/$script" > "$copy"
  chmod +x "$copy"
  if "./$copy" "$@" >"$TMP/out" 2>&1; then
    bad "$label — it RAN (exit 0); the guard did not fire"
    sed -n '1,4p' "$TMP/out" | sed 's/^/      /'
  else
    ok "$label"
  fi
  rm -f "$copy"
}

echo "deploy-test.sh — destinations"
try "refuses the site root"                 's|^WEB_DEST=.*|WEB_DEST="/home/public"|'            deploy-test.sh --dry-run --no-web
try "refuses the live PHP suite's /calmind" 's|^WEB_DEST=.*|WEB_DEST="/home/public/calmind"|'    deploy-test.sh --dry-run --no-web
try "refuses the suite's /dev/calmind"      's|^WEB_DEST=.*|WEB_DEST="/home/public/dev/calmind"|' deploy-test.sh --dry-run --no-web
try "refuses a stray web destination"       's|^WEB_DEST=.*|WEB_DEST="/home/public/somewhere"|'  deploy-test.sh --dry-run --no-web
try "refuses a lib outside the instance"    's|^LIB_DEST=.*|LIB_DEST="/home/protected/lib"|'     deploy-test.sh --dry-run --no-web

echo "deploy-prod.sh — destination and consent"
try "refuses a DEST that is not well-known" 's|^DEST=.*|DEST="/home/public"|'                    deploy-prod.sh --dry-run
# The bare form must refuse: this one is about argv, so the copy is unmodified.
try "refuses to run without --yes"          's|^#unchanged$|#unchanged|'                         deploy-prod.sh

echo "deploy-test.sh — the PHP lint gate"
# The gate that could not fail. Break a real file, in a copy of the tree the
# script lints, and require the deploy to stop.
cp server/lib/store.php "$TMP/store.php"
printf '<?php\nthis is not php {{{\n' > server/lib/store.php
if ./server/deploy-test.sh --dry-run --no-web >"$TMP/lint" 2>&1; then
  bad "a PHP syntax error still deploys"
else
  grep -q 'not deploying' "$TMP/lint" && ok "a PHP syntax error stops the deploy" \
    || bad "it stopped, but not at the lint gate — check $TMP/lint"
fi
cp "$TMP/store.php" server/lib/store.php

echo "deploy-test.sh — the core typecheck gate"
# vitest strips types without checking them, so the suite is green against a
# fixture whose shape no client could ever write. tsc is the only thing that
# sees that, and until this gate existed nothing ran tsc — it had drifted to
# six errors unnoticed. Same method as the lint above: break the real tree,
# require the deploy to stop, put it back.
cp packages/core/src/order.ts "$TMP/order.ts"
printf '\nconst _guardcheckProbe: number = "not a number";\n' >> packages/core/src/order.ts
if ./server/deploy-test.sh --dry-run --no-web >"$TMP/tsc" 2>&1; then
  bad "a core TYPE error still deploys"
else
  grep -q 'typecheck failed' "$TMP/tsc" && ok "a core type error stops the deploy" \
    || bad "it stopped, but not at the typecheck gate — check $TMP/tsc"
fi
cp "$TMP/order.ts" packages/core/src/order.ts

echo
echo "────────────────────────────────"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
