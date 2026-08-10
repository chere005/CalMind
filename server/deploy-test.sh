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

# The destinations are constants with a guard, deploy-dev.sh-style: this script
# can only ever write the test instance's calmind areas. Everything else that
# names a path DERIVES from these two, so there is one place to look and no
# second copy to drift — the data dir, the perms pass and the web client's
# icon href were all separately hardcoded, which meant changing WEB_DEST here
# left the icon still pointing at /test/calmind.
LIB_DEST="/home/protected/calmind/lib"
WEB_DEST="/home/public/test/calmind"
DATA_DEST="$(dirname "$LIB_DEST")/data"   # the instance's own data dir
INST_DIR="$(dirname "$LIB_DEST")"          # what the perms pass owns
WEB_PATH="${WEB_DEST#/home/public}"        # the URL path the client is served at

# The guards run BEFORE deploy.conf is read, deliberately: they are about
# these constants and nothing else, so tools/check-deploy-guards.sh can prove
# them on a machine that has no SSH_DEST and no network. A guard that can only
# be exercised by someone holding the production credentials is a guard nobody
# exercises.
#
# Each destination is checked on its own. Concatenating them and matching one
# pattern — the old form — let a wrong LIB_DEST hide inside the '*' that
# joined them.
case "$LIB_DEST" in
  /home/protected/calmind/lib) ;;
  *) echo "guard: LIB_DEST is not the test lib ($LIB_DEST)" >&2; exit 1 ;;
esac
# The two that would be catastrophic rather than merely wrong are named first,
# so the message says WHICH mistake this is. /home/public/calmind and
# /home/public/dev/calmind are the old PHP suite's areas — still live, and
# nothing in this repo may write them.
#
# `if`, not `[ … ] && { … }`: under `set -e` that form is a list whose status
# is the test's, so the ordinary case (the test being false, which is every
# correct run) is a non-zero list. Whether that ends the script is a question
# about which /bin/sh you are on, and a deploy script should not have one of
# those in it.
if [ "$WEB_DEST" = "/home/public" ]; then
  echo "guard: that is the site root" >&2; exit 1
fi
if [ "$WEB_DEST" = "/home/public/calmind" ] || [ "$WEB_DEST" = "/home/public/dev/calmind" ]; then
  echo "guard: that is the live PHP suite's area, not this app's" >&2; exit 1
fi
case "$WEB_DEST" in
  /home/public/test/calmind) ;;
  *) echo "guard: WEB_DEST is not the test web root ($WEB_DEST)" >&2; exit 1 ;;
esac

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

echo "==> lint"
# php -l exits non-zero PER FILE, but the old form piped every file through one
# grep and ended in `|| true`, so the pipeline's status was grep's — and grep
# SUCCEEDS when it finds a line, i.e. when there are errors. Inverted and then
# discarded: a file with a syntax error printed its error and shipped anyway.
# Proven by breaking store.php and watching the whole thing exit 0.
LINT=$(find server -name '*.php' -print0 | xargs -0 -n1 php -l 2>&1 | grep -v 'No syntax errors' || true)
if [ -n "$LINT" ]; then
  echo "$LINT" >&2
  echo "PHP syntax errors above — not deploying" >&2
  exit 1
fi

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
  if [ "$GESTURES" = 1 ]; then
    echo "==> gestures (--no-gestures to skip)"
    npx playwright test >/dev/null 2>&1 || { echo "gesture suite failed — not deploying (npx playwright test to see it)" >&2; exit 1; }
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

# rsync only creates the final path element, so make the parents first.
if [ -z "$DRY" ]; then
  ssh "$SSH_DEST" "mkdir -p $LIB_DEST $DATA_DEST $WEB_DEST/api"
fi

echo "==> [TEST] server/lib -> $LIB_DEST (config.php never sent)"
rsync -avL $DRY --exclude 'config.php' server/lib/ "$SSH_DEST:$LIB_DEST/"

echo "==> [TEST] api -> $WEB_DEST/api/"
rsync -avL $DRY server/public/api/ "$SSH_DEST:$WEB_DEST/api/"

if [ "$WEB" = 1 ]; then
  # Not `&& [ -d apps/app/dist ]`: a missing export used to skip this block
  # silently, so a run that shipped the API and NO web client still printed
  # "Done". The export is checked above, so getting here without it means
  # something removed it — say so rather than half-deploy quietly.
  [ -d apps/app/dist ] || { echo "apps/app/dist is gone — the API shipped, the web client did not" >&2; exit 1; }
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
    perl -i -pe "s|</head>|<link rel=\"apple-touch-icon\" href=\"$WEB_PATH/apple-touch-icon.png\"/></head>|" apps/app/dist/index.html
  rsync -avL $DRY --exclude 'api' apps/app/dist/ "$SSH_DEST:$WEB_DEST/"
  # index.html must revalidate; the hashed bundles cache forever.
  rsync -avL $DRY server/public/web.htaccess "$SSH_DEST:$WEB_DEST/.htaccess"
fi

# The web user must be able to CREATE the data dir's contents (it owns the data,
# suite-style), and read lib; rsync leaves everything owned by the SSH login, so
# hand the group over. Data contents themselves are never touched.
if [ -z "$DRY" ]; then
  echo "==> [TEST] web-user perms (lib read, data dir writable)"
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
  echo "==> [TEST] proving the served page"
  # Retried once, deliberately. A deploy that has just finished rsyncing can
  # serve a moment of inconsistency — that happened here: four checks red,
  # then 9/9 immediately after with nothing changed. A gate that cries wolf is
  # one people learn to ignore, so the retry exists to tell a settling upload
  # apart from a broken one. It is NOT a way to pass by trying twice: a second
  # failure still stops the deploy, and a first failure is printed either way
  # so an intermittent fault cannot hide behind a green second attempt.
  if ! ./server/tools/smoke-live.sh --static; then
    echo "   first pass failed — giving the upload a moment and re-checking once" >&2
    sleep 5
    ./server/tools/smoke-live.sh --static || {
      echo "the deployed page is wrong — look before shipping further" >&2; exit 1; }
    echo "   (it passed on the retry: the first run caught a settling upload, not a fault)" >&2
  fi
fi

echo "==> Done. Data contents are never touched."
