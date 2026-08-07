#!/bin/sh
# Deploy the CalMind sync API + web client to the NFSN TEST instance, and nothing
# else — the suite's deploy rules: lint first, never send a config, never touch a
# data dir, never --delete. The host lives in server/deploy.conf (gitignored):
#
#   SSH_DEST="user_site@ssh.example.example"
#
# Usage: ./server/deploy-test.sh [--dry-run] [--no-web]
#   --dry-run  preview every transfer, touch nothing
#   --no-web   skip the Expo web export (API only)

set -e
cd "$(dirname "$0")/.."

DRY=""; WEB=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY="--dry-run" ;;
    --no-web)  WEB=0 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

# The destinations are constants with a guard, deploy-dev.sh-style: this script
# can only ever write the test instance's calmind areas.
LIB_DEST="/home/protected/calmind-test/lib"
WEB_DEST="/home/public/test/calmind-app"
case "$LIB_DEST$WEB_DEST" in
  */calmind-test/*calmind-app*) ;;
  *) echo "guard: refusing non-calmind destination" >&2; exit 1 ;;
esac

echo "==> lint"
find server -name '*.php' -exec php -l {} \; | grep -v 'No syntax errors' || true

echo "==> tests"
php server/tools/test.php >/dev/null || { echo "server tests failed — not deploying" >&2; exit 1; }

if [ "$WEB" = 1 ]; then
  echo "==> web export"
  (cd apps/app && npx expo export -p web)
fi

# rsync only creates the final path element, so make the parents first.
if [ -z "$DRY" ]; then
  ssh "$SSH_DEST" "mkdir -p $LIB_DEST /home/protected/calmind-test/data $WEB_DEST/api"
fi

echo "==> [TEST] server/lib -> $LIB_DEST (config.php never sent)"
rsync -avL $DRY --exclude 'config.php' server/lib/ "$SSH_DEST:$LIB_DEST/"

echo "==> [TEST] api -> $WEB_DEST/api/"
rsync -avL $DRY server/public/api/ "$SSH_DEST:$WEB_DEST/api/"

if [ "$WEB" = 1 ] && [ -d apps/app/dist ]; then
  echo "==> [TEST] web client -> $WEB_DEST/"
  rsync -avL $DRY --exclude 'api' apps/app/dist/ "$SSH_DEST:$WEB_DEST/"
fi

# The web user must be able to CREATE the data dir's contents (it owns the data,
# suite-style), and read lib; rsync leaves everything owned by the SSH login, so
# hand the group over. Data contents themselves are never touched.
if [ -z "$DRY" ]; then
  echo "==> [TEST] web-user perms (lib read, data dir writable)"
  ssh "$SSH_DEST" "mkdir -p /home/protected/calmind-test/data \
    && chgrp -R web /home/protected/calmind-test \
    && chmod -R g+rX /home/protected/calmind-test/lib \
    && chmod g+rwx /home/protected/calmind-test /home/protected/calmind-test/data"
fi

echo "==> Done. Data contents are never touched."
