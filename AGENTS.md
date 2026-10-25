# Working on CalMind

The baseline for all of Sean's repos lives in ~/GIT/AgentSuite/AGENTS.md
and is imported here; this file holds only what is true of THIS repo.
@../AgentSuite/AGENTS.md

Calendar/reminders/notes/habits/recipes app. Docs: `ARCHITECTURE.md` (map), `TESTING.md`, `PARITY.md`, `TODO.md` (live list; holds suite counts — write no number in prose).

## Rules

- **Core:** behavior lives in `packages/core`, with a test; screens hold plumbing only. **Spec:** `spec/*.json` vectors are the contract — amend a vector first, never edit a test to match new code.
- **Old suite:** the pre-split code is history; grep `git -C ~/GIT/seancheren-site grep -n '<pattern>' e9b9f28 -- calmind lib` (not the checkout). Its code, not that repo's CLAUDE.md, is the spec.
- **Web first:** deploy web BEFORE building/installing the phone or watch app (gates run in the web deploy; the app needs the server it expects).
- **Deploy = PROD:** `./server/deploy.sh prod test --yes-prod [--quick]` ships both instances off one gate run; `--yes-prod` stays mandatory and spelled out.
- **`./server/deploy-prod.sh`:** separate; the only prod `.well-known` passkey payload; `--yes` writes, `--verify` is read-only. See `tools/check-deploy-guards.sh`.
- **Lanes:** `npm run dtp` (quick: `--quick` gates + spot test) / `npm run tdtp` (between-runs suite first, full gesture+WebKit gates in deploy). Order is in Platforms; do not restate it. **Lane flags:** `--mac`/`--ios`/`--android` build only that one; `--web` = release, no platform builds; none = all three.
- **Status card:** each run reports start/finish to seancheren.com/status, never fatally; if `MIND_RUN_ID` is set, CoreMind's `dtp all` owns the one card and this lane defers.
- **Exit code:** the lane ends non-zero when a device build is owed (release still shipped, card closed `ok` severity 2); CoreMind's batch continues to later repos.
- **Sibling repos:** ChefMind (github.com/chere005/ChefMind) and MyCalMind (github.com/chere005/MyCalMind) live at `~/GIT/ChefMind`, `~/GIT/MyCalMind`; they are CLONES — fixes land here first, then copied down deliberately. **ChefMind sync:** ChefMind syncs through THIS server (`chef` space) and reads this checkout as `$CALMIND_REPO`; changes to `server/lib` must keep the space contract or its gates break.
- **Widget page = write:** opening the Scriptable widget feed page on Sean's account mutates his token store; treat as a write to his data.
- **Core drift gate:** `check-drift.sh` must pass or the lane refuses and names the copy-down; the lane never rewrites source mid-release.
- Use Sean's own recipe notes/shapes (read via the app or round-tripped through core), not invented cards; every real recipe bug came from his.

## Commands

```sh
npm install                       # once, at the root — npm workspaces
npm run test:dev                  # between-runs suite: 2 typechecks, core, server, counts (~30s)
npm test                          # core + server only
npm run typecheck                 # tsc --noEmit over packages/core AND apps/app, separately
```

```sh
npm run test:core -- order               # vitest, by test-FILE substring
npm run test:core -- order -t "inverted" # …and by test name
npm run export:web && npx playwright test e2e/callist.spec.ts
npx playwright test e2e/callist.spec.ts -g "groups by day"
```

```sh
php -S 127.0.0.1:8788 -t server/public   # the API; data in server/data/ or $CALMIND_DATA_DIR
npm run web                              # Expo web on :8081, talking to :8788
npm run export:web                       # export + tools/patch-web-html.mjs — never a bare expo export
```

- Core vitest needs `TZ=America/Chicago`; bare `vitest` turns date tests red after 7pm. `php server/tools/test.php`: all-or-nothing, boots its own `php -S` on a scratch dir; never run beside another suite.
- Playwright drives `apps/app/dist`, not source: `e2e/freshness.ts` refuses a stale export, so re-run `npm run export:web` after any edit. One worker, 420×900 Chromium, `php -S` on 8790, wiped data dir.
- Deploy shards e2e: 8790, 8793 (8794 with `CALMIND_E2E_SHARDS=3`), WebKit on 8791; each has its own server, data dir, `test-results-<port>`. Specs take ports from `e2e/port.ts`, never literals (`e2e/portguard.spec.ts` fails on one).
- Nothing else may hold 8790/8791/8793/8794 during a deploy (AcctMind's harness uses 8791); two runs on one port fight.
- No lint script; the deploy runs `find server -name '*.php' -print0 | xargs -0 -n1 php -l`. `npx playwright install webkit` once before `npm run test:webkit`.
- `test:watch`/`test:widget` need `swift` and `python3` (they lift real Swift from `apps/app/targets`).

## Architecture

- `@calmind/core` is consumed as TS SOURCE (`./src/index.ts`), no deps, no build: live in metro/tsc at once, NOT in `apps/app/dist` until export. Swift/Kotlin cores replay the same spec vectors; the 12/24-hour clock has three implementations (watch, complication, widget decode `watchFeed` JSON) plus a seam check.
- `apps/app/src/store.tsx` is the only stateful seam (context around core's `SyncEngine`); drag order is `payload.ord` (fractional key), since array position can't survive per-record merge. Server is dumb: `server/public/api/index.php` fronts `server/lib/app.php`, merges by CLEAR metadata only; `payload` is opaque, encrypted at rest (`ENC1:`). A feature needing server payload reads is client logic or new clear metadata.
- prod/test/dev differ only by path on one origin and localStorage ignores paths, so session/snapshot keys carry an `instanceTag` from the API URL; `apps/app/src/config.ts` alone picks the API (same-origin, `127.0.0.1:8788` for metro, PROD for native/desktop).

## Platforms

CalMind is the origin app and the only suite repo with a full production server. Shared fixes land here, get promoted to CoreMind canon, and CoreMind propagates canon OUT to all four consumers, this one included.

- **Web** — own production server; the only app Sean's devices, browser and public request link hit directly.
- **macOS** — Tauri bundle (`desktop/`), built by `tools/build-platforms.sh --mac` BEFORE the tag; a failed build leaves the version untagged and a re-run reuses it.
- **Version lives in FOUR files** (root `package.json` is not one): `apps/app/app.json`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` (`version = "x"`, not JSON). The lane writes and GREPS each (a no-match `perl -i` exits 0); lockfile syncs separately and refuses if more than version lines changed.
- **Windows, macOS dmg, Linux** — a pushed bare version tag (`1.37.0`, no `v`) runs `.github/workflows/release.yml`: msi+exe, Apple-silicon dmg and deb+AppImage land on ONE GitHub Release with `SHA256SUMS.txt`, published only when all are there. The tag must equal the version in the four files. Existing tag: `gh workflow run Release -f tag=<tag>`. **No `actions/upload-artifact`** (Actions artifact quota is full); ARCHITECTURE.md "Releases" has the rest.
- **iOS** — `tools/build-platforms.sh --ios` (devicectl) after the push, never fatal; installs to ALL three paired phones (Sean's `iPhoooooone`, Autumn's, Patricia's): one build, per-phone install, warn on refusal, fail only if none took it. `IOS_DEVICE` narrows to one. **iOS cap/registering:** no per-phone app cap (team 2LGYTL3FSJ is PAID, profile `TimeToLive 365`). Unregistered phone → devicectl provisioning error → run `IOS_DEVICE='Its Name' sh tools/build-platforms.sh --ios` once.
- **Android** — `tools/build-platforms.sh --android` builds, installs and launches on a local emulator.
- **Order:** drift gate → prod+test deploy → Mac bundle → `tools/preflight.sh` (the Release builds on this commit, no publish; `--skip-preflight` only if GitHub is down) → tag → push → watched Release run → device builds, one at a time. A failed Release after the tag leaves the deploy live: the lane reports `gh run rerun <id> --failed` and ends non-zero. Each block runs under `tools/heavy-lock.sh` (CoreMind canon: source it, never edit); it only sees builds that take it (not other lockless builds, Test* forks, hand/Xcode builds). CoreMind's `bin/build-platforms.sh` is the fallback for a checkout predating this one; `bin/dtp.sh all` delegates to each app's lane.

## Traps

- **`click()` on a gone control** waits out the whole test budget and reads as a hang → give speculative clicks `click({ timeout: 1_500 }).catch(() => {})`.
- **Checks that cannot fail** (empty-string grep, test blind to disabled `openssl_verify`, PHP spec `json_decode`-ing an ENCRYPTED store, absence assertion on a missing container) → break the guarded thing and watch it go red first.
- **`dist` holds several `index-*.js`** (entry + async chunk); `find … | head -1` is arbitrary → read the name from `dist/index.html`; compare index.html to index.html for "did the deploy land".
- **`npm run test:deploy` makes the export look stale:** it appends to `packages/core/src/order.ts` and restores via `cp` (new mtime), so the next gesture/WebKit run dies in `e2e/freshness.ts` naming `order.ts` → clean `git diff` means mtime only; re-export; run `test:deploy` last.
- **Comments state intent, code may have drifted** (widget key rotating despite "handed out once"; login page not always rendering its theme) → read both.
- **Phone-only bugs:** RN `Modal` is its own window outside the safe area, so absolute positioning sits under the clock; browsers can't show it → check on the simulator. **Tap targets:** measure from the real screenshot (`xcrun simctl io <udid> screenshot`), divide by scale; the shown image is resized. **`hitSlop` is a no-op in react-native-web** → measure the drawn box. Fix with padding + negative margin, but when border/`borderRadius` sit on the pressable, move the visual to an inner View. **Offset-from-own-edge clicks prove nothing** (pass with or without the bug) → measure from the centre outward by a justified distance.
- **Failed writes are silent** (oversized record dropped while "synced", damaged store read as empty account, unsaved snapshot) → ask what happens on write failure; triage every `.catch(() => {})` by what is lost.
