# TODO — in priority order

The working list as of 2026-08-10. PARITY.md stays the
ledger of what's *done*; this is what's still owed, top priority first.
Standing rules: behavior lives in packages/core, RN primitives only, the old
suite (seancheren-reminders) IS the spec — grep its CSS/PHP before guessing a
visual. Deploy to **test only** (`./server/deploy-test.sh`) as changes land.

## 0 · Sean's live batch (from the phone, via Dispatch)

- [x] **"On mobile only show 5 days of habits in weeks"** — a real width
      breakpoint (7 from 700px, 5 below), not a platform check, so a tablet
      keeps the full week. Window ends on TOMORROW, so today stays in view
      with a day of headroom — that's the window native already used; say so
      in case he wants it ending on today instead. Paging steps by the
      columns shown, since a fixed 7-day step at 5 wide skipped two days.
- [x] **Legend line balancing** — core `balanceLines`, measured widths, no
      hardcoded counts. Confirmed on his own store on the sim: 2+3, no
      orphan.
- [x] **"Only show things on the legend which actually have at least one
      occurrence in the current calendar view"** — the legend was reading
      the days past the folder tri-state the grid draws through, so a folder
      switched to 'none' kept a chip with no mark anywhere. Verified on
      device by paging: Aug 5+2 chips → Sep 1+1 → Nov none at all.
      Edge cases, both answered "the heading belongs to its chips": an owner
      with nothing left loses its name too, and an empty month shows no
      legend and a single rule.
- [~] **"iOS web app shouldn't be white on the top bar"** — fix shipped to
      test, NOT verified on an installed PWA. The export carried no
      `viewport-fit=cover`, so `env(safe-area-inset-*)` was 0, the app never
      padded, and iOS drew its own light bar. Head now patched at export.
      **Sean must delete the home-screen icon and re-add it** — iOS caches
      the head at install time. Open question for him: the translucent style
      forces WHITE status-bar text, which will read poorly on the cream Sage
      theme. iOS offers no "match my background, choose my own text colour".

- [x] **"Make sure the highlight color for dates matches the color it
      appears on the calendar legend / which is ultimately the color set for
      the folder in the manage menu"** — core was already reading the folder
      colour for both; the Calendar screen was repainting an OVERDUE cell
      icon in the theme's orange. Now folder-coloured like the suite does it.
      Spec pins the chain and fails against the old code. **Open question
      for Sean:** a FINISHED colour still greys out rather than keeping the
      folder colour — that is the suite's own rule, and the icon hides
      entirely unless Completed is on, but say the word and it goes.

- [x] **Recipes, Sean's elevated priority** — four things off the phone
      screenshots: an ingredient with no number in front of it now counts as
      one; a line mends by TAPPING it rather than delete-and-retype; both
      lists reorder by the marker they already wear; delete moved behind the
      swipe, as every other list does it. The fifth thing I listed turned out
      to be my own misreading — a SAVED recipe already renders properly in
      the note (bold headings, bullets, numbered steps); the "wall of plain
      text" screenshot was taken mid-edit.
- [x] **OCR quality — UNBLOCKED by Sean 2026-08-09 ("find several online
      examples") and done against four real sites.** Playwright screenshotted
      King Arthur / Budget Bytes / RecipeTin / Sally's as rendered, the
      app's own tesseract read them, and every parser rule chases an
      OBSERVED failure: checkbox glyphs, dash bullets, fused tokens
      (1and 1/2, 11/4tspsalt, 1'teaspoon), price chatter, ratings-as-
      ingredients, and wrapped-column fragments rejoining (triple-guarded so
      'a pinch of salt' never glues to a neighbour). Sally's: 22 fragment
      rows → 11 clean ingredients. Residue, honestly: capitalised wrap
      fragments stay split (a tap mends them); some mixed-case video
      garbage passes the ratio filter. Real photos of HIS cards remain
      worth a pass when he shares them — camera noise ≠ screenshot noise.
- [x] **Units badge the row, right-justified like a parsed date** — Sean
      verbatim. ingredientParts lifts qty+unit as data from
      parseIngredient's own output; the row wears the reminder date-chip's
      EXACT pill (marginLeft auto, radius 999, flexShrink 0 — added after
      the first capture showed '⅓ cup' folding inside its own pill). No
      quantity, no badge. Before/after screenshots taken on a throwaway
      LOCAL account; paths handed over for Sean.

## 0.4 · Sean's live batch, round two

- [x] **The white bar at the TOP is fixed** — he confirmed it. What fixed it
      was viewport-fit=cover plus the translucent status-bar style.
- [x] **The white bar at the BOTTOM** — the same root cause, newly reachable.
      Nothing ever set a background on html/body, so any pixel the app's views
      don't paint falls through to the browser default (white), and
      viewport-fit=cover is what let the page reach the home-indicator inset
      where it showed. Painted now at first paint AND on every theme switch,
      so it follows Sage rather than pinning midnight. The live smoke checks
      it, so a regression can't ship quietly.
- [?] **App mode with DuckDuckGo as default** — told him the platform
      constraint rather than promising a code fix: on iOS only Safari's "Add
      to Home Screen" makes a true standalone web app; a third-party browser's
      version opens in that browser. His default can stay DDG — launching the
      icon doesn't route through the default browser. Sequence given: delete
      the old icon, add from Safari, launch. If it STILL opens with chrome
      after that, it's ours and I want to know.
- [?] **Passkeys** — feasibility read given, no code. The load-bearing
      correction: CalMind already hashes with password_hash and has a test
      proving no plaintext at rest. The plaintext problem is the OLD suite's.
      So passkeys are convenience plus phishing resistance, not a rescue —
      and the cost lands in the NATIVE tiers (separate iOS/Android
      implementations, domain-association files, a Tauri webview that may not
      play) plus CBOR/COSE verification in framework-less PHP. Recommended
      later, web-first, passwords staying as the fallback. Awaiting his word.

## FLAKY UNDER LOAD · the new-note focus is a 50ms race

OBSERVED, cause NOT established. `app.spec.ts:353` under
`playwright.webkit.config.ts`, everything actually run:

  - idle: 13 runs, 13 passes
  - once after an emulator + iOS simulator + two xcodebuilds: FAILED
  - once straight after a 4-minute Chromium suite: FAILED
  - under SYNTHETIC cpu load, four busy cores: 5 runs, 5 passes
  - RE-RUNNING the exact failing condition (full Chromium suite, then WebKit
    immediately): PASSED

Two failures in about twenty-two runs, and every attempt to reproduce them
deliberately has failed — including replaying the precise sequence that
produced one of them. Do not spend time on synthetic load or on suite
ordering; both were tried and neither does it. What is known: it is intermittent, it has only ever
been seen in WebKit, and the code contains a 50ms deferred focus that is a
race by construction whether or not it is this one.

I have now described this bug three ways — standing failure, does not
reproduce, load-sensitive — and been wrong each time by concluding from too
few runs. The record is the counts above; the cause is open.

Not reachable by a person at a 50ms window: pressing + and getting to the
title in a twentieth of a second is not something a human does. The deferral
is still worth removing, which is the design question below.

WHAT HAPPENS. Opening a note from `+` sets bodyEditing and then focuses the
body through `setTimeout(bodyRef.current?.focus(), 50)` (Notes.tsx). The
spec performs FOUR interactions inside that 50ms; in WebKit the deferred
focus lands after the final blur, so the body never collapses to its read
view and `note-body-view` never appears.

HOW BAD IS IT, HONESTLY. Less than the first draft of this entry claimed,
and the correction matters for whoever picks it up. Stealing focus from the
title needs a sub-50ms reaction — press +, register a new screen, reach the
title — which no human does; only a driver can. What IS reachable is the
other half: for the first 50ms after + the body is not yet focused, so a
fast typist's opening keystrokes go nowhere. That is the real defect, it is
small, and it argues for removing the deferral rather than for urgency.

WHY IT IS STILL HERE. Two fixes were tried and both were worse:

  - Guarding the deferred call (skip if an input already has focus) made it
    decline to focus at all when the title had been touched first, breaking
    "a section's + lands in the editor TYPING".
  - Removing the deferral and restoring the body's `autoFocus` broke three
    more, including "opening a second note never shows the first one's text"
    — autoFocus and the body's own `onBlur -> setBodyEditing(false)` interact
    across note switches in a way that needs proper thought.

Reverted to the committed state rather than leave a half-fix in the tree.

THE MECHANISM, found on the fourth failure and worth more than the fixes
were. The body's `onBlur -> setBodyEditing(false)` collapses the editor
whenever focus LEAVES IT — including to the title of the same note. So with
synchronous focus: + focuses the body, filling the title blurs it, the
editor collapses, and the `note-body-edit` a spec then reaches for is gone.
That is exactly why removing the deferral broke notesswitch and both
recipeurl specs: all three do + -> title -> body.

Which means the 50ms delay is not incidental. Those specs DEPEND on the
steal — the body gets focus back after the title is filled, so the field is
still there for them. Any fix that stops the theft must also decide what
tapping the title should do to an open body editor.

WHAT TO DO — and it is a DESIGN question for Sean, not a bug to hunt.
Today, moving focus to the title closes the body editor and renders its
markers ('note body renders its markers as styled text when you tap away'
asserts precisely that). If instead the title is treated as part of the same
editing session — blur to the title leaves the body open — the race
disappears, the body can be focused synchronously at mount, and the specs
stop needing the steal. That is a coherent design and probably the right
one, but it changes what 'tap away' means and is his call.

Whoever does it: change `useNoteScoped`'s reset, the onBlur collapse and the
fresh-note effect TOGETHER, and run BOTH configs after every step. Four
one-at-a-time patches each fixed one spec and broke another.

And note the two sites share ONE TextInput, which is why neither can be
fixed alone: autoFocus on it serves the + path and the tap-to-edit path at
once, and that is precisely what broke notesswitch and both recipeurl specs
when tried. The deferral is not there by accident — the field does not exist
until bodyEditing has rendered — so removing it means changing WHEN the
field mounts, not just how it is focused.

RUN IT: `npx playwright test --config=playwright.webkit.config.ts`. That
config had never been run in this session before tonight, which is how a
real bug in Sean's own engine sat unnoticed.

## BUG · the watch's month grid drops the first days of the month

Seen on a watchOS simulator, 2026-08-10, showing August 2026. The grid's
first visible row is `6 7 8` sitting in the last three columns; days 1-5 and
the whole leading-blank row never appear. Scrolling up does not reveal them,
so it is not a scroll artifact.

The week maths is RIGHT — rows break after 8, 15, 22, 29, all Saturdays, and
today (10) is green in the correct column. What is missing is the start:
`MonthView` renders `ForEach(0..<lead) { Text("") }` for the leading blanks
and then `ForEach(1...days)`, and the first eleven cells (six blanks plus
1-5) do not come out.

TRIED AND DISPROVED: the blank cell. `Text("")` has no content and SwiftUI
can decline to lay it out, so the theory was that the LazyVGrid never
reserved those columns. Replacing it with `Color.clear.frame(height: 1)` —
which does have a frame — changed NOTHING on screen. Do not spend time there
again.

MEASURED, so the next attempt does not start from an impression. On a
416px-wide screenshot the seven columns sit at x = 30, 89, 148, 207, 266,
325, 384. The first drawn row has lit spans at 261-272, 320-330 and 379-390
— columns 5, 6 and 7 — and the digits are unambiguously 6, 7, 8. For the
week beginning Sunday the 2nd, that is exactly where the 6th, 7th and 8th
belong, so the PLACEMENT is right.

A vertical brightness scan shows the title band at y=112-144 and the first
grid row at y=168-184, a gap of ~24px where a row is ~42px. So there is no
row hidden above and nothing is merely scrolled off: the grid's first eleven
cells (six leading blanks, then the 1st through the 5th) are simply not
drawn, and everything from the 6th onward is perfect.

ALSO DISPROVED: lazy materialisation. The page was reached through several
quick swipes, so the obvious theory was that a LazyVGrid inside a paged
TabView had not built its top rows yet. Re-measured after it had sat idle:
byte-identical — first content still at y=170, same spans at columns 5, 6, 7.
It is stable, not a timing artifact.

So three theories are dead: the blank cell (`Color.clear` with a real frame
changed nothing), a hidden row above (the brightness scan leaves no space for
one), and lazy materialisation (stable after settling). A clean missing
PREFIX of exactly one row plus four cells, reproducible, with correct
placement for everything that does draw.

Note for whoever continues: a swipe does not scroll a watchOS ScrollView (the
crown does, and this harness cannot turn it), so 'scroll up and look' is not
available by that route. Rendering the grid outside the TabView, or with a
fixed month and lead, would isolate whether the paging is involved at all.

NOT a regression: `git log` shows MonthView untouched this session. It has
been wrong for as long as the page has existed, and nobody saw it because
nobody had ever rendered the watch app — which is the actual lesson. Three
hours went into polling an unreachable watch when a simulator would draw it.

## Watch UI, SEEN at last — 2026-08-10, watchOS simulator

Sean's watch was off-network all night, so the grouping and 12-hour work was
built, tested and never LOOKED AT. A watchOS simulator renders it without his
wrist: build CalMindWatch for a `platform=watchOS Simulator` destination with
`CODE_SIGNING_ALLOWED=NO`, then `simctl install/launch` and
`simctl io <udid> screenshot`. Worth reaching for far earlier than polling an
unreachable device for three hours.

Confirmed on screen, not inferred:

- **`8/12 3:30pm`** — his format exactly. 12-hour, no leading zero, m/d for a
  day that is not today, minutes only because it is half past.
- **Four page dots, first filled** — the horizontal paging that replaced
  `.verticalPage`. That is the fix for 'I can't see any events': the dots say
  more pages exist and which one you are on.

Then all four pages, with a SEEDED grouped feed — every rule confirmed:

- Reminders: folder header **Home** (two folders exist, so both are named),
  section headers **Now** and **Later** under it (Home has two sections), and
  **Work with NO section header** because Work has only one. That is exactly
  the rule watchGroups encodes, seen rather than trusted.
- Chips in 12-hour throughout: `Today 3pm`, `Today 9:30am`, `Today 5pm` —
  minutes only when there are any.
- Events: `3:30pm` and `2pm` under day headings.
- Month: every day present after the LazyVGrid fix.

How to seed one: the phone's WCSession context WINS at activation, so a
seeded cache is overwritten while the sims are paired. `simctl unpair`
first — that reboots the watch sim, so reinstall after — then
`simctl spawn <udid> defaults write com.seancheren.calmind.watchkitapp
"watchlist.json" -data <hex>`. Re-pair afterwards.

## 0.45 · The watch actually syncs — 2026-08-09, later the same night

Two stacked failures, each invisible alone, both silent by design.

- **WCSession error 7006, 'Watch app is not installed.'** The watch app had
  been sideloaded wrist-first with devicectl, so iOS never registered it as
  CalMind's companion and WCSession refused to carry anything. Paired, both
  apps open, complication drawing — and no delivery. The push used `try?`,
  the `.catch(() => {})` pattern in Swift, so it left no trace and cost most
  of a day. Removing it turned a day of guessing into one console read.
- **The watch's UDID was never in the profile** — 'cannot install at this
  time' from the Watch app. Xcode only registers devices it BUILDS AGAINST,
  and every build that day targeted a phone. One build with the watch as
  destination fixed it.
- **The events were never missing.** `.tabViewStyle(.verticalPage)` stacked
  Summary/Reminders/Events/Calendar with no indicator, so left/right did
  nothing and nothing on screen said more pages existed. `.page` restores
  the dots. A UI bug that read, all the way through, as a sync bug.

Shipped alongside: the notes `+` (the inline naming step WAS the bug — see
below), chevrons 13→11, the legend no longer scrolls, default note titles,
AASA live on prod with the Content-Type Apache would not set on its own.

**The lesson worth keeping:** every one of these was silent. A `try?`, a
missing indicator, an unregistered device — none of them said anything, and
each one made the next diagnosis harder. Search for the quiet failures
first; they are where the days go.

### Still open

- **iOS home-screen widget** — target written and committed
  (`targets/appwidget/`, interactive check-off via AppIntents, App Group
  cache shared with the watch, ticks queued as `pendingTicks`). NOT built
  in: needs `expo prebuild`, which regenerates `ios/` and would rebuild the
  signing fixed by hand that night.
- **Native iOS OCR** — not started. Vision-framework replacement for
  tesseract.js so photo import works off the browser.
- **URL recipe import** — core `recipeFromHtml` done and tested (JSON-LD
  schema.org/Recipe, ingredients + steps ONLY per Sean). Needs the app-side
  fetch and a paste-a-URL entry point.
- **Docs/comments/testing pass incl. macOS and Android** — not started.
  Neither platform was exercised in this session at all.
- **The `+` deploy lesson**: the deployed bundle hash did not match the
  local build for hours while Sean reported a fixed bug as broken. Compare
  index.html to index.html before believing a deploy landed.

## 0.44 · Sean's live batch, round three — 2026-08-09, the devices session

First session to put the app on his REAL iPhone 15 Pro and Apple Watch
Series 9. Both are installed and reachable over Wi-Fi.

- [x] **`ios.appleTeamId` set in app.json.** The apple-targets plugin warned
      on every device build that it was missing and that "iOS builds may
      fail"; the watch target had no team until Xcode guessed one. Naming it
      fixes both targets at once — the next build reports `Auto signing app
      using team(s) 2LGYTL3FSJ, 2LGYTL3FSJ`.
- [x] **The web app's bottom gap — fixed by CONSTRUCTION, not verified.**
      expo-reset sizes with `height:100%`, which under viewport-fit=cover
      resolves against the LARGE viewport, so in a Safari tab the app is laid
      out taller than the visible area and the tab bar falls below the fold —
      and since the toolbar collapses on scroll, the gap DIFFERS per screen.
      That matched Sean's report exactly (Reminders ~102pt vs Calendar ~60pt).
      Now `100dvh` behind an `@supports` guard, patched at export so it
      survives every re-export; verified served, idempotent.
      **Still open:** he never said whether those screenshots were a browser
      tab or the home-screen icon. If standalone, `dvh == lvh == svh` and
      this changed NOTHING — the cause is elsewhere and needs a screenshot or
      a signed-in session. Neither web surface is measurable from here: both
      sit behind the login wall and his account is not mine to open.
- [x] **monthLegend no longer chips an all-ticked folder.** The cell hides a
      finished mark unless Completed is showing, so the legend named a colour
      the grid never drew. Takes `showDone` now, wired through from the
      screen. Proven by breaking the fix and watching the test go red.
- [x] **day.ts held two RAW NUL bytes** as sort-key separators, so `file`
      called it `data` and grep/ripgrep silently matched NOTHING in it —
      minutes lost before the cause was even visible. Now escaped;
      character-identical, all 279 prior tests still pass.

### Watch — what is actually true now

- [x] **CalMindWatch runs on his real watch.** The target is real and
      generated by apple-targets from `apps/app/targets/watch/`.
- [x] **The install path is DIRECT, not the Watch app.** "Available Apps →
      Install" failed repeatedly with "could not install at this time";
      `xcrun devicectl device install app --device <watch-udid>` works first
      try. Root cause of the failures: the watch profile listed only the
      PHONE's UDID. Xcode only registers devices it actually builds against,
      so a build must target the watch itself to get its UDID in.
- [x] **App Groups WORKS on a free Personal Team — proven, BUILD SUCCEEDED.**
      I had warned this would likely need the paid $99/yr account; that was
      wrong. The issued profile carries
      `app-groups=['group.com.seancheren.calmind']`. This unblocks the
      complication, which needs a shared container because a widget
      extension is a separate process and cannot read WatchStore's
      UserDefaults.
- [x] **Modular face complication — BUILT AND ON HIS WATCH.** A
      `type: 'watch-widget'` target in `apps/app/targets/watchwidget/`, all
      four accessory families, WatchStore's cache moved to the App Group
      suite (standard defaults kept as read fallback), WidgetCenter poked on
      every push. Compiles for watch sim AND signs for device. Sean adds it
      by long-pressing the face → edit → pick a slot → CalMind, and it only
      appears in that list once the NEW build is on the watch.
      INSTALLED on his phone and watch as Release ~14:40 — the phone build
      also ends the Debug-only LogBox banner ("Open debugger…", which sat
      exactly over the tab bar and likely WAS his "spurious space") and the
      Metro tether that would have stranded the app off home Wi-Fi. The
      complication list shows CalMind only under the NEW watch build; the
      The watch install took ~an hour of retries: the build was ready long
      before the transfer was, because the watch's Wi-Fi link kept dropping
      mid-copy. The working recipe is a poll-for-reachable loop that WAITS
      30s for the tunnel to settle before invoking devicectl — an install
      fired the instant the watch appears dies in the encryption handshake.
      widget reads the App Group container — VERIFIED on the sim pair
      (2026-08-09 15:0x, reading Sean's data read-only): the phone pushed
      {items: 29, events: 4}, the watch decoded and WROTE it to the group
      container, calendar colours intact. What remains unverifiable from
      here: the WidgetKit render on a real face (sim faces aren't
      scriptable) and the tick tap, which would WRITE to his data and
      waits for his thumb.
      2026-08-09 ~15:1x, Sean verbatim: "Make the watch module just show
      the next two events." Done as the complication (he had just been in
      the face picker): the Modular rectangle draws the next two CALENDAR
      events one line each (dot, "Wed 15:30 · Chase"); inline the next one;
      corner count+label; circle count. Fewer than two shows what there is,
      none says "No events". Events ≠ dated reminders — Sean CONFIRMED
      ("you got it right with just events"), so do not fold reminders in.
      Rebuilt and INSTALLED on the watch 2026-08-09 (~16:5x).
      Two traps burned into this, do not relearn them:
      · Apple REFUSES the bundle id suffix `.complication` outright ("cannot
        be registered … not available") — `.widget` registers fine. Same
        team, same day, only the string differed.
      · apple-targets wires extensions in DIRECTORY ORDER: a widget dir
        sorting before `watch/` gets embedded into the PHONE app (installd
        then rejects the install, watchOS binary in an iOS PlugIns), because
        the watch target doesn't exist yet when the embed runs. The dir is
        named `watchwidget` so it sorts after `watch`. If it's ever renamed,
        check `Embed Foundation Extensions` lands on CalMindWatch in the
        pbxproj.
- [~] **Four watch tabs: Summary, Reminders, Events, Month — written,
      build in flight.** The feed prerequisite landed first: core `watchFeed`
      sends items + the next 30 events (capped BECAUSE an oversized
      application context is dropped silently), all-day leading timed —
      day.ts's own tiebreak, which the first draft had backwards and the
      test caught. Old watch builds decode `{items}` and ignore the rest, so
      no lockstep upgrade. WatchTabs.swift: verticalPage TabView — Summary
      (count, due-today, next event), the existing reminder list, events
      grouped by day in calendar colours, and a month grid with event dots.
      Still read-only. NOT yet verified on a simulator or wrist.
- [~] **Check items off from the watch — code-complete and INSTALLED.**
      The return path: a tap queues {tick: id} as transferUserInfo (survives
      the phone being away), lands as an onTick event, and the store applies
      it through the SAME reminderToggle a phone tap uses — repeats roll on
      the phone, never the watch; the next push closes the loop. Conflict
      rule deliberately NOT invented: last writer wins through the ordinary
      store, the suite's existing two-device rule. A tick for a deleted
      record drops silently. Both schemes build; README's read-only claim
      updated to record Sean's reversal. NOT verified end-to-end — and the
      sim route is gated too: Login has no pre-login server override (the
      Settings override is stored WITH the session), so a throwaway signup
      necessarily lands on the LIVE test server, and the deploy tooling's
      own "no account made" restraint makes that Sean's call. One word from
      him — "ok to make a test account on test" — and the tick round-trip
      verifies on the spare sim pair with zero risk to his data. Or his
      thumb on the real watch, whichever comes first.

### Still owed from this session

- [ ] **Legend rows grouped by kind** — he chose this over greedy fill and
      over per-chip truncation: reminder chips on one line, calendars on
      another. Not started.
- [ ] **"Adding a note should go straight to the note editor."** The path
      already exists (Add → onNoteCreated → Notes' effect, commented "land in
      its editor, as prod does") and e2e asserts it — app.spec.ts:157, "the
      editor auto-opens on create", which passed in today's deploy. So either
      it is native-only, or he means it should land in TYPING mode
      (`bodyEditing` starts false). Awaiting which. Cannot test it myself:
      adding a note writes to his data.
- [ ] **Passkeys from the native iOS app — probed, INCONCLUSIVE, two asks
      for Sean.** Today they are web-only by design (passkey.ts's header;
      the screens hide the button rather than offer something that throws).
      What the probing established, in order:
      · `ios.entitlements` SILENTLY IGNORES an associated-domains key — the
        first probe "succeeded" while testing nothing (the signed app,
        read back with codesign, carried no such entitlement). The
        supported key is `ios.associatedDomains` (checked against the SDK
        57 docs), and with it the entitlement verifiably lands in the file.
      · The REAL probe then failed with `No Accounts` — xcodebuild lost the
        Apple ID session, so nothing could mint a profile and the
        capability question never reached Apple. NOT a refusal.
      The probe key is REVERTED from app.json because it breaks every
      device build until resolved.
      Asks for Sean: (1) re-add his Apple ID in Xcode → Settings →
      Accounts — also needed before Aug 16, when the profiles expire and
      renewal will hit the same wall; (2) the AASA file needs the PROD
      domain root — prepared in server/prod-only/ with instructions, ships
      only on his word. Then the probe is one build away, and if Apple
      signs it the rest is the Swift credential bridge.

### Facts that will cost time again if forgotten

- **Both device profiles expire 2026-08-16.** Free Personal Team's 7-day
  window: the apps stop launching that day and need a rebuild, watch too.
- **CocoaPods dies without a UTF-8 locale.** The symptom is a Ruby trace
  ending in `String#unicode_normalize`, which reads as a CocoaPods bug and is
  not. `LANG=en_US.UTF-8 pod install` works.
- **`expo prebuild` CLEARS ios/ before anything else.** If pods then fail,
  the native project is left unbuildable with no obvious link to whatever you
  changed. It does correctly regenerate the watch target every time, so
  `--clean` is safe for that — only the Xcode team selection is lost, and
  appleTeamId now restores it.

## 0.45 · Opening the widget page retires the widget you already have

handle_widget_token contradicts itself: the first block returns null for
"already minted; the client keeps its copy", and the second then DELETES that
token and mints a fresh one. So every visit to Settings → Widget silently
kills the widget already on the home screen — it holds a dead key and just
stops updating, with nothing anywhere saying why. Pinned by a server test
that drives the old key against the feed and gets a 401.

It is not obviously WRONG: only the hash is stored, so the old token cannot
be shown again, and something has to be handed over. It is the invisibility
that is wrong. The page now says so out loud ("issues a new key, which
retires the last one"), which costs nothing and is true.

The better fixes need Sean's word, since they trade away something:
  a. store the token itself, not just its hash, so opening the page shows
     the SAME key and changes nothing — it is a read-only feed key, so the
     at-rest cost is small, but it is still a secret sitting in a file;
  b. only mint on an explicit "new key" button, showing "already set up"
     otherwise — no rotation by accident, but no way to recover a lost key
     without pressing it;
  c. leave it rotating and rely on the warning.

## 0.5 · A decision for Sean — the PWA cannot open offline

The web app registers NO service worker, so a phone with no signal cannot
fetch index.html or the bundle: the home-screen app dies before any of our
code runs. The local-first snapshot is real but, on the web, it only rescues
a session already loaded. Native and the Tauri shell carry their bundle on
disk and genuinely do open offline — the desktop README's "opens offline like
the phones do" is true there and NOT true in the browser.

Fixing it means a service worker, and that collides head-on with the deploy's
own rule: **index.html must always revalidate, or a phone shows last week's
app against this week's data.** A caching worker done carelessly turns a
"can't open offline" annoyance into stale code running against live data,
which is the worse failure. So it is a real tradeoff and Sean's call, not
something to slip in. e2e/offline.spec.ts covers what IS promised today:
edits land offline, survive moving around the app, and reach the SERVER once
the signal returns (proved from a browser that never saw the first one).

## 0.6 · Worth knowing — two devices converge in up to 30 seconds

Not a bug, but not obvious either, and it surprised the test three times
before it surprised anyone else. The store pushes on an 800ms debounce and
otherwise polls every 30s (plus on load, and on an app coming back to the
foreground). So: tick something on the phone and glance at the desktop and
you may not see it for half a minute — reloading the other device is
instant, because boot syncs.

For one person on three clients that is probably fine, and shortening the
poll costs battery and requests. Flagged because the natural expectation is
"my devices agree", and they do — just not immediately. e2e/twodevice.spec.ts
now covers the real contract: both devices' edits survive (neither quietly
replaces the other), and a tick on one shows on the other once it syncs.

## 0.7 · A real hole, narrow but silent — an oversized record never syncs

The server skips any record whose payload exceeds MAX_PAYLOAD (64KB) and
still answers 200 with a fresh cursor. The client's engine then clears the
dirty flag for everything it SENT, without checking what the server KEPT. So
a note that crosses the cap:

  · saves locally and looks completely normal,
  · is silently dropped by the server,
  · is forgotten as dirty, so it never retries,
  · never appears on another device, and dies with that device.

64KB is roughly ten thousand words, so this is rare rather than impossible —
a long pasted article, or a big OCR haul from many photos. Pinned by a server
test so it is visible instead of latent.

Fixing it properly is a protocol change and Sean's call, because the sensible
options differ in what the user sees:
  a. server returns `refused: [ids]`; the client keeps them dirty AND says
     so — without the "says so", it just retries forever;
  b. client refuses to save a body past the cap, with a message, so the
     situation never arises;
  c. raise the cap and move the problem rather than solve it.
(a) is the honest one and needs a little UI. Not doing it unasked: this is
the sync contract, the most safety-critical part of the app.

## 0b · Sean's batch, 2026-08-10 (all landed unless marked)

- [x] **The watch showed one flat page.** `watchFeed` filtered folders with
      `payload.app === 'reminders'`, but a milestone-1 folder carries no
      `app` at all and IS a reminders folder (types.ts). Sean's oldest
      folders are exactly that shape, so the wrist got an empty folder list
      and `watchGroups` returned one anonymous group. Silent, because an
      empty list is also what a folder-less account sends.
- [x] **The wrist's compact clock** — no am/pm below 8pm, and the
      complication drops "Today" and shows only the time.
- [x] **The chevron at 60%**, stroke scaled with it; collapse-all is a
      DOUBLE caret so it stops reading as the Back button; Habits' collapse
      -all was a text '⌃' in a 30pt CircleBtn and is the drawn one now.
- [x] **Every icon sat LOW in its button** — the line box reserves descender
      space `+` and `‹` never use, measured at 2.56pt on the tab bar's '+'.
      `+ − ‹ ›` are drawn now; measured back to 0.00.
- [x] **Edit mode**: a visible Done on all three screens, the suite's
      tap-outside rule on web, and a native wrapper for the phone (EditExit)
      — the Calendar's panel edit mode had NO way out on a phone at all.
      Entering it now moves nothing: the edit cluster floats, the heads carry
      a minHeight, and the toolbar has a fixed height (the Done button I
      added was itself the last 6pt of shift).
- [x] **Shared blocks**: partner sections fold, they and their rows indent to
      match my own, and the owner badge sits left of the divider.
- [x] **The phone widget had no data source** — nothing on the phone ever
      wrote the App Group cache it reads; the only writer was the WATCH app,
      filling the watch's container on another device.
- [x] **The widget shows what the CALENDAR shows** — `widgetDays` calls
      `dayItems`, so "Manage reminders"' tri-state applies and an overdue
      item lands on today.
- [x] **Deploy scripts**: two gates that could not fail (the PHP lint's
      status was grep's and then discarded; the bundle check never captured a
      BEFORE), a real `deploy-prod.sh` for the `.well-known` pair, and the
      `.htaccess` that gives the AASA its content type is in the repo instead
      of only on the server.

Open, and both need Sean:

- [~] **The widget's pixels.** Now partly seen: installed on an iOS simulator
      and added from the widget gallery, it draws the reference layout — the
      header row, a green day heading over a green rule, a green tick box.
      What the simulator CANNOT show is real data: an unsigned simulator build
      carries no entitlements at all, so App Groups do not exist there and the
      widget's process cannot read the cache even when the suite is seeded at
      the simulator's user level. Everything upstream of the pixels is covered
      (entitlements in the signed build, the cache writer, core's shape, the
      decoder, drawnDays); the last mile is a real device, i.e. Sean's.
- [ ] **iOS never propagated the watch app** from the phone across four
      installs — the wrist sat on build 1 while the phone carried 6. A direct
      `devicectl` install to the watch fixed it, and only worked while the
      watch was awake and holding a tunnel. Worth knowing why the companion
      path does not update it; until then, the watch needs the direct install
      and the build number is what proves it landed.

## 1 · In flight

- [x] **Overdue date chips in the Calendar day panel** — landed, deployed,
      ledgered (iteration 36). `dueLabel()` at both chip sites.
- [x] **The day panel's group order** — one group per kind AND owner, kinds
      in the legend's order, mine before theirs, a group skipped when the
      Completed filter empties it; a partner's dated notes now draw at all.
      Pinned by spec (`dp-group-head`), deployed.

- [x] **The month cell's mark well** is a FIXED two rows, so cells stand the
      same height however busy the day (spec measures every well).
- [x] **Partner dimming** — checked against the suite rather than assumed:
      the rule is only that the partner's HEADINGS are a shade dimmer and
      their rows carry no name chip. CalMind already does both; there is no
      row or mark dimming in the suite to port. Nothing owed.
- [x] **Habits rows and sections drag** (iteration 37), behind the suite's
      ✎ edit mode — and the shared drag hooks stopped yielding the responder
      to the enclosing ScrollView, which had been killing every drag on a
      list long enough to scroll.

- [x] **The month cell's icons-per-row** — checked against the suite's CSS
      rather than guessed: `.cell .dots` is a 23px well, three to a row, two
      rows max, extras clipped. Three everywhere IS the rule; CalMind's 40px
      cap already gives it. What WAS wrong: the suite packs lines with
      `align-content: flex-start` and CalMind centred them. Fixed.

- [x] **The web app manifest** — installable on Android and on desktop
      Chrome/Edge again, relative URLs so promote needs no edit, htaccess
      names the type. Verified live.
- [x] **Recipes: a method that numbers nothing** — prose methods now come
      out as steps instead of leftovers.

Next up, in Sean's order:

- [x] **The native drag is VERIFIED** (iteration 44) — on Android, where adb
      takes synthetic input and the iOS sim does not. Grips revealed by ✎,
      'games' dragged below 'music' and back again, Sean's order restored
      exactly. The ScrollView-responder fix holds on a real device.
- [x] **Android builds and runs** against the live test API, carrying the
      whole run's work. Two traps worth remembering: the AVD can boot with
      a dead graphics state and never open its adb port (kill it hard,
      restart with `-gpu swiftshader_indirect`), and `expo run:android
      --device` wants the AVD NAME, not the adb serial.
- [x] **macOS desktop** rebuilt off the current export and smoke-tested
      (builds, launches, survives, quits). The embedded asset index lists
      /index.html and /manifest.webmanifest, which is how you tell the new
      export went in — Tauri compiles the frontend into the binary, so the
      html itself can't be grepped out of the .app.
- [x] **The Windows workflow was exporting the wrong thing** — a bare
      `expo export`, so a Windows bundle would have carried an index.html
      without the manifest or the status-bar metas. Corrected in the file;
      still dispatch-only, still Sean's call to run.

## 1z · hitSlop does nothing on the web (2026-08-09)

- [x] **Every icon control was smaller in Safari than on the phone apps.**
      react-native-web does not implement `hitSlop`, so `hitSlop={8}` bought
      16px of extra target on iOS and Android and nothing at all in a
      browser. Proven, not read off the docs: a click five pixels outside a
      26px CircleBtn left it untouched, and the same click at dead centre
      fired it. The folder picker — the control Sean named — was a 16px pie
      wearing a 32px ring.
- [x] **Fixed in two shapes.** The pickers were given the ring's own
      dimensions, which moved nothing because the ring was already 32x32.
      Everything else carries `WebHitSlop`, a transparent absolutely
      positioned child reaching 8px past its parent: it is INSIDE the
      pressable, so the press bubbles to the same handler, it takes no layout
      space, and it leaves the parent's background alone — which matters,
      because `app.spec.ts:488` reads a swatch's colour off the pressable and
      a restructure would have silently pointed it at the wrong element.
      Applied to CircleBtn, ConfirmDelete, both reminder ticks, the fold
      chevrons, and the habits colour dot (11px drawn — the smallest control
      in the app).
- [x] **Verified in WebKit**, which is the whole point: checking this in
      Chromium alone would have been checking it everywhere except where it
      matters. `hitarea.spec.ts` is now in the WebKit config. 15 there.
- [x] **The drag grips too** — the riskiest place to put one of these, since
      what is being widened is a gesture rather than a tap: a child that took
      the pointer down and did not pass it on would leave a row stuck to the
      finger. PanResponder resolves through bubbling, so it does pass it on.
      All eight drag specs stay green, and a new one grabs a folder row six
      pixels LEFT of the ≡ — where there was nothing to grab before — and
      drags it past its neighbour. Removing the child turns that red.
      Recipe ingredient and step grips got it too.
- [ ] **Worth remembering — three of these checks passed while testing
      nothing**, and only deliberate mutation found it. A press measured
      three pixels in from an element's own edge lands inside it at any size.
      A neighbour sweep on a blank account agrees with itself across five
      empty screens. And searching for neighbours by `role="button"` cannot
      see a plain Pressable, so an over-extended tick sitting on top of the
      row body passed cleanly. The last one is why the check is now
      structural — find every absolutely positioned child that sticks out on
      all four sides and require it to stay within 12px — rather than a list
      of things that might be covered.

## 1y · Desktop parity checked, and one check thrown away (2026-08-09)

- [x] **macOS desktop rebuilt on today's export and smoked: 6/6.** The check
      worth having is the middle one — Tauri compresses the frontend into the
      binary, so "it built" is easy to mistake for "it has tonight's work in
      it". The content-hashed bundle name survives in the asset index, and it
      matches apps/app/dist: index-de58f062….
- [x] **The header at DESKTOP width was a real question and the answer was
      no bug.** The suite puts its `<header>` inside the same `.wrap` that
      caps the column at 640 (calendar/index.php:828), so I went looking for
      CalMind's header spanning the whole 1160 window with the content
      floating in a column — which would fling every control to the far
      edges, Sean's complaint wearing a different width. Measured instead of
      assumed: back at x=276, username ending at 860, column 260–900. Already
      right, because the header shares App.tsx's `s.body` box with the
      content.
- [x] **Two assertions written, then deleted, because they could not fail.**
      Having measured it, I added checks that back and the username sit
      inside the column. They restate what "the calendar column stays a
      column" already guarantees: both are bounded by the SAME box, and there
      is no one-line change that unbinds the header without unbinding the
      content — I tried, and the existing assertion fired first every time.
      A check that cannot fail is worse than no check, because it reads like
      cover. Deleted.
- [x] **What was kept is the one claim that CAN fail**: the picker is drawn
      at desktop width. Nothing about the column bound implies it, a
      width-gated regression could answer it wrongly, and that is exactly how
      it went missing before. Mutation-tested — hide the picker and it goes
      red at 1160 as it does at 390.
- [ ] Windows remains dispatch-only by Sean's instruction; the workflow's
      export bug was fixed earlier and still wants a run he triggers.

## 1x · The calendar groundwork, probed rather than trusted (2026-08-09)

Same method as the scaler and the date parser, on the two modules that are
load-bearing whichever route Sean picks. Both came back CORRECT, which is
the result — but two of the behaviours had nothing watching them.

- [x] **RRULE is right on every case put to it**, including the ones that
      usually go wrong: BYMONTHDAY=31 skipping short months rather than
      sliding to the 30th, 29 February only in leap years, BYMONTHDAY=-1 as
      the last day of each month, BYDAY=-1SU, COUNT counting from DTSTART
      even when the window opens later, EXDATE removing without shifting,
      UNTIL inclusive in the date, datetime-Z and before-DTSTART forms.
- [x] **WKST was the gap.** It is inert until INTERVAL exceeds 1 AND the
      BYDAY set straddles a week boundary, and then it decides where one
      fortnight ends. The implementation gets RFC 5545's own example exactly
      right — WKST=MO gives Aug 5, 10, 19, 24 and WKST=SU gives Aug 5, 17,
      19, 31 — and nothing pinned it. Now tested, including that the two
      answers DIFFER: an implementation ignoring WKST returns the Monday list
      for both and looks entirely plausible. Mutation-tested by hardcoding
      Monday.
- [x] **parseIcal against a realistic file, which was the other gap.** A real
      subscription carries a VTIMEZONE — and a VTIMEZONE contains its OWN
      DTSTART lines for the daylight rules — and many feeds carry VTODOs. A
      reader that took any DTSTART it saw would invent four plausible phantom
      events out of one small file. It does not, and now that is pinned,
      along with the all-day DATE form, an escaped comma in SUMMARY, a folded
      line rejoining, and 17:00Z landing at noon Chicago in August.
      Mutation-tested by letting VTODO through.
- [ ] **One thing noticed and deliberately not changed**: an UNTIL that fails
      to parse becomes null, which means "repeat forever". Bounded in
      practice by the window and the 1000 cap, and real generators emit valid
      UNTILs, so hardening it would be inventing a case. Written down instead.

## 1w · A DECISION for Sean — two devices can disagree forever (2026-08-09)

Found by probing the sync engine the way the scaler was probed. Not
hypothetical, and not something I changed, because the fix contains a
question that is his.

- [ ] **The bug.** The merge takes a remote record only when it is strictly
      NEWER (`theirs.updated > mine.updated`), and the server's rule is the
      same (`app.php:307` and `:445`). So an exact tie leaves every party
      holding its own incumbent. Two devices that stamp the same record
      identically stay different from each other, silently, forever. Proven:
      A writes "from A" and B writes "from B" at the same stamp, and after
      four round trips A still reads "from A", B still reads "from B", and
      the server holds whichever arrived last.
- [ ] **Ties are less exotic than they sound.** `put()` clamps to
      `updated + 1` whenever the clock is not ahead of the record. One device
      with a fast clock therefore makes EVERY later edit from a
      correctly-set device land on exactly that same value. It does not need
      a millisecond race; it needs one wrong clock, once.
- [ ] **Why the obvious fixes do not work.** A tie cannot be broken with
      information both sides share. Client-side alone fails: the server
      discards one candidate before the other client ever sees it. Comparing
      payloads fails: encryption uses a random IV, so a client cannot
      reproduce the blob it sent, and client and server have no common
      deterministic value beyond id, type and updated — all of which are
      equal in a tie. Making it converge needs the SERVER to pick
      deterministically (it can compare the two blobs, since it holds both)
      AND the client to accept on ties rather than only on newer. Two server
      sites and one client line.
- [ ] **The question inside it, which is why this is Sean's.** Any fix picks
      a winner, and picking one silently discards the other device's writing.
      For a notes app that may be the wrong trade — surfacing a conflict, or
      keeping both, is a real alternative. Convergence is not in doubt;
      what to converge ON is.
- [x] **Pinned meanwhile**, so a change is deliberate rather than accidental:
      a characterisation test asserting the tie keeps the incumbent, named
      after this entry and mutation-tested.
- [x] **And one real gap closed while in there**: nothing tested a transport
      that FAILS, which is the commonest event in a sync engine's life. The
      error reaches the caller and the record stays dirty; both now pinned,
      and both go red if the failure is swallowed.

## 1v · The hand-rolled base64url, probed exhaustively (2026-08-09)

- [x] **The codec is correct.** Every one of the 256 byte values, in every
      position of a three-byte group, round trips; so does a 1KB buffer the
      size of a real attestation object. Bad characters throw, including a
      stray newline and padding in the middle — both things a sloppy server
      sends. The existing tests covered every LENGTH; this covered every
      VALUE, which is where a shift or a mask goes wrong.
- [x] **One silent failure, now loud.** A base64 group is 2, 3 or 4
      characters, so a string of 4n+1 cannot have come from any encoder. It
      used to decode anyway, dropping the orphan character's bits without a
      word: 'A' gave zero bytes, 'AAAAA' gave three. A truncated credential
      id therefore came back SHORTER rather than rejected, and the trouble
      surfaced later as a signature that would not verify — true, and no help
      at all in working out why. It throws now.
- [x] **The server's decoder was checked for the same class and is fine.**
      `b64u_decode` returns '' when base64_decode fails, which is silent in
      itself, but every caller feeds it straight into `client_data_check`,
      `authdata_parse` or `openssl_verify`, and all three refuse an empty
      string loudly. A clean negative rather than an assumption.

## 0.2 · Sean's standalone reports (2026-08-09, round three)

### The black gap at the bottom — NOT reproduced, and here is exactly what I did

- [x] **I did reach standalone.** Installed the test build to the simulator's
      Home Screen from Safari with "Open as Web App" on, launched it, signed
      up a throwaway account. Real standalone: no browser chrome, translucent
      status bar.
- [x] **The layout there is CORRECT.** The tab bar sits at the bottom with
      only the home-indicator inset beneath it. Measured off the render: tab
      icons centre at ~96.7% of screen height. In Sean's screenshot they
      centre at ~85.9%, with ~14% of dead space below. So his layout is
      sized to a shorter screen; mine is not.
- [x] **The likeliest reason, and it is evidenced: his app is running OLD
      CODE.** I deployed a viewport read-out to Settings, confirmed the string
      is in the SERVED bundle (`grep` over the live JS: present), and then
      could not get it to appear in the installed app across several
      relaunches. index.html is served `no-cache` and the bundle is
      content-hashed and `immutable`, so a genuine cold load cannot miss it —
      an installed iOS web app simply keeps the page it has.
- [ ] **What settles it, for Sean:** remove the Home Screen icon, re-add it,
      open Settings and screenshot the three grey lines at the bottom of the
      card. They give inner/visual/client heights, screen size, dpr,
      standalone yes/no and all four safe-area insets. If the gap is gone
      after re-adding, it was stale code. If it survives, those numbers say
      which of the heights disagrees and I can fix it directly.
- [ ] **Not yet explained and deliberately not guessed at**: 393x852 (his) vs
      402x874 (the simulator) is a different device size, and I cannot rule
      out that the bug only appears at his. The diagnostic answers that too.
- [ ] Noticed in passing: the installed web-app icon is the site-wide "SC"
      mark, not CalMind's. The apple-touch-icon link is being added by the
      deploy but iOS is not using it. Separate, cosmetic, unfixed.

### The legend alignment — fixed

- [x] **The owner label was inside the balanced row, treated as a chip.** So
      line one began after "SEAN" and every wrapped line began under it: no
      common left edge, which is the ragged margin he described. It now sits
      in a gutter beside the chips, which is the SUITE's own shape rather
      than a new idea — `.cleg-who` is `flex: 0 0 auto` and the chips wrap
      inside their own `.cleg-kind` box (calendar/index.php:997-1003).
- [x] **The balancer is better off**: it now balances chips only, none of
      which is a label, which is what it was written for. The existing
      three-and-three assertion still holds.
- [x] **Chip spacing matched to the suite**: 10 across and 4 down (its 0.55rem
      / 0.25rem), icon and text centred on a 20pt line so glyph and label
      share a baseline and every gap is the same.
- [x] **Pinned and mutation-tested**: every line of chips must share one left
      edge. Putting the label back inside the row fails it and prints the
      proof — `got [109,35]`, line one after the label, line two under it.

## 0.15 · Collapse chevrons and shared folds (2026-08-09, Sean)

- [x] **One chevron, one size, everywhere.** There were three treatments for
      the same action: a drawn chevron at 15 for folders and 14 for sections
      in Reminders and Notes, a 12pt '▸/▾' in the calendar's day panel, and a
      14pt '›/⌄' in Habits. Four screens had each grown their own copy. All
      of them now use `<Chevron/>` at the single size the component decides,
      and that size is 13 — smaller than any of the three, which is the other
      half of what he asked for.
- [x] **A fourth copy I had missed**, found by the new check rather than by
      me: the widget page's "Show raw feed URL" disclosure was still '▾/▸'.
      Converted.
- [x] **NOT touched, on purpose**: the '›' at the end of a note row. It means
      "open this", not "collapse this", and the check excludes it explicitly.
- [x] **Held by a source-level check**, since most of these sit behind a
      folder, a section, a partner or an edit mode and driving to each would
      be a tour rather than a test. Two rules: no screen may pass its own
      `size` to Chevron, and no screen may draw a collapse with a text glyph.
      Both mutation-tested.
- [x] **Shared folders can be collapsed now.** They had no control at all —
      the one list Sean cannot reorder was also the one he could not put
      away. Added to the partner's folder in both Reminders and Notes. The
      calendar's day panel already had it for the partner's three groups.
- [x] **CONFIRMED before changing anything, as he asked: the fold is already
      per-viewer.** It lives in this device's AsyncStorage
      (`calmind.folded.reminders`, `calmind.foldedFolders.notes`), is never
      written to the partner's store and never leaves the device. Folding
      Aki's list away cannot change Aki's screen. There was no bug here, only
      a missing control.
- [ ] **Worth knowing, not fixed**: because that state is device-local rather
      than an account pref, folds do not follow Sean between his phone and
      his desktop, and two accounts sharing one browser share the folds. Say
      the word and it becomes a synced pref like the theme.
- [ ] **Also seen**: the deploy gate refused a deploy with icons and
      index.html all 503 — the HOST was briefly down, not the build. It
      retried green a minute later. The gate did exactly its job; recorded
      because a 503 on the icons alone would have meant something quite
      different.

## 0.1 · The installed app now takes new builds by itself (2026-08-09)

This is the one that was quietly costing everything else: an installed
home-screen web app is RESUMED, not reloaded, so it can sit on a build from
weeks ago while every deploy since passes it by. Measured, not assumed — a
read-out was deployed, confirmed present in the SERVED bundle by grep, and
still did not appear in the installed app across several relaunches, while
index.html goes out `no-cache` and the bundle is content-hashed and
`immutable`. It very likely explains why Sean's screenshots keep disagreeing
with what is deployed.

- [x] **The check**: compare the entry bundle the page is RUNNING (read off
      its own script tag) with the one the server advertises now (index.html
      fetched `no-store`, with a cache-busting param). No build changes
      needed; both names come out of HTML the same way.
- [x] **When**: on open, and on every return to visibility — which is exactly
      the moment a resumed app has been stale all along.
- [x] **Only when safe**: never while anything is still owed to the server.
      The engine's own dirty count is the guard, so a reload cannot land on
      top of unsent typing.
- [x] **How**: `location.replace` to a URL carrying the target build as a
      query, because `location.reload()` is free to reuse the very cache that
      caused the problem, and a different URL is a fresh navigation.
- [x] **THE RELOAD LOOP, caught by the spec rather than by thinking.** The
      first version guarded with an in-memory flag — which the reload itself
      resets, since it re-runs the module. The spec watched the page navigate
      four times in three seconds. In the real world it is worse than a test
      failure: if the page comes back STILL on the old bundle, which is the
      exact failure this exists to work around, the app would reload for ever
      and be unusable. Fixed by remembering the build a reload aimed AT,
      across the reload, in localStorage: seeing it again means the attempt
      did not take and must not be repeated. The slot is cleared once the
      page is genuinely running that build.
- [x] Decision in core (`shouldReload`, 8 tests), plumbing in the app, two
      e2e specs — one that a superseded build IS replaced exactly once, one
      that a current page sits perfectly still.
- [x] **And it will not reload out from under a half-typed field.** The dirty
      count is not enough on its own: a note body reaches the engine on every
      keystroke and so counts, but the text in a new-reminder field, a folder
      name or a recipe line has been committed nowhere and would simply go
      with the page. Since the check runs when the app is RETURNED to, that
      is exactly the moment a field left mid-word is still sitting there —
      and backgrounding takes focus away while leaving the words, so the
      guard sweeps every input rather than only the focused one.
- [x] **That test was vacuous when first written** and I nearly kept it: after
      the earlier reload the page was already sitting still because of the
      "already tried this build" note, so the assertion would have passed
      whether or not a half-typed field meant anything. It clears that note
      first now, and removing the typing guard turns it red.
- [ ] **TURNED OFF THE SAME DAY, because it broke the installed app.** With
      the updater wired in, a freshly installed home-screen web app renders a
      BLANK dark screen — reproducibly, on relaunch. With it commented out
      and nothing else changed, a fresh install off the same deploy renders
      the app correctly. That is the whole experiment: same simulator, same
      URL, one line different.
- [ ] **Everything else said it was fine**, which is the lesson. 104 specs in
      Chromium, 16 in headless WebKit, and the live deployment loaded in a
      real browser — correct bundle, no reload attempted, `updateTried` null.
      None of them is an installed webclip, and that is the only place it
      fails.
- [x] **Two tools built to find the cause, waiting on a deploy.** First, an
      inline error reporter in the page head (`tools/patch-web-html.mjs`):
      first thing to run, so it is listening before the bundle and survives
      whatever the bundle does, and it paints an uncaught error across the
      screen. A webclip has no console and none can be attached from here, so
      the page has to say what went wrong itself. It draws nothing unless
      something throws. Second, the updater is now behind `?autoupdate=1`, so
      a webclip installed at that URL reproduces the blank screen while no
      ordinary install runs the code at all.
- [ ] **CORRECTION: I could NOT reproduce the blank screen, and my earlier
      conclusion is now in doubt.** With the updater FORCED ON in a
      local-only build, installed as a webclip against a local server, the
      app renders perfectly in standalone. So "the updater causes it" does
      not survive a third experiment:
        A. deployed HTTPS, updater unconditional → blank (twice)
        B. deployed HTTPS, updater commented out → renders
        C. local HTTP, updater forced on → RENDERS
      A against B says the updater. A against C says it is not the updater,
      or not only. The two differ in host and protocol as well as in the
      code, so neither pair settles it. Re-running A needs a deploy, and
      deploys are blocked.
- [ ] **Re-reading my own evidence turned up the hole in it**: on that fresh
      install the running bundle and the served bundle were the SAME, so
      `shouldReload` returns false and no navigation could have happened.
      The blank was therefore never caused by the reload — which is what I
      had been assuming while looking for the fault in the wrong place.
- [ ] Also ruled out on the way: the deploy does NOT use `--delete`, so old
      bundles stay on the server and a cached page pointing at one still
      loads. A missing script is not the explanation. (It does mean a stale
      webclip can keep running an old bundle for ever, which fits the
      staleness exactly.)
- [ ] **A real lead, found by installing webclips against a LOCAL server** (no
      deploy needed — the simulator shares the Mac's network, so
      `http://127.0.0.1:8791/test/calmind/` installs and runs standalone just
      as the live one does; that route is repeatable and works while deploys
      are blocked).
      **iOS ignores the URL you install from and uses the MANIFEST's
      `start_url`.** Installing from `.../?autoupdate=1` produced a webclip
      whose URL is plain `.../test/calmind/`, and the flag never reached the
      app. That is worth knowing on its own, and it points straight at the
      updater: the reload navigates to `?b=<build>`, which is NOT the
      start_url iOS considers the app's own page. A webclip being sent
      somewhere outside its declared start is a very plausible reason for a
      blank window, and it would explain why every browser is fine — only a
      webclip has a start_url to disagree with.
      **The obvious next move is to make the reload navigate to the SAME url
      rather than a decorated one**, and it is deliberately NOT written yet:
      it needs verifying on a webclip, and shipping an unverified fix for a
      bug I have already shipped once is how this goes wrong twice.
- [ ] **Cause NOT yet known, and I am not guessing at one.** What is ruled
      out: it is not the `?b=` query colliding with the app's own `?tick=`
      route (different name, checked); it is not a reload loop, since the
      guard refuses a second attempt at the same build; it is not the bundle,
      which is byte-identical to the one that renders in Safari on the same
      device. Next step is a real error: attach macOS Safari's Web Inspector
      to the simulator's webclip and read the console, rather than reasoning
      about it from here.
- [x] The logic is untouched in core and still covered by 9 tests; the three
      e2e specs are SKIPPED rather than deleted, carrying the reason, so
      turning it back on turns them back on.
- [ ] Sean does NOT need to do anything. The stale-code problem remains — he
      still has to remove and re-add the icon by hand to get a new build —
      but a blank app is very much worse than an old one, and shipping this
      would have handed him exactly that on the reinstall I asked for.

## 0.05 · DEPLOYS ARE BLOCKED — SSH key no longer accepted (2026-08-09)

- [ ] **`./server/deploy-test.sh` fails at the SSH step.** "Permission denied,
      please try again" then "Too many authentication failures". Deploys
      worked earlier in this same session, so something changed underneath.
- [ ] **Diagnosed, not guessed.** `ssh-add -l` reports "The agent has no
      identities" — it held the key earlier and does not now. Offering the
      configured key on its own (`-o IdentitiesOnly=yes -i
      ~/.ssh/id_ed25519_nfs -o BatchMode=yes`) is refused with "Permission
      denied (publickey,password,keyboard-interactive)", so it is not merely
      SSH running out of attempts while trying several keys.
- [ ] **This is Sean's to fix and I did not touch it.** Almost certainly
      `ssh-add ~/.ssh/id_ed25519_nfs` and the passphrase — the key is named
      for that host in `~/.ssh/config`. If that is refused too, the key needs
      re-authorising in the NearlyFreeSpeech panel. I will not handle the
      key or its passphrase, and I stopped rather than working around the
      block when reading the key file was denied.
- [ ] **Everything since the last successful deploy is COMMITTED BUT NOT
      DEPLOYED.** The live test instance is one deploy behind: it has the
      auto-updater fully disabled, which is the safe state. What is waiting
      is the URL-gated updater and the error reporter below.

## 0.03 · Sean's answers on passkeys and E2EE (2026-08-09)

- [x] **Passkeys stay AUTH ONLY.** His words: "i still want to use passkey for
      auth but we'll solve e2ee together later." So the current shape is
      right and nothing changes.
- [ ] **E2EE is a separate project, to be designed WITH him.** The honest
      position, given to him: a passkey proves who you are, it does not
      encrypt anything. The private key never leaves the authenticator and
      cannot be used to derive a data key. WebAuthn's `prf` extension can
      derive a stable secret for exactly that — we request no extensions at
      all today.
- [ ] **And today's encryption is NOT end to end**, which matters more.
      `store_key()` (server/lib/store.php:10) reads the key from server
      config or an auto-generated `.datakey` beside the data, so records are
      encrypted AT REST with a key the server holds. The host can decrypt.
- [ ] **What real E2EE would cost, so the conversation starts honest**: the
      widget feed is rendered SERVER-side and could not be; sharing with Aki
      relies on the server reading records to enforce scope
      (`share_in_scope`); and email recovery could no longer restore data,
      only an account. Each is a real feature that would have to change or go.
- [x] **LastPass will be offered as a passkey provider.** Checked rather than
      assumed: registration asks for `residentKey: required` and
      `userVerification: required` and sets NO `authenticatorAttachment`
      (app.php:693), so the browser is free to offer a third-party manager
      rather than only the device's own authenticator. He needs LastPass on
      under iOS Settings → General → Autofill & Passwords. Untested against
      LastPass itself — our e2e uses a virtual authenticator.

## 1u · Two more modules probed, both clean (2026-08-09)

Same method as the scaler. Recording the NEGATIVES because they are worth as
much as the finds — they say where not to look next time.

- [x] **repeats.ts is correct on everything put to it.** Month steps off a
      31st clamp as documented (Jan 31 → Feb 28 → Mar 31 → Apr 30, never
      sliding into the next month); 29 February yearly lands on the 28th in
      common years and the 29th in 2028; a daily rule across the US spring
      forward emits seven consecutive days with none lost or doubled; a
      fortnightly rule across the autumn change keeps its stride;
      `repeatNext` after an EARLIER day still returns the next one after the
      start rather than walking backwards; a window opening six years after
      the start emits only what is inside it. Labels read correctly and a
      null rule is an empty string. This is the one Sean actually uses —
      "Kitchen shelf, every day" is on his calendar.
- [x] **richtext.ts is correct too**, including the traps. `snake_case_word`
      does NOT go italic, which is the classic false positive, because the
      underline marker is `__` and the toolbar's U button writes exactly that
      (Notes.tsx:328) — the two agree. `1996. What a year` and `1.5 cups`
      stay prose rather than becoming numbered steps, while `1.` and `10.`
      become steps. A URL survives intact, query string and underscores and
      all. Bold, italic and underline nest and interleave correctly.
- [ ] Two harmless oddities seen and deliberately left: `file__name__here`
      underlines "name", and an unclosed `**` runs bold to the end of the
      line. Both are what the markers mean; changing either would cost more
      than it buys.

## 2 · Steady state (every iteration)

- [ ] `git pull --autostash` first — two sessions share this repo; stage
      explicit paths only, never `git add -A`, hold commits on files the other
      session has half-refactored.
- [ ] Keep the suites green: 354 core + 38 server + 118 gesture (+1 skipped) + 16 WebKit,
      plus 9 live checks (16 with the API) and 6 desktop. And the native ones,
      which no browser can reach: `npm run test:watch` (both Swift time
      formatters against core's cases; core's JSON through the wrist's real
      decoder, incl. drawnGroups), `npm run test:widget` (core's JSON through
      HomeWidget's real decoder AND its drawnDays; every App Group key read
      has a writer on its own device), `npm run test:deploy` (8 guards, each
      proven by breaking a copy of the real script). The README points here
      rather than carrying numbers of its own, so this line has to be the one
      that is right — it was 93 an hour after the gesture suite passed 96,
      which is exactly how the README's own "145 tests" went stale.
      `npx playwright test --list` gives the gesture total without a run.
      The gesture run refuses to start against a stale export (e2e/freshness.ts).
- [ ] Confirm live test == local dist (md5 of served index.html vs
      `apps/app/dist/index.html`).
- [ ] Keep PARITY.md honest; act on Sean's steering the moment it arrives.
- [ ] Re-check every touched glyph button is a centred circle before deploy
      (`display:flex; align-items:center; justify-content:center` equivalent).

## 3 · Back burner — recipes (medium/low priority, per Sean)

- [ ] OCR extraction keeps improving pattern-wise: pull ingredient name +
      quantity + unit where a pattern is visible; imperfect text is fine (the
      user can fix it) but **never** emit junk non-letter characters —
      `scrubLine()` in packages/core/src/recipe.ts is the gate, extend it there.
- [ ] Include-notes checkbox (`recipe-incnotes`) shipped; keep it honored on
      every save path if the editor grows new ones.
- [x] **Numbered steps read as steps** — the method used to render flush-left
      as one wall of text: a wrapped step ran back under its own number, so
      finding your place after looking up from the pan meant re-reading. The
      number now sits in a gutter like the bullet's dot, with air between
      steps. `richLines` gained a 'number' kind (two digits max, space after
      the dot — '1996. What a year' and '1.5 cups' stay prose). It is read
      back but never toggled: the toolbar writes '- ', recipes write '1. '.
- [x] **Scaling (½× / 1× / 2×)** — reading, not editing: nothing is written,
      and the spec's load-bearing assertion is that the note still says 2 cups
      afterwards. Only ingredient lines under **Ingredients** scale — the
      method is prose, and '20-25 minutes' is a time, not a yield. Lines with
      no number ('a pinch of salt') are returned untouched rather than guessed
      at. Plurals count too: half of 2 eggs is 1 egg, and 2 tbsp is never
      2 tbsps. Unit conversion is NOT done — 12 tbsp butter stays 12 tbsp
      rather than becoming ¾ cup; that is the obvious next ask if Sean wants
      it.
- [x] **Scaling checked against Sean's REAL recipes on the iOS build**, which
      found two bugs my invented cards could not: '200/250 g guanciale' (a
      slash range — the scaler took 200 and stranded '/250' in the name,
      doubling to the nonsense '400 /250 g') and '3 egg yolks' → '6 eggs
      yolks' (pluralising the head of a compound noun). Both fixed and pinned
      with his shapes. Lesson worth keeping: the invented test data agreed
      with me, and his didn't.
- [x] **Dual-unit ingredient lines** — '3 tablespoons 45 g all purpose flour'
      is one amount written twice. Scaling only the leading quantity gave
      '6 tablespoons 45 g': a line that contradicts itself, which is worse
      than not scaling at all. Both measures now scale. The second unit must
      be one we recognise, so '1 cup 2% milk' and '1 tsp 5 spice powder' are
      untouched, and a parenthesised size ('1 (14 oz) can') still means more
      tins rather than a bigger tin. Known cosmetic wart, pinned: that same
      parenthesis hides the word 'can' from the pluraliser.
- [x] **Scaling reaches shared recipes too.** The shared-note view is a second
      copy of the note renderer and it is the copy that gets forgotten — it
      had the new numbered steps but not the scale. Covered inside the
      existing two-account share test rather than by standing up sharing a
      second time.
- [x] **Two more of Sean's cards read at ½× on the phone** (Pastitsio,
      Ravioli di Zucca): clean. '2 cloves' → '1 clove', '2 ½ cups' → '1 ¼',
      ¾ → ⅜, and '1 finely diced garlic clove' → '½ finely diced garlic
      clove' WITHOUT pluralising 'finely'. Numberless lines ('a butternut
      squash', 'some chopped green onions') left alone as designed.
- [x] **Scaling cannot reach the stored recipe through any path**, including
      the one that could have written it back permanently: scale to 2x, open
      the structured Recipe editor, Save. The editor parses the note's own
      body rather than the scaled view, so nothing doubles — pinned through a
      reload so the assertion is about the record and not a stale screen. The
      Recipe button now also drops the view back to 1x, so the editor and the
      screen behind it agree rather than the editor looking like it threw the
      doubling away.
- [x] **'1 bay leaf' doubled to '2 bay leaf'** (Tagliatelle al Ragù, read on
      the phone). The pluraliser only ever looked at the word AFTER the
      number, and there that word is 'bay'. Now, when that word is not a unit
      at all — 'bay', 'large', 'red' — the count falls to the single bare noun
      that follows, with an irregular map for the plurals English refuses to
      make by rule (leaf/loaf/half/knife, potato/tomato). Nothing is guessed
      where there is no single noun to find: '600 g fresh tagliatelle (see
      Pasta all'Uovo)' is left exactly as written.
      My first attempt pluralised 'sugar' and 'guanciale' after tbsp and g —
      caught by tests that were already there, which is what they are for.
- [x] **All of Sean's recipes now read on a real phone**, at ½x and 2x. The
      last three (Porro e Salsiccia, Fumé, Uovo) came back clean. Four bugs
      came out of this exercise overall — dual-unit lines, the slash range,
      the compound noun, and the bay leaf — none of which my invented cards
      contained.
- [x] The shapes verified by eye are now core tests rather than a memory: a
      range whose TOP lands exactly on 1 ('1 ½-2 cups' → '¾-1 cup', unit going
      singular with it), a decimal range, 'pinches', an adjective in the unit
      slot with an already-plural noun, and '1 onion' → '2 onions'. Reading a
      screen is not a thing that repeats itself.
- [x] **scrubLine was breaking the source URLs in Sean's own recipes.** Two
      rules that are right for a photographed card are wrong for a link: the
      character filter dropped '_', and the de-duplicator collapsed '//' to
      '/'. His Aglio Olio line came back as
      "https:/…/Pasta AglioOlioPeperoncino.html" — a dead link, silently, the
      first time Recipe was pressed on that note. Several of his recipes carry
      a "*From <url>*" line.
      URLs are now lifted out before scrubbing and put back after, with
      trailing punctuation handed back to the scrubber so the '*' that closes
      the emphasis still goes. '_' is allowed in ordinary text too.
      Found by round-tripping his REAL note shapes through core — no writes,
      no risk to his data, and it turned up what synthetic cards had not.
- [x] **An "Ingredients" heading swallowed the whole rest of the note.** Only
      another heading closed the block, so on Sean's Pasta all'Uovo — heading,
      three ingredients, then the method as plain prose with no METHOD line,
      then a References section — pressing Recipe produced EIGHT ingredients
      (the instructions, the word "References", a YouTube link) and no steps.
      Saving would have rewritten the note as that.
      A sentence now ends the run: full stop and no quantity in front of it.
      Both shapes that legitimately end in punctuation keep their place,
      because they open with a quantity — "2 cups flour." and "300 g pasta
      (spaghetti is traditional.)". Pinned both ways.
- [x] **A title was being taken from inside the ingredient list.** The scan
      skipped headings but did not STOP at one, so it walked past
      "Ingredients", over the quantities, and took the first numberless
      ingredient as the title. On Croque Madame that was "fresh cracked black
      pepper to taste"; on Carbonara "freshly ground black pepper"; on Porro
      "generous amount of freshly ground black pepper". Each then left the
      ingredient list — the editor puts a stray title into the notes blob, so
      it was preserved but demoted, and the list came up an ingredient short.
      A name comes before the sections; the scan stops at the first heading now.

      **CORRECTION.** I said three of Sean's four recipes were affected. That
      was wrong, and I checked it only afterwards. His saved recipes carry our
      own `**Ingredients**` markers — visible as a bold heading in the note —
      so they take the fromMarkers path, which takes no title and reads the
      lines verbatim. None of the three parse bugs could reach them. What I
      had actually tested were reconstructions I typed WITHOUT the markers,
      and I generalised from my own typing to his data.

      The bugs are real and worth the fixes, but their reach is: the OCR photo
      import (no markers, which is the whole point of that path), any note
      written by hand with a plain "Ingredients" heading, and Aglio Olio-style
      prose notes. Verified on the phone afterwards: Croque Madame opens with
      all ten ingredients including "fresh cracked black pepper to taste".
- [x] All four observed shapes (Zozzona, Croque Madame, Carbonara, Porro) now
      round-trip with every ingredient kept, no prose mistaken for food, and
      byte-identical on a second save.
- [x] **Unticking "Include notes" hid the very lines it drops.** That was
      tolerable when the leftovers were trivia. It is not now: most of Sean's
      cards write the method as prose with no heading, so the whole method
      lands in the leftovers rather than in the steps — and unticking removed
      it from the screen at the exact moment Save was about to remove it from
      the note. The lines stay visible either way now, struck through, above a
      line saying how many will not be saved. The checkbox does the same thing
      as before; only the cost is visible.
- [x] **A second OCR fixture, shaped like the cards that actually break it.**
      The tidy one leads with a name and labels its method, so it could not
      exercise any of this run's parse fixes. The awkward one has no title
      line, a numberless ingredient at the END of the list, and a method
      written as prose with no DIRECTIONS heading — the three things that
      between them made "fresh cracked black pepper to taste" the recipe's
      title and bulleted the cooking instructions as food.
      Driven through REAL tesseract, not a stub, and verified with teeth:
      putting back the old skip-don't-stop title scan turns it red.
      This is the path where those fixes actually matter — the correction
      above is that Sean's SAVED recipes carry our markers and were never
      affected; a photographed card carries nothing and never will.
- [x] **A photo it cannot read now says so.** The import used to end in
      silence: the spinner cleared, nothing appeared, and there was no way to
      tell a blank result from a slow one or from a tap that missed. It now
      says "No text found in that photo — try a straighter, brighter shot",
      and invents nothing to fill the gap. Covered by a blank card through
      real tesseract.
- [x] **The photo's leftovers reach the page.** `extra` was read-only state
      seeded once from the note, so prose that came in WITH a photo — a source
      line, a method with no heading — was parsed and then dropped on the
      floor. It appends now, which matters more since the parse fixes send
      unheaded methods there.
- [x] **Native asks before it offers.** The web-only check lived inside
      `ocrImages`, so a phone opened the photo library, took your selection,
      and only then said it could not read any of it. Doing the work first and
      refusing afterwards is the wrong order to find out in. `ocrSupported()`
      is asked before the picker opens now.
      Verified on the simulator: the picker no longer opens. NOT verified: the
      message itself, which clears after five seconds while a screenshot
      round-trip costs longer than that — so I have seen the refusal happen
      but not read it on the device. The web path is unchanged and its three
      OCR specs still pass.
- [x] **The leftovers fix now has a test of its own.** I shipped `extra`
      appending from a photo without covering it, which is the same gap I keep
      finding in other people's work. The awkward-card spec asserts the
      unheaded method is visible under Include notes, and it has teeth:
      dropping the append again turns it red.
- [x] Judged sufficient rather than chased: the native "reading photos is
      web-only" MESSAGE is still unread on a device. The mechanism that draws
      it — `busy !== '' && <Text>` — is the same one the "No text found in
      that photo" spec exercises and passes on, so what is unverified is one
      string on one platform, not the path. Said plainly rather than left to
      look complete.
- [ ] Photo import flow (recipe-import → recipe-photos → recipe-title →
      recipe-save) is covered by e2e/ocr.spec.ts — keep that spec on the real
      flow, not a shortcut.

## 3aa · Three scaling bugs, found by running it rather than thinking (2026-08-09)

- [x] **'1 x 400g tin coconut milk' doubled to '2 x 800 g'** — four times the
      coconut milk, in a line that reads as though it were right. The
      dual-measure rule took the 400 g for the same amount written twice and
      scaled it alongside the count. It is not: it is the size of each tin, so
      only the count moves. This is the one that mattered — the other two are
      spelling.
- [x] **'1 loaf crusty bread' → '2 loaf'.** 'loaf' was in the irregular-plural
      table but not the measure list, so it was never the word being counted.
- [x] **'2 ribs celery' → '4 ribs celerys'.** 'rib' was in neither list, so the
      count fell through to the NAME — and the name is a mass noun that takes
      no plural at all. Added, with 'pack', 'bulb', 'wedge', 'sachet', 'tub',
      'punnet', 'block', 'bar', 'drop', 'splash'.
- [x] **'1 (14 oz) can tomatoes' → '2 (14 oz) cans'** — the wart pinned last
      run, now fixed rather than pinned. The bracket sat between the number
      and 'can', so the unit group matched nothing; reaching past one bracket
      finds it.
- [ ] **How they were found is the point, and worth repeating.** Not by
      thinking of cases — by running the scaler over two dozen ordinary
      shopping-list lines and reading the output. Three of twenty-eight were
      wrong. Every one had been invisible to a test suite that only ever
      asked about lines somebody had already thought to doubt. The same
      lesson as Sean's own cards: invented data agrees with you.

## 3ac · Read off Sean's real cards on the iOS build (2026-08-09)

- [x] **'2 teaspoons whole grain mustard' halved to '1 teaspoons'**, and
      '2 ounces deli ham' to '1 ounces'. Both straight off his Croque Madame.
      The spelled-out units live in UNIT_MAP, which is about normalising
      'teaspoons' to 'tsp'; MEASURE is what decides whether a word gets
      recounted, and they were never in it. 'cup' and 'slice' happen to be in
      both, which is why those looked fine and hid the rest. Added teaspoon,
      tablespoon, ounce, pound, gram, kilogram, and the litre spellings. The
      abbreviations stay out — 'g' and 'tsp' are INVARIANT and take no 's'.
- [x] **The method is never scaled, and it now matters.** His Zozzona says
      'Cut the guanciale into 2 x 4 x .4 cm cuboids' — which reads exactly
      like the '1 x 400g tin' pack shape the scaler started treating
      specially this run. It is a SHAPE; doubling the recipe does not make
      the cubes bigger. Only lines under Ingredients scale, so it is safe,
      and that is now pinned rather than merely true.
- [x] **Checked without touching anything of his.** Reading his notes through
      the app is fine; a rebuild is not, because reinstalling could drop the
      session and signing back in would need credentials I will not handle.
      So the lines were read off the screen and replayed against the scaler
      locally. Ten recipes there now, not the four from before.
- [x] **'1 medium chopped onion' doubled to '2 medium chopped onion'** (his
      Pastitsio). The noun is the LAST word and the rule only ever looked at
      a single bare one. Now the last word counts when every word before it
      is a participle. The -ed test is the whole safety of it, and the case
      that says why it is not simply "take the last word" is '1 small handful
      parsley': 'handful' sits in that position, is a measure rather than a
      participle, so nothing is counted and 'parsley' keeps the plural it
      does not have. Both directions mutation-tested.
- [ ] **Still missed, deliberately: '1 large free range egg' and '1 finely
      diced garlic clove'** keep their singular noun when doubled, because
      'range' and 'garlic' are not participles either. Under-correcting is
      the right failure here — the alternative invents words.
- [x] **All ten cards read.** The last four turned up one thing, and it was
      a fault in THIS RUN'S OWN work rather than an old one. His Carbonara
      opens "This makes enough for 3 (skinny) or 2 (hungry) people." — a
      number, a bracket, a word, which is precisely the shape the new
      parenthesis rule reaches into. It doubled to "6 (skinny) ors 2 (hungry)
      people." The line is prose and never reaches the scaler, so nothing was
      ever wrong on screen; but being saved by where a line happens to sit is
      not the same as being right, and the 'x' branch written the same hour
      already required a real measure word where the bracket branch required
      nothing. Now both do. Mutation-tested: drop the guard and 'ors' comes
      back.
- [ ] **Everything else across the last four was correct**, including
      '200/300 g pancetta' (slash range), '1.5 onions' halving to '¾ onion',
      '3/4 cups freshly grated parmigiano' to '⅜ cup', '300 g of pasta
      all'uovo' (the 'of' survives), and the two prose lines that look like
      pack sizes — 'make 5 x 3 cm rectangles' and 'very thin (.3 cm) slices'.
- [ ] One judgement call left as-is: '2 dried chili' doubles to '4 dried
      chilis', correcting a word Sean wrote as an invariant plural. Defensible
      English, predates this run, not worth a special case.
- [ ] **Nothing else in ten cards came back wrong**, including the shapes
      that had been guesses last run: parenthesised asides that are NOT
      sizes ('2 ounces deli ham (french is recommended)') are left alone, and
      a decimal range with a bracket after it ('1.5-2 cups tomato sauce
      (blitzed canned...)') halves to '¾-1 cup' correctly.
- [ ] **Still unconfirmed: the '1 x 400g tin' shape itself.** It is standard
      in British recipe writing and the fix is right either way, but none of
      his ten cards uses it, so the bug it fixed remains inferred rather than
      observed.

## 3ab · A DECISION for Sean — "standup at 9am" is titled "standup at"

Found by probing the date parser the same way the scaler was probed: run it
over three dozen lines somebody would actually type and read the output.

- [ ] **The papercut.** Lifting the time out of a line leaves the preposition
      that pointed at it. "standup at 9am" -> "standup at". "meeting at 12pm"
      -> "meeting at". "set alarm for 7am" -> "set alarm for". "birthday on
      9/14" -> "birthday on". It lands on nearly every timed item, since "at"
      is how people write times.
- [ ] **It is NOT a CalMind bug — it is the reference behaviour**, which is
      why nothing was changed. The suite's `parse_time_from_text`
      (lib/util.php:102) does `str_replace($m[0], '', $text)` and stops, and
      `spec/parse.json` pins the case by name: "Up at 12am" -> text "Up at".
      That vector is the contract CalMind's core shares with the native ones,
      so amending it is a change to the app Sean uses today, on every
      platform, not a tidy-up.
- [ ] **The fix is small and was written and then reverted.** Strip a single
      lead-in word (at/on/by/for/from/@) immediately before the lifted span.
      Only that position, so "turn the oven on at 6pm" keeps its "on" and
      "meet Ben at the pub at 3pm" keeps the pub. One spec vector would need
      amending, and the same edit would be owed to lib/util.php and to the
      Swift and Kotlin cores if they are to stay identical.
- [ ] **Sean's call**, and it is a small one either way. Worth asking because
      it changes a shared contract rather than because it is hard.

Two more from the same probe, recorded as facts rather than complaints, since
the documented vocabulary is 'tomorrow', 'in 2 weeks', 'in an hour', 'in
30mins' and these are simply outside it: weekday words ("next tuesday",
"this friday", "party on saturday") are not understood, and neither are
"tonight", "noon", "midnight", "end of month", or month names ("14 sept").
Bare times without am/pm ("standup at 9", "flight at 07:05") are also
ignored. All consistent with the reference. Whether any are worth adding is
a feature question, not a bug.

## 3b · Passkeys (Sean said go, 2026-08-08)

- [x] **Server**: registration, usernameless login, list, remove. Attestation
      'none'; CBOR + COSE→DER written by hand (no composer on the host). RP id
      and origin DERIVED from the request, overridable in config — a wrong RP
      id is invisible until every passkey stops working at once.
- [x] **Web UI**: "Use a passkey" on the sign-in card and an Add/remove
      section in Settings, both hidden unless the device can actually make one.
- [x] **Tests, and what each one is worth**: server/tools/test.php drives a
      software authenticator (real P-256, real CBOR) and covers the refusals —
      bent signature, foreign origin, replayed challenge, counter regression,
      removed key. e2e/passkey.spec.ts drives Chromium's virtual authenticator
      and covers the WIRING only: with openssl_verify short-circuited to
      success it still passed, and only the PHP suite went red. Measured, not
      assumed. Do not let the e2e stand in for the crypto coverage.
- [x] **Verified against the DEPLOYED test server**, not just localhost —
      real domain, real TLS, RP id `seancheren.com`, no port in the origin.
      `CALMIND_LIVE=1 npx playwright test live-passkey`; skipped by default so
      the normal run stays offline. Leaves an account behind (no delete-account
      endpoint) and says which one.
- [x] **The challenge store is capped, not just aged out.**
      `passkey_login_begin` takes no token by design (asking who you are first
      would leak which usernames exist), which makes it the one endpoint a
      stranger can make write to disk — and every other request reads and
      rewrites that same file. Pruning by age alone bounds it by TRAFFIC.
      Now capped at 200, evicting by ARRIVAL order: a burst all lands inside
      the same second, so sorting on the timestamp orders equal keys
      arbitrarily and could evict the challenge belonging to the person
      actually signing in. The test caught exactly that.
- [ ] **Native tiers**: iOS/Android want the platform APIs, not this shim.
      passkey.ts is web-guarded so the buttons simply do not appear there.
- [ ] **WebAuthn forbids an IP address as an RP id** — the e2e run had to move
      to http://localhost. Worth remembering before meeting it on a staging box
      reached by address.
- [x] **The doubletap flake is answered, not waited out.** It failed once in a
      full run and never again in ~40 targeted runs, which was always the
      wrong thing to chase: the spec's own comment admitted the protection was
      incidental — the screen navigating away and the field clearing, both a
      render later than the second tap. Add now refuses the SAME line filed
      twice inside 1.5s, which is a thumb rather than an intention. The spec
      presses three times, and a second spec proves the guard is not a ban on
      repeating yourself: the same words a couple of seconds apart file twice,
      because two 'pay the sitter' reminders is an ordinary thing to want.

## 3c · The two Safari/widget reports (2026-08-08)

- [x] **"Top and bottom bar still wrong on safari"** — MEASURED, and the page
      is not at fault: loading the live test URL in iOS Safari on the simulator
      shows both bars correctly dark. theme-color and the page background are
      served and applied. Two things that DO look like this and are outside the
      page: DuckDuckGo (Sean's default browser) draws its own chrome and does
      not tint from theme-color, and Settings → Safari → "Allow Website
      Tinting" turns the effect off system-wide. The installed home-screen app
      is the surface our metas fully control, and that one still needs the
      icon deleted and re-added FROM SAFARI.
- [x] **theme-color now written on every load, not only on a theme change.**
      Honest note: this was NOT the cause of anything above. applyTheme
      early-returned when the theme already matched, so the chrome was left to
      the colour hardcoded at export time — right for Midnight by coincidence,
      and the only reason nothing showed. Covered by e2e/themecheck.spec.ts on
      Sage, whose background is nearly white.
- [x] **Widget tap goes to Safari, not the default browser** —
      x-safari-https://, verified still handled on current iOS.
- [ ] **Widget tap CANNOT open the home-screen app. iOS does not allow it.**
      A home-screen web app has no url scheme and is not a universal-link
      target; it launches from its icon and nothing else. The only real route
      is the NATIVE iOS app plus a custom scheme (calmind://), which needs the
      app on Sean's actual phone — an Apple Developer account and TestFlight.
      Sean's call, and not a small one.

## 3d · Calendar integrations (Sean: "Extracted data and via oauth")

- [x] **iCalendar parsing lives in core** (`packages/core/src/ical.ts`), built
      first BECAUSE it is the part both routes share: a subscribed .ics link
      and a full CalDAV query hand back the same VEVENTs. Nothing in it knows
      how the text arrived, so it commits to no auth decision.
      Covers folding, quoted TZID params, TEXT escaping, and the three kinds
      of moment a calendar carries — a date with no time, a UTC instant, and a
      wall clock in a named zone. Zone maths is done by probing Intl rather
      than carrying a table; the tests pin both DST changeovers and round-trip
      every hour across a spring-forward day.
- [x] **RRULE expansion** (`packages/core/src/rrule.ts`) — daily/weekly/
      monthly/yearly with INTERVAL, COUNT, UNTIL, BYDAY (including '3FR' and
      '-1FR'), BYMONTHDAY (negative counts from the end), EXDATE, WKST.
      Two rules worth remembering, both pinned: an invalid date is SKIPPED and
      never clamped, so monthly-on-the-31st happens seven times a year and
      29 Feb only in leap years; and COUNT counts occurrences from DTSTART,
      including ones before the display window, or a window that opens late
      silently lengthens the series. An unrecognised FREQ yields the single
      start date rather than nothing — a wrong pattern is a complaint, a
      vanished event is a missed appointment.
- [ ] **Still to join up**: mapping expanded occurrences onto our own record
      shape, and deciding whether they are stored or computed on the fly.
- [x] **The URL fetcher, built once and wired to nothing.** Both routes need
      it — a subscribed .ics is a GET, CalDAV is a GET with more verbs — so it
      commits to neither. `server/lib/fetchurl.php`.
      The care is the point: a URL typed into an app becomes a request made BY
      THE SERVER, from inside the host, which can reach addresses the person
      typing cannot. So the host is resolved first and every address it
      answers with must be public — checked again on EVERY redirect hop, since
      a redirect is exactly how that check gets walked around. Refuses
      loopback, private ranges, link-local and 169.254.169.254 (the cloud
      metadata address, which sits in no private range and is the classic
      target). Bounded at 15s and 4MB so a feed pointed at something enormous
      cannot take the server with it.
      Tested directly rather than through an endpoint that does not exist yet.
- [ ] **BLOCKED on Sean, and it decides the shape**: reading Gmail needs a
      Google Cloud project HE creates. For a personal gmail.com account an app
      left in Testing mode expires its refresh roughly weekly; escaping that
      means Google verification, which for mail scopes is onerous, and there
      is no Workspace "Internal" shortcut available. Worth confirming before
      any code is written against it. CalDAV calendars carry no equivalent
      problem and could go first.
- [ ] Also unanswered: subscribe-by-link vs full CalDAV first, and whether
      imported events stay read-only forever (changes the record model).

## 3e · Desktop parity (2026-08-09)

- [x] **macOS desktop rebuilt on tonight's export and smoke-tested** —
      `./desktop/smoke.sh` (new): builds, carries THIS export, launches,
      survives, quits. The "carries this export" check matches the
      content-hashed bundle filename against apps/app/dist, which is the only
      one of the five that can tell a fresh build from a stale one.
- [ ] **Android cannot be verified on this machine at all** — no `adb`, no
      `emulator` on PATH. Not a code problem; the toolchain simply is not
      installed here. iOS is verified (built Release three times tonight
      against Sean's real data).
- [ ] Windows stays dispatch-only by Sean's instruction.

## 3f · The silent sync hole, closed (2026-08-09)

- [x] **An oversized record is now refused BY NAME.** It was worse than first
      reported: the server dropped the row and answered ok with a fresh
      cursor, so the engine cleared it from `dirty` because it had been
      "sent". The note then lived on exactly one device while the app showed
      "Online — synced" — nothing appears wrong until that device is.
      Now: the sync reply carries `rejected: [ids]`, the engine keeps those
      dirty so they retry and self-heal the moment the note is shortened, and
      Settings says "A note is too long to save — it is on this device only."
      Covered in core (engine), server (reply shape) and e2e (the message).
- [ ] **The LIMIT itself is still Sean's call** — 64KB is about ten thousand
      words. Raising it, or splitting long notes, is a product decision; being
      honest about the failure was not.

## 3g · Tests that could not fail (2026-08-09)

Three checks went green for the wrong reason tonight: a shell grep for the
empty string, an e2e that could not see `openssl_verify` short-circuited, and
a PHP spec reading an ENCRYPTED store with json_decode. All three were caught
by asking "what would make this go red?" rather than by trusting the tick.

- [x] **Swept the suites for the same shape.** 105 testIDs referenced by
      specs, all real. The PHP feed specs pair every absence assertion with a
      positive one on the same list, so an empty read fails first — they hold.
      The live smoke's string compares all have one non-empty side.
- [x] **Encoded it**: `e2e/testids.spec.ts` fails if any spec reaches for a
      testID no component renders, which is the version of this mistake that
      can never be noticed by hand — an absence assertion on a typo passes
      forever. Handles template ids by prefix; asserts both scans found
      something before comparing.

## 3h · The other creation paths (2026-08-09, negative result)

Having made Add's double-tap guard deliberate, I checked whether its siblings
were guarded or merely lucky. Four paths commit from one field via BOTH
onBlur and onSubmitEditing:

- `addNote` — guarded explicitly, and its comment ("Enter fires submit AND
  blur on web") says the bug was met for real there.
- Both `addSection`s — protected by accident: a section name must be unique,
  so the second commit is refused on the name.
- `addReminder` — NO guard and no uniqueness rule, so a duplicate would simply
  appear and stay. **It does not.** `e2e/addtwice.spec.ts` covers Enter, blur,
  and the deliberate repeat; all three passed first time. The field unmounts
  and clears before a second call can carry the old value.

No guard added: there was nothing to fix, and the specs are what will notice
if that code's shape changes. Add got a guard an hour ago because there the
race had actually been observed — the difference is evidence, not taste.

## 3i · A bug I introduced tonight, found on the phone (2026-08-09)

- [x] **One note's text appearing in another note's editor.** The body/title
      drafts added earlier tonight (so a sync cannot pull words out from under
      a cursor) were never cleared when a DIFFERENT note opened. Open note A,
      put the cursor in its body, go back, open note B: B showed A's words, in
      an open editor, one keystroke from saving them over B. Found by opening
      Sean's real recipes on the simulator — "Pasta alla Zozzona" wearing the
      body of "Pasta Aglio, Olio e Peperoncino". Exactly what the drafts were
      built to prevent, one screen over.
      Fixed by clearing scale, bodyEditing and both drafts on `openId` change;
      verified on the simulator.
- [ ] **`e2e/notesswitch.spec.ts` does NOT cover that bug** — measured, not
      assumed: it passes with the fix and without it. On web, clicking back
      blurs the field and the blur handler clears the draft, so the browser
      never reaches the broken state; on iOS a tap elsewhere does not blur.
      The spec guards the blur path instead, which is worth having and is not
      the same thing. A native-driving harness is what would cover it.
- [x] Scaling re-checked on two more of Sean's cards while there. Zozzona
      brought a shape the tests had not: a DECIMAL range, '1.5-2 cups' → '3-4
      cups'. Also '1 onion' → '2 onions' and '3 egg yolks' → '6 egg yolks'.
      Aglio Olio is prose with no ingredient list and correctly gets no scale
      control at all.

## 3j · The rest of the leaked per-note state (2026-08-09)

Having fixed the drafts leaking across a note switch, I read every piece of
state that screen holds and asked which of them belong to the OPEN note. Two
more did, and one of those deletes things:

- [x] **An armed delete carried to the next note.** Delete is two-press and
      disarms itself after 2.5s. The arming lived in screen state, so arming
      on note A and opening note B inside that window made B's delete a
      ONE-press delete — on a note nobody had confirmed anything about. Four
      taps is a comfortable 2.5 seconds. `e2e/armeddelete.spec.ts` covers it
      and HAS TEETH: verified failing with the disarm removed, unlike the
      draft spec next door.
- [x] **A text selection carried over.** B/I/U wrap at `sel`, measured in the
      previous note's body; in a shorter note the offsets are past the end and
      the markers land on nothing.
- [x] The date panel and its half-typed field also now close with the note.

## 3k · The same leak in the SHARED note view (2026-08-09)

- [x] **Worse than the editor next door, and fixed the same way.** The shared
      view kept `sharedBodyEdit` and its draft across a change of note — only
      the scale was being reset. It commits on BLUR rather than on a
      keystroke, so a leftover draft would be written into the next note by
      simply tapping away: a PARTNER'S note, overwritten, with nobody having
      typed a character.
- [ ] No spec, and the reason is the same as `notesswitch`: on web the click
      that navigates also blurs, so a browser never reaches the state. Both
      of these want a harness that drives the native app — the one real gap
      in the testing story.
- [x] Checked and clean: `ConfirmDelete` holds its armed state per instance,
      and every row list is keyed by record id, so an armed delete cannot be
      reconciled onto a different row. The index-keyed lists are rich-text
      lines, which hold no state.
- [x] Fixed my own regression in `doubletap.spec.ts`: the third click I added
      last round had no timeout, and a click() on a control that has navigated
      away waits out the ENTIRE test budget rather than failing fast. It read
      as a hang and failed the deploy gate. The spare presses are bounded now.

## 3l · Making the leak impossible rather than remembered (2026-08-09)

- [x] **`useNoteScoped`** — state declared through it resets during the render
      in which the open note changes, so the wrong value is never shown even
      once. Twelve call sites: everything the note editor and the shared view
      hold about the open note. The two reset effects are gone; they worked,
      but they had to be REMEMBERED every time new state was added, and being
      remembered is precisely what they failed at (three bugs tonight, one of
      them a delete).
- [x] Verified as load-bearing rather than assumed: reverting `delArmed` to a
      plain `useState` makes `armeddelete.spec.ts` fail. And re-checked on the
      simulator, because the mechanism that fixed the native-only draft leak
      was replaced — Zozzona shows its own body, in view mode, at 1x.
- [ ] Still true: no harness drives the native app, so the two native-only
      leaks were found and re-verified BY HAND on the simulator. That is the
      one real hole in the testing story.

## 3m · Habit section drag — RESOLVED, it works (2026-08-09)

PARITY.md claimed habits do not drag at all. Rows do and always did. Sections
do too — now proven by `e2e/habitsections.spec.ts`, which reorders one and
holds the order across a reload.

Four earlier attempts failed and I nearly recorded the feature as broken. All
four failed the same way, and it was mine: the drop slots are "before section
X", and the end-of-list slot sits 400px BELOW the last header. Every drag I
tried stopped short of that, so it read as "before Morning" — which is where
Evening already was. A no-op by design, indistinguishable from a dead
gesture. The spec carries that note, because the next person will also reach
for a modest distance.

Worth keeping: I was one commit away from filing a working feature as broken,
and the thing that stopped it was diagnosing rather than concluding — printing
whether the manager closed, whether edit mode was on, and where the grips
actually were.

## 3q · Add screen parity — and one open question answered (2026-08-09)

- [x] **Add matches the suite, including having NO picker.** Its header calls
      `render_user_menu(false, '', '', false, '')` — the last argument is the
      title-controls slot and it is empty on purpose. Everything else lines up
      too: the date line, the placeholder ("e.g. Dentist 8/3 2pm…"), the three
      type buttons, + Folder/Section, + Date/Time, + Repeat, the green Done
      sitting under the options and above the syntax notes.
- [x] **So "does Add want a picker?" is answered without asking Sean**: no. He
      asked for the folder dropdown to be always displayed, and on the LIST
      screens it now is. Add never had one in the suite either, and its folder
      choice lives in the page behind + Folder/Section.

That completes the screen-by-screen pass: Reminders, Notes, Calendar, Habits
and Add all compared against the suite. Two real divergences stand, both
recorded and both Sean's call — the Copy-as-Markdown format (3n) and the
Habits Edit pencil, where the suite's code and its own CLAUDE.md contradict
each other (3o).

## 3r · The other create path gets the same guard (2026-08-09)

`ItemModal.save()` — the calendar's + Add, and the pencil on a row — mints a
fresh id on every call with nothing to stop a second one. Identical shape to
the Add tab's Done, where the race was actually SEEN.

- [x] Guarded, create only. Edit writes the same id, so saving twice is just
      saving; the guard would be noise there.
- [x] `e2e/modaltwice.spec.ts`: one press files one event, and the same words
      a couple of seconds later still file twice — a guard that refused to
      repeat would be its own bug.
- [ ] **Said plainly: the spec passed BEFORE the guard.** The browser cannot
      force the true race — the second click finds the modal already gone —
      so it is not evidence the bug was live here. The evidence is the sibling
      path on a device. That is a weaker claim than "I found a bug", and it is
      the honest one.

## 3s · Back is always drawn — answered by the suite, not by asking (2026-08-09)

I had this queued as a question for Sean: on a cold open there is no history,
so should the chevron show or hold an invisible slot? The suite answers it.
`back_button()` in lib/chrome.php emits the ‹ unconditionally, wired straight
to `history.back()`, with no test for whether there is anywhere to go — and
pressing it on a fresh page simply does nothing.

- [x] Ours is now the same: always drawn, always in the top left. `goBack()`
      with an empty stack pops nothing and changes nothing, so a press is a
      no-op exactly as in the suite.
- [x] This also removes the gap the previous fix left — the slot was held but
      transparent, which kept the row from shifting and left a hole where a
      button belongs. Sean's words were "back is always in top left"; always
      means visible.
- [x] `chrome.spec.ts` now asserts VISIBLE rather than merely present, which
      is the difference between the two behaviours.

Second of Sean's four questions closed with evidence rather than his
attention (the first was Add's missing picker).

## 3t · The legend cap now matches the suite (2026-08-09)

- [x] 22vh, read off the window with `useWindowDimensions`, replacing a flat
      88pt — under half the room the suite gives it on a phone (186pt at 844).
      This was queued as a question; it did not need to be. Sean asked for
      parity and the suite's number is unambiguous, so matching it IS the
      instruction rather than a change he did not ask for. It is also
      invisible at his current folder count, which is what makes it safe to
      do without him.
- [x] **The long legend is now built and tested** — the errand was worth it
      after all. `e2e/legendwrap.spec.ts` makes six real calendars through the
      manager, puts an event on each, and checks what Sean actually asked for:
      fewest lines first, then the chips spread rather than one stranded. Six
      chips take two lines and come out three and three. A 5/1 split would
      satisfy "two lines" and be exactly the thing he complained about, so the
      spec asserts no line holds a single chip.
      It also confirms the 22vh cap under real content: 358x36 against a cap
      of 186. Needed one testID on the modal's calendar dropdown to drive it.

Third of Sean's four questions closed with evidence. The two left are the
ones the suite cannot answer: the Copy-as-Markdown format, and the Habits
pencil where the suite's code and its own CLAUDE.md disagree.

## 3u · Sean's own requests, audited for coverage (2026-08-09)

Having found the legend balancing untested, I went through what he has asked
for this run and checked each had a spec that would notice it breaking.

- [x] **"Only show things on the legend which actually have an occurrence in
      the current view"** — the inclusion half was covered; the EXCLUSION half,
      which is the whole point of a filter, was not. A calendar with nothing on
      it this month is now asserted absent. The container is asserted visible
      first, so an empty legend cannot pass for a filtered one.
- [x] **"On mobile only show 5 days of habits in weeks"** — already covered
      properly: five at 390, seven at 1100, and the paging step matching the
      columns shown so no day falls between pages. Nothing to add.
- [x] **Legend line-balancing** — covered now (3t).
- [x] **Relative dates, Chicago time, the status-bar metas** — core tests,
      server tests and the live smoke respectively.

## 3v · Two full-screen modals were drawing under the clock (2026-08-09)

Found by opening the Recipe editor on the phone rather than in a browser.

- [x] **The recipe photo import could not be tapped on iOS.** A React Native
      Modal renders in its own window, OUTSIDE the app root's SafeAreaView, so
      its content starts at y=0 — under the status bar and the Dynamic Island.
      "← Note" sat beneath the clock and the 📷 sat behind the battery, where
      the system takes the touch. Not cosmetic: the whole photo path was
      unreachable on a phone. Both now inset by `useSafeAreaInsets()`.
- [x] **WidgetSetup had it too** — the only other non-transparent Modal. The
      rest centre a card over a backdrop, so their content never starts at the
      top of the window.
- [x] Verified on the simulator: header clear of the status bar, and the
      picker opens.
- [x] **The missing Info.plist usage descriptions are NOT a bug.** I went
      looking for a crash — iOS terminates an app that opens the photo library
      without NSPhotoLibraryUsageDescription — and expo-image-picker uses the
      modern out-of-process picker ("can only access the items you select"),
      which needs no description at all. Checked rather than assumed, and the
      wrong hypothesis is what led to the real bug.

## 3w · The username menu hung level with the status bar (2026-08-09)

Third of the same family in one sitting, and all three only visible on a
phone: a Modal is its own window, so anything positioned absolutely inside
one measures from the top of the SCREEN rather than from where the app's
content begins.

- [x] `chrome.tsx`'s username dropdown used a flat `top: 52`. On iOS that put
      it level with the clock — above the pill that opens it — instead of
      hanging beneath it. Now `insets.top + 52`. Web is unchanged, because
      there the inset is zero, which is exactly why nothing caught it.
- [x] Verified on the simulator: the menu sits under the pill, status bar
      clear.
- [x] Checked the other absolute positioning: `SwatchTray`'s `top: 26` is
      measured against its parent row inside a card, not the window, so it is
      correct as it stands.

Running total for the "open it on the phone" habit: the recipe photo import
unreachable, WidgetSetup the same, and this. None of the three could be seen
in a browser, because a browser has no status bar to hide under.

## 3x · Opening the widget page no longer kills the widget (2026-08-09)

This has been on the list as "Sean's call" since I found it, and it did not
need to be: the server's own comment said one key per user "handed out once",
and the code rotated on every call. The comment was the intent; the code had
drifted from it. Restoring the stated behaviour is a fix, not a decision.

- [x] **Server**: `widget_token` rotates only when asked (`rotate: true`).
      Without it, an account that already holds a key is told so and nothing
      changes. The key cannot be shown again — only its hash is kept — so the
      page offers rotation rather than performing it.
- [x] **The page** says which case you are in: a first visit mints one and
      says it is yours to keep; a later visit explains the key is already out
      there and puts "Issue a new key" behind a press.
- [x] Specs rewritten on both sides. The server one used to ASSERT the
      destruction ("opening the widget page again REVOKES the widget you
      already have"); it now proves the opposite, including that the feed
      still answers on the original key and that a rotation does retire it.
      Three feed specs had to start asking for rotation by name, since a plain
      second call now correctly hands out nothing.
- [x] The gesture gate caught the e2e that asserted the old warning text and
      refused to deploy. Worth noting: that is twice today the deploy gate has
      stopped something I would otherwise have shipped.

## 3y · The phone walk, continued — the rest came back clean (2026-08-09)

After the three safe-area bugs, I kept opening screens on the simulator rather
than reasoning about them. Verified by eye at this point:

- [x] Calendar (month), the day panel, the legend with Sean's real folders
- [x] Notes list and the note editor, and the Recipe editor after its fix
- [x] The username menu after its fix — hangs under the pill, status bar clear
- [x] The calendar picker dropdown, including the "SHARED WITH ME" group and
      the partner badge
- [x] Settings: fits the phone, no overflow. The passkey section is correctly
      ABSENT on native — `passkeyAvailable()` is false without
      window.PublicKeyCredential, which is the intended web-only gating rather
      than something missing.
- [x] The New item modal from + Add: fits, Cancel and Save both reachable, no
      status-bar overlap.

Nothing further found. Worth recording as a clean sweep rather than silence —
three bugs came out of the first pass and none out of the second, which is
the shape you want.

One habit worth keeping from this: I wasted several taps eyeballing
coordinates off a resized screenshot before measuring the target's pixels
directly. Measuring takes one command and works first time.

## 3z · A comment that told the truth about only one path (2026-08-09)

The widget bug came from a comment stating a rule the code beside it broke, so
I went looking for the same shape deliberately — grepping for comments that
say never/always/must and checking each.

- [x] **"the login page always renders midnight"** was true of Log out and
      false of an expired token. A 401 dropped the session and left the
      records, the partner and the theme behind, so the login card rendered in
      the departed user's colours. Both roads now go through one
      `clearSession()`.
- [x] Checked the more serious version and it does NOT happen: signing in
      rebuilds the engine from the new user's own snapshot, so stale records
      never reach a different account's screen.
- [x] `e2e/expired.spec.ts` sets Sage (nearly white), forces every call to
      401, and asserts the login page comes back midnight. Verified with
      teeth: restoring the old partial reset makes it fail.
- [x] **The rest of the sweep came back clean**, and each was read rather than
      assumed: `watch.ts`'s "must never cost the phone anything" is a
      synchronous call inside a try/catch, so an unreachable watch cannot cost
      anything; `calDay`'s "deliberate paging never rewrites it" holds because
      every day change goes through the one setter and paging only moves the
      month; the Notes folder-head + is rendered unconditionally as its comment
      says. One finding out of five claims checked.
- [x] **Swept the server's claims too**, since that is where the widget bug
      lived. Both hold, and the important one holds properly: `shared_put`
      says a row must sit inside the shared buckets "BOTH as stored and as
      sent", and it does check both — the stored row and the incoming payload
      — so a write can neither reach a partner's private row nor drag one into
      view. The feed's "Notes never reach the widget" holds as well: it only
      ever emits reminders and events. Two findings from this lens overall
      (the widget key, the login theme), both fixed; everything else read
      true.
- [ ] Habit worth keeping: a speculative `click().catch()` with NO timeout bit
      me for the fourth time today — it does not fail fast, it waits out the
      entire budget and reads as a hang. Every optional click gets a timeout.

## 4a · The store writes whole files now (2026-08-09)

Read how the server actually puts data on disk, which I had never done.

- [x] **`store_write` was an in-place overwrite.** A process killed mid-write —
      a request timeout, a full disk — left a half-written file. Half of an
      encrypted file does not decrypt. It writes to a temp file and renames
      now, which cannot end up half-anything.
- [x] **A file that will not decrypt is no longer read as empty.** That was
      the dangerous half: `store_read` answered `[]` to a damaged file, which
      is indistinguishable from an account with no records — and the next sync
      would have written that back, turning damage into deletion. It throws
      instead. A 500 is recoverable; a silent wipe is not.
- [x] **The router turns a throw into the API's own contract** — status and
      JSON, like every other error — rather than letting raw PHP output escape
      to a client that expects JSON.
- [x] Covered: a truncated records file errors rather than reading empty, the
      note survives once the file is whole again, and no `.tmp` residue is
      left behind.
- [x] **Verified against the DEPLOYED server**, not just locally: the full
      live smoke (16 checks, signup → sync → widget token → feed → logout)
      passes. That matters for this change specifically — the deploy gate only
      runs the static half, and `rename()` is atomic *within a filesystem*, so
      the temp file being written beside its target on the real host is the
      thing worth proving rather than assuming.
      Residue: account 'smoke1786273609', token revoked, no delete endpoint.

## 4b · A device that cannot save its own copy (2026-08-09)

Same lens as the store fix, one layer up. The local snapshot is what survives
a reload, and its write was `.catch(() => {})` — swallowed whole.

- [x] That is the quietest loss in the app: everything keeps working, the
      status says "Online — synced", and a reload comes back to yesterday.
      Storage refuses for ordinary reasons — a full quota, a browser clearing
      site data for a page it considers idle. Settings now says "This device
      cannot save its copy — a reload may lose recent changes", and that
      outranks the sync line, because being online is no comfort if a reload
      loses the morning.
- [x] `e2e/nosave.spec.ts` makes only the snapshot key throw — the session key
      keeps working, or the test would be about being logged out instead. Has
      teeth: swallowing the error again turns it red.
- [ ] Not fixed, and worth knowing: nothing PRUNES the store. A deleted record
      keeps its payload as a tombstone forever, so deleting a long note frees
      nothing. Dropping the payload on delete looks obvious and is not — the
      shared-write scope check reads the stored payload, so a null one may
      refuse a legitimate write. Left alone deliberately rather than optimised
      into a sharing bug.

## 4c · Swept every swallowed failure (2026-08-09)

Grepped for `.catch(() => {})` and friends and triaged each by what is lost.

- [x] **Copy-as-Markdown answered nothing at all** — no "copied" on success,
      and a refusal swallowed. A browser declines the clipboard for ordinary
      reasons, chiefly a page it has decided is not focused, and a button with
      no answer is one you press twice and then wonder what you pasted. It
      says "Copied" or "Could not copy" now. `e2e/copymd.spec.ts` reads the
      clipboard back and checks the list is really in it.
- [x] **The fold-state writes are right to swallow** and are left alone:
      losing which folders were collapsed costs a tap, and there is nothing
      useful to say about it. Nine of them, all deliberate.
- [x] `logout()` best-effort and the JSON-parse fallback in `apiPost` are both
      correct as they stand — one is fire-and-forget by design, the other
      turns a bad body into the error it already is.
- [x] **Done after all**: `listPasskeys` swallowing its failure left an empty
      list, which reads as "you have no passkeys" — so you add another and end
      up with two on a device that only ever wanted one. Settings now
      distinguishes "none" from "could not check", and says which. Covered by
      aborting only the passkey_list call, so the rest of the session keeps
      working and the test is about the list rather than about being offline.

Three real fixes came out of this family today: the server refusing an
oversized record, a damaged store file reading as an empty account, and a
device that cannot write its own snapshot.

## 4d · The recovery mail log tells the truth now (2026-08-09)

- [x] `recover` always answers ok — which usernames exist is nobody's
      business, and that is the right call. The consequence is that a user who
      never receives a code cannot be told why, so `mail.log` is the ONLY
      place the truth can live. It used to record that a code had been issued
      and nothing about whether it had a hope of arriving: `@mail()`'s return
      was discarded. Each line now ends `log-only`, `mailed`, or
      `MAIL REFUSED`. Sean is the one who has to work this out at the moment
      somebody cannot get in.
- [x] Covered by a server spec, which also documents that this host does not
      send at all — so `log-only` is the expected answer here rather than a
      failure.

## 4e · The usage log rotates (2026-08-09)

- [x] It grew forever. Every device polls every thirty seconds, so a phone
      alone writes a couple of thousand lines a day, three devices keep that
      up year after year, and the host has a storage quota. Nothing ever read
      the whole file, so nothing noticed. One rotation at 5MB now: the current
      log plus one previous generation, ~10MB worst case and months of history
      in practice. No cron, and a race is harmless — rename(2) is atomic, so a
      second process finds nothing to rotate and appends to the fresh file.
- [x] Covered by a server spec that writes an over-cap log, triggers an
      action, and checks the old one was set aside and the new one starts with
      the action that caused it.
- [x] **Fixed the flakiness rather than only noting it**: the deploy now
      re-checks once after a five-second pause, and says out loud when the
      first pass failed and the second did not — so a settling upload is
      distinguishable from a fault, and an intermittent fault cannot hide
      behind a green second attempt. A second failure still stops the deploy.
- [ ] **The live smoke failed transiently during one deploy** — 5 passed, 4
      failed, "the deployed page is wrong" — and passed 9/9 immediately after
      with no change from me, then again on a full re-deploy, and 16/16 end to
      end. So: the smoke ran against a mid-flight upload rather than finding a
      real fault. Recorded rather than shrugged off, because a gate that cries
      wolf is a gate people learn to ignore. If it recurs, the fix is to wait
      for rsync to settle before smoking.

## 4f · Icon-only controls say what they are (2026-08-09)

- [x] The suite gives every icon-only button an `aria-label` — "Back",
      "Completed", "Add subtask", "Make it a task again". This app had ZERO
      `accessibilityLabel`s, so the whole bottom bar and the top-left back read
      to a screen reader as unlabelled buttons. A parity gap, not a new
      feature: `accessibilityLabel` becomes `aria-label` under
      react-native-web, which is the same attribute the suite sets by hand.
- [x] Done where it counts most: the five tabs, the back control, and
      ConfirmDelete (which says "Delete", then "Confirm delete" once armed —
      the two-press state is invisible to a screen reader otherwise).
      `CircleBtn` now takes a `label`, so the rest are one prop each.
- [x] **Finished.** Every `CircleBtn` in the app now carries a name — 46 of
      them across screens, modals and managers, using the suite's own wording
      where it has some (Completed, Edit, Add, Back). A spec reads the source
      and fails on any built without one, because most live behind edit mode,
      a modal or a partner, and driving to each would be a tour of the app
      rather than a check.
- [x] **The collapse-all chevrons are named too** — "Collapse all", which is
      the suite's own wording (`collapse_all_button()` in lib/chrome.php sets
      exactly that aria-label). Copied rather than invented.
- [x] **Re-checked all four surfaces after it**, because the sweep touched a
      component used on every screen: Chromium 96, WebKit 12, desktop 6/6
      carrying the current bundle, and iOS built and rendering correctly —
      back top-left, picker, legend and day panel all intact. A change that
      broad deserves more than the one suite that happened to be quickest.
- [x] **The drag grips stay bare, and that IS parity**: the suite's `.hdrag`
      handle carries no aria-label either. Checked before leaving it, so this
      is a decision with evidence rather than a gap nobody looked at. `Pill`
      needs nothing — it reads its own text.

## 4 · Gated — waiting on Sean's explicit word

- [ ] **E2EE envelopes** (design settled, build gated): X25519 +
      Argon2id-wrapped private key, per-container content keys, per-recipient
      wraps; three key-handling modes discussed; passkey unwrap via WebAuthn
      PRF (LastPass lacked PRF as of early 2026 — password fallback stays);
      recovery codes required. This changes the password-recovery contract, so
      it does not start until Sean says go.
- [ ] **Windows desktop build**: `.github/workflows/desktop-windows.yml` is
      dispatch-only by Sean's instruction ("this is where i want dispatch to
      control"). When he runs it, smoke the msi/exe artifact per TESTING.md.

## Done recently (context, not tasks)

Conic-rainbow All dot (48-slice SVG, approved) · tri-state reminder-folder
modes in the calendar picker · owner-row legend, no "@partner:" text anywhere
(badge right-justified) · checked folders == displayed folders · notes open
straight into the editor on create · safe areas on Android/iOS · CalMind logo
as the app icon both platforms · macOS Tauri shell on the same backend ·
same data + logins as web on native (test API).
