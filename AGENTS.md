# Working on CalMind

Sean's calendar/reminders/notes/habits/recipes app. `README.md` is the map,
`TESTING.md` is what the tests are worth, `PARITY.md` is the ledger of what
shipped, `TODO.md` is the live list.

## Standing rules

- **Answers are SHORT, and only what Sean has to act on.** Outcome, decisions
  he needs to make, anything blocking him. Detail belongs in comments and
  commit messages, which is where he goes looking for it.
- **Do not list what has not been tested.** No caveat sections, no "still
  owed", no unprompted risk inventories — he will say so if something is
  wrong, and reading a list of everything that might be costs him the time the
  brevity just saved. Say what a check actually proved and stop.
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
  Anything that *tests* a deploy script must neuter `ssh`/`rsync` in its
  copy first: a run that proved the consent gate works, by removing the
  consent gate, went on to write production. See
  `tools/check-deploy-guards.sh`.
- **`dtp` = deploy, tag, push; `tdtp` = test, deploy, tag, push.** Sean,
  2026-08-22 — two lanes, one gesture each: `npm run dtp` / `npm run tdtp`
  (tools/dtp.sh, tools/tdtp.sh). dtp is the quick lane (`--quick` gates plus
  the spot test); tdtp runs the between-runs suite first and the full
  gesture+WebKit gates in the deploy. Both ship prod AND test, then tag
  `x.y.0` (bare — no `v`), `git push --follow-tags`, and dispatch the `desktop-windows`
  workflow. A failed deploy stops the lane — never tag around one; a re-run
  picks the still-untagged version up rather than burning a number.
- **A dtp bumps the MINOR version.** Sean, 2026-08-20 ("it should be 1.3.0 not
  1.2.1") and again 2026-08-21 after ChefMind shipped as 1.0.1: every ship
  goes x.y.0 → x.(y+1).0 unless he says major or patch in that message. Do not
  reach for a patch number to signal "this was a small change" — he asks for
  the other two when he wants them, and silence means minor. This holds for
  every app in the suite — ChefMind and MyCalMind carry the same rule in
  their own repos; the rule is about the gesture, not about which app.
- **ChefMind and MyCalMind are their own repos now** (2026-08-22, history
  preserved): github.com/chere005/ChefMind and github.com/chere005/MyCalMind,
  expected as sibling checkouts at `~/GIT/ChefMind` and `~/GIT/MyCalMind`.
  They are still CLONES kept in lockstep — a fix that belongs to the product
  lands here first and gets copied down, deliberately, across repos. ChefMind
  still syncs through THIS server (the `chef` space): its deploy and its core
  suite read this checkout as `$CALMIND_REPO`, so changes to `server/lib`
  keep the space contract or break ChefMind's gates, loudly.
- **Two sessions share this repo.** `git pull --autostash` first, stage
  explicit paths, never `git add -A`.
- **Sean's data is his.** Reading his notes through the app to find bugs is
  fine and has been the best bug-finder there is. Writing to them, reordering
  his sections, or opening the widget page on his account is not.

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
