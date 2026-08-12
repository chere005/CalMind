#!/bin/sh
# Does TODO.md's suite-counts line still tell the truth?
#
# That line exists because the README used to carry its own numbers and its
# "145 tests" went stale unnoticed. The README points here now — and then the
# line itself went stale, by three, in the session that added the tests. A
# number kept right by remembering to keep it right is the same duplication
# this repo distrusts everywhere else; it just happens to be in prose.
#
# WHAT IT CHECKS: core, gesture, WebKit, server and the deploy guards, each
# measured rather than asserted. The playwright totals come from `--list`, so
# no suite is actually run for them.
#
# WHAT IT DOES NOT, and why, because a checker that quietly covers less than it
# claims is the thing this repo keeps finding:
#   · desktop 7 — needs a full Tauri release build. Counted statically below
#     from smoke.sh's own `ok` calls, which is what the number means.
#   · live 19 — needs the deployed test server (CALMIND_LIVE).
#
#   sh tools/check-suite-counts.sh
set -e
cd "$(dirname "$0")/.."

# TWO lines, not one — the counts wrap, and reading only the first left the
# desktop and deploy-guard claims empty while reporting them as mismatches.
LINE=$(grep -A1 -E '^core \*\*[0-9]+\*\* · gesture' TODO.md | tr '\n' ' ' || true)
[ -n "$LINE" ] || { echo "TODO.md has no suite-counts line starting 'core **N** · gesture'" >&2; exit 1; }

claim() { printf '%s' "$LINE" | grep -oE "$1 \*\*[0-9]+\*\*" | grep -oE '[0-9]+'; }

BAD=0
cmp_count() { # name, claimed, actual
  if [ "$2" = "$3" ]; then
    printf '  \033[32m✓\033[0m %-14s %s\n' "$1" "$3"
  else
    printf '  \033[31m✗\033[0m %-14s TODO says %s, actually %s\n' "$1" "$2" "$3"
    BAD=$((BAD + 1))
  fi
}

# Playwright's --list prints one indented line per test; the skipped one is
# listed too, which is why the line reads "N (+1 skipped)" and the claim below
# is compared against the PASSING count.
listed() { npx playwright test --list ${2:+-c "$2"} 2>/dev/null | grep -cE '^  [a-z].*spec\.ts:[0-9]+'; }
SKIPPED=$(grep -rlE 'test\.skip\(' e2e/*.spec.ts | wc -l | tr -d ' ')

cmp_count core "$(claim core)" \
  "$(npx vitest run --root packages/core 2>&1 | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
cmp_count gesture "$(claim gesture)" "$(( $(listed) - SKIPPED ))"
cmp_count WebKit "$(claim WebKit)" "$(listed x playwright.webkit.config.ts)"
cmp_count server "$(claim server)" \
  "$(php server/tools/test.php 2>&1 | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
cmp_count 'deploy guards' "$(printf '%s' "$LINE" | grep -oE 'deploy guards \*\*[0-9]+\*\*' | grep -oE '[0-9]+')" \
  "$(sh tools/check-deploy-guards.sh 2>&1 | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"

# Static, so it costs nothing and still catches a check being added or removed.
# `ok` is called inline as well as at the start of a line — `[ -x "$BIN" ] &&
# ok "..."` — so anchoring the pattern undercounts, which it did.
cmp_count desktop "$(claim desktop)" "$(grep -oE 'ok "' desktop/smoke.sh | wc -l | tr -d ' ')"

echo
if [ "$BAD" -gt 0 ]; then
  echo "$BAD count(s) stale in TODO.md — the README points at that line." >&2
  exit 1
fi
echo "suite counts: TODO.md agrees with the suites."
