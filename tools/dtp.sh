#!/bin/sh
# dtp — deploy, tag, push. The release gesture for CalMind.
# tdtp — the same lane with the full suites: tools/tdtp.sh, which calls this
# with --full. (Sean's shorthand, 2026-08-22: dtp = deploy, tag, push; tdtp =
# test, deploy, tag, push. The lanes themselves are TODO.md §4's, unchanged —
# this script just makes them one gesture instead of three.)
#
# What a run does, in order:
#   0. git pull --autostash (two sessions share this repo), then refuse a
#      tree with uncommitted TRACKED changes — the tag must name what shipped
#   1. bump the MINOR version (x.y.0 → x.(y+1).0) in the four files that move
#      together — apps/app/app.json, desktop/package.json,
#      desktop/src-tauri/tauri.conf.json, desktop/src-tauri/Cargo.toml (the
#      lock follows via cargo) — and commit the bump. UNLESS the current
#      version is still untagged: a previous run bumped and then failed
#      before tagging, and that version is reused rather than skipped past.
#      ios.buildNumber is NOT touched — it moves by hand per device build;
#      the web deploy is what this lane ships, and web first, always.
#   2. deploy: ./server/deploy.sh prod test --yes-prod [--quick]
#      · dtp is the quick lane (seconds-cost gates plus the spot test —
#        Sean: "even if it means some things could occasionally break")
#      · tdtp is the full lane: every suite, gestures and WebKit included
#      Both ship prod AND test off one run of the gates ("dtp should be
#      prod now generally" — 2026-08-21). A failed deploy stops everything:
#      nothing is tagged, nothing is pushed, never tag around a failure.
#   3. the macOS bundle, from a fresh export of what the deploy just shipped
#      — BEFORE the tag, so a broken desktop build leaves the version
#      untagged and a re-run reuses it, exactly as a failed deploy does
#   4. tag X.Y.0 (BARE — no v) (annotated);  5. git push --follow-tags
#   6. dispatch the desktop-windows workflow (CI builds the pushed tree);
#      a dispatch failure is reported but does not un-ship the release
#   7. the device builds — iOS on the phone (the watch companion rides
#      along), Android on an emulator — AFTER the push and reported rather
#      than fatal, because the release has already happened and an unplugged
#      phone must not read as a failed one. One at a time, never in
#      parallel: two heavy build/device processes at once has caused real
#      failures on this machine twice.
#
# THIS REPO SHIPS ITSELF. Steps 3 and 7 were CoreMind's alone
# (bin/build-platforms.sh CalMind) until 2026-08-23, and ChefMind fell into
# the hole that leaves first: a release tagged and pushed while the Mac
# bundle stayed a day behind. Sean, 2026-08-23: "all apps should have a
# deploy on their own mechanism inside their repo" — so tools/
# build-platforms.sh is this repo's, this lane runs it, and CoreMind
# orchestrates ACROSS apps by calling each app's own lane.
#
# WHICH PLATFORMS: naming one selects only it, naming none means all of them —
# tools/build-platforms.sh's own convention. `--web` is how you say "the
# release and no platform builds".
set -e
cd "$(dirname "$0")/.."

FULL=0; PICKED=0; WANT_MAC=0; WANT_IOS=0; WANT_ANDROID=0
for a in "$@"; do
  case "$a" in
    --full)    FULL=1 ;;
    --mac)     WANT_MAC=1;     PICKED=1 ;;
    --ios)     WANT_IOS=1;     PICKED=1 ;;
    --android) WANT_ANDROID=1; PICKED=1 ;;
    # The release on its own. Not the same as naming no flag at all, which
    # means every platform — this is the way to say none.
    --web)     PICKED=1 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done
# --full is not a platform, so `tdtp` with no other flag still means all three.
[ "$PICKED" = 1 ] || { WANT_MAC=1; WANT_IOS=1; WANT_ANDROID=1; }

# ---------------------------------------------------------------- the branch
# The push below names main explicitly, so a lane run from any other branch
# would deploy and tag a tree it then does not push — while printing
# "pushed" and exiting 0.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "refusing: this lane ships main, and HEAD is on '$BRANCH'" >&2
  exit 1
fi

# ------------------------------------------------------------ the drift gate
# This repo carries clones of CoreMind's canon, and a release that ships
# drifted copies publishes bytes canon does not have — silently, since
# nothing else in this lane reads the manifests. Auto-rewriting source
# mid-release is not allowed (deploy-core.sh is a deliberate act with its
# own guards, and a lane that edits the tree it is about to tag cannot be
# trusted about what shipped), so the gate makes the dependency LOUD
# instead: `exact` rows failing check-drift.sh refuses the release with the
# fix spelled out; `owed` and `fork` rows report and pass, per that script's
# own contract. No CoreMind checkout beside this repo is a warning, not a
# wall — the check is CoreMind's to offer.
DRIFTCHECK="${MIND_DIR:-$(cd .. && pwd)}/CoreMind/bin/check-drift.sh"
if [ -f "$DRIFTCHECK" ]; then
  if ! sh "$DRIFTCHECK" CalMind; then
    echo "" >&2
    echo "refusing: canon has drifted (the rows above) — nothing has shipped." >&2
    echo "  Land the copy-down first, commit it, then re-run:" >&2
    echo "    sh ../CoreMind/bin/deploy-core.sh --only CalMind" >&2
    exit 1
  fi
else
  echo "   WARNING: no CoreMind checkout beside this repo — the drift gate did not run" >&2
fi

# ------------------------------------------------------------- the status page
# A SINGLE-REPO RELEASE IS STILL A RELEASE. Sean, 2026-08-23: "i dont see the
# tdtp from ChefMind on status". CoreMind's bin/dtp.sh had reported to
# seancheren.com/status since the page existed; a repo shipping ITSELF did not,
# so the page went quiet for exactly the runs nobody else knew were coming — and
# the history graph recorded no purple for them at all.
#
# NEVER FATAL. report-status.sh exits 0 on every failure path by design, and the
# `|| true` here covers the case where CoreMind is not checked out beside this
# repo at all. A status page must never be the thing that stops a release.
# A BATCH OWNS ITS OWN CARD. When CoreMind's orchestrator runs this lane as
# part of `dtp all`, it has already opened one run for the whole plan and
# passes its id down — reporting again would draw a second card for a job that
# is one job (Sean, 2026-08-23: "there should be one card per tdtp if multiple
# jobs are triggered in one batch"). Run alone, MIND_RUN_ID is unset and this
# lane opens and closes its own, exactly as before.
REPORTER="${MIND_DIR:-$(cd .. && pwd)}/CoreMind/bin/report-status.sh"
RUN_ID=""
REPORT_DONE=0
if [ -f "$REPORTER" ] && [ -z "${MIND_RUN_ID:-}" ]; then
  KIND=dtp; [ "$FULL" = 1 ] && KIND=tdtp
  RUN_ID=$(sh "$REPORTER" start "$KIND" CalMind 2>/dev/null || true)
  # A lane that dies anywhere — a failed deploy, a refused push, a Ctrl-C —
  # must not leave this repo purple on the page for ever.
  trap 'if [ -n "$RUN_ID" ] && [ "$REPORT_DONE" != 1 ]; then sh "$REPORTER" finish "$RUN_ID" failed 3 "stopped before finishing" >/dev/null 2>&1 || true; fi' EXIT INT TERM
fi

# ------------------------------------------------------- the tree, then a pull
# The dirty check runs FIRST and again AFTER the pull. `git pull --autostash`
# exits 0 even when the autostash pop CONFLICTS — proven, not assumed — so a
# pull that goes first can leave conflict markers in the tree with set -e none
# the wiser, and the lane would deploy them.
refuse_dirty() {
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "refusing: $1" >&2
    git status --porcelain --untracked-files=no | sed 's/^/  /' >&2
    exit 1
  fi
}
refuse_dirty "uncommitted tracked changes — commit your work first, so the tag names exactly what shipped"

if git remote get-url origin >/dev/null 2>&1; then
  git pull --autostash --quiet
  refuse_dirty "the pull left the tree dirty — a conflicted autostash pop exits 0, so this is the check that catches it"
fi

if [ "$FULL" = 1 ]; then
  echo "==> tdtp: the between-runs suite first (the deploy runs the browser gates itself)"
  sh tools/test-dev.sh || { echo "test:dev failed — nothing shipped" >&2; exit 1; }
fi

# ------------------------------------------------------------------ the version
CUR=$(node -p "require('./apps/app/app.json').expo.version")
# x.y.z, three digit parts, nothing else. The glob this replaces claimed to
# reject anything else and accepted '', '1', '1.2' and '1.2.3.4' — and an
# EMPTY version flowed on into `git rev-parse refs/tags/v` and a tag named `v`.
printf '%s\n' "$CUR" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "app.json version '$CUR' is not x.y.z" >&2; exit 1; }

if git rev-parse -q --verify "refs/tags/$CUR" >/dev/null; then
  NEW=$(echo "$CUR" | awk -F. '{printf "%d.%d.0", $1, $2+1}')
  echo "==> version: $CUR (tagged) -> $NEW"
else
  NEW="$CUR"
  echo "==> version: $CUR is still untagged from an earlier run — reusing it"
fi

# A leftover $NEW would make `git tag -a` fail AFTER the deploy has already
# shipped. Checked HERE, while nothing has been touched yet.
if git rev-parse -q --verify "refs/tags/$NEW" >/dev/null; then
  echo "refusing: the tag $NEW already exists — nothing has shipped yet." >&2
  echo "  It is the residue of an interrupted lane: look at it, then delete it" >&2
  echo "  or move the version on." >&2
  exit 1
fi

# Each substitution is VERIFIED — a sed that matches nothing reports success
# (AcctMind's hard-learned lesson, and tools/check-version.mjs is its scar).
if [ "$NEW" != "$CUR" ]; then
  for F in apps/app/app.json desktop/package.json desktop/src-tauri/tauri.conf.json; do
    perl -i -pe "s|\"version\": \"\Q$CUR\E\"|\"version\": \"$NEW\"|" "$F"
  done
  perl -i -pe "s|^version = \"\Q$CUR\E\"|version = \"$NEW\"|" desktop/src-tauri/Cargo.toml
fi
for F in apps/app/app.json desktop/package.json desktop/src-tauri/tauri.conf.json; do
  grep -q "\"version\": \"$NEW\"" "$F" || { echo "guard: $F does not carry $NEW" >&2; exit 1; }
done
grep -q "^version = \"$NEW\"" desktop/src-tauri/Cargo.toml \
  || { echo "guard: Cargo.toml does not carry $NEW" >&2; exit 1; }

# Cargo.lock follows the crate — otherwise the next desktop build dirties it.
if command -v cargo >/dev/null 2>&1; then
  (cd desktop/src-tauri && cargo update -p calmind-desktop --quiet)
else
  echo "   (no cargo on PATH — Cargo.lock will catch up on the next desktop build)"
fi

# The lock mirrors these version numbers, and npm rewrites it on the next
# install if they disagree — which lands as "uncommitted tracked changes" in
# the NEXT lane, about a file nobody edited. The diff is bounded here because
# a script that rewrites a 300KB lock deserves a check that it changed only
# what it said it would.
echo "==> package-lock.json"
node tools/sync-lock-versions.mjs
LOCKDIFF=$(git diff --numstat -- package-lock.json | awk '{print $1 + $2}')
if [ -n "$LOCKDIFF" ] && [ "$LOCKDIFF" -gt 30 ]; then
  echo "guard: the lock sync changed $LOCKDIFF lines — that is more than version fields" >&2
  git checkout -- package-lock.json
  exit 1
fi

if ! git diff --quiet -- apps/app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock package-lock.json; then
  git add apps/app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock package-lock.json
  git commit -q -m "CalMind $NEW"
  echo "==> committed the bump"
fi

# ------------------------------------------------------------------- the deploy
if [ "$FULL" = 1 ]; then
  ./server/deploy.sh prod test --yes-prod
else
  ./server/deploy.sh prod test --yes-prod --quick
fi

# ------------------------------------------------------------------ the desktop
# A fresh export of exactly what the deploy just shipped, then the Tauri
# bundle — build-platforms.sh makes its own clean dist rather than trusting
# whatever is in apps/app/dist by now. BEFORE the tag, so a broken desktop
# build leaves the version untagged and a re-run reuses it, exactly as a
# failed deploy does.
if [ "$WANT_MAC" = 1 ]; then
  if ! sh tools/build-platforms.sh --mac; then
    echo "" >&2
    echo "THE WEB SHIPPED, but the macOS bundle failed — so nothing was tagged." >&2
    echo "  Fix it and re-run: the lane reuses ${NEW}, which is the version" >&2
    echo "  already live." >&2
    exit 1
  fi
fi

# --------------------------------------------------------------- tag, push, CI
git tag -a "$NEW" -m "CalMind $NEW"
# --atomic, because `git push --follow-tags` is per-ref: when origin/main has
# moved under a long deploy, the TAG lands on the remote while main is
# REJECTED — a published tag for a commit nobody can fetch. Both or neither.
#
# And if it is neither, the local tag comes straight back off. The version is
# then still untagged, so a re-run REUSES it — which is right, because the
# deploy above already shipped exactly these bytes under that number.
if ! git push --atomic --follow-tags origin main; then
  git tag -d "$NEW" >/dev/null
  echo "" >&2
  echo "THE DEPLOY SHIPPED, but the push was rejected — so nothing was tagged." >&2
  echo "  main has moved on the remote. Pull, then re-run: the lane reuses ${NEW}." >&2
  exit 1
fi
echo "==> pushed, tagged $NEW"

if command -v gh >/dev/null 2>&1; then
  gh workflow run desktop-windows \
    && echo "==> desktop-windows dispatched (CI builds the pushed tree)" \
    || echo "   WARNING: desktop-windows dispatch failed — run it from the Actions tab" >&2
fi

# ------------------------------------------------------------- the device builds
# After the push, and NOT fatal. The release is done by here — the web is
# live, the tag is on the remote — so a phone that is not plugged in is a
# thing to be told about, not a failed release to unpick. The iOS install
# carries the watch companion onto a paired Apple Watch when one is
# reachable.
#
# One at a time, never in parallel: two heavy build/device processes at once
# has caused real failures on this machine twice.
DEVICE_FAILED=""
if [ "$WANT_IOS" = 1 ]; then
  sh tools/build-platforms.sh --ios || DEVICE_FAILED="$DEVICE_FAILED --ios"
fi
if [ "$WANT_ANDROID" = 1 ]; then
  sh tools/build-platforms.sh --android || DEVICE_FAILED="$DEVICE_FAILED --android"
fi
if [ -n "$DEVICE_FAILED" ]; then
  echo "" >&2
  echo "$NEW IS LIVE AND TAGGED. These device builds did not finish:$DEVICE_FAILED" >&2
  echo "  Re-run just those, once the device is ready:" >&2
  echo "    sh tools/build-platforms.sh$DEVICE_FAILED" >&2
fi

# The page is told how it ended, and with what severity: a live, tagged release
# whose phone build did not run is not a failure, but it is not a clean 0 either.
REPORT_DONE=1
if [ -n "$RUN_ID" ]; then
  if [ -n "$DEVICE_FAILED" ]; then
    sh "$REPORTER" finish "$RUN_ID" ok 2 "$NEW live; device builds pending:$DEVICE_FAILED" >/dev/null 2>&1 || true
  else
    sh "$REPORTER" finish "$RUN_ID" ok 0 "$NEW live" >/dev/null 2>&1 || true
  fi
fi

echo "==> dtp done: $NEW is live on prod and test"
