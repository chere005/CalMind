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

All three must be green before `./server/deploy-test.sh`.

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
