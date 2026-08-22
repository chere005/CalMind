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
#   3. tag vX.Y.0 (annotated);  4. git push --follow-tags
#   5. dispatch the desktop-windows workflow (CI builds the pushed tree);
#      a dispatch failure is reported but does not un-ship the release
set -e
cd "$(dirname "$0")/.."

FULL=0
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

git pull --autostash --quiet

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "refusing: uncommitted tracked changes — commit your work first, so the" >&2
  echo "tag names exactly what shipped:" >&2
  git status --porcelain --untracked-files=no | sed 's/^/  /' >&2
  exit 1
fi

if [ "$FULL" = 1 ]; then
  echo "==> tdtp: the between-runs suite first (the deploy runs the browser gates itself)"
  sh tools/test-dev.sh || { echo "test:dev failed — nothing shipped" >&2; exit 1; }
fi

# ------------------------------------------------------------------ the version
CUR=$(node -p "require('./apps/app/app.json').expo.version")
case "$CUR" in
  *[!0-9.]*|.*|*.|*..*) echo "app.json version '$CUR' is not x.y.z" >&2; exit 1 ;;
esac

if git rev-parse -q --verify "refs/tags/v$CUR" >/dev/null; then
  NEW=$(echo "$CUR" | awk -F. '{printf "%d.%d.0", $1, $2+1}')
  echo "==> version: $CUR (tagged) -> $NEW"
else
  NEW="$CUR"
  echo "==> version: $CUR is still untagged from an earlier run — reusing it"
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

if ! git diff --quiet -- apps/app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock; then
  git add apps/app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock
  git commit -q -m "CalMind $NEW"
  echo "==> committed the bump"
fi

# ------------------------------------------------------------------- the deploy
if [ "$FULL" = 1 ]; then
  ./server/deploy.sh prod test --yes-prod
else
  ./server/deploy.sh prod test --yes-prod --quick
fi

# --------------------------------------------------------------- tag, push, CI
git tag -a "v$NEW" -m "CalMind $NEW"
git push --follow-tags origin main
echo "==> pushed, tagged v$NEW"

if command -v gh >/dev/null 2>&1; then
  gh workflow run desktop-windows \
    && echo "==> desktop-windows dispatched (CI builds the pushed tree)" \
    || echo "   WARNING: desktop-windows dispatch failed — run it from the Actions tab" >&2
fi

echo "==> dtp done: v$NEW is live on prod and test"
