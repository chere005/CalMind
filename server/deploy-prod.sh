#!/bin/sh
# Deploy the PROD-ONLY files — and only those.
#
# There is no CalMind production INSTANCE. The app is served from
# /test/calmind/ and nothing else; https://seancheren.com/calmind/ is the old
# PHP suite, still live, and this script will not go near it. The one thing
# CalMind legitimately puts at the production domain is the .well-known pair
# that makes native passkeys work, because iOS will only fetch it from the
# apex:
#
#   /home/public/.well-known/apple-app-site-association   (the appID)
#   /home/public/.well-known/.htaccess                    (its Content-Type)
#
# This exists because that deploy was a hand-typed scp out of a README, and a
# hand-typed scp at the production root is the single riskiest command in this
# repo. The .htaccess in particular had been living ONLY on the server — lose
# it and the association file goes back to being served with no Content-Type,
# which silently breaks passkeys on every device with no error anywhere.
#
# Deliberately NOT deploy-test.sh with a `prod` mode. The standing rule is
# that prod is never touched without Sean saying so in that message, and a
# mode flag is one typo away from being chosen by accident. A separate script
# with constant destinations cannot be aimed anywhere else.
#
# Usage:
#   ./server/deploy-prod.sh --dry-run     preview; touches nothing
#   ./server/deploy-prod.sh --yes         do it
#   ./server/deploy-prod.sh --verify      check only what is already live
#
# --yes is required. There is no bare form: this is the production domain
# root, and a script that runs on an empty argv is one stray Enter away.
set -e
cd "$(dirname "$0")/.."

DRY=""; GO=0; VERIFY_ONLY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY="--dry-run" ;;
    --yes)     GO=1 ;;
    --verify)  VERIFY_ONLY=1 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

SRC="server/prod-only"
DEST="/home/public/.well-known"
SITE="https://seancheren.com"

# Constant destination, checked BEFORE deploy.conf is read — the guard is
# about this constant, not about the credentials, so it can be proven on a
# machine that holds neither. See tools/check-deploy-guards.sh.
case "$DEST" in
  /home/public/.well-known) ;;
  *) echo "guard: DEST is not the well-known dir ($DEST)" >&2; exit 1 ;;
esac
# This script writes ONE directory at the production root. Anything that is
# not it, including the root itself, is a refusal rather than a surprise.
if [ "$DEST" = "/home/public" ]; then
  echo "guard: that is the production site root" >&2; exit 1
fi

[ -f server/deploy.conf ] || { echo "server/deploy.conf missing (SSH_DEST=...)" >&2; exit 1; }
. ./server/deploy.conf
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set in server/deploy.conf" >&2; exit 1; }

# What the served result must look like. Checked after a deploy, and on its
# own with --verify — the content type is the half that has actually gone
# wrong before, and it is invisible from the page.
verify() {
  echo "==> verifying $SITE/.well-known/apple-app-site-association"
  code=$(curl -sS -o /tmp/calmind-aasa.json -w '%{http_code}' "$SITE/.well-known/apple-app-site-association")
  type=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE/.well-known/apple-app-site-association")
  fail=0
  [ "$code" = "200" ] || { echo "   ✗ status $code (want 200)" >&2; fail=1; }
  case "$type" in
    application/json*) echo "   ✓ application/json" ;;
    *) echo "   ✗ content-type '$type' — iOS requires application/json, and caches a bad serve for hours" >&2; fail=1 ;;
  esac
  # The appID the phone will be checked against. Compared to the file in the
  # repo rather than to a string typed here, so the two cannot drift.
  want=$(tr -d ' \n\t' < "$SRC/apple-app-site-association")
  got=$(tr -d ' \n\t' < /tmp/calmind-aasa.json)
  if [ "$want" = "$got" ]; then echo "   ✓ the served appID matches $SRC/apple-app-site-association"
  else echo "   ✗ served content differs from the repo's" >&2; fail=1; fi
  rm -f /tmp/calmind-aasa.json
  [ "$fail" = 0 ] || { echo "prod is NOT serving what it should" >&2; exit 1; }
  echo "   (iOS caches this for hours — a fix is not instant on a device that already looked)"
}

if [ "$VERIFY_ONLY" = 1 ]; then verify; exit 0; fi

if [ "$GO" != 1 ] && [ -z "$DRY" ]; then
  echo "This writes the PRODUCTION domain root ($DEST)." >&2
  echo "Re-run with --yes once Sean has said prod in that message, or --dry-run to preview." >&2
  exit 1
fi

echo "==> [PROD] $SRC -> $DEST"
echo "    apple-app-site-association  (the appID iOS checks)"
echo "    .htaccess                   (its Content-Type)"
# Named files, never the directory: prod-only/ also holds a README, and the
# production well-known dir is not a place to sweep a folder into.
if [ -z "$DRY" ]; then
  ssh "$SSH_DEST" "mkdir -p $DEST"
  rsync -avL "$SRC/apple-app-site-association" "$SSH_DEST:$DEST/apple-app-site-association"
  rsync -avL "$SRC/well-known.htaccess" "$SSH_DEST:$DEST/.htaccess"
  ssh "$SSH_DEST" "chmod a+r $DEST/apple-app-site-association $DEST/.htaccess"
  verify
else
  rsync -avL --dry-run "$SRC/apple-app-site-association" "$SSH_DEST:$DEST/apple-app-site-association"
  rsync -avL --dry-run "$SRC/well-known.htaccess" "$SSH_DEST:$DEST/.htaccess"
  echo "    (dry run — nothing changed. --verify checks what is live right now.)"
fi

echo "==> Done. Nothing outside $DEST was touched."
