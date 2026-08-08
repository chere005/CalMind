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
                              #   (npm -w app exec expo export -- -p web first)
```

All three must be green before `./server/deploy-test.sh`.

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
- Anything the export can't exercise: iOS keyboard behavior, safe areas,
  home-screen PWA standalone mode.
