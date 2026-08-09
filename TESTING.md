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
  rather than sorting away from it.
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
