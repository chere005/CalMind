#!/bin/sh
# Deploy the CalMind sync API + web client to the NFSN TEST instance, and nothing
# else — the suite's deploy rules: lint first, never send a config, never touch a
# data dir, never --delete. The host lives in server/deploy.conf (gitignored):
#
#   SSH_DEST="user_site@ssh.example.example"
#
# Usage: ./server/deploy-test.sh [--dry-run] [--no-web]
#   --dry-run      preview every transfer, touch nothing
#   --no-web       skip the Expo web export (API only)
#   --no-gestures  skip the Playwright run (the escape hatch — a harness that
#                  flakes must never be able to strand a deploy)

set -e
cd "$(dirname "$0")/.."

DRY=""; WEB=1; GESTURES=1
for a in "$@"; do
  case "$a" in
    --dry-run)     DRY="--dry-run" ;;
    --no-web)      WEB=0 ;;
    --no-gestures) GESTURES=0 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

# The destinations are constants with a guard, deploy-dev.sh-style: this script
# can only ever write the test instance's calmind areas.
LIB_DEST="/home/protected/calmind/lib"
WEB_DEST="/home/public/test/calmind"
case "$LIB_DEST$WEB_DEST" in
  /home/protected/calmind/*/home/public/test/calmind) ;;
  *) echo "guard: refusing non-calmind destination" >&2; exit 1 ;;
esac

echo "==> lint"
find server -name '*.php' -exec php -l {} \; | grep -v 'No syntax errors' || true

echo "==> tests"
# The server suite was the only gate here, so a red CORE suite could still ship.
# Core is the behaviour every client runs and it takes about a second.
npm run test:core --silent >/dev/null 2>&1 || { echo "core tests failed — not deploying" >&2; exit 1; }
php server/tools/test.php >/dev/null || { echo "server tests failed — not deploying" >&2; exit 1; }

if [ "$WEB" = 1 ]; then
  echo "==> web export"
  # One export path for deploys and the gesture harness alike, so the HTML the
  # specs drive is the HTML that ships — head patch included.
  npm run export:web

  # TESTING.md's rule — all three suites green before a deploy — was a human
  # one, and humans in a hurry are exactly who it exists for. It runs AFTER the
  # export because the specs drive dist, not the source. --no-gestures is the
  # way out if the harness itself is the thing that's broken.
  if [ "$GESTURES" = 1 ]; then
    echo "==> gestures (--no-gestures to skip)"
    npx playwright test >/dev/null 2>&1 || { echo "gesture suite failed — not deploying (npx playwright test to see it)" >&2; exit 1; }
  fi
fi

# rsync only creates the final path element, so make the parents first.
if [ -z "$DRY" ]; then
  ssh "$SSH_DEST" "mkdir -p $LIB_DEST /home/protected/calmind/data $WEB_DEST/api"
fi

echo "==> [TEST] server/lib -> $LIB_DEST (config.php never sent)"
rsync -avL $DRY --exclude 'config.php' server/lib/ "$SSH_DEST:$LIB_DEST/"

echo "==> [TEST] api -> $WEB_DEST/api/"
rsync -avL $DRY server/public/api/ "$SSH_DEST:$WEB_DEST/api/"

if [ "$WEB" = 1 ] && [ -d apps/app/dist ]; then
  echo "==> [TEST] web client -> $WEB_DEST/"
  ICOV=$(shasum apps/app/dist/favicon.ico | cut -c1-8)
  perl -i -pe "s|favicon\.ico(\?v=[0-9a-f]*)?|favicon.ico?v=$ICOV|" apps/app/dist/index.html
  # The home-screen icon: iOS reads apple-touch-icon, which expo doesn't emit.
  sips -z 180 180 apps/app/assets/icon.png --out apps/app/dist/apple-touch-icon.png >/dev/null 2>&1
  # …and the manifest's pair, for Android and desktop installs. The manifest
  # itself is written by the export's head patch; these are what it names.
  sips -z 192 192 apps/app/assets/icon.png --out apps/app/dist/icon-192.png >/dev/null 2>&1
  sips -z 512 512 apps/app/assets/icon.png --out apps/app/dist/icon-512.png >/dev/null 2>&1
  grep -q apple-touch-icon apps/app/dist/index.html || \
    perl -i -pe 's|</head>|<link rel="apple-touch-icon" href="/test/calmind/apple-touch-icon.png"/></head>|' apps/app/dist/index.html
  rsync -avL $DRY --exclude 'api' apps/app/dist/ "$SSH_DEST:$WEB_DEST/"
  # index.html must revalidate; the hashed bundles cache forever.
  rsync -avL $DRY server/public/web.htaccess "$SSH_DEST:$WEB_DEST/.htaccess"
fi

# The web user must be able to CREATE the data dir's contents (it owns the data,
# suite-style), and read lib; rsync leaves everything owned by the SSH login, so
# hand the group over. Data contents themselves are never touched.
if [ -z "$DRY" ]; then
  echo "==> [TEST] web-user perms (lib read, data dir writable)"
  ssh "$SSH_DEST" "mkdir -p /home/protected/calmind/data \
    && chgrp -R web /home/protected/calmind \
    && chmod -R g+rX /home/protected/calmind/lib \
    && chmod g+rwx /home/protected/calmind /home/protected/calmind/data"
fi

# Prove what was just uploaded, rather than trusting rsync's word for it: the
# served head is where the deploy-shaped bugs show (a bare export ships an
# index.html with no manifest and no status-bar metas). --static makes no
# account, so a routine deploy leaves no residue behind it.
if [ -z "$DRY" ] && [ "$WEB" = 1 ]; then
  echo "==> [TEST] proving the served page"
  ./server/tools/smoke-live.sh --static || { echo "the deployed page is wrong — look before shipping further" >&2; exit 1; }
fi

echo "==> Done. Data contents are never touched."
