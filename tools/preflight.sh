#!/bin/sh
# preflight — run the Release workflow's builds on the commit you are ABOUT to tag, before tagging it, so a break that only
# a Windows, macOS or Linux runner can show is found here and not in a tagged release (and a red run mails nobody: in
# preflight mode every job is continue-on-error, so the run itself stays green).
#
#   sh tools/preflight.sh            the current HEAD; the expected tag is the version in the four version files
#   sh tools/preflight.sh 1.37.0     ...and check that the files carry that version
#
# What it does: pushes HEAD to refs/heads/preflight/<sha7> (a branch push triggers nothing; the workflows only react to tags
# and manual runs), dispatches `Release` there with preflight=true, finds that run, waits for it, reads each job's
# conclusion, prints PASS or FAIL naming the failed jobs and steps, and ALWAYS deletes the preflight branch again.
# Exit 0 = pass, 1 = a job failed or the run did not finish, 2 = could not start (usage, dirty tree, no gh).
#
# Needs: gh (logged in), and .github/workflows/release.yml already on the default branch (GitHub only dispatches a
# workflow it knows from there; the file on the branch is what then runs).
#
# Works in Git Bash on Windows, and on macOS and Linux: POSIX sh, and a GNU-or-BSD date.
set -eu
cd "$(dirname "$0")/.."

TAG="${1:-}"
case "$TAG" in -*) echo "usage: sh tools/preflight.sh [tag]" >&2; exit 2 ;; esac

command -v gh >/dev/null 2>&1 || { echo "preflight: gh is not installed" >&2; exit 2; }

# owner/repo from origin, so a fork preflights itself.
REPO="${PREFLIGHT_REPO:-$(git remote get-url origin | sed -e 's|\.git$||' -e 's|.*[:/]\([^/]*/[^/]*\)$|\1|')}"
[ -n "$REPO" ] || { echo "preflight: cannot work out owner/repo from origin" >&2; exit 2; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "preflight: commit first - what is checked is the commit, and the tree has uncommitted changes" >&2
  exit 2
fi
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short=7 HEAD)
BRANCH="preflight/$SHORT"

cleanup() {
  git push -q origin --delete "$BRANCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "preflight: pushing HEAD ($SHORT) to origin as $BRANCH"
git push -q origin "HEAD:refs/heads/$BRANCH" --force

# Two minutes of slack: a machine's clock is rarely GitHub's (this one has run ~17 s ahead, and a run it had just
# started was taken for an older one and never found). The run is still this branch, this commit and a manual dispatch.
BEFORE=$(date -u -d '-120 seconds' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-120S +%Y-%m-%dT%H:%M:%SZ)

if [ -n "$TAG" ]; then
  gh workflow run release.yml --repo "$REPO" --ref "$BRANCH" -f preflight=true -f "tag=$TAG" >/dev/null \
    || { echo "preflight: could not dispatch Release (is release.yml on the default branch yet?)" >&2; exit 2; }
else
  gh workflow run release.yml --repo "$REPO" --ref "$BRANCH" -f preflight=true >/dev/null \
    || { echo "preflight: could not dispatch Release (is release.yml on the default branch yet?)" >&2; exit 2; }
fi

RUN=""
i=0
while [ "$i" -lt 30 ]; do
  RUN=$(gh run list --repo "$REPO" --workflow release.yml --branch "$BRANCH" --event workflow_dispatch --limit 10 \
    --json databaseId,headSha,createdAt \
    --jq "[.[] | select(.headSha == \"$SHA\" and .createdAt >= \"$BEFORE\")][0].databaseId // empty" 2>/dev/null || true)
  [ -n "$RUN" ] && break
  i=$((i + 1))
  sleep 4
done
if [ -z "$RUN" ]; then
  echo "preflight: the run did not appear (look at https://github.com/$REPO/actions)" >&2
  exit 1
fi
echo "preflight: https://github.com/$REPO/actions/runs/$RUN"

# `gh run watch` can drop on a network blip; keep asking until the run says it is completed (or give up after ~90 min).
gh run watch "$RUN" --repo "$REPO" --interval 30 >/dev/null 2>&1 || true
n=0
STATUS=""
while [ "$n" -lt 60 ]; do
  STATUS=$(gh run view "$RUN" --repo "$REPO" --json status --jq .status 2>/dev/null || true)
  [ "$STATUS" = "completed" ] && break
  n=$((n + 1))
  sleep 30
done
if [ "$STATUS" != "completed" ]; then
  echo "preflight: FAIL - the run did not finish (status: ${STATUS:-unknown}): https://github.com/$REPO/actions/runs/$RUN"
  exit 1
fi

JOBS=$(gh run view "$RUN" --repo "$REPO" --json jobs --jq '.jobs[] | [.name, (.conclusion // "none")] | @tsv')
echo "$JOBS" | sed 's/^/  /'
# A job counts as failed when its conclusion is not success/skipped, or when any of its steps failed (a job-level
# continue-on-error may report the job itself as a success). The summary job is bookkeeping and never decides.
FAILED_STEPS=$(gh run view "$RUN" --repo "$REPO" --json jobs \
  --jq '.jobs[] | select(.name != "Preflight summary") | .name as $j | .steps[] | select(.conclusion == "failure") | "  failed: \($j) > \(.name)"')
FAILED_JOBS=$(echo "$JOBS" | awk -F'\t' '$1 != "Preflight summary" && $2 != "success" && $2 != "skipped" { print "  failed: " $1 " (" $2 ")" }')
if [ -n "$FAILED_STEPS" ] || [ -n "$FAILED_JOBS" ]; then
  echo "preflight: FAIL"
  [ -n "$FAILED_JOBS" ] && echo "$FAILED_JOBS"
  [ -n "$FAILED_STEPS" ] && echo "$FAILED_STEPS"
  echo "  logs: gh run view $RUN --repo $REPO --log-failed"
  exit 1
fi
echo "preflight: PASS ($SHORT may be tagged)"
