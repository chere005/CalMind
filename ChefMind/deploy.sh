#!/bin/sh
# Deploy ChefMind — the web client, to production, and nothing else.
#
#   ./ChefMind/deploy.sh --dry-run          preview every transfer
#   ./ChefMind/deploy.sh --yes-prod         do it
#   ./ChefMind/deploy.sh --verify           check what is already live
#
# WHY A SEPARATE SCRIPT rather than a target in server/deploy.sh. That script
# ships an API and a web client to one of three CalMind instances, and every
# path it can write is in its own table. ChefMind writes ONE directory, has no
# API of its own, and its destination is the production document root — so it
# gets deploy-prod.sh's treatment: constant destinations, a spelled-out flag,
# and no bare form. A script that cannot be aimed cannot be misaimed.
#
# There is no test instance. Sean, 2026-08-21: "this will be deployed straight
# away to seancheren.com/ChefMind". The gates below are therefore the whole of
# the rehearsal, which is why they are not optional.
#
# The host lives in server/deploy.conf (gitignored), shared with CalMind's.
set -e
# Resolved BEFORE the cd, because the re-entrant --verify call below needs a
# path that is still correct from the repo root — $0 as given is relative to
# wherever this was invoked from.
SELF=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
cd "$(dirname "$0")/.."

DRY=""; GO=0; VERIFY_ONLY=0
for a in "$@"; do
  case "$a" in
    --dry-run)  DRY="--dry-run" ;;
    --yes-prod) GO=1 ;;
    --verify)   VERIFY_ONLY=1 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

# Constants. Nothing below builds a path from an argument.
WEB_DEST="/home/public/ChefMind"
SITE_URL="https://seancheren.com/ChefMind"
# The API this client talks to. CalMind's, on purpose — same accounts, and the
# data is kept apart by the sync space rather than by a second server.
API_URL="https://seancheren.com/calmind/api/index.php"
SPACE="chef"

# The guards run BEFORE deploy.conf is read, so tools/check-deploy-guards.sh
# can prove them on a machine with no SSH_DEST and no network.
#
# The three named first are the ones that would be catastrophic rather than
# merely wrong: the site root, and CalMind's own two live areas. `if`, not
# `[ … ] && { … }` — under `set -e` that form is a list whose status is the
# test's, so the ordinary case (false, which is every correct run) would end
# the script.
if [ "$WEB_DEST" = "/home/public" ]; then
  echo "guard: that is the site root" >&2; exit 1
fi
if [ "$WEB_DEST" = "/home/public/calmind" ] || [ "$WEB_DEST" = "/home/public/dev/calmind" ] || [ "$WEB_DEST" = "/home/public/test/calmind" ]; then
  echo "guard: that is CalMind's area, not this app's" >&2; exit 1
fi
case "$WEB_DEST" in
  /home/public/ChefMind) ;;
  *) echo "guard: WEB_DEST is not ChefMind's web root ($WEB_DEST)" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------- the API gate
#
# THE ONE THAT PROTECTS SEAN'S DATA, and the reason it runs before anything
# else that costs time.
#
# ChefMind syncs into CalMind's server and is kept separate by sending
# space='chef'. An API that does not know that parameter IGNORES it — and then
# every ChefMind record lands in CalMind's own store, and every CalMind record
# comes back into ChefMind. Nothing errors. It would be found weeks later, by
# a reminders list with recipes in it, and by then the two are one file.
#
# So: ask the live API what spaces it knows, and refuse to ship if the answer
# does not name ours. `spaces` is public for exactly this, because a deploy
# holds no credentials.
api_spaces() {
  curl -sS --max-time 20 -X POST "$API_URL" \
    -H 'Content-Type: application/json' -d '{"action":"spaces"}' 2>/dev/null
}
check_api() {
  echo "==> API gate: does $API_URL know the '$SPACE' space?"
  ANSWER=$(api_spaces || true)
  if ! printf '%s' "$ANSWER" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if '$SPACE' in (d.get('spaces') or []) else 1)
"; then
    echo "" >&2
    echo "REFUSING: the live API does not report the '$SPACE' space." >&2
    echo "  answered: ${ANSWER:-<nothing>}" >&2
    echo "" >&2
    echo "ChefMind sends space='$SPACE' on every sync. An API that does not know it" >&2
    echo "ignores the parameter and writes ChefMind's records into CalMind's store." >&2
    echo "Deploy the API first:  ./server/deploy.sh prod --yes-prod" >&2
    exit 1
  fi
  echo "    it does."
}

if [ "$VERIFY_ONLY" = 1 ]; then
  check_api
  echo "==> verifying what is live at $SITE_URL"
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$SITE_URL/index.html")
  [ "$CODE" = "200" ] || { echo "the page answers $CODE" >&2; exit 1; }
  HEAD=$(curl -sS "$SITE_URL/index.html")
  FAIL=0
  for NEEDLE in 'viewport-fit=cover' 'black-translucent' 'manifest.webmanifest' 'chefmind-bg' 'navigator.serviceWorker.register'; do
    case "$HEAD" in
      *"$NEEDLE"*) printf '  \033[32m✓\033[0m %s\n' "$NEEDLE" ;;
      *) printf '  \033[31m✗\033[0m %s\n' "$NEEDLE"; FAIL=1 ;;
    esac
  done
  # It must NOT be CalMind. One origin, two apps, and an index.html copied to
  # the wrong directory would look entirely healthy above.
  case "$HEAD" in
    *'<title>ChefMind</title>'*) printf '  \033[32m✓\033[0m it is ChefMind\n' ;;
    *) printf '  \033[31m✗\033[0m that is not ChefMind'"'"'s page\n'; FAIL=1 ;;
  esac
  [ "$FAIL" -eq 0 ] || exit 1
  echo "live and correct."
  exit 0
fi

if [ "$GO" != 1 ] && [ -z "$DRY" ]; then
  echo "refusing: this writes the production document root. --yes-prod, spelled out." >&2
  echo "  (--dry-run previews; --verify checks what is already there)" >&2
  exit 1
fi

check_api

echo "==> typecheck"
TSLOG=$(mktemp)
for P in ChefMind/packages/core ChefMind/app; do
  if ! npx tsc --noEmit -p "$P" >"$TSLOG" 2>&1; then
    cat "$TSLOG" >&2; rm -f "$TSLOG"
    echo "$P typecheck failed — not deploying" >&2; exit 1
  fi
done
rm -f "$TSLOG"

echo "==> core tests"
( cd ChefMind && npm run test:core --silent >/dev/null 2>&1 ) \
  || { echo "core tests failed — not deploying" >&2; exit 1; }

# The API is CalMind's, so ITS suite is the one that gates the behaviour this
# client depends on — the sync space above all. Running it here means ChefMind
# cannot ship against a server whose own tests are red.
echo "==> server tests (the API this client talks to is CalMind's)"
php server/tools/test.php >/dev/null \
  || { echo "server tests failed — not deploying" >&2; exit 1; }

echo "==> web export"
( cd ChefMind && npm run export:web >/dev/null ) \
  || { echo "the export failed — not deploying" >&2; exit 1; }
node ChefMind/tools/patch-web-html.mjs ChefMind/app/dist/index.html

[ -f ChefMind/app/dist/index.html ] || { echo "the export produced no dist/index.html — not deploying" >&2; exit 1; }
# Read the bundle out of index.html rather than globbing: dist holds more than
# one index-*.js (the entry bundle and an async chunk) and `find | head -1`
# picks between them arbitrarily.
BUNDLE=$(grep -o 'index-[a-zA-Z0-9]*\.js' ChefMind/app/dist/index.html | head -1)
[ -n "$BUNDLE" ] || { echo "dist/index.html names no bundle — not deploying" >&2; exit 1; }
echo "    bundle: $BUNDLE"

# The client must be the one that sends the space. A build that lost the line
# would pass every check above and still merge two stores.
grep -q "space" ChefMind/app/src/api.ts || { echo "api.ts no longer sends a space — not deploying" >&2; exit 1; }
if ! grep -q "\"$SPACE\"\|'$SPACE'" "ChefMind/app/dist/_expo/static/js/web/$BUNDLE"; then
  echo "the exported bundle does not contain the space string — not deploying" >&2
  exit 1
fi
echo "    the bundle carries space='$SPACE'"

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

echo "==> icons"
# iOS reads apple-touch-icon, which expo does not emit; the manifest names the
# other two.
sips -z 180 180 ChefMind/app/assets/icon.png --out ChefMind/app/dist/apple-touch-icon.png >/dev/null 2>&1
sips -z 192 192 ChefMind/app/assets/icon.png --out ChefMind/app/dist/icon-192.png >/dev/null 2>&1
sips -z 512 512 ChefMind/app/assets/icon.png --out ChefMind/app/dist/icon-512.png >/dev/null 2>&1
perl -i -pe "s|<link rel=\"apple-touch-icon\"[^>]*/?>||g" ChefMind/app/dist/index.html
perl -i -pe "s|</head>|<link rel=\"apple-touch-icon\" href=\"/ChefMind/apple-touch-icon.png\"/></head>|" ChefMind/app/dist/index.html
ICOV=$(shasum ChefMind/app/dist/favicon.ico | cut -c1-8)
perl -i -pe "s|favicon\.ico(\?v=[0-9a-f]*)?|favicon.ico?v=$ICOV|" ChefMind/app/dist/index.html

echo "==> web client -> $WEB_DEST/"
# No --delete, ever. .sources.json is this machine's record of what the export
# was built from and has no business being served.
rsync -avL $DRY --exclude '.sources.json' ChefMind/app/dist/ "$SSH_DEST:$WEB_DEST/"
# index.html must revalidate; the hashed bundles cache forever. CalMind's
# htaccess, because the rule is about the shape of the files and both apps
# have the same shape.
rsync -avL $DRY server/public/web.htaccess "$SSH_DEST:$WEB_DEST/.htaccess"

if [ -z "$DRY" ]; then
  echo "==> proving the served page"
  # Retried once: an upload that has just finished can serve a moment of
  # inconsistency, and a gate that cries wolf is one people learn to ignore.
  # A second failure still stops the deploy.
  if ! sh "$SELF" --verify; then
    echo "   first pass failed — giving the upload a moment and re-checking once" >&2
    sleep 5
    sh "$SELF" --verify || { echo "the deployed page is wrong" >&2; exit 1; }
  fi
fi

echo "==> Done. $SITE_URL"
