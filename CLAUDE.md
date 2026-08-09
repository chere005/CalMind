# Working on CalMind

Sean's calendar/reminders/notes/habits/recipes app. `README.md` is the map,
`TESTING.md` is what the tests are worth, `PARITY.md` is the ledger of what
shipped, `TODO.md` is the live list.

## Standing rules

- **Behavior lives in `packages/core`.** A screen holds plumbing. If you can
  describe a rule in a sentence, it belongs in core with a test.
- **The old suite is the spec.** `/Users/s/GIT/seancheren-reminders` — grep its
  CSS and PHP before guessing at a visual. It is right more often than memory
  is, and it settles arguments that would otherwise cost Sean a message.
  Where its code and its own CLAUDE.md disagree, that is a question for Sean,
  not a thing to pick a side on.
- **Deploy to test only** — `./server/deploy-test.sh`, which refuses anything
  else. Prod is never touched without Sean saying so, in that message.
- **Two sessions share this repo.** `git pull --autostash` first, stage
  explicit paths, never `git add -A`.
- **Sean's data is his.** Reading his notes through the app to find bugs is
  fine and has been the best bug-finder there is. Writing to them, reordering
  his sections, or opening the widget page on his account is not.

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
- **Ask what happens when a write fails.** The worst bugs found here were all
  silent: an oversized record dropped while the app said "synced", a damaged
  store file reading as an empty account, a device that could not save its own
  snapshot. Search for `.catch(() => {})` and triage each by what is lost.

## Test data

Invented recipe cards agree with whoever invented them. Every real recipe bug
this project has found came from Sean's own notes — read through the app, or
round-tripped through core by shape. Prefer his shapes to your imagination.
