# What the tests cover — and what still needs an eye

The suite's bargain carries over: **change a feature, change its test in the
same commit; add a feature, add a test with it; fix a bug, add the case that
would have caught it.** This file is the map of which harness watches what,
and what nobody watches but a person. Keep it in step, or a thing ends up in
neither list and nobody is looking at it.

## Every harness, in one place

Eight run against the working tree; two more exist only against a deployed
instance (`smoke-live.sh` and the live passkey spec, both further down). Three
of the eight are the deploy gate. The other five have to be *remembered*,
which is why they are listed here rather than left to be discovered.

| run | what it watches | in the deploy gate? |
|---|---|---|
| `npm run test:core` | the behaviour itself, incl. the `spec/*.json` replay | **yes** |
| `npm run test:server` | the API over real HTTP on a scratch dir | **yes** |
| `npm run test:e2e` | gestures, real mouse, on the EXPORTED app | **yes** |
| `npm run test:webkit` | the spine + header rules + scaling, in Sean's engine | no |
| `npm run test:watch` | both Swift clock copies; core's JSON through the wrist's real decoder, `drawnGroups` and `drawnWidgetDays` | no |
| `npm run test:widget` | core's JSON through HomeWidget's real decoder and `drawnDays`; every App Group key read has a writer on its own device | no |
| `npm run test:deploy` | the deploy guards, each proven by breaking a copy | no |
| `./desktop/smoke.sh` | the macOS shell carries THIS export | no |

The five outside the gate are outside it for a reason each — WebKit needs its
own browser download, the native checks need `swift` and `python3` (they lift
the real Swift out of the targets rather than re-typing it), the deploy guards
rewrite copies of the real scripts, and the desktop smoke compiles Rust — but
"outside the gate" has already cost a real bug (below). Run them by hand after
anything they touch. Counts live in TODO.md's steady-state line; a number
written into prose goes stale, and this file is not exempt.

The three that gate a deploy, spelled out:

```sh
npm -w @calmind/core test     # core: vitest, ~1s
php server/tools/test.php     # server: real php -S + HTTP on a scratch dir, ~10s
npx playwright test           # gestures: the EXPORTED app + real API, real mouse, ~30s
                              #   (npm run export:web first — export PLUS the head
                              #    patch; a bare `expo export` ships an index.html
                              #    with no manifest and no status-bar metas)
```

All three must be green before `./server/deploy-test.sh` — and the deploy holds
you to all three itself now, rather than trusting anyone to remember: it runs
core, the server suite and (after the export, since the specs drive `dist`) the
gestures, and ships nothing if any of them is red. Each gate has been watched
failing on purpose; a guard nobody has seen fire is a guard nobody should
trust. `--no-gestures` is the way past the slow one when the harness itself is
what's broken. After uploading, it proves the page it just served.

And one AFTER it:

```sh
./server/tools/smoke-live.sh   # the DEPLOYED instance, over real HTTPS, ~5s
```

The three runs prove the behaviour; they cannot prove the deploy. Real Apache,
the htaccess, the server's own PHP and timezone, TLS — none of that exists
until the thing is deployed, and that is where the deploy-shaped bugs live.
The last one was the server keeping UTC, so the widget spent every evening
after 7pm Chicago calling tomorrow "today"; the smoke asserts the feed's day
IS Chicago's, which is the check that would have caught it. It also holds the
served head (viewport-fit, the translucent status bar, the manifest and its
content type, the icons) and walks signup → sync → widget token → feed → bad
token refused → logout revokes. It leaves one throwaway account behind and
says so — there is no delete-account endpoint and this is not the place to
invent one.

The gesture run now **refuses to start against a stale export** (`e2e/
freshness.ts`, wired in as playwright's globalSetup): if anything under
`apps/app/src`, `apps/app/App.tsx`, `apps/app/index.ts` or
`packages/core/src` has CHANGED since the export was built, it stops, names
the files, and tells you to run `npm run export:web`. The specs drive the
EXPORT, not the source, so a stale bundle makes the run a lie in either
direction — a pass for code that isn't there, or a failure for a fix that is.
That is worse than a red run, because it looks like an answer.

Changed, not merely touched: the comparison is by content hash against
`apps/app/dist/.sources.json`, which the export writes. It was mtimes until
2026-08-12, and the section below says what that cost. Mtimes remain the
fallback when no manifest exists.

## packages/core — the behavior itself (vitest)

- Spec replay: the parser (slash-only US dates, times, tokens leaving
  titles), repeats (month/year clamping), the outline block sort — shared
  vectors in `spec/`, so any future port replays the same truths.
- The day model: overdue collection on today, rideAlong riders, repeat
  expansion, cell marks (one icon per kind+colour, worst reminder state),
  the legend, week rows (`weekOf` — a month ROW, the ?wk=first|last idea).
- Manage rules: folder/section/calendar/habit-section delete and rename
  refusals and re-homes, block moves, the last-section-out ask,
  conversions (one-way into notes, reminder⇄event, subtasks keep home),
  duplicateItem, showAgain, reminderToggle's max(due, today) roll,
  timeLabel, richLines.
- Normalize guarantees (starters, re-homing, the rideAlong folder) and the
  LWW sync engine (put/del/snapshot/dirty).
- The legend reads the days through the SAME folder tri-state the grid draws
  through, so it can only name what the window actually holds — a folder set
  to 'none' leaves the key, and a rideAlong folder earns its chip only on a
  day it really rides.
- Habit moves (`moveHabit`, `moveHabitSection`): habits have no folder layer,
  so the last-section and duplicate-name refusals can't arise — only a
  missing section or a missing landing row.
- Balanced line breaking (`balanceLines`): fewest lines first, then the
  evenest split — five chips over two lines come out 3+2, never 4+1; it
  balances by WIDTH rather than count, gives an over-wide item its own line,
  and its invariants hold at five different widths.
- Recipe ingredients: quantity ranges written with a dash or with 'to', a
  whole number plus a typographic fraction, and the sentences that merely
  CONTAIN 'to' and are not ranges at all.
- The WATCH FEED (`watchRows`). It used to live inside the phone's bridge
  module behind an `if (!bridge) return`, so it could only execute on a device
  with a watch paired to it — the one place nobody watches a test run. It is
  behaviour, so it moved here, and the app keeps only the WatchConnectivity
  plumbing: open reminders only (nothing done, deleted, or of another kind),
  the Reminders list's own order, and a subtask travelling under its parent
  rather than sorting away from it, and — since the iOS widget gained a
  folder picker — the reminder folders it offers, notes folders excluded.
  The exact-field-set assertion on a row is the reason adding `folderId`
  could not slip through unnoticed; keep it exact, not a subset.

  What no test covers, and could not: what the WATCH does with the feed
  once it has it. An evening was lost to 'my watch is not syncing' when the
  phone was delivering correctly the whole time and the wrist showed
  'Nothing due today' — the words it also shows when it has received
  nothing at all. WatchStore now publishes `.waiting` / `.loaded` /
  `.failed(reason)` and every empty screen reads it, so the two can never
  be confused again. That distinction is enforced by construction rather
  than by a test, because nothing here can run SwiftUI.

  What CAN be checked is the Swift that does not need SwiftUI.
  `tools/check-watch-format.sh` extracts BOTH real time formatters — the
  watch app's WatchFormat and its deliberate twin in the complication, which
  exists because a widget extension cannot see the app's sources — and runs
  them against the cases pinned in `test/watch.test.ts`. Nothing is re-typed:
  if a copy changes, the script runs the change. Duplication nothing checks
  is duplication that drifts, and this drift would surface as a time reading
  one way on the face and another in the list, which nobody reports as a bug.
  Proven by breaking one copy's drop-the-':00' rule and watching six
  mismatches appear.

  **The per-keystroke cost, measured 2026-08-11 rather than worried about.**
  `refresh()` runs on every mutate and the note body writes on every keystroke,
  so each one re-runs `normalize()` over the whole store and rebuilds the watch
  feed — which includes fourteen days of `dayItems`. That sounds alarming and
  is not: 0.8ms at ~100 records, 2.1ms at ~600, 4.9ms at ~1800, scaling
  linearly, and `normalize` is a rounding error next to the feed. A frame is
  16ms. It is also iOS-only — `pushWatchList` returns immediately when the
  native bridge is absent, which is every other platform.

  Written down so the next person does not re-derive the worry and then
  "optimise" a path that is already fast.

  `tools/check-watch-feed.sh` covers the seam BETWEEN the two languages,
  which is where the worst watch bug so far actually lived. core's
  `watchFeed()` writes the JSON and `WatchStore.swift`'s Codable structs
  read it; both sides were fully tested and both were green while the wrist
  showed a flat, ungrouped page for a week. Each side had been tested
  against its own idea of the shape, and nothing ran them against each
  other. So this generates the fixture with the real `watchFeed` and decodes
  it with the real structs — including a folder carrying no `app` field,
  the milestone-1 shape Sean's oldest folders still have, which is the exact
  record the feed was dropping.

  It also runs the wrist's two pieces of its own logic. `drawnGroups` is the
  fallback that draws a flat list when a payload arrives with no groups.
  That was a computed property over `store`, so it could only ever execute
  inside a rendered view on a watch; it is static and pure now for no other
  reason than that something can call it. Both branches are checked.

  `drawnWidgetDays` is the second, added 2026-08-10 when Sean asked the
  watch's first page to show exactly what the home-screen widget shows. It
  is a deliberate SECOND COPY of HomeWidget.swift's filter — two targets,
  two binaries, neither able to import the other — so the only thing keeping
  them honest is that both are run against one core-generated feed. The
  fixture carries two calendars and an event alone on its own day, because
  a selection with nothing to exclude and no day to empty would let the
  check pass whatever the filter did.

  The reminder half is asserted as a SET comparison rather than by naming
  rows, and that correction is the interesting part: the first draft named
  a row that is undated, which the tri-state legitimately keeps off the
  page — so it was asserting a guess about the tri-state instead of the
  actual rule, which is that a CALENDAR selection changes no reminder at
  all. Proven red by making the filter hit reminders too.

  Seen, not only asserted: rendered on a watchOS simulator with a seeded
  feed, showing the overdue row in orange, the event in its calendar's
  colour, and the event on the UNPICKED calendar absent — then reseeded with
  an empty selection and watched that same event come back. Both directions,
  on screen. (Seeding needs `simctl unpair` first — the phone's context wins
  at activation — and the unpair reboots the watch sim, so reinstall after.
  Seed BOTH `com.seancheren.calmind.watchkitapp` and the App Group suite:
  the store reads the group first and falls back to standard.)

  Proven the only way that counts — by restoring each original bug and
  watching it go red: the strict `app === 'reminders'` comparison drops
  Home and collapses three groups to two, and removing the fallback turns
  four rows into zero, which is the blank page a watchOS simulator caught
  before Sean's wrist did.

  `tools/check-widget-feed.sh` is the same seam one device over, and that
  one seam has already produced two bugs by itself. First nothing wrote the
  cache at all: the PHONE widget read "watchlist.json" from the App Group
  and the only writer was the watch app, filling the watch's own container
  on another device — so the widget sat on its waiting state forever and
  opening the app could not help. Then the day list ignored the calendar's
  per-folder tri-state, so a folder switched off in "Manage reminders"
  still filled the home screen.

  Both were invisible to every test on either side, because each side was
  correct about its own idea of the shape. So the check feeds core's real
  watchFeed output — from a store with real 'dated' / 'none' / 'all'
  modes — into the real Codable structs lifted out of HomeWidget.swift, and
  asserts what a person would see: the dated one shows, the undated one
  rides on today, the overdue one is gathered onto today, the event sits
  beside them, and the 'none' folder appears on no day at all.

  Then it runs the widget's OWN layer, the same way the watch check runs
  `drawnGroups`. `drawnDays` used to reach into UserDefaults and a WidgetKit
  configuration, so it could only ever execute inside a rendered widget on a
  phone — behaviour nothing can reach, which is the shape every bug on this
  seam has had. It is static and pure for exactly one reason: so something
  can call it. What it covers is what core cannot know — which folders THIS
  instance was configured for, and which ticks are queued but not yet
  applied — plus the day headings and the row cap.

  Proven by breaking it two ways: drop the optimistic tick filter and a
  ticked row stays on screen; let a folder selection filter events as well
  as reminders and the event vanishes. That second rule is worth stating,
  because it is easy to "tidy" away — picking a folder filters REMINDERS,
  and events survive, since an event has no folder and dropping them all
  would be a second rule nobody asked for.

  Both watch formatters are also run against the 12/24-HOUR setting, which
  is one pref honoured by four surfaces and therefore three separate Swift
  implementations of one rule — the shape that drifts. Proven by making the
  complication ignore the flag: four mismatches, each naming itself.

  `tools/check-appgroup.sh` states the rule the first of those bugs broke:
  every App Group key that is READ has a WRITER on the same device, with
  the phone and the watch treated as the separate devices they are.

  Proven by restoring each bug: ignoring the tri-state gives 3 mismatches
  naming the rows that should not be there, sending no days gives 5, and
  deleting the cache writer makes check-appgroup name the reading file.

  It also caught a test of its own making: a hardcoded date passed until
  midnight and then failed for reasons unrelated to the code. The harness
  derives its dates now.

- OCR PARTIAL FAILURE is NOT tested, and should be said out loud. Both
  readers — tesseract on the web, Vision on iOS — now catch each photo
  separately, keep the pages that read, and report how many did not. Before
  that, one bad frame threw away every page already read, on both paths.
  The happy path is covered by `e2e/ocr.spec.ts`; the partial-failure path is
  verified by reading the code, because provoking a mid-batch OCR failure
  needs a corrupt image the engine accepts and then chokes on, and a fixture
  like that is its own maintenance problem. If this breaks, it breaks
  silently — which is exactly why the behaviour is written to keep work
  rather than to be clever.

- TAP TARGETS on the web are measured, never read off the source. `hitSlop`
  is a no-op under react-native-web, so a control is exactly as big as it is
  drawn there and bigger on native — the two disagree silently, in the
  direction that hurts Safari on a phone. All three pickers' checkboxes were
  18pt tall in a browser (a fontSize-16 glyph) against 32pt on a device.
  Measured from the CENTRE outward: reach was 9px, exactly the element's own
  edge, and 17px with the WebHitSlop overlay — 34pt.

  The measurement was wrong first, which is the part worth keeping. It
  counted a hit whenever the element under the point CONTAINED the control,
  so every ancestor passed: it was measuring the whole row and would have
  reported success with the fix absent. Before trusting a measurement, ask
  what would make it read false.

  `tools/sweep-tap-targets.mjs` does this across every clickable element on
  the four tabs, both pickers and the recipe editor, and flags anything under
  30pt. It found two things reading the source did not: the collapse-all
  button shrunk to a 24pt TARGET when its icon was made smaller, and
  Reminders' collapse-all still drawing a static chevron long after Notes'
  was made dynamic. It also proves each screen it claims to have opened
  actually opened — the first version measured the recipe editor's link row
  twice with the row closed, and the two passes agreed, which is what a
  measurement that cannot fail looks like.
### One clock spec, and the copy that could not be moved, 2026-08-11

The twelve-hour clock cases were written out twice, byte for byte — in
`check-watch-format.sh` for the watch app's `clockFull`, and again in
`check-feed-format.sh` for the widget feed's PHP. Two copies that had not yet
disagreed, which is not the same as two that cannot, and the second one was
added this same day by someone copying the first.

`spec/clock.json` is the list now.

BOTH the feed and its checker were REMOVED on 2026-08-12 with the Scriptable
widget, so the fourth copy of the rule is gone rather than guarded — the
strongest version of this fix, and the reason the entry stays: the argument
is about duplication nothing checks, and it is what made deleting the copy
safe to do quickly.

check-watch-format DOES NOT, and that is a decision rather than an oversight:
it builds a Swift program inside a python heredoc inside a shell script, and
threading JSON through that took three failed attempts at restructuring a
checker that works, for a duplicate that has never actually drifted. So the
feed checker COMPARES the two instead — it reads the Swift harness's
`fullCases` and holds them to the same file. The drift is caught without
touching the fragile thing.

Two details that were bugs in the comparison before they were features of it:

  · The first regex matched `let fullCases: [(String?, String)]` — the TYPE's
    brackets — and extracted an empty list. It reported a mismatch rather than
    quietly agreeing, which is the only reason it was noticed within a minute.
    An explicit "no cases extracted" check now sits beside it, because an empty
    list compared against an empty list is exactly the shape this repo keeps
    finding.
  · The first attempt to PROVE the comparison bites changed `("20:00", "8pm")`
    — which appears in both the compact list and the full one — so it edited
    the wrong copy and caught nothing. The break has to be a case unique to
    `fullCases`.

### The desktop check passed over an eight-hour-old stage, 2026-08-11

`npm run test:desktop` runs `desktop/check-assets.sh`, which verifies that
everything index.html asks for is present in the staged bundle. It reported
green over a stage carrying `index-564c1cba…` while the export had moved on to
`index-bc127492…` — nearly eight hours behind. Nothing was wrong with what it
checked: a stale stage is INTERNALLY consistent, because it was copied whole
from a dist that was consistent at the time.

Two holes, both closed:

  · **It never asked whether the stage was current.** It does now, by BUNDLE
    NAME rather than timestamp — the bundle is content-hashed, so a matching
    name is the same bytes. `smoke.sh` already did this for the built .app; the
    headless half, which is what the npm script runs, did not.
  · **It only scanned ABSOLUTE references.** The manifest is written
    `href="manifest.webmanifest"` with no leading slash, so it was never
    checked at all and could have vanished from the export with every line
    still green. Found because the absolute count dropped from three to two and
    the missing one turned out to be relative rather than gone. Relative refs
    resolve against the page's own directory and are checked there now; removing
    the manifest from the stage turns it red.

The family resemblance to the stale simulator earlier the same day is the
point: an artefact that is consistent with ITSELF says nothing about whether it
is the artefact you meant to test.

### Never run two Playwright suites at once, 2026-08-12

Both configs bind their own port — 8790 for the gestures, 8791 for WebKit — and
each starts its server with `reuseExistingServer: false`. Two runs of the SAME
config therefore fight over one port, and the loser produces garbage that looks
exactly like a code failure: a 24-minute run reporting 138 of 164 tests, a pile
of `locator.fill` timeouts, and a spec named in the failure list.

That was read as "the change under test broke the editor". It had not. The
committed code, run alone afterwards, passed 162 with exit 0 — and the change
was reverted on the strength of contaminated evidence before that was known.

Two habits come out of it. Run one suite at a time, and check `lsof -ti
tcp:8790` before believing a bad result. And do not pipe a diagnostic run
through `tail`: the first attempt captured three lines and threw away every
error, which is why it took three more runs to find out what had happened.

### The WebKit suite is in the deploy gate now, 2026-08-11

It was not, and that was the whole point of it going missing: `deploy-test.sh`
ran `npx playwright test` — the Chromium config — and stopped there. The WebKit
suite exists because a react-native-web `hitSlop` is a no-op in a browser and
the browser that matters is Safari; its own config says verifying that in
Chromium alone "would have been checking it everywhere except where it
matters". Leaving it out of the gate meant exactly that could ship.

Sixteen specs, under thirty seconds, keeping its log for the same reason the
gesture run does.

ONE FLAKE SEEN on that first run, at `app.spec.ts:359` — and it is NOT news:
it is TODO §2's first entry, "The new-note focus is a 50ms race (WebKit only)",
which already names that exact spec and counts it at three in about
twenty-four full runs. It was recorded here as a fresh observation because §2
was never opened. Read the open-bugs list before writing down a bug.

That entry also says, in as many words, not to spend time on synthetic load or
suite ordering because both were already tried — and five reproduction runs
went into exactly that before it was read.

The one thing worth adding to it, done: a clean A/B ruled out the note
editor's status dot, which was new that day and the obvious suspect.

### Every checker broken on purpose, 2026-08-11

The eight shell checkers are the only cover some of this code has, and most of
them had never been pointed at a broken subject — they were trusted to catch
things without anyone checking that they do. Each was driven with a failure it
is supposed to see, by EXIT CODE rather than by reading its output:

| checker | broken with | result |
|---|---|---|
| `check-widget-feed` | `toggledTicks` losing its remove branch; appending a duplicate; `packed()` ignoring the height it is given | caught ×3 |
| `check-watch-feed` | `capped()` dropping its limit; counting within days not across; a Codable field renamed on the wrist | caught ×3 |
| `check-watch-format` | (already carried its own proof — the drop-the-':00' rule); the home widget's header date, twice — the weekday dropped, and the comma form | caught ×2 |
| `check-appgroup` | the phone's writer of `watchlist.json` deleted — the original bug | caught |
| `check-assets` | the window pointed at an unstaged path; an asset removed from the bundle | caught ×2 |
| `check-suite-counts` | a stale gesture count; a wrong core count | caught ×2 |
| `check-deploy-guards` | (is itself a suite of nine) | — |

Nothing was found wrong. That is the point of writing it down: "the checker
works" is a claim, and until the subject has been broken under it, it is an
untested one.

### What the SCREEN costs as it grows, measured 2026-08-12

The measurements below that one are core's: pure functions, all linear, all
under 4ms at 8,000 records. They say nothing about the app, because the cost
that reaches Sean is the re-render, and no spec has ever run against more
than about five items — the whole suite builds its own data by hand.

Seeded through the snapshot the store already persists (`calmind.snapshot.
<user>`, shape `{cursor, recs, dirty}`) and reloaded into, then a real
interaction timed: typing ten characters into the reminders add field, which
re-renders the list on every keystroke.

| reminders in the store | ms per keystroke |
|---|---|
| 10 | 5.1 |
| 100 | 15.4 |
| 400 | 39.6 |

Roughly linear — forty times the records for about eight times the cost — so
`flatIdxOf`'s findIndex-per-row does NOT dominate the way reading it suggests
it might. Suspected quadratic, measured not.

What it does say is that the screen, not core, is where the time goes, and
that 400 reminders already costs ~40ms a keystroke on a fast desktop under
Chromium. Perceptible lag starts around 50–100ms, so this is approaching it
rather than at it, and a phone is slower than this machine. Worth
re-measuring before assuming a large store still feels fine, and worth
knowing that the fix would be in the render (virtualising, or memoising rows)
rather than in core, which is already fast.

Not turned into a test: a timing assertion on a shared machine is a flake
generator, and this suite already has one flake it does not need company for.
The seeding recipe above is the reusable part — it takes about ten lines and
gets a realistic store in under a second.

### What the store costs as it grows, measured 2026-08-12

Nothing watches performance, and the two questions worth an answer both had
none: does the snapshot fit, and does anything go quadratic. Measured through
the real engine and the real core functions rather than estimated.

SIZE, per record in the persisted snapshot: a short reminder 229 bytes, a
typical one 279, a small recipe note 265, a long recipe with method prose
1,427. Against a 5MB origin that is ~22,900 short reminders or ~3,675 long
recipes; halve it where a browser counts quota in UTF-16 units. Comfortable
for text — the numbers are in TODO §3 because what they really settle is the
cost of an inlined IMAGE, which is ~187 long recipes apiece.

SPEED, healthy store, doubling the record count each row: `normalize`,
`dayItems`, `cellMarks` and `sortByDate` all grow 1.3–2.2x per doubling —
linear — and all four are under 4ms at 8,000 records. No quadratic anywhere
on the paths the app runs constantly.

SPEED, DAMAGED store, which is the interesting one: `normalize` re-homes a
stranded row by scanning its folder's sections, so with N stranded records
and M sections the two MULTIPLY — doubling either axis doubles the time
(measured both ways: 2.0x, 2.0x on records; 2.1x, 1.6x, 1.9x on sections).
2,000 stranded rows across 160 sections costs ~25ms, and 20,000 across 200
would be a few hundred.

That is not a bug and the reason matters: the scan only runs while a row is
stranded, and normalize REPAIRS it on that same pass, so the cost is paid
once after something like a folder delete and never again — the healthy-store
guard short-circuits every refresh afterwards. Worth knowing before anyone
"optimises" it, and worth re-measuring if normalize ever stops repairing in
one pass (`normidem.test.ts` is what would catch that).

### The four clocks, compared over every minute, 2026-08-12

The time rule exists four times — core's `timeLabel`, `WatchFormat.clockFull`
on the wrist, the complication's `clock12`, and a fourth in PHP because
`handle_feed` formats its own rows. The checkers hold them to `spec/clock.json`,
which is about a dozen cases chosen because they are the ones that catch a
12-hour clock out. Good cases, but a sample.

Driven exhaustively once, to find out whether the sample is faithful: all
1440 minutes of the day, in both clock modes, real code in each language
extracted the way the checkers already extract it.

| pair | comparisons | disagreements |
|---|---|---|
| PHP `$spoken` (feed) vs core `timeLabel` | 2880 | **0** |
| Swift `WatchFormat.clockFull` vs core `timeLabel` | 2880 | **0** |

The complication's `clock12` is deliberately NOT in that table: it is the
compact rule — bare below 8pm, ':00' dropped — so it is not supposed to agree
with core, and `check-watch-format.sh` already holds it to its own spec.

Not turned into a checker. The sample is now known to be faithful, the
boundaries it samples (noon, midnight, 19:xx against 20:00) are exactly where
divergence would appear, and the exhaustive version needs vitest, php AND
swift in one script to earn nothing the sample does not already earn. Redo it
rather than automate it, if the rule is ever rewritten.

ONE TRAP, and it cost the first run: THE FLAG IS DUPLICATED TOO. The
complication carries a global `var CLOCK24`; `WatchFormat` carries its own
`static var clock24`. Setting one does not set the other, and the result was
1440 failures that read exactly like a catastrophic divergence — the watch
apparently answering 12-hour for every minute of a 24-hour clock. It was the
harness. When comparing these copies, set BOTH.

### What the gesture suite does NOT reach, 2026-08-12

Measured rather than guessed: every `testID` in `apps/app/src` against every
spec in `e2e/`. 158 controls, 14 that no spec addresses. Two of the bugs
fixed today were found by following an entry on this list into the source —
the recipe editor's hand-typing, and the × on a folder's only section, which
turned out to be wrong on the WELL-tested screen too. So the list is worth
keeping accurate rather than merely long.

| control | what is unwatched |
|---|---|
| `shared-day-tick`, `all-shared-note`, `calshared-box-`, `shared-add-field`, `legend-partner` | the partner's rows on the CALENDAR, and the share window's own add field. Sharing needs two accounts, so these cost a second browser context — `app.spec.ts` has one such test and these are the surfaces it does not walk. |
| `nsec-grip-`, `nsecempty-` | reordering a NOTES section by dragging, and its empty drop slot. Reminders and habits both have a drag test; notes does not. Checked 2026-08-12: the wiring and the drop handler are identical to the tested reminders one, character for character, so this is a guard against future divergence rather than a suspected bug. |
| `cal-all-box`, `trimode-all`, `trimode-dated` | the calendar picker's All toggle, and two of the folder tri-state's three buttons. `trimode-none` IS tested, which proves the wiring mechanism, and core covers all three MODE semantics thoroughly (`day.test.ts`) — so what is missing here is only the two remaining button literals. |
| `hsec-dot-`, `hsec-name-`, `sec-rename`, `login-confirm` | reached by other means and so less bare than they look: the habit swatch is covered by `hitarea.spec.ts`'s shape sweep rather than by name, and the confirm-password field by its placeholder. |

TWO WRONG SWEEPS CAME FIRST, and both are the same lesson in opposite
directions. A plain `grep -rl` reported `sec-grip-` as covered because
`hsec-grip-` contains it — a substring pretending to be a match. Fixing that
by demanding a quote or dash after the id then reported `secadd-` as
UNCOVERED, because specs write `secadd-General` and the template ends at the
dash. The number only became trustworthy once known-good and known-bad cases
were asserted in both directions, which is the same discipline as breaking a
test on purpose: a sweep is a check, and a check nobody has seen fail proves
nothing.

### The hit-area spec I did not find, 2026-08-12

Recorded because the mistake is more useful than the work was.

Measuring every control in the exported app turned up the habit section's
colour swatch at 11x11, the smallest in the app, and a grep of `e2e/` for
`WebHitSlop` and `hsec-dot` came back empty. I concluded that a workaround
used in 36 places across 13 files had no test, wrote one, broke it four ways,
and committed it.

`e2e/hitarea.spec.ts` had covered it all along — four tests, in the WebKit
list, opening with "A button is as big as it looks — on the web too." The grep
missed it because it names neither the component nor that control. Two
greps for the mechanism's NAME are not a search for its BEHAVIOUR, and the
file's own title is the thing that would have found it.

The redundant spec was removed. What it would have added, it added worse:
its upper bound clicked 20px out and asserted nothing happened, while
hitarea reads the reach straight off the element on all four sides and pins
it at exactly 7px. That file explains why, and it is the better reason:
"a click landing or missing says as much about what is painted on top as
about the slop, and an earlier version of this test passed a deliberately
broken 40px slop for exactly that reason."

One real gap is left, and left on purpose. hitarea's sweep gives every pad an
UPPER bound across five screens, and its first test gives a LOWER bound for
one control (`cal-completed`). So deleting `WebHitSlop` wholesale is caught,
but deleting it from a single control is not. Thirty-six per-control tests to
close that is worse than the gap: they share one component, and the component
is what the mutation would have to break.

### The freshness gate asked about mtimes, not code, 2026-08-12

`e2e/freshness.ts` refuses to run against a stale export, and it is one of the
most valuable guards here — a suite that tests code which is not there gives
"the worst kind of green". It compared MTIMES.

Two sessions share this repo. An ordinary git operation in the other one — a
pull with autostash, a checkout, a stash pop — rewrites files it restores to
IDENTICAL content. The mtime moves; nothing about the code changes. That read
as STALE three times in one session, every time naming
`packages/core/src/order.ts`, which had no diff against HEAD at all. Three
needless re-exports, and each one teaches whoever hit it that the gate is
noise. `deploy-test.sh` already says the same thing about hiding a gate's
reason: the first person it blocks unfairly is the one who deletes it.

It asks by CONTENT now. `npm run export:web` writes a hash per source file
into `apps/app/dist/.sources.json` (tools/source-digest.mjs, shared by the
writer and the reader so they cannot disagree about what a source is), and
freshness compares hashes. A touched file is fresh. A changed one is not, and
gets NAMED — better than the old message, which could only point at whichever
file was touched most recently.

Broken on purpose, all four ways: fresh export passes; a `touch` with no edit
passes; a real one-line change is caught and named; and with the manifest
removed the old mtime rule still fires, which is what an export made before
this existed will fall back to.

### A neutered copy has to live where the original lived, 2026-08-12

`apps/app` joined the deploy gate's typecheck. Proving a gate fires means
running the script with the fault present, and CLAUDE.md's rule is that any
such run neuters `ssh` and `rsync` in its copy first.

The copy was written to the scratchpad. `deploy-test.sh` opens with
`cd "$(dirname "$0")/.."`, so from there it walked out of the repo: `find`
could not see `server/`, `npx` picked up a stranger's `tsc`, and both runs —
the deliberately broken tree AND the clean one — failed identically at
`packages/core typecheck failed`.

Both failing is what gave it away. Had the script exited 0 for its own reasons
it would have read as a pass, and the gate would have been recorded as proven
without ever having run. `tools/check-deploy-guards.sh` writes its copies to
`server/_guardcheck-$$.sh` for precisely this reason, which is a detail worth
copying rather than rediscovering.

Redone from `server/`, both directions hold: with a type error in
`apps/app/src/watch.ts` the script refuses and names `apps/app`; clean, it
passes typecheck and goes on to the tests, echoing test destinations only.

### What no browser test can see, 2026-08-12

The Habits bug — edit mode with no way out on a phone — hid in a place the
gesture suite cannot look, and it is worth naming every such place rather
than waiting for the next one.

`EditExit` is the shape of the problem: `Platform.OS === 'web'` returns its
children untouched, so on the web the component does NOTHING. Breaking its
native exit outright leaves all 181 gesture tests green. That is measured,
not reasoned — and it means "the suite is green" says exactly nothing about
any branch like it.

Twelve `Platform.OS` branches, in nine files. The ones the suite CAN see are
the web halves, and they are covered: nav's centred column, `ui.tsx`'s
mousedown preventDefault and `WebHitSlop`, `update.ts` (web-only by
construction, and `update.spec.ts` drives it), `config.ts`'s location sniff.

The ones it CANNOT, in rough order of what a failure would cost:

| branch | what hides there |
|---|---|
| `EditExit` (native) | a tap outside leaving edit mode. Had a real bug on Habits; fixed 2026-08-12, still unverified on a device. |
| `watch.ts` — `Platform.OS === 'ios'` | the whole WatchBridge push. The feed's CONTENT is covered by core's `watchRows` and by the Swift decoder checkers; the bridge call itself is not. |
| `ocr.ts` — the iOS path | native photo OCR. `ocr.spec.ts` drives the web route only. |
| `Login.tsx` — `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` | whether the keyboard covers the login fields on a phone. Never seen fail; also never seen at all. |
| `config.ts` — the Android emulator host | only matters on Android, which Sean does not use. |

None of this is a call to write native tests — there is no harness here that
could, and the simulator has its own trap (`check-sim-fresh.sh` exists
because a screenshot of a stale build is extremely convincing). It is a list
of what to LOOK at when something is reported on the phone and the suite says
everything is fine, because for these five the suite was never speaking.

### Compound states: "X while Y", 2026-08-12

Four mutation survivors turned out to share a shape — each guarded a path
where something ELSE was simultaneously true — so that shape was used as a
PREDICTOR rather than just described. Every probe below is "do X while Y is
happening", and the hit rate was worth the trouble: three real bugs, two
load-bearing guards with no coverage, two behaviours that turned out correct.

| X while Y | outcome |
|---|---|
| press a row's cluster button WHILE editing that row | **BUG** — stale `recs`; duplicate copied the pre-edit text, outdent wrote it back over the save |
| swipe a recipe line, then ADD one | **BUG** — swipe keyed by index, the parked × deleted a different line |
| edit a recipe line while an IMPORT lands | **BUG** — `editing.at` is an index; the correction overwrote a freshly imported line |
| drag a recipe line while an import lands | correct-ish: the drag is DROPPED. A no-op rather than a wrong move, which is the safe failure — do not "fix" it into one |
| drag a reminder while a ticked row above it leaves | correct — the right row moves; pinned in `dragunder.spec.ts` |
| sign IN on a device with an empty engine | guard, untested — `seconddevice.spec.ts` |
| a sharing call failing while the network is FINE | guard, untested — `sharedoffline.spec.ts` |

The recipe editor accounts for three of the hits because it keys everything by
INDEX — its lines are plain strings with no identity — while the list moves
under them: adds prepend, imports prepend, drags reorder. Reminders keys the
same states by record id and none of it applies there. That asymmetry is what
made the file worth going through exhaustively rather than sampling.

### The APP layer, mutation-audited, 2026-08-12

Core was audited on 2026-08-11. The screens never had been, and they are the
half where the gesture suite is the only guard — so a survivor there is a
behaviour that could stop working with every suite still green.

Seventeen mutations, chosen where a survivor would mean something rather than
where one was easy to make. FOUR survived, and all four had the same shape: a
guard governing a path no spec walks. Two of them had real bugs sitting
behind them, which is the argument for chasing a survivor rather than
shrugging at it.

The paths, spelled out, because the pattern is the useful part: pressing a
cluster button WHILE a row is being edited; signing IN rather than up;
double-tapping a day-panel row; and a sharing call failing while the network
is otherwise fine. Every existing spec drove the ordinary version of each —
press the button on a row you are not editing, sign up, tap once, share while
online — so the guard was never the thing under test.

| mutation | result |
|---|---|
| `GRACE_MS` 2000 → 0, the uncheck grace gone | caught, all four grace specs |
| `GRACE_MS` → 60000, the grace never ending | caught, by the test whose name says exactly that |
| the sync debounce 800ms → 5 minutes | caught by `toolong.spec` |
| both drags yielding to the ScrollView (`onPanResponderTerminationRequest` → true) | caught by three specs |
| the calendar's `delayLongPress` 350 → 5000 | caught by "the CALENDAR day panel leaves edit mode by tapping out" |
| `justSwiped()` → false, so a swipe also opens the row it swiped | caught by three specs |
| **the calendar's double-tap window → 0** | **SURVIVED — see `caldbltap.spec.ts`** |
| **the `holdCluster` guard removed** | **SURVIVED — see `clusterhold.spec.ts`, and two real bugs were behind it** |
| **`if (hydratedRef.current)` → `if (true)`** | **SURVIVED — see `seconddevice.spec.ts`** |
| `persistNow` debounced by 2s | caught by six, including the two "survives a reload" drag specs its own comment names — the claim was true |
| `useNoteScoped`'s per-note reset removed | caught by four, two named for it |
| the sync coalescing drops a mid-flight request | caught by `synccoalesce.spec.ts` |
| undo stops skipping `superseded` tombstones | caught in core |
| the SERVER drops `superseded` on rebuild | caught by the server suite |
| **`sharedPut`'s both-failed signal removed** | **SURVIVED — see `sharedoffline.spec.ts`** |

Two things are worth taking from the survivor beyond the fix. The gesture
exists FIVE times (a habit name, a reminder row, a reminders section head, a
notes section head, a calendar day-panel row) and four had a `dblclick`
somewhere — so the gap was one copy of something otherwise well covered,
which is the hardest kind to notice by reading. And `doubletap.spec.ts`
exists and is about something else entirely: a double tap not filing TWO
reminders. A name can look like coverage.

The drag result is the interesting near-miss. Five drag specs PASSED with
both drags yielding — they drag in short lists, where the enclosing
ScrollView never asks for the responder. Only the three in scrollable
contexts failed. A mutation that is caught by a minority of the tests that
look relevant is still caught, but it says which of them are actually
exercising the guard.

### Mutation-audited, 2026-08-11

Coverage says a line ran. It does not say anything would have noticed if the
line were wrong, which is the only question worth asking about a guard. So each
branch in seven modules was deleted or inverted in turn and the suite re-run.
**83 mutations.** One module was weak; the rest hold.

| module | mutations | survived |
|---|---|---|
| `update.ts` — shouldReload's six early returns | 6 | 0 |
| `sync.ts` — LWW, the tie-break's three clauses, rejected ids, dirty clearing | 6 | 0 |
| `day.ts` — folder tri-state, riders, overdue | 7 | 0 |
| `watch.ts` — feed filters, widget picker, empty groups, strays | 6 | 0 |
| `habit.ts` — dayShares counting | 1 | 0 |
| `normalize.ts` — every seed, every re-home, the edited report | 9 | 0 |
| `manage.ts` — all 48 single-line error guards | 48 | **33** |
| `server/lib/app.php` — sharing scope, auth, caps, passkeys | 22 | **2** |
| `server/lib/fetchurl.php` — the SSRF guards and redirects | 7 | **4** |
| `server/lib/store.php` — encryption, corrupt-file handling, the lock | 3 | **1** |
| `server/lib/webauthn.php` — the origin check | 4 | **2** |
| the SWIFT the checkers extract — widget and watch | 6 | 0 |
| `parse.ts`, `undo.ts`, `rules.ts`, `recipe.ts`, `markdown.ts`, `layout.ts` | 30 | **5** |

manage.ts is written up in TODO; the short version is that 27 of the 33 were
bad-id defences that now share one table, five were rules (two of them the
sibling-asymmetry this repo keeps producing), and the last three are
unreachable behind an earlier guard and are deliberately left alone.

The server's two survivors were both real gaps in guards nothing else could
cover, since the server is the only thing enforcing either:

  · **The passkey UP/UV flags.** Every existing spec sent `0x05` — both user
    present and user verified — so deleting the guard that requires them failed
    nothing. It is the difference between someone holding the device and
    someone unlocking it with a face or a PIN, and the flags arrive from the
    client, which is untrusted by definition. Now covered with a correctly
    signed assertion for each of UP-only, UV-only and neither.
  · **require_auth's anchors.** `^Bearer <64 hex>$` loosened to a bare search
    passed everything, because no spec had ever sent a header of the wrong
    shape carrying a real token. Low stakes on its own — you still need the
    secret — and a line's worth of test.

fetchurl.php's four survivors are two different things, and telling them apart
was the work:

  · TWO ARE REDUNDANT, not uncovered. The explicit `127.` / `169.254.` /
    `0.0.0.0` shortcut and the metadata-address line sit BELOW a `filter_var`
    with NO_PRIV_RANGE|NO_RES_RANGE, which already refuses every one of those —
    checked address by address rather than assumed. They cannot change an
    answer, so no test can distinguish them. Defence in depth, left alone.
  · TWO ARE A GENUINE BLIND SPOT: redirects had no cover at all. Replacing the
    recursive call with a function that does not exist broke nothing, and
    neither did removing the hop limit. Nothing local can drive a redirect —
    every server this harness can reach is on 127.0.0.1, which the address
    guard refuses before the redirect branch is reached. The re-check itself
    stays structural (it re-enters fetch_url, so a redirect to a private host
    is refused like a direct one); what was extractable was the arithmetic
    that decides WHERE it goes, and pulling `fetch_next_url` out found two
    bugs in it — see TODO.

TWO THINGS THE TECHNIQUE NEEDS, both learned the hard way here:

  · **A mutation that fails to APPLY prints a green suite** and reads exactly
    like a guard that works. It happened twice in this session's other work —
    a regex that missed its target — so every sweep above checks the file
    actually changed and says `DID NOT APPLY` when it did not. Without that,
    83 green results would have been 83 confident lies.
  · **A fixture can mask the guard under test.** With one calendar in the
    store, manage's 'no such calendar' guard was shadowed by 'the last calendar
    stays' on the very next line: neutering it changed nothing observable, so
    the mutation survived a test written specifically to catch it. Two tests
    were dead on arrival until the fixture grew a second calendar and a second
    habit section. Re-running the sweep AFTER writing the tests is what found
    that; writing them was not enough.

The Swift row is the native seam, and it had never been checked the other way
round: the checkers were trusted to catch a broken Swift function without
anyone breaking one. Six mutations, all caught by exit code —
`check-widget-feed.sh` sees `toggledTicks` losing its remove branch, gaining a
duplicate, and `packed()` ignoring the height it is given (the overfill Sean
reported); `check-watch-feed.sh` sees `capped()` dropping its limit, counting
within days instead of across them, and a Codable field renamed on the wrist,
which is the cross-language drift it exists for. `check-watch-format.sh` had
already recorded its own proof.

webauthn.php's survivors were both in `webauthn_origin_ok`, and the reason the
passkey specs could not stand in for a direct test is worth keeping: this
harness EXPECTS `http://127.0.0.1:$port`, and the foreign origin it tries
differs in PORT as well as host, so the port comparison refuses it and the host
restriction is never exercised. Widening the localhost test to `fn($h) => true`
passed the entire suite while accepting `https://evil.example` as
`https://calmind.example` — verified by calling the function directly, not
inferred from the mutation surviving.

  · store.php's one survivor was `flock(LOCK_EX)`, and the reason it had no
    cover is worth knowing: it CANNOT be tested through the API, because
    `php -S` serialises requests by itself — a parallel HTTP test would
    demonstrate the dev server's behaviour, not the lock's. Four real processes
    calling with_lock directly is what makes the race happen. Unlocked, 119 of
    160 increments are lost, on every run; locked, none are. A guard that only
    fires under concurrency needs a test that creates some.

  · A THIRD, from the passkey work: **a shared-state suite makes ORDER part of
    the test.** Placed after the counter-regression spec, all three new flag
    refusals passed — for the wrong reason, because that spec removes the
    passkey at the end and a 401 'not recognised' reads exactly like a 401
    'not verified'. Only the positive case at the end of the same test exposed
    it. Its signCount then had to be chosen against the specs either side:
    above its own attempts, below the 9 the counter spec must succeed with,
    above the 2 it must refuse.

Worth repeating on anything new here. It is the cheapest way to find a branch
nothing is watching, and a clean result is real evidence — but only once both
of the above are ruled out.

## server/ — the API contract (PHP over real HTTP)

- Auth: signup validation, hashed storage (no plaintext on disk), login,
  token revocation on password change, recovery codes (single-use, five
  wrong burns it).
- Sync: cursor round-trip, LWW, tombstones, malformed-row tolerance,
  MAX_BATCH/MAX_PAYLOAD caps, per-user walls.
- Sharing: the mutual gate re-checked from both stores on every request,
  bucket-filtered pulls, shared_put scope rules (structure refused, private
  rows unreachable both as stored and as sent), removal ending it instantly.
- The widget feed: read-only token (a bearer is refused as one), dated
  in / undated non-riders out, rolled repeats keeping future dates, hidden
  folders/calendars honoured, the cals= pin (narrow-only, stale → prefs),
  the 12-row cap, spoken times.

## e2e/ — gestures under a real mouse (Playwright)

The suite's by-eye column, given teeth: every spec signs up its own account
against a scratch API, so state never leaks. Covered: sign-up → Calendar
landing; add + tick; manager drag reorder surviving reload; two-press
delete; long-press inline edit; page edit mode's gate (absent → revealed →
Escape); row/section/cross-folder/empty-section drags (measured, entered
through edit mode as a finger must); kind conversion through the ✎ window;
duplicate ⧉; swipe-left delete arriving armed; week mode folding and paging;
rendered rich text; themes (pick → repaint → reload persists → logout
midnight); the full sharing handshake ×2 (live ticks from the @partner view
and the All canvas, shared note editing, recolour swatch, partner-destination
add); ?tick= quick-done; the rolled flash on and off; the remembered day;
the widget setup page's pin.

Added since: the day panel's GROUP ORDER (one group per kind and owner, mine
before theirs, in the legend's kind order — read off the headings themselves);
the month cell's fixed two-row mark well, measured on every cell so a quiet
day can't stand shorter than a busy one; a habit dragging to a new spot and
surviving a reload; habits showing five day columns on a phone and seven with
room, with the pages abutting — no overlap, no gap; the web-app head and
manifest an install needs; and Sean's COLOUR CHAIN end to end — the folder's
colour in the manage menu reaching both the legend chip and the date's own
mark, including when the reminder is overdue (the case that was wrong);
a habit renaming on ONE tap once the pencil is on (and not before it); and
the suite's own scar — a day is selected by a TAP and nothing else, so a
sideways swipe pages without picking the cell it lands on and a vertical
one folds without picking either.

Two more shapes the suite had never taken, both added the same way — by
looking at what the tests DON'T vary rather than at the code:

```sh
npx playwright test e2e/desktop.spec.ts             # 1160×800, the Tauri width
npx playwright install webkit                       # once
npx playwright test -c playwright.webkit.config.ts  # the spine, in WebKit
```

Every spec but one runs at 420×900 in Chromium. The desktop shell ships a
window at 1160×800 around this same bundle, and Sean's daily use is an iOS
home-screen web app — which is WebKit. So the width the desktop app runs at
and the engine the phone reads it in had both never run a test. The desktop
spec is about shape, not pixels (the column stays a bounded centred column,
nothing scrolls sideways, habits earns its full week at that width); the
WebKit config runs the spine only — sign up, add, tick, rendered markers, the
head an install needs — because gesture specs lean on synthetic mouse
behaviour that differs by engine and a red run full of harness noise teaches
nobody anything. It lives in its own config so the ordinary `npx playwright
test` neither changes nor needs the WebKit download.

**It is NOT in the deploy gate, and that cost something.** `deploy-test.sh`
runs core, the PHP specs and the Chromium suite; the WebKit config is
manual. Through an entire session of shipping to web it was never run — and
the first run of it found a real defect that Chromium could not see (a 50ms
deferred focus in the note editor, `TODO.md`). An engine Sean reads the app
in every day had, in practice, zero coverage.

Run it by hand after anything touching focus, selection, or layout:

```sh
npx playwright test -c playwright.webkit.config.ts   # 16/16
```

**`app.spec.ts:353` here is INTERMITTENT and its cause is open.** Two
failures in about fifteen runs, both after heavy real work; 7 of 7 idle
passes; and 5 of 5 passes under deliberate CPU starvation, which is what
killed the tidy 'it is just load' explanation. Counts are in TODO.md. Repeat
a red run before believing it, and do not read a green one as proof — the
note editor does contain a 50ms deferred focus that is a race by
construction, whoever wins it today.

Every one of those signs up a FRESH account and drives half a dozen records,
which is not the shape the app actually runs against. `e2e/seeded.spec.ts`
closes that: it runs `server/tools/seed-example.php` against the harness to
build the demo store through the real API — a couple of hundred records over
several folders and sections, overdue rows, a rider, repeats mid-stream, three
calendars, two months of habit history, all anchored on today — then signs in
and reads what the screens make of it. It is the only test where the legend
balancer meets more than two chips, and the only one that would catch a screen
that goes blank or throws at size.

A session dying underneath you is covered too (`e2e/revoked.spec.ts`): the
server revokes other devices' tokens on a password change — its own rule, with
its own test — and this is the OTHER end, which had never run. The second
device's next sync comes back 401 and it must return to the login, not treat a
dead token as "offline" and keep taking edits that can never land. The device
that made the change keeps working.

One spec guards the others: `e2e/testids.spec.ts` checks that every testID any
spec reaches for is actually rendered somewhere in the app. A misspelled testID
is not a failing test, it is a PASSING one — `toHaveCount(0)` and
`not.toBeVisible` on a name nothing renders are true forever, and this suite
has a dozen such assertions, all of them guarding behaviour that is hard to
check any other way. A typo would retire the guard silently rather than
announce itself. It handles template-built ids (`share-${bucket}-${name}`) by
prefix, and asserts it read both sides before comparing, so an empty scan
cannot pass for a clean one.

`e2e/chrome.spec.ts` watches the top bar, which nothing did until it broke
twice in one day. Back must sit LEFT of the title on every screen; a screen
with a picker keeps it in every view mode; the username pill is always there.
Both of the day's regressions were controls that came and went or sat on the
wrong side, and either way everything beside them moved — which from outside
looks like "all the button placement is broken". Verified with teeth:
reintroducing both regressions turns two of the three red.

The WebKit run (`npm run test:webkit`) grew on
the day Sean said the button placement was broken. It now carries the header
rules and recipe scaling as well as the original spine, because those are what
he actually looks at and they had only ever been checked in Chromium — an
engine he does not use. His daily reading is an iOS home-screen web app, which
is WebKit, and so is the macOS desktop shell. Nine specs, green.

Passkeys are verified TWICE, against different things. `e2e/passkey.spec.ts`
runs locally and proves the wiring; `e2e/live-passkey.spec.ts` runs against the
deployed test server and proves the parts that only exist there — a
relying-party id derived from a real host rather than localhost, an origin with
no port, and a genuinely secure context. Those fail invisibly: every passkey
stops working at once with no error until someone tries to sign in. It is
opt-in because it touches the network and leaves an account behind:

    CALMIND_LIVE=1 npx playwright test live-passkey

It asserts the URL contains /test/ before it creates anything, and prints the
account it leaves. There is no delete-account endpoint, so the residue is real.

SIGNING OUT is checked against a storage that will not delete —
`e2e/signout.spec.ts`, added 2026-08-12. The two tests there are deliberately
unequal, and it is worth knowing which is which. The online one passes with
the fix and without it: it exists to pin the REASON the leftover token is
normally harmless, which is that the server revokes it, and that reason was
being assumed rather than tested. The offline one is the test with teeth —
with no server to revoke anything, the device is the only authority left, and
before the fix it restored the session and showed the account's cached
snapshot on a device where Log out had been pressed.

Both drive the failure by making `Storage.prototype.removeItem` throw for the
session key alone. Not a dead store: the snapshot still writes, which is what
leaves the data there to be shown. Found by taking CLAUDE.md's own instruction
literally — search for the silent catches and triage each by what is lost.
Nineteen of them; eighteen lose fold state, which costs a re-open. The
nineteenth was this.

The DESKTOP has its own smoke, `./desktop/smoke.sh`, and one of its five
checks is the only one that says anything hard. Tauri compiles the frontend
into the binary and compresses it, so neither the html nor the app's own
strings can be grepped back out — which makes "it built" extremely easy to
mistake for "it has tonight's work in it". The exported bundle filename is
content-hashed and DOES survive as a plain string in the asset index, so
matching it against apps/app/dist is a real link between the .app and the
source. The other four (bundle exists, launches, survives, quits) are worth
having and prove much less.

A first version of that check globbed a path that did not exist, so it
searched the binary for the empty string and reported a confident YES. It is
worth assuming a green check is lying until it has been shown failing at
least once.

It then went wrong a SECOND way, which is the more interesting one. An export
emits MORE THAN ONE file called index-<hash>.js: the entry bundle (~700KB,
named by index.html) and an async chunk it loads at runtime (~18KB). Nothing
is stale and nothing accumulates — they are both current, and
`find … | head -1` picks between them arbitrarily. So the check could match
the async chunk, find it in the binary, and pass without ever having looked at
the bundle that matters. It now reads the name out of dist/index.html.

The same arbitrary pick sent me chasing a phantom "the deploy is not landing"
for ten minutes. Compare index.html to index.html, never a directory listing
to a directory listing.

My first explanation for this was that expo leaves old bundles behind, and I
briefly had `rm -rf dist` in the export script on the strength of it. That was
wrong — a clean export still emits two — and the change went back out. A fix
resting on a false diagnosis is worse than the bug, because it looks handled.

Nor did any of them have a remote edit land WHILE TYPING.
`e2e/clobber.spec.ts` is the one that found a real bug. The body writes on
every keystroke, so while you are actually typing your copy is always newest
and nothing can land on it — the window is the pause. Type a sentence, stop
to think, and the thirty-second poll arrives with a newer version from the
other device: the field is bound straight to the record, so the half-typed
sentence was replaced in place, silently, with the cursor still in it.

Both fields now hold their own copy while they have the cursor — the record
still gets every keystroke, only the read-back is deferred. The specs pin
both the shelter and its limit: the rest of the editor keeps tracking the
other device, because a guard that froze the whole screen would be a worse
bug than the one it fixed.

Nor did any of them have something DELETED out from under them.
`e2e/deletedunder.spec.ts` opens a note on one device and deletes it on
another — an ordinary Tuesday across three clients, not a stress test. The
editor holds its record by looking it up on every render, so the moment that
delete syncs in the lookup returns nothing; the spec holds that this is a
graceful fall back to a working list rather than a blank screen with no way
out, and that nothing throws on the way.

That answer turned out not to be the whole house's. The item sheet — the
add/edit window over the calendar and reminders — is handed a RECORD rather
than an id, and never looked at it again, so the same delete left it editing
a snapshot of something that no longer existed. Pressing Save wrote the
snapshot back with a fresh `updated`, LWW beat the tombstone, and the deletion
was undone on every device: measured, the row Sean deleted on one client came
back on both, wearing the text he had just typed on the other.
`e2e/zombiesheet.spec.ts` pins the sheet to the editor's behaviour — it leaves
when its record does, and the reminder stays deleted. The wait in it is 36
seconds because the 30-second pull is the only thing that carries another
device's delete in: a reload would close the sheet and destroy the state under
test, and behind a modal there is no mutation to schedule an earlier sync.
Its first draft asked whether the sheet was gone AFTER pressing Save, which
Save does by itself — green with the bug present and with it absent. Breaking
the guard and watching which assertion went red is what caught it, and the
check now reads the sheet's state before the press and asserts it after.

Nor did any of them press a button TWICE. A thumb double-taps constantly, and
`e2e/doubletap.spec.ts` checks the three places a second press would cost
something: Done on the Add tab filing two copies, a section add committing on
both Enter and blur (the pair that already caught Notes out once, which is why
addNote carries a committed-flag), and a toggle put back where it started. All
three hold — but the guards are INCIDENTAL, not deliberate: a field clearing
itself, a screen navigating away, a completed row hiding. That is precisely
the sort of protection that stops existing without anyone noticing, which is
why it is worth pinning.

Nor did any of them get INTERRUPTED. Every spec finishes what it starts —
types, presses Enter, moves on — while a phone constantly does the opposite.
`e2e/interrupted.spec.ts` renames a reminder and switches tab without
pressing Enter (the inline edit holds its text locally and writes it on blur,
so this rests entirely on blur firing when the screen is torn out from under
it), and types half a sentence into a note before navigating away and
reloading. Both survive — and both run in the WebKit config too, because
whether blur fires on a teardown is precisely the sort of thing two engines
answer differently, and an edit that survives in Chromium and vanishes in
WebKit would vanish on Sean's phone specifically.

Nor did any of them type anything LONG. Every spec uses tidy little strings
("buy milk", "peel garlic"), while real use pastes URLs and dictates
sentences. `e2e/longtext.spec.ts` puts a running sentence and an
unbreakable no-spaces URL through the reminders list, the calendar's day
panel (the tightest row there is — tick, chips and an edit cluster beside
the text), the notes list and the note editor, and asserts the one thing
that actually breaks: the document never scrolls SIDEWAYS. Horizontal
overflow on a phone is miserable and permanent, and nothing else was
watching for it.

Nor did any of them run on a day other than today. `e2e/clock.spec.ts` freezes
the app's clock (a `Date` swapped in before the bundle loads) and draws the
screens on the days that break things: New Year's Eve — December paging into
January, and a typed "tomorrow" crossing into the next year — and February
29th, stepping into March and back. Core has vectors for the arithmetic; this
is the other half, the screens on those days, which no vector reaches. Both
passed first try, which is the answer you want and the reason to keep them.

### Edit mode, and the gestures that end it (2026-08-10)

Sean removed the Done button, so tapping out is the ONLY way to leave edit
mode — which makes "can he get stuck?" the question these specs exist to
answer. Each of Reminders, Notes and Habits is driven the same way: hold to
enter, then leave by the FOLDER header, the SECTION header, and blank space
below the list. The headers matter because a full screen has no blank space,
and they are the only always-visible surface that is not a control.

Two rules underneath, both learned by getting them wrong first:

  - The header is a plain View, never a Pressable. As a Pressable it fired
    its own onPress on the release of the long-press that had just opened
    edit mode, so edit mode opened and shut in one gesture; both Habits specs
    caught it. As a View the tap reaches the rules that already exist — the
    document listener on web, the EditExit wrapper on native — and those
    already guard that opening click.
  - Its testID is `head-sec-` / `head-fold-`, not `sechead-` / `foldhead-`.
    The allow-lists keep `[data-testid^="sec"]` and `[data-testid^="fold"]`,
    so the obvious names make the header EXEMPT from the rule it exists to
    trigger. Proven: rename Habits' to `hsec-head-` and its spec goes red.

Zero shift on entering edit mode is measured rather than asserted — see the
scratch measurement in the commit for 2026-08-10: rows identical in height,
y, tick x, tick y and body width, on both ways in.

### Collapse-all, the date sheet, and the two routes into the note editor

`collapse-all` had NO behavioural test on any screen until today. chevrons.spec
checks it is the right glyph in the right box, which says nothing about
whether pressing it folds anything. It now folds and unfolds on the list AND
the calendar's day panel — the latter being a control one day old.

The note date sheet is driven through all three of its controls, including
CLEAR, which is the one that fails silently: a note keeps a date nobody can
see it still has. Its absence is proven the way a date matters — the note is
gone from the calendar afterwards. A typed `12/25` is asserted to store a
real `YYYY-12-25`, because it did not: the field wrote the characters
straight into payload.date while every comparison in the app is against
YYYY-MM-DD.

Both routes into the note editor are pinned — from the calendar's day panel
and from the Add sheet — because Back now returns to whichever tab you came
from, and the Add route is where "stuck" would look most like working
software: the editor closing to the notes list with the tab unchanged.

## What only an eye can check

- **Icon-button centring** — the suite's pre-deploy rule verbatim: every
  glyph button re-checked visually on touched pages before deploying.
- Colour truth (palettes, washes, contrast on all four themes), font sizes
  and rhythm — Sean steers these from screenshots; match prod's CSS values.
- Native: the iOS/Android sims (login → Calendar smoke) and the watch.
  WatchConnectivity IS proven end-to-end on sims, with two gotchas that
  will bite again: the phone must run the watch-EMBEDDED build (a phone
  app without its companion makes updateApplicationContext throw, silently
  eaten by the try?), and sim pairs drift to 'active, disconnected' —
  bounce the WATCH sim and re-check `xcrun simctl list pairs`.

- **The Modal safe-area trap** — CLAUDE.md's most expensive recurring one: a
  Modal is its own window, so anything absolutely positioned in it is measured
  from the top of the SCREEN and sits under the clock. Three such bugs were
  invisible in every browser test.

  All eighteen Modals were read for that shape on 2026-08-11 and only three
  files position anything absolutely at all. None is the dangerous case:
  Reminders' `editCluster` floats over a ROW, and Notes' `edStatus` and
  `goesMenu` live in the note editor, which is a screen rather than a Modal —
  and `App.tsx` wraps every screen in a SafeAreaView on all four edges, so a
  screen-level `top` is already measured from below the notch.

  The one that depends on an assumption is chrome.tsx's user menu: it hangs off
  a `measureInWindow` of the pill, inside a Modal, with no inset added — on the
  reasoning that measureInWindow returns window coordinates which already
  include the SafeAreaView's padding, so they are the same space the Modal lays
  out in. The fallback path beside it DOES add `insets.top`, because it has no
  measurement to work from.

  ATTEMPTED ON THE SIMULATOR, 2026-08-11, AND THE ATTEMPT WAS INVALID —
  which is worth more than the check would have been. The app launched, the
  menu hung neatly under the pill, and it looked like a clean confirmation.
  It was not: the running JS was older than the source. Two independent markers
  said so — the menu had no "Undo last delete" row, which chrome.tsx renders
  UNCONDITIONALLY, and the top bar had no sync dot, which is in every web
  screenshot of the same code.

  The cause is worth knowing before anyone repeats it. The installed .app dates
  from 2026-08-10 and is a Debug build, so it takes its JavaScript from Metro
  rather than from itself — and the Metro on 8081 has been up since 2026-08-08
  and belongs to another session. Two sessions share this repo, so it is not
  ours to restart. Nothing about the screen said any of this; it rendered
  perfectly, just a version behind.

  So "open it on the simulator and look" is a trap in its current state.
  `npm run test:simfresh` now answers the first half of the question — it
  compares the installed .app on every booted simulator, and the Metro on 8081,
  against the newest source file, and says which is behind and by how long. On
  the day it was written it reported all three: two stale .apps and a
  three-day-old dev server.

  It cannot see which bundle the app has already CACHED, so the second half is
  still a MARKER: something today's source renders and yesterday's did not,
  looked for on the screen. The two that caught this were free — the "Undo last
  delete" row in the user menu and the sync dot in the top bar.

  THAT REASONING IS NOT A SIGHTING. It is consistent and it matches the
  comment, and this exact class has been reasoned wrong here three times
  before. The e2e cover is web only, where a Modal is a div in the same
  document and the question does not arise. If the menu ever hangs level with
  the status bar on a phone, this is the line to look at.

**A pass was actually done on 2026-08-11**, at 390px and 1160px, through
Playwright screenshots rather than the in-app browser (whose clicks kept timing
out). Reminders at rest and in edit mode, the calendar grid and day panel, the
notes list, the note editor, habits at five and seven columns, the add page,
the user menu, Settings and the sharing sheet.

It found ONE bug, and it was one nothing else could have found: the note
editor's footer printed the literal string `'Saved'` whatever had happened. A
hardcoded string is exactly as green as a correct one, and mutating it changes
nothing any test asserts. Fixed; see TODO.

TWO THINGS LOOKED WRONG AND WERE NOT, both worth writing down because the
temptation to report them was real:

  · The desktop column looked off-centre in the screenshot. Measured: 260/260
    at 1160px, 400/400 at 1440, 130/130 at 900, a fixed 640px column. The
    screenshot is 2320px shown at 2000 and the arithmetic was done against the
    wrong basis — the same trap that made an earlier click land on the wrong
    button. MEASURE the element; never read a position off a resized image.
  · Habits' pager says "This week" at seven columns and a date range at five.
    That is `w === 0 && cols === 7` in the source, deliberate, and the dates
    are on screen directly beneath it either way.
  The script's FORMATTING is pinned by the widget spec (header row, uppercase
  day headings, the rules, the right-aligned time) because two copies of it
  drifted apart once and the flat one shipped.
- **The NATIVE home-screen widget's pixels.** Everything behind them is
  covered — the entitlements, the cache writer, core's shape, HomeWidget's
  decoder and `drawnDays` — and none of that is the same as having seen it.
  It cannot be seen from here either: a simulator build carries no
  entitlements whether it is signed or not, so App Groups do not exist there
  and the widget has nothing to read. It needs Sean's phone and a look. The
  same goes for the watch, with one difference worth remembering — the watch
  app itself DOES render on a watchOS simulator, and the day someone finally
  looked at one it produced three bugs in an hour, so there is no excuse for
  waiting on a wrist.
- OCR against REAL photographs. e2e/ocr.spec.ts drives the real engine, but
  over a fixture card this repo draws itself (e2e/fixtures/recipe-card.svg,
  rasterised by the browser mid-run) — so it proves the pipeline and the
  parsing rules, not how tesseract copes with a glossy page, a handwritten
  card, or a photo taken at an angle. That needs Sean's camera.
- Anything the export can't exercise: iOS keyboard behavior, safe areas,
  home-screen PWA standalone mode. **The status-bar strip is the live
  example**: the head now carries viewport-fit=cover and the translucent
  style, and a spec holds those in the HTML — but whether an INSTALLED web
  app draws the strip in the theme's colour can only be seen on a phone.
  Two things to know when checking it: iOS caches the head at install, so
  the icon must be DELETED and re-added, not just relaunched; and the
  simulator accepts no synthetic tap anywhere in the bottom toolbar (in
  Safari as much as in our own tab bar), so Add to Home Screen cannot be
  driven from here at all. That last limitation also puts the Habits, Notes
  and Reminders tabs out of reach on the iOS sim — **use ANDROID for any
  native gesture you need to see**: `adb shell input tap/swipe` is accepted
  everywhere the iOS sim refuses it, and that is how the drag was finally
  witnessed (grips revealed by ✎, a habit dragged past its neighbour and
  dragged back). Boot notes for the emulator, both of which cost time once:
  it can come up with a dead graphics state and never open its adb port at
  all (kill it hard — a plain pkill doesn't — and restart with `-gpu
  swiftshader_indirect`), and `expo run:android --device` wants the AVD
  NAME, not the adb serial.
- **Desktop** (desktop/): the shell holds NO behavior — it is the same web
  bundle the e2e suite drives, so the three runs above cover it. The by-eye
  residue is only the shell itself: window opens, CM dock icon, signs into
  the live test API, quits clean. Windows: trigger the manual
  desktop-windows workflow and smoke the artifact when one is wanted.
