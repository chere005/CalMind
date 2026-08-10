# What the tests cover — and what still needs an eye

The suite's bargain carries over: **change a feature, change its test in the
same commit; add a feature, add a test with it; fix a bug, add the case that
would have caught it.** This file is the map of which harness watches what,
and what nobody watches but a person. Keep it in step, or a thing ends up in
neither list and nobody is looking at it.

## The three runs

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
`packages/core/src` is newer than `apps/app/dist/index.html`, it stops and
tells you to run `npm run export:web`. The specs drive the EXPORT, not the
source, so a stale bundle makes the run a lie in either direction — a pass
for code that isn't there, or a failure for a fix that is. That is worse
than a red run, because it looks like an answer.

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
- The SCRIPTABLE WIDGET, actually executed (`test/widget.test.ts`). Its
  Scriptable globals are stubbed just enough to record what the script builds,
  then the structure is asserted: the header row, uppercase day headings with
  today named as today, the time as its own node AFTER the title rather than
  glued in front of it, "No more items today." on an empty day, "Couldn't
  load." when the feed won't, and a small widget showing fewer rows than a
  large one. Checked against the real regression — breaking the header and
  inlining the time the way the rewrite did turns two of these red. The
  gesture suite's string-matching catches a rewrite; only this catches a typo.

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

**A failure here is usually LOAD, and the code is still at fault.**
`app.spec.ts:353` is flaky in a measurable way: 7 of 7 passes on an idle
machine, and a failure both times the machine was busy — once under an
emulator plus two xcodebuilds, once straight after a four-minute Chromium
run. The note editor focuses its body on a 50ms timer; starve that timer and
it lands after the blur it was meant to precede (TODO.md has the design
question). So repeat a red run on a quiet machine before believing it — and
do not conclude the code is innocent when it passes, because a race that
only needs a busy CPU is exactly what CI will find.

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
- Scriptable on a real phone (the widget itself, tick links, the PWA hop).
  The script's FORMATTING is pinned by the widget spec (header row, uppercase
  day headings, the rules, the right-aligned time) because two copies of it
  drifted apart once and the flat one shipped.
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
