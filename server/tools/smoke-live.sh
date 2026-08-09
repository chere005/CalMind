#!/bin/sh
# The live smoke: drive the DEPLOYED instance over real HTTPS.
#
# The three local runs prove the behaviour; they cannot prove the deploy. Real
# Apache, the htaccess, the server's PHP and its timezone, TLS — none of that
# is in the picture until the thing is actually deployed, and every bug this
# has caught lived exactly there. The last one was the server keeping UTC, so
# the widget spent every evening after 7pm Chicago calling tomorrow "today".
#
#   ./server/tools/smoke-live.sh                 # the test instance
#   ./server/tools/smoke-live.sh https://host/x  # somewhere else
#   ./server/tools/smoke-live.sh --static        # the served page only
#
# The full run signs up a throwaway account and leaves it behind — there is no
# delete-account endpoint and this is not the place to invent one. The name is
# printed at the end so the residue is never a surprise. `--static` checks only
# what the deploy just uploaded and creates NOTHING, which is why deploy-test.sh
# can run it every time without piling up accounts.
set -e
cd "$(dirname "$0")/../.."

STATIC=0
case "$1" in --static) STATIC=1; shift ;; esac
BASE="${1:-https://seancheren.com/test/calmind}"
API="$BASE/api/index.php"
U="smoke$(date +%s)"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
is()   { [ "$2" = "$3" ] && ok "$1" || bad "$1 — wanted '$3', got '$2'"; }

post() { curl -sS -X POST "$API" -H 'Content-Type: application/json' ${2:+-H "Authorization: Bearer $2"} -d "$1"; }
jq1()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }

echo "live smoke → $BASE"
echo

echo "the page it serves"
HEAD=$(curl -sS "$BASE/index.html")
case "$HEAD" in *viewport-fit=cover*) ok "viewport-fit=cover (iOS pads for the notch)" ;; *) bad "viewport-fit=cover missing" ;; esac
case "$HEAD" in *black-translucent*)   ok "the translucent status bar style" ;;    *) bad "status-bar style missing" ;; esac
case "$HEAD" in *manifest.webmanifest*) ok "the manifest is linked" ;;             *) bad "manifest link missing" ;; esac
# The page's own background. Unset means white, and viewport-fit=cover lets
# that show in BOTH safe areas — which is how a white band appeared under the
# tab bar the moment the top strip was fixed.
case "$HEAD" in *calmind-bg*) ok "the page paints its own background" ;;           *) bad "no page background — the safe areas will come out white" ;; esac
MTYPE=$(curl -sS -o /dev/null -w '%{content_type}' "$BASE/manifest.webmanifest")
is "the manifest's content type" "$MTYPE" "application/manifest+json"
for ICON in icon-192.png icon-512.png apple-touch-icon.png; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/$ICON")
  is "$ICON serves" "$CODE" "200"
done

# The relying-party id a passkey is bound to. It is derived from the request
# host rather than configured, which is the safer default and also the one
# failure nobody would see coming: get it wrong and every passkey on every
# device stops working at once, with no error until someone tries to sign in.
# Needs no account — login_begin is deliberately answerable to anyone.
HOST=$(printf '%s' "$BASE" | sed -e 's#^https\{0,1\}://##' -e 's#[:/].*##')
RPID=$(post '{"action":"passkey_login_begin"}' | jq1 rpId)
is "passkeys are bound to this domain" "$RPID" "$HOST"

if [ "$STATIC" = 1 ]; then
  echo
  echo "────────────────────────────────"
  echo "$PASS passed, $FAIL failed (served page only; no account made)"
  [ "$FAIL" -eq 0 ] || exit 1
  exit 0
fi

echo
echo "the API, end to end"
TOK=$(post "{\"action\":\"signup\",\"username\":\"$U\",\"email\":\"$U@example.com\",\"password\":\"smoke-pw-123\"}" | jq1 token)
[ -n "$TOK" ] && ok "signup issues a token" || { bad "signup failed"; echo; echo "$PASS passed, $((FAIL+1)) failed"; exit 1; }

CHI=$(TZ=America/Chicago date +%Y-%m-%d)
NOW=$(python3 -c 'import time;print(int(time.time()*1000))')
SYNC=$(post "{\"action\":\"sync\",\"cursor\":0,\"changes\":[
 {\"id\":\"f1\",\"type\":\"folder\",\"updated\":$NOW,\"payload\":{\"name\":\"Smoke\",\"color\":\"#34d399\",\"ord\":\"a\",\"app\":\"reminders\"}},
 {\"id\":\"s1\",\"type\":\"section\",\"updated\":$NOW,\"payload\":{\"name\":\"General\",\"folderId\":\"f1\",\"ord\":\"a\"}},
 {\"id\":\"r1\",\"type\":\"reminder\",\"updated\":$NOW,\"payload\":{\"text\":\"live smoke row\",\"due\":\"$CHI\",\"time\":\"15:30\",\"done\":false,\"repeat\":null,\"folderId\":\"f1\",\"sectionId\":\"s1\",\"indent\":0,\"ord\":\"a\"}}
]}" "$TOK")
is "sync takes the batch" "$(echo "$SYNC" | jq1 cursor)" "3"

WT=$(post '{"action":"widget_token"}' "$TOK" | jq1 token)
[ -n "$WT" ] && ok "a widget token mints" || bad "no widget token"

curl -sS "$API?feed=1&t=$WT&cals=all" -o /tmp/calmind-smoke-feed.json
FEED_TODAY=$(jq1 today < /tmp/calmind-smoke-feed.json)
# THE ONE THAT MATTERS: the server's day must be Chicago's, not UTC's. These
# differ for five hours every evening, which is exactly when it went wrong.
is "the feed's day is Chicago's" "$FEED_TODAY" "$CHI"
ROW=$(python3 -c "
import json;d=json.load(open('/tmp/calmind-smoke-feed.json'))
rows=(d.get('days') or {}).get(d.get('today'),[])
print(next((r.get('time','') for r in rows if r.get('text')=='live smoke row'),''))
")
is "the row is on today, its time spoken" "$ROW" "3:30pm"

BADTOK=$(curl -sS -o /dev/null -w '%{http_code}' "$API?feed=1&t=notatoken&cals=all")
is "a bad feed token is refused" "$BADTOK" "401"

post '{"action":"logout"}' "$TOK" > /dev/null
GONE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOK" -d '{"action":"whoami"}')
is "logout revokes the token" "$GONE" "401"

rm -f /tmp/calmind-smoke-feed.json
echo
echo "────────────────────────────────"
echo "$PASS passed, $FAIL failed"
echo "residue: account '$U' (no delete-account endpoint; token revoked)"
[ "$FAIL" -eq 0 ] || exit 1
