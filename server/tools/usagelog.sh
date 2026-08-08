#!/bin/sh
# The live test instance's usage log, read over SSH — one tab-separated line
# per authenticated action (see usage_log in server/lib/app.php: time, IP,
# user, action — never any content). The suite's tools/usagelog.sh, for the
# CalMind store.
#
#   server/tools/usagelog.sh             last 50 lines
#   server/tools/usagelog.sh -f          follow it live
#   server/tools/usagelog.sh -n 200      more of it
#   server/tools/usagelog.sh --real      drop smoke/e2e/demo-account noise
#
# The SSH login comes from server/deploy.conf (SSH_DEST=...), like the deploy.

set -e
root="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$root/server/deploy.conf" ] && . "$root/server/deploy.conf"
[ -n "$SSH_DEST" ] || { echo "SSH_DEST not set (server/deploy.conf)" >&2; exit 1; }

LOG="/home/protected/calmind/data/usage.log"
FILTER="cat"
ARGS=""
for a in "$@"; do
    case "$a" in
        --real)
            # The throwaway accounts Claude and the harness make on live.
            TAB="$(printf '\t')"
            FILTER="grep -vE '${TAB}(smoke[0-9a-f]*|probe|e2e[0-9]*|dbg[0-9]*|eye[0-9]*|mt[0-9]*|pill[0-9]*|size[0-9]*|shot[0-9]*|sim[a-z]*)${TAB}'"
            ;;
        *) ARGS="$ARGS $a" ;;
    esac
done
[ -n "$ARGS" ] || ARGS="-n 50"

# shellcheck disable=SC2029 — $ARGS/$LOG expand locally on purpose; FILTER runs remotely.
ssh "$SSH_DEST" "tail $ARGS $LOG | $FILTER"
