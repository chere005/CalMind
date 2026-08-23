# Working on CalMind

The baseline for all of Sean's repos lives in ~/GIT/AgentSuite/AGENTS.md
and is imported here; this file holds only what is true of THIS repo.
@../AgentSuite/AGENTS.md

Sean's calendar/reminders/notes/habits/recipes app. `README.md` is the map,
`TESTING.md` is what the tests are worth, `PARITY.md` is the ledger of what
shipped, `TODO.md` is the live list (and holds the suite counts — no number is
written into prose anywhere else).

## Standing rules

- **Behavior lives in `packages/core`.** A screen holds plumbing. If you can
  describe a rule in a sentence, it belongs in core with a test.
- **The old suite is still the spec, but it is HISTORY now.** It was deleted
  from `seancheren-site` on 2026-08-22 (commit `665dff8`), superseded by this
  repo. A working tree of it no longer exists, so grep the commit BEFORE the
  deletion rather than the checkout:

      git -C ~/GIT/seancheren-site grep -n '<pattern>' e9b9f28 -- calmind lib

  It is still right more often than memory is, and it still settles arguments
  that would otherwise cost Sean a message. Where its code and that repo's
  own CLAUDE.md disagreed, that was a question for him — and the CLAUDE.md
  has since been rewritten for what the site is now, so the CODE at e9b9f28
  is the only half of that pair still standing.
- **Web first, always.** Deploy the web BEFORE building and installing the
  phone or watch app — Sean's instruction, 2026-08-10. The web deploy runs
  the gates (lint, typecheck, suites), so a device build that goes first is a
  build made against code the gates have not passed; and the app talks to the
  API, so shipping the client ahead of the server it expects is the wrong
  order to find out.
- **A deploy means PROD** — Sean, 2026-08-21: "dtp should be prod now
  generally". `./server/deploy.sh prod test --yes-prod [--quick]`, which
  ships both instances off one run of the gates. Prod is where his devices,
  his browser and the public request link all point, so a deploy that
  stopped at test was a deploy he could not see; test rides along in the
  same command so the sandbox does not drift behind the thing it is meant to
  rehearse. `--yes-prod` stays mandatory and stays spelled out in the
  command — the default changed, the explicitness did not.
  `./server/deploy-prod.sh` is separate and unrelated: the one prod-legitimate
  `.well-known` passkey payload, `--yes` to write, `--verify` read-only.
  See `tools/check-deploy-guards.sh`.
- **`dtp` / `tdtp` here: `npm run dtp` / `npm run tdtp`** (tools/dtp.sh,
  tools/tdtp.sh). dtp is the quick lane (`--quick` gates plus
  the spot test); tdtp runs the between-runs suite first and the full
  gesture+WebKit gates in the deploy. Both ship prod AND test, then tag,
  `git push --follow-tags`, and dispatch the `desktop-windows` workflow.
- **ChefMind and MyCalMind are their own repos now** (2026-08-22, history
  preserved): github.com/chere005/ChefMind and github.com/chere005/MyCalMind,
  expected as sibling checkouts at `~/GIT/ChefMind` and `~/GIT/MyCalMind`.
  They are still CLONES kept in lockstep — a fix that belongs to the product
  lands here first and gets copied down, deliberately, across repos. ChefMind
  still syncs through THIS server (the `chef` space): its deploy and its core
  suite read this checkout as `$CALMIND_REPO`, so changes to `server/lib`
  keep the space contract or break ChefMind's gates, loudly.
- **Two sessions share this repo.** `git pull --autostash` first.
- **Sean's data is his.** Reading his notes through the app to find bugs is
  fine and has been the best bug-finder there is. Writing to them, reordering
  his sections, or opening the widget page on his account is not.

## Commands

```sh
npm install                       # once, at the root — npm workspaces
npm run test:dev                  # between-runs suite: 2 typechecks, core, server, counts (~40s)
npm test                          # core + server only
npm run typecheck                 # tsc --noEmit over packages/core AND apps/app, separately
```

Running ONE test:

```sh
npm run test:core -- order               # vitest, by test-FILE substring
npm run test:core -- order -t "inverted" # …and by test name
npm run export:web && npx playwright test e2e/callist.spec.ts
npx playwright test e2e/callist.spec.ts -g "groups by day"
```

- Core's vitest runs under `TZ=America/Chicago`; invoking `vitest` directly
  without it turns date tests red after 7pm.
- `php server/tools/test.php` is all-or-nothing — no filter. It boots its own
  `php -S` on a scratch dir, so never run it alongside another suite.
- Playwright drives `apps/app/dist`, NOT the source. `e2e/freshness.ts`
  compares source digests to the export and refuses a stale one, so a single
  spec still needs `npm run export:web` after any source edit. One worker,
  420×900 Chromium, its own `php -S` on 8790 over a wiped data dir.
- There is no lint script. The only lint is PHP syntax, run inline by the
  deploy: `find server -name '*.php' -print0 | xargs -0 -n1 php -l`.
- `npx playwright install webkit` once, before `npm run test:webkit`.
- `test:watch` / `test:widget` need `swift` and `python3` — they lift the real
  Swift out of `apps/app/targets` rather than re-typing it.

Local processes:

```sh
php -S 127.0.0.1:8788 -t server/public   # the API; data in server/data/ or $CALMIND_DATA_DIR
npm run web                              # Expo web on :8081, talking to :8788
npm run export:web                       # export + tools/patch-web-html.mjs — never a bare expo export
```

## Architecture

**`spec/*.json` → `packages/core` → every surface.** The JSON vectors are the
behavior contract; `packages/core/test/spec.test.ts` replays them, and the
suite's Swift/Kotlin cores replay the same files. Changing a behavior means
amending a vector first — never editing a test to match new code.

`@calmind/core` is consumed as TypeScript SOURCE (`main: ./src/index.ts`), has
no dependencies and no build step. A core edit is live in metro and tsc
immediately; it is NOT live in `apps/app/dist` until an export.

One Expo app is web + iOS + Android. `desktop/` is a Tauri 2 shell around the
identical web export. The watch app, complication and home-screen widget are
Swift targets generated into the Xcode project from `apps/app/targets/*` —
they are separate processes that decode core's `watchFeed` JSON, which is why
one rule (the 12/24-hour clock) has three implementations and its own seam
check.

**Sync.** Local-first, per-record last-write-wins on `updated`, one endpoint
shape (README's "The sync model"). `apps/app/src/store.tsx` is the app's only
stateful seam — a React context around core's `SyncEngine`; AsyncStorage and
the server round-trip trail behind it, debounced. Drag order is
`payload.ord`, a fractional key on the record, because array position cannot
survive per-record merging.

The server is deliberately dumb: `server/public/api/index.php` is a thin
front over `server/lib/app.php`, which merges by CLEAR metadata only —
`payload` is opaque and stored encrypted at rest (`ENC1:`). A feature that
seems to need the server to read a payload is client logic, or it is new clear
metadata.

**Instance separation.** prod/test/dev differ only by path on one origin, and
localStorage ignores paths — so session and snapshot keys are suffixed with an
`instanceTag` derived from the API URL (`store.tsx`). `apps/app/src/config.ts`
is the one place that decides which API a surface talks to: same-origin for
anything serving `api/` beside the page, `127.0.0.1:8788` for metro, and PROD
for native and the desktop shell.

## Platforms

CalMind is the origin app and the only repo in the suite with a full
production server. A shared fix typically lands here first and gets promoted
into CoreMind's canon — but canon then flows the other way on every deploy:
CoreMind propagates it OUT into all four consumers, this repo included (see
CoreMind's AGENTS.md for that graph). As of 2026-08-22:

- **Web** — its own production server. `./server/deploy.sh prod test
  --yes-prod` ships both instances; see the deploy rule above. This is the
  only app in the suite Sean's devices, browser, and the public request link
  point at directly.
- **macOS** — Tauri desktop bundle (`desktop/`).
- **Windows** — desktop, built and smoke-tested in CI via
  `.github/workflows/desktop-windows.yml`, dispatched at the end of
  `dtp`/`tdtp`.
- **iOS** — installs to the physical phone via CoreMind's
  `bin/build-platforms.sh CalMind --ios` (devicectl). Counts against Apple's
  free-tier cap of 3 apps installed on one physical device at a time; the
  phone currently carries CalMind, ChefMind, and AcctMind.
- **watchOS** — a real paired-watch companion app, CalMindWatch, plus a
  CalMindComplication and CalMindWidget extension (`apps/app/targets/watch`,
  `apps/app/targets/watchwidget`). Installs to a paired Apple Watch when one
  is reachable. MyCalMind's iOS build also produces a watch companion (same
  CalMindWatch product name, kept deliberately) but has not installed it to a
  watch; ChefMind and AcctMind have no watchOS target at all.
- **Android** — builds, installs, and launches on a local emulator via
  CoreMind's `bin/build-platforms.sh CalMind --android` (confirmed working
  2026-08-22).

Only web (this repo's own deploy) and the Windows CI dispatch ride along with
`dtp`/`tdtp`. macOS, iOS, watchOS, and Android are built separately by
CoreMind's shared, table-driven `bin/build-platforms.sh` — see that repo for
the two hard rules it enforces: never run two heavy build/device processes on
this machine at once, and mind the phone's 3-app free-tier cap before
installing.

## Traps that have cost real time here

- **A `click()` on a control that has gone does not fail fast.** It waits out
  the entire test budget and reads as a hang. Every speculative click needs
  its own short timeout: `click({ timeout: 1_500 }).catch(() => {})`. This one
  landed four times in a single session.
- **A check that cannot fail looks exactly like one that passes.** Five green
  checks turned out to be worthless in one session — a shell grep for the
  empty string, a browser test that could not see `openssl_verify` disabled, a
  PHP spec reading an ENCRYPTED store with `json_decode`, an absence assertion
  on a container that was not there. Before trusting a new test, break the
  thing it guards and watch it go red.
- **`dist` holds more than one `index-*.js`** — the entry bundle and an async
  chunk. `find … | head -1` picks between them arbitrarily. Read the name out
  of `dist/index.html`, and compare index.html to index.html when asking
  whether a deploy landed.
- **`npm run test:deploy` leaves the web export looking stale.** The guard
  proves "a core type error stops the deploy" by appending a bad line to
  `packages/core/src/order.ts`, running the typecheck, and restoring the file
  with `cp` — same bytes, new mtime. So the very next gesture or WebKit run
  dies in `e2e/freshness.ts` naming `order.ts`, and it reads like something
  edited core behind your back. `git diff` is the tell: clean means it was
  only the mtime. Re-export and carry on; run `test:deploy` last.
- **The shell's working directory persists between Bash calls.** A `cd` into
  the suite or into `desktop/` will silently break the next command's relative
  paths. Use absolute paths.
- **Comments state intent; the code may have drifted.** Two real bugs came
  from reading one against the other — the widget key rotating on every open
  while its comment said "handed out once", and a login page that only
  sometimes rendered the theme it claimed to always render.
- **Some bugs are only visible on a phone.** A React Native `Modal` is its own
  window, outside the app's safe area, so anything absolutely positioned in
  one sits under the clock. Three such bugs were invisible in every browser
  test — a browser has no status bar to hide under. Open it on the simulator
  and look.
- **Measure tap targets from the real screenshot's pixels.** The image you are
  shown is resized; eyeballing coordinates off it wastes taps. `xcrun simctl
  io <udid> screenshot` and find the target, then divide by the scale.
- **`hitSlop` is a no-op under react-native-web.** So a control is exactly as
  big as it is drawn on the web, and bigger on the native builds — the two
  disagree, silently, in the direction that hurts Safari on a phone. Proven by
  clicking five pixels outside a button and watching nothing happen, then
  clicking its centre and watching it fire. When a press has to work, measure
  the box; do not read `hitSlop={8}` in the source and assume 16 more pixels.
  Padding plus a negative margin is the usual fix, but not when the border and
  `borderRadius` are on the pressable itself — padding pushes the visible edge
  outward. Move the visual to an inner View instead.
- **An offset from an element's own edge is not a check.** A click three pixels
  in from the right edge lands inside the element whatever size it is, so it
  passes with the bug present and with it absent. Measure from the centre
  outward by a fixed distance you can justify.
- **Ask what happens when a write fails.** The worst bugs found here were all
  silent: an oversized record dropped while the app said "synced", a damaged
  store file reading as an empty account, a device that could not save its own
  snapshot. Search for `.catch(() => {})` and triage each by what is lost.

## Test data

Invented recipe cards agree with whoever invented them. Every real recipe bug
this project has found came from Sean's own notes — read through the app, or
round-tripped through core by shape. Prefer his shapes to your imagination.
