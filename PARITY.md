# Parity ledger — seancheren.com/calmind → /test/calmind

The Ralph loop's working memory: what's shipped, what's in flight, what's next,
checked against the suite's CLAUDE.md/TESTING.md notes each pass. Keep this
honest — the next iteration trusts it.

## Removed

- **The Scriptable widget, 2026-08-12, entirely, on Sean's word.** The lines
  below that describe it are kept as the ledger they are — it did ship and it
  did work — but the script, its setup page, the server's `widget_token` and
  read-only feed, and every test of them are gone. The NATIVE home-screen
  widget is untouched and is now the only one: it reads the App Group, never
  that feed.

## Shipped (verified on web against seeded example/buddy)
- Core: spec replay (parse/repeats/sort), day model (overdue collection,
  rideAlong riders, repeat expansion), normalize guarantees, manage rules
  (folder/section/calendar delete·rename refusals + re-homes), reminderToggle
  (max(due,today) roll), sectionNameTaken, ord keys, LWW sync engine.
  94 core + 15 server tests.
- Reminders: folder blocks (wash chips), gold sections, chevron collapse
  (persisted), undated-first block sort, subtasks (+/‹), full-edit ✎ →
  ItemModal, toolbar row under divider (collapse-all ⌄, completed ☑ icon,
  sean-only ⧉ markdown), FolderPick.
  RETIRED 2026-08-12, and corrected here rather than left to be found: this
  line claimed a "repeat mini-editor" and "inline edit (re-parses dates)", and
  Sean removed both from this screen — see the five-nits iteration at the foot
  of this file. That makes a FIFTH stale §1 entry, and the first one caught by
  the person who staled it rather than by a question of Sean's.
- Calendar: month grid + day panel, centred pager + ◉ today, CalendarPick with
  visibility filtering, ItemModal add/edit (kind row, +Time/+Repeat reveals,
  Goes-in pickers), overdue/rider rows on today.
- Notes: folders/sections/rows, editor (title/body autosave, marker toolbar),
  create→editor from everywhere, FolderPick.
- Habits: week tick grid, deterministic tick ids, per-section colours, add row.
- Chrome: TopBar (status dot · picker · username→menu[Settings/Log out]),
  640px column, tab bar (✅ pie + 📝 🔥), pie/rainbow picker buttons,
  per-app palettes (lib/palette.php computed values), CalMind logo (pie-C+M).
- Server: dumb-store sync, hashed auth, recovery, caps, ENC1; seeder
  (example 246 recs + buddy, Chicago-anchored, deterministic ids).

## Iteration 1 shipped (on top of the pre-loop state)
- Sean's PROD data imported into test's sean: server/tools/import-suite.php
  (suite JSON → records: name→id folders/sections, suite ids kept, ords from
  stored order, HTML bodies → marker text, habit done-maps → ticks, prefs
  mapped). 219 records live. Export/mint were one-shot guarded wrappers,
  deleted after use. Leftover: sean's old empty test 'Reminders' folder
  duplicates the imported one — he can delete it in Manage folders.
- Status dot moved right of the username; settings footer = the suite's three
  round buttons (Share/Widget = roadmap notes until those milestones, Done).
- Icons: favicon/app icon/splash/adaptive all render the mark now (canvas-
  rendered PNGs from assets/logo.svg). Android adaptive art is the full mark —
  proper foreground inset when the Android build lands.

## Iteration 2 shipped
- cellMarks/monthLegend in core (4 new tests, 98 green): one icon per
  kind+colour, worst state per reminder colour, legend built off the cells.
- Month cells wear the kind icons in a capped well (+ past six); the legend
  bar sits between grid and panel and hides when empty; the day panel's kind
  groups fold with persisted chevrons; the tab bar is all SVG (tick-circle,
  pie, +, page, flame).

## Iteration 3 shipped
- Habits month view: one pie per day, equal slices per counted habit in its
  section's colour, filled when ticked, outline for days ahead, today pilled
  and ringed, the key underneath in pie-slice order. Week|Month toggle lives
  in the synced habits pref (Prefs.view). Pager pages whichever view is up.
- Manage-sections window (☰): add/rename/recolor (habits palette)/two-press
  delete via core deleteHabitSection (last stays, habits re-home — tested).
- Habit rename in place (tap while pencil is on, or long-press); section fold
  chevrons persisted. 100 core + 15 server tests.

## Iteration 4 shipped
- Row drag in all three manager windows (folders, calendars, habit sections):
  ≡ handles, the suite's single drop-line, dim-and-ride row, ord landing via
  ordForMove. useRowDrag is the portable hook (STABLE per-index responders —
  rebuilt-per-render handlers dropped the gesture, showing as text selection;
  release computes from total travel so fast flicks land). BY-EYE: synthetic
  browser drags can't fully exercise PanResponder — Sean or the Playwright
  harness must confirm real-mouse reorder before this counts as done.
- Calendar tab icon is a proper calendar glyph (the pie was always about the
  folder pickers — clarified); note rows lost their body previews; index.html
  ships with no-cache (hashed bundles immutable) so stale pages stop happening.
- Sean's prod pull confirmed visible on test after his page caught up.

## Iteration 5 shipped
- The Playwright gesture harness: e2e/router.php serves the EXPORTED app
  under the production prefix with the real PHP API on a scratch dir — the
  live test instance on a laptop. Five specs, real mouse events: signup→
  calendar landing, add+tick (row hides), MANAGER DRAG reorder incl. reload
  persistence, two-press delete, long-press inline edit. `npx playwright test`
  (script: test:e2e). testIDs plumbed through Pill/CircleBtn/ConfirmDelete/
  tabs/rows — they ride to native too.
- Real bug the harness caught on day one: snapshot persistence was debounced
  300ms, so an edit made just before a reload vanished. Persistence is now
  immediate on every mutation; only the network push stays debounced. The
  manager drag from iteration 4 is CONFIRMED with real gestures — off the
  by-eye list.

## Iteration 6 shipped
- The outline drag, spec-first: reminderBlock/moveReminderBlock in core
  (104 tests) — a parent gathers its following indent-1 rows, blocks land as
  one family on consecutive ords, cross-folder re-files, self-landing refused.
  Reminders rows wear a muted ≡ grip; the drag speaks flat visible-row
  indices, the drop-line renders in place, and the e2e spec proves reorder +
  reload persistence under a real mouse (6/6 green).
- Known simplifications, honest: drop math assumes ~uniform 46px rows (fine
  at phone widths; wrapped chips could drift a slot on unusual widths);
  empty sections can't be drop targets yet; SECTION drag (blocks between
  folders, last-section-out ask) still open. Notes rows don't drag yet.

## Iteration 6.5 shipped (Sean's live steering batch)
- The mark is Sean's pick: option C, the one-stroke CM — logo.svg, Logo.tsx,
  favicon/icon/splash/adaptive all re-rendered; favicon.ico deploys with a
  ?v=<hash> stamp and hourly cache so a changed icon always shows.
- Add is prod's page: date line, kind CARDS with icons, +Folder/Section
  +Date/Time +Repeat reveals, full-width accent Done that adds and returns,
  the typed-patterns help block.
- The note editor is prod's: dropdown-styled header (← All notes · folder ·
  gold section dropdowns), boxed title + dashed +Add date, pill toolbar
  (" B I U ·List) under the name, outlined tinted body, Saved left /
  text Delete (two-press) right.
- Dropdown is the one select everywhere (ItemModal, Add, managers, note
  header) — no more pill walls. Every modal closes on outside click.
- Calendar: tighter cells with an inner tile so the picked day breathes,
  ☑ completed toggle on the panel, spurious ◉ gone (month label taps home).
- Reminders: prod type scale; rows AND section names edit by double-click or
  long-press.

## Iteration 7 shipped
- Core: moveNote (cross-folder note row moves) and moveSection (blocks with
  the suite's refusals: duplicate name in the destination, a folder's last
  section stays — the ask-then-delete-emptied-folder flow arrives with the
  section-drag UI). 108 tests.
- Notes rows drag (grips + drop-line, same flat model), proven by a real-mouse
  e2e spec incl. cross-folder re-file (7 gesture specs green).
- Habits is prod's page: Week|Month segmented left, labelled ‹ This week ›
  pager right, collapse-all above the grid, colour-wash section pills, tinted
  habit name boxes and big tinted tick cells, today's column pilled+ringed,
  and the folder-style SECTION dropdown (pie button → All + visibility boxes
  + Manage sections…). Month pies draw CONTIGUOUS per-section arcs now.
- The Scriptable widget lives again: read-only widget tokens (never a bearer
  token — tested), GET ?feed=1&t=… serving 21 days of reminders+events
  (riders + rolled-overdue on today, repeats expanded, notes never), Settings'
  Widget button mints and shows the URL, tools/scriptable-widget.js is the
  script. TopBar titles at prod scale (24/800). Ralph state gitignored.

## Iteration 8 shipped
- Empty sections are drop targets in Reminders AND Notes: one placeholder
  entry per empty section in the flat drag model, expanding to a dashed
  "drop here" slot only while a drag is live (uniform index math holds).
  Proven by a real-mouse spec dragging a row UP into an empty section, with
  DOM order asserting the re-file (8 gesture specs green).

## Iteration 9 shipped
- SECTION drag, measured: headers register refs, the grant measures them in
  window space, the pointer's absolute Y picks the slot — variable heights
  never bend the math (components/sectiondrag.ts). Sections land only
  between sections; end-of-folder slots included; drop line stays the only
  feedback. Duplicate-name refusal proven under a real mouse.
- The ask-first flow: moveSectionEmptyingFolder in core (move + tombstone the
  emptied folder as ONE result; rideAlong/last-folder still refuse — tested),
  surfaced as the suite's confirm modal when a drag would empty a folder.
- 110 core + 17 server + 9 gesture tests.

## Iteration 10 shipped
- Kind conversions in core: convertToNote (reminder|event → note, one-way,
  a reminder with subtasks stays behind as their home — reminderBlock length
  decides), convertReminderToEvent (undated converts onto today),
  convertEventToReminder (date→due, time carried). 4 new tests.
- ItemModal's kind row is live in EDIT now (notes never convert out — the row
  hides for a note); a changed kind routes through the core conversions.
- Notes section drag: same measured hook as Reminders, grips + drop lines +
  the last-section-out ask (moveSectionEmptyingFolder) — full rule parity.
- THE BUG THIS ITERATION FOUND (a real phone bug, not a test artifact): a
  glyph button beside a focused field stole focus on pointerdown → blur
  unmounted the cluster mid-press → the tap died. rn-web never even delivers
  onPressIn before the teardown. Fix in ui.tsx: noSteal — CircleBtn and
  ConfirmDelete preventDefault() mousedown on web (focus never moves), and
  onPressIn doubles onto onTouchStart for the touch path, with a holdCluster
  ref in Reminders letting blur skip teardown once. This protected every
  manager-window rename pencil too, which had the same latent race.
- 114 core + 17 server + 10 gesture tests.

## Iteration 11 shipped
- Row drags are MEASURED: useRowDrag records every entry's midpoint at grant
  and moves when the row's DISPLACED midpoint crosses another's (grab point
  cancels out; direction-aware tie bias). Placeholders stay zero-height in a
  drag — growing them at grant shifted the list under the finger; the drop
  line is the only feedback, as the suite demands. All five call sites.
- Duplicate buttons: duplicateItem in core (reminder = whole outline block,
  fresh ids, consecutive ords directly under the original; note/event = one
  copy; 3 tests) — wired as ⧉ in the Reminders edit cluster (top-level, the
  suite's spot between ✎ and +), on Notes rows, and on all three day-panel
  row kinds.
- THE INFRA FIND: e2e specs had NEVER exercised their own scratch API — the
  web app hardcoded localhost:8788 for any localhost hostname, so ten
  iterations of green runs leaned on a long-dead manually-started dev server.
  Same-origin api/ everywhere except metro now; drag specs measure their
  destinations instead of assuming pixel constants.
- 117 core + 17 server + 11 gesture tests.

## Iteration 12 shipped (so far)
- WEEK MODE: weekOf/addDays in core (a month ROW, null-padded — stepping the
  anchor across an edge lands on the neighbour month's first/last row, the
  suite's ?wk=first|last; 4 tests). Swipe up on the grid folds to the week,
  swipe down opens the month, a firm sideways swipe pages what the arrows
  page (a week in week mode, a month otherwise); sticks per device
  (calmind.calWeekMode); legend + calendar picker hide in week mode; folding
  anchors on the selected day only when it's in the shown month.
- Two web gesture truths learned (both in Calendar.tsx comments): an
  ancestor cannot wrestle the responder off a pressed cell on rn-web — claim
  with onMoveShouldSetPanResponderCapture past 10px of travel (which is also
  what makes day-selection tap-only); and a swipe across cell text starts a
  SELECTION, which TERMINATES the pan — the grid wears userSelect: 'none'.
- 121 core + 17 server + 12 gesture tests.

- RENDERED RICH TEXT: richLines in core (markers → styled runs; toggles
  never cross a line break, unclosed styles the rest of its line — 5 tests).
  The note body READS rendered (quote bar in the suite's purple, bullet
  dots, bold/italic/underline runs) and swaps to the marker field on tap;
  Pill joined the noSteal club so the toolbar can't blur the field away.
- 126 core + 17 server + 13 gesture tests.

## Iteration 13 shipped
- SWIPE-A-ROW-LEFT TO DELETE: useSwipeLeft (stable per-key responders,
  capture-phase claim on clearly-horizontal leftward travel) on Reminders
  rows, Notes rows, and all three day-panel row kinds. The swipe reveals the
  delete already ARMED (ConfirmDelete forceArmed) — the swipe is the first
  press, one tap fires; stands down while a row is inline-editing. Swipe
  targets wear userSelect none (a selection terminates the pan). One more
  web gesture truth: the browser fires a CLICK on the mouseup that ends a
  pan, so tap handlers consult justSwiped() before clearing the state the
  gesture just set.
- 126 core + 17 server + 14 gesture tests.

## Iteration 14 shipped
- THEMES: the suite's four full palettes (midnight/sage/forest/olive) carried
  over from lib/auth.php's THEMES table VERBATIM, same columns — midnight's
  drift (surface/dim/muted/gold approximations) corrected to the suite's
  exact values in the process. T is a mutable singleton now; every
  StyleSheet.create in the app (19 files) is wrapped in themed(() => …), a
  lazy Proxy sheet that re-creates itself per theme generation, so switching
  remounts the tree (App keys on the generation) and no component knows
  themes exist. The picker is the suite's swatch row (page colour + accent
  dot) in Settings; the choice is a SYNCED pref (Prefs.theme under the new
  'suite' prefs app) so every device follows; sign-out returns to midnight —
  the login page has no user to theme. Sage flips the status bar dark.
  Proven under a real browser: pick → repaint, reload → still cream (synced),
  log out → midnight.
- 126 core + 17 server + 15 gesture tests.

## Iteration 15 shipped
- PAGE EDIT MODE, the suite's body.editing: Reminders and Notes both. Long-
  press or double-click a row enters it (a reminder also opens inline; a
  section long-press enters it with its rename field); tap empty space or
  Escape leaves (capture-phase listener — a focused field swallows Escape
  before it bubbles). Grips hide OUTSIDE it the suite's way (opacity, not
  unmount, so nothing shifts) and drags live only inside it; the icon
  cluster (✎ ⧉ +/‹ ×) rides EVERY top-level row in edit mode now, not just
  the inline-open one; Notes rows got their edit-gated ⧉ and two-press ×;
  swipe-delete stands down page-wide in edit mode. Drag specs enter edit
  mode first, as a finger must; a new spec pins the gate (absent → revealed
  → Escape).
- Kind palette check against kind_color_css: overdue corrected to the
  suite's #f0a860 (was a tailwind orange), note purple #8b6ef0 and done
  #555 staged as constants; the event blue was already right.
- 126 core + 17 server + 16 gesture tests.

## Iteration 16 shipped — SHARING (first half)
- The model: one singleton 'share' record per user (partners + three opt-in
  id buckets), the suite's shares file as a synced record. Server:
  share_mutual() re-checks BOTH stores on every request; shared_pull returns
  the first mutual partner's records filtered to their buckets (rows follow
  their containers — nothing is copied, the owner's store is read directly);
  shared_put writes ONE row into the partner's store, container types
  refused outright, and the row must sit in shared scope both as stored and
  as sent — a write can neither reach a private row nor drag one into view.
  3 server tests: one-sided shares nothing / mutual opens buckets exactly /
  tick lands + structure and private rows 403 / removal on either side ends
  it instantly both ways.
- The client: store pulls shared records with every sync (read-only copies,
  never in the engine — a partner's store is not ours to hold a cursor
  into); sharedPut round-trips and re-pulls. The share window (Settings ⇗,
  closing settings first like the suite): partner list with two-press
  remove, 'sharing'/'waiting for them' badges, empty-state handshake text,
  and the three tick lists. The folder picker grew 'Shared with me' rows
  (@partner: Folder); the Reminders shared view renders their sections
  read-only with LIVE ticks and the section + adding into their store.
- E2E (two browser contexts): full handshake A↔B, B ticks A's row in the
  @A view, the tick lands in A's store.
- 126 core + 20 server + 17 gesture tests.

## Iteration 17 shipped — sharing, second half
- Calendar: the partner's shared calendars sit in the picker under 'Shared
  with me' with their own show/hide boxes (Prefs.hiddenShared — never merged
  into my list); their items draw into the month cells and the legend gets
  one row per owner (mine first, partner's dimmer with the @name). The day
  panel grew the suite's kind+owner groups — '<partner>'s events' /
  reminders, dimmer headings, per-gkey fold keys, no name chips on their
  rows — with LIVE ticks on their reminders (sharedPut) and read-only
  events.
- Notes: the @partner folder view — their sections and rows read-only; a
  tap opens the note RENDERED (richLines), never the editor. Live shared
  note editing is still queued.
- Second two-context e2e: A shares the starter calendar + note folder; B
  sees 'A's events · joint dinner' on today and reads the rendered note
  (markers gone).
- 126 core + 20 server + 18 gesture tests.

## Sean's steering batch (mid-iteration 18)
- REMINDERS TYPE SCALE, prod's exact values: folder wash chip 21/700,
  section gold 18/600, rows 16 with the suite's 8px rhythm and soft
  dividers (none under a section's last row). Notes' headings match.
- EVERY ICON WAS SECRETLY PADDED: qlmanage had rendered the 96px logo.svg
  top-left on a white 512/1024 canvas since iteration 1 — favicon, icon,
  splash, adaptive all carried it (that was the 'wrong tab icon'). All
  re-rendered full-bleed by scaling the SVG's declared size first; pixel-
  verified. Android adaptive set is now proper layers: mark-only foreground
  inset to the safe zone, #111 background, white monochrome.
- The deploy stamps an apple-touch-icon (180px) + link tag into index.html —
  expo emits none, and the home-screen icon read as broken without it.
  Verified live on test.

## Iteration 18 shipped — sharing rounds out
- ALL-VIEW PARTNER BLOCKS: in Reminders and Notes the partner's shared
  folders follow my blocks on the All canvas — wash chip '@partner: Name',
  their sections and rows, structure read-only, TICKS LIVE right there
  (the suite's All rule); a partner note row hops to the @partner view.
- SHARED NOTE EDITING: the @partner note opens rendered, a tap swaps in the
  marker field, and the body commits to THEIR store on blur (sharedPut) —
  reads and writes both go to the partner's file, structure alone refused.
- Specs extended in place: B ticks A's row on the All canvas; B edits the
  shared body and A reads 'then onions' in their own editor.
- 126 core + 20 server + 18 gesture tests.

## Iteration 19 shipped
- SHARED RECOLOURS: the viewer's override (Prefs.sharedColors, keyed
  @partner:id) resolves in the STORE, so the picker, shared views, All
  blocks, cells and legend all follow from one place — the suite's
  folder_shared_color chain, owner colour as the fallback, owner data never
  touched. The folder manager's read-only 'Shared with me' rows carry the
  swatch, cycling APP_PALETTES_SHARED's lighter tier.
- PARTNER DESTINATIONS in the add window: the suite's per-owner picker
  pair — my dropdown and an @partner's dropdown led by the blank '—',
  exactly one owner ever selected ('~'-prefixed ids so a shared choice can
  never be mistaken for mine); a shared pick writes THEIR store via
  sharedPut. Create mode only, as the suite offers.
- Specs extended in place: the swatch cycles under a real click, and B's
  'buy bread' dropped into A's shared section shows in A's own list.
- 126 core + 20 server + 18 gesture tests.

## Iteration 20 shipped
- FEED COMPARISON against the suite's build_feed, three real gaps closed:
  a rolled REPEATING reminder now keeps its future dates in the window (it
  only sat on today); the suite's 12-row cap holds; and the feed follows
  visibility — hidden reminder folders drop out, events follow hidden_cals
  and a single-calendar lastView. Own-data-only confirmed on both sides
  (the feed reads records-<user> alone; a partner's items never feed).
  New server test pins all three (21 server tests).
- HABITS ROLLING WINDOW: weekDates is the suite's shape now — six days back
  through TOMORROW, eight columns, of which a narrow screen (≤640) shows
  the last five (the wide-only rule), pager label following the shown span.
- Shared-calendar recolour rows in Manage calendars (the folders' twin,
  APP_PALETTES_SHARED.calendar).
- Drag simplification sweep: the iteration-6 caveats are all retired —
  measured drags (it. 11) removed the uniform-height assumption, empty
  sections are targets, sections drag, Notes rows drag.
- 126 core + 21 server + 18 gesture tests.

## Iteration 21 shipped — the by-eye pass
- Screenshot sweep of all five tabs at phone width, three finds fixed and
  re-verified by eye: the calendar legend hugged its content (flexGrow 0 —
  it sat on ~70px of dead black), every time chip speaks the suite's style
  now (timeLabel in core: '3pm', '2:30pm' — day panel, due chips; the FEED
  formats server-side too so an old widget script follows), and Notes got
  its missing fold story (section chevrons + collapse-all above the top
  folder, persisted like Reminders').
- Scriptable check: day headings ('Today · …'), tick boxes and event dots
  match; ours uses a text ☐ where the suite draws SFSymbol square, and the
  tick link (quick.php equivalent) is still open — both noted below.
- 127 core + 21 server + 18 gesture tests.

## Iteration 22 shipped
- WIDGET TICK-BACK, the suite's quick.php?tick= mode translated honestly:
  ?tick=<id> on the web app opens the one-reminder Done page on the
  SIGNED-IN session (a repeat rolls via reminderToggle, the label says so),
  then lands on the Calendar. The read token still never writes — the rule
  held. The Scriptable script links each reminder row to it and the widget
  face to the app. Spec: create → open ?tick= → Done → row gone.
- 127 core + 21 server + 19 gesture tests.

## Iteration 23 shipped — the CLAUDE.md sweep
- THE ROLLED FLASH: a ticked repeat rolls instead of checking off, and the
  roll is VISIBLE now — the row washes accent-soft and its date chip lights
  in the accent for the suite's 2.2s, in the Reminders list and the day
  panel both. Spec proves the flash comes on and fades back out. (An
  undated repeat still just checks off — no anchor to roll from, the
  suite's own rule, and writing the spec re-confirmed it.)
- THE REMEMBERED DAY (calDay): the selected day survives a trip to another
  tab and comes back; a fresh load lands on today; paging never rewrites it.
- Sweep verdicts: the '.folder-empty hides empty sections' paragraph in the
  suite's CLAUDE.md is STALE — no such class in prod's code any more; our
  always-visible sections match current prod. Partner entries in the share
  window don't rename yet (suite has per-entry labels) — queued.
- 127 core + 21 server + 21 gesture tests.

## Iteration 24 shipped — iOS BOOTS NATIVE
- CALMIND RUNS ON THE IPHONE SIMULATOR: expo run:ios builds, installs and
  boots on the iPhone 17 Pro sim — verified end-to-end by signing up
  against a local API (php -S on 8788, the sim default) and landing on the
  Calendar, today ringed, exactly the suite's landing rule. To reproduce:
  `npm run ios` in apps/app (LANG=en_US.UTF-8 for CocoaPods — gem install
  fails without it and expo's auto-install path hit exactly that), plus
  `npx expo start` for metro and the php server. ios/ stays prebuild
  output, gitignored.
- PARTNER RENAME LABELS: the share window's pencil renames an entry — a
  display label in MY share record's labels map, worn by the window, the
  pickers, the shared-view chips, the owner headings and the legend, while
  the username stays the partnership key. Spec renames to 'Buddy' and finds
  it on the picker row.
- 127 core + 21 server + 21 gesture tests.

## Iteration 25 shipped — ANDROID BOOTS TOO, and Sean's style batch
- ANDROID: expo run:android builds (gradle 4m40s cold, NDK/CMake auto-
  installed) and the app boots on the Pixel_10_Pro AVD — login card,
  mark, fields. Same reproduction shape as iOS: boot the AVD first (expo
  bails 'device offline' if it probes mid-boot), ANDROID_HOME set,
  --no-bundler + metro. android/ stays gitignored prebuild output.
- SEAN'S STYLE BATCH, from screenshots: folder chips down to 18/600 (21/700
  read too heavy in RN's rendering); the top bar wears prod's controls —
  the picker in a dark ringed 36px circle, the username in a thin outlined
  accent pill with a caret (header nav .who carried over). Verified by
  screenshot against his reference.
- FAVICON 'issue' diagnosed: the live .ico is pixel-verified centred
  (stroke-inclusive bbox math); Sean's tab held the hour-cached old one.
- Empty-states pass: fresh account matches prod's shape on every tab
  (folders with empty sections visible, Habits' starter pill) — clean.
- Watch investigation: apps/watch/ Swift sources + the WatchBridge local
  pod exist and compile into the phone app; the WATCH target itself needs
  an @expo/config-plugins addition (prebuild emits none) — next.
- 127 core + 21 server + 21 gesture tests.

## Iteration 26 shipped — the watch target GENERATES
- @bacons/apple-targets landed: the three watch Swift sources moved into
  apps/app/targets/watch/ beside their expo-target.config.js (type watch,
  bundle .watchkitapp, watchOS 10), and expo prebuild --clean now emits the
  CalMindWatch target into the Xcode project every run — the hand-add
  README instructions are retired. FULL BUILD GREEN: the phone app compiles
  with the watch app embedded (xcodebuild exit 0).
- The one trap, recorded: passing -sdk iphonesimulator to xcodebuild
  OVERRIDES every target's SDKROOT — the watch target then compiles against
  the iPhone SDK and fails WCSessionDelegate conformance (iOS requires the
  two inactive/deactivate methods watchOS doesn't have). Let the
  destination pick per-target SDKs; the plugin's SDKROOT=watchos is right.
- Scriptable matches the suite's generated script exactly now: SFSymbol
  square boxes (kind-palette #f0a860 when rolled), blue event dots,
  centre-aligned rows.
- 127 core + 21 server + 21 gesture tests; web untouched this pass.

## Iteration 27 shipped — aki's data, Sean's polish batch, the watch RUNS
- AKI'S PROD DATA on test: 59 records (26 reminders, 16 events, 2
  calendars, folders/sections, prefs) through the same one-shot guarded
  wrapper pair as sean's import — export wrapper on prod (auth.php, not
  store.php alone: store_read needs the lib booted), mint wrapper on test
  (account created if absent), both confirmed deleted; the temporary
  password went to Sean as a file, never through chat.
- SEAN'S POLISH: the tab icon is a round dark disc now (a circular alpha
  mask carved in a pure-python PNG pass — the rounded tile's corners had
  rasterised opaque white); the Calendar's spurious ◉ is gone (the month
  label taps home, week anchor included); pager arrows, picker ring and
  username pill share one 32px line; username 15, folder chips 17 and
  pill-height matched.
- THE WATCH APP RUNS: installed and launched on the paired Apple Watch
  Series 11 sim from the generated target's build — 'Nothing to do' empty
  state drawn. Remaining link: a phone with reminders pushing the list
  through WatchConnectivity to see rows (needs the phone dev-client +
  metro + a signed-in account with data at the same time).
- 127 core + 21 server + 21 gesture tests.

## Iteration 28 shipped — Sean's live batch
- AKI'S LOGIN FIXED: the mint wrapper wrote the hash under 'password' where
  handle_login reads 'hash' — repaired by a one-shot wrapper (same temp
  password), verified with a real login round-trip. Lesson recorded: the
  scp'd wrappers can never self-unlink (the web user doesn't own them);
  every one-shot ends with an ssh rm, always.
- THE WIDGET SETUP PAGE, prod's feed.php translated: install steps, the
  COMPLETE script with feed URL + token + the suite's cals= pin baked from
  whatever the calendar is showing at copy time, Copy script, home-screen
  steps, the token warning, Show raw feed URL. Tapping the widget opens
  CalMind (the PWA when saved from Share); reminder rows open ?tick=. The
  feed honours the pin server-side (validated ids narrow only; stale pins
  fall back to prefs; folders never pinned) — server test covers pinned /
  all / stale.
- CONFIRM PASSWORD on sign-up, reset and change-password — mismatch stops
  the submit with the suite-toned error.
- Sean's sizing pass 2: ring+pill 28, pie up to 24 inside, sections 16,
  the tab bar's icons pull to a 420px centre on web only.
- 127 core + 22 server + 22 gesture tests.

## Iteration 29 shipped — the fine-tooth CLAUDE.md pass, round two
- $SHOWAGAIN: whatever you just added has to be visible afterwards — the
  suite's rule lands as core showAgain() (single-view on another container
  widens back to All, a hidden destination un-hides; 3 tests) wired into
  BOTH create paths (the day-panel modal and the Add tab).
- theme-color meta follows the theme on web (the suite's theme_bg()), so
  Sage's browser chrome goes cream with the page.
- The Habits page grew the suite's section colour dot left of each pill,
  cycling the habits palette in place — always live here (this Habits has
  no page pencil; renames are long-press), a noted divergence.
- 130 core + 22 server + 23 gesture tests.

## Iteration 30 shipped — THE WATCH DRAWS THE LIST
- WatchConnectivity end-to-end PROVEN on simulators: the phone's store
  change pushed through the WatchBridge and the watch rendered the
  reminder row. Two root causes, both recorded in TESTING.md: the phone
  sim was running the pre-watch-target build (no embedded companion →
  updateApplicationContext throws, silently eaten by try?), and the sim
  pair had drifted to 'active, disconnected' — bouncing the watch sim
  reconnects it. Every layer of the stack now demonstrably works: web ⇄
  server ⇄ phone (native) → watch.
- TESTING.md lands in the repo: the suite's bargain ported — the map of
  what the three harnesses watch and what stays by-eye.
- 130 core + 22 server + 23 gesture tests.

## Iteration 33 shipped — Sean's rapid-steering batch A
- ALL IS THE MASTER again in both pickers: the row's new box shows ticked
  only when everything is visible; one tap shows the lot (lands on All), a
  second hides the lot — individual boxes untouched. (It had only been
  setting the view, never the hidden lists.)
- SEAN⇄AKI SHARING LIVE ON TEST: their prod shares- files exported one-shot,
  converted (calendar ids kept by the import; folder names → the importer's
  imf_ scheme) and pushed as share records — first pass lost LWW to records
  the two had made in the UI that day (updated=1 vs Date.now, a lesson),
  re-pushed with live timestamps. sean sees aki's folder+calendar+38 items;
  aki sees sean's three folders, two calendars, 35 items. The ⇗ marks now
  have something real to mark.
- Native default server → LIVE TEST (Sean's call, made by using it): the
  sim sits at the login pointed at his real data; he signs in himself.
- Style batch: pie 18 inside its ring (air), pill spacing balanced, collapse
  chevrons grown from comic-small to 16/20, Reminders date chips wear a
  surface2 highlight and right-justify, Notes' Delete is outlined and
  arming only recolours (never moves), Habits shows 7 columns on web / 5 on
  phones.
- 132 core + 22 server + 25 gesture tests.

## Iteration 33 continued — batches B and C of Sean's steering
- SEAN'S STORE DEDUPED: the starter Reminders/Calendar/notes-General
  folders folded into their imported twins (their stray items moved first),
  verified by census — no duplicate names remain.
- Shared rows rework: the @name: prefix and ⇗ retired for a purple PARTNER
  CHIP, and shared rows carry real visibility boxes (hiddenShared per app,
  respected by the All canvas; the master All box covers them).
- The day panel's 'Nothing on this day' counts the partner's items too —
  and the old check had been double-counting notes while FORGETTING events.
- COLOUR PICKING IS A TRAY now (the suite's swatch tray): tapping any
  manager swatch opens the app's palette as a dot row — folders, calendars,
  habit sections, and the shared recolours, all through one SwatchTray.
- Obtuse SVG chevrons replace the cramped text glyphs (sections, folder
  blocks, collapse-all); folder BLOCKS collapse in Reminders and Notes,
  persisted; the status dot explains itself on hover/long-press; the
  manager's 'rides on today' suffix is gone; Notes' Delete is outlined and
  arming only recolours; Habits shows 7 columns web / 5 phone; the watch
  target got the CalMind icon.
- 132 core + 22 server + 25 gesture tests.

## Iteration 34–35 shipped — back/tab, the calendar rework, OCR recipes
- BACK + REMEMBERED TAB: a tab-history stack behind NavCtx — the top bar's
  ‹ pops it, refresh restores the tab (persisted); the status dot moved
  into Settings as a labelled row; the picker pie sits icon-sized.
- THE CALENDAR REWORK (Sean's spec, verified by screenshot in both modes):
  the grid fills edge to edge with the neighbours' days LIGHTENED
  (monthGridFilled), picking one never changes the shown month; swipe-up
  folds to TWO weeks — the selected day's and the next (twoWeeksFrom, 14
  real dates) — paging a week there, a month in full view.
- OCR RECIPE IMPORT (v1): 📷 Recipe in the note editor picks photos
  (expo-image-picker), reads them (tesseract.js, web; native says
  not-yet politely), and formatRecipe in core (4 tests) lands title +
  **INGREDIENTS** bullets + numbered steps in the note. PROVEN end-to-end:
  a generated recipe card image OCRs into title/bullets/steps in the spec.
- iOS rebuilt clean → the full-bleed icon is on the phone sim.
- 136 core + 22 server + 26 gesture tests.

## Iteration 36 shipped — the day panel reads like the suite
- OVERDUE CHIPS in the day panel wear the suite's date ("Tue, Aug 4"), not
  raw ISO — a dueLabel() mirroring Reminders' chip, at both sites (own and
  shared rows). The landing the previous session left in the tree.
- THE PANEL'S GROUP ORDER is the suite's again. It builds one group per kind
  AND owner up front, kinds in the legend's order, mine before theirs; three
  drifts fixed: the own-Reminders heading sat above the PARTNER's events with
  its rows stranded below it; a partner's dated notes were never drawn at all
  (though the empty check counted them, so a day holding only their note went
  blank — no rows, no "Nothing on this day"); and the Reminders heading
  survived a day whose every reminder was ticked with Completed off.
- The order is now pinned by spec, not by eye: dp-group-head text reads
  Events · A's events · Reminders · A's notes.
- 145 core + 22 server + 30 gesture. Deployed to test, live == local.

## Iteration 37 shipped — Habits drags, and the drag stops dying on long lists
- HABITS REORDERS at last, the one app whose rows and sections couldn't.
  Core gained moveHabit + moveHabitSection (moveNote/moveSection minus the
  folder layer Habits hasn't got, so the last-section and duplicate-name
  refusals can't arise — 6 tests). The screen wires them behind the suite's
  own edit mode: the top bar's ✎ reveals grips and the row delete, Escape
  leaves, and out of edit mode the grip leaves the FLOW (display, not
  opacity) so the name box keeps hugging its label.
- THE SHARED HOOK HAD A REAL BUG, and it was never about Habits: the
  enclosing ScrollView asks for the responder as soon as a drag travels
  vertically, and PanResponder says yes by default — so the drag was
  granted, measured, then silently TERMINATED before it could drop. It
  only bites on a list long enough to scroll, which is exactly why the
  Reminders and Notes specs (short lists) passed while Sean's real store
  would have failed. Both hooks now refuse the request.
  Worth knowing: a green gesture suite did not mean the drag worked.
- 151 core + 22 server + 32 gesture. Deployed, live == local.

## Iteration 38 shipped — the ingredient parser learns ranges
- A RANGE is a pattern worth seeing: '2-3 cloves garlic' had parsed as the
  bare 2, leaving '-3 cloves garlic' in the NAME — so the unit was never
  found and the line came back worse than it went in. Ranges written with
  a dash or with 'to' now parse, each side normalised, the separator kept
  as the author wrote it ('2 to 3 tbsp water', not a dash). A whole number
  with a typographic fraction ('1 ½ tbsp') reads as one quantity too.
- Writing the "a sentence that merely contains 'to' is not a range" case
  turned up an older bug beside it: the pieces re-join with spaces, so
  '1 onion, chopped' came back '1 onion , chopped'. Space before
  punctuation is the junk the scrub gate exists to stop; the join closes
  it up now.
- The Recipe page was re-read against Sean's spec and matches it whole:
  ingredients land at the TOP through parseIngredient, instructions
  append numbered at the BOTTOM, 📷 fills the structured entries, the
  include-notes checkbox is honoured on the one save path. Dead
  formatRecipe import dropped.
- 154 core + 22 server + 32 gesture. Deployed, live == local.

## Iteration 39 — the iOS build, and what it could and couldn't prove
- iOS BUILDS AND RUNS on the iPhone 17 Pro sim, first try, signed in as
  sean against the live test API — his real store (Sean/AkiSean/Reminders/
  Calendar, aki's Personal + Meal Planning in the legend).
- CONFIRMED ON DEVICE by screenshot: the day panel's group order fix is
  right on native. Selecting Aug 15 draws "aki's events → Work event 7am"
  under its own heading, with no stray own-Reminders heading above it.
- NOT CONFIRMED: the drag. The simulator would not accept a synthetic tap
  anywhere in the bottom tab strip (mid-screen taps land fine — a day cell
  selects and the panel follows), so Habits/Notes/Reminders were out of
  reach by hand. Say so plainly rather than claim a green native check.
- What was done instead of a claim: all three draggable lists now hold the
  scroll still while a drag is live. Refusing the responder hand-over is
  what keeps the gesture; not scrolling under the finger is what keeps the
  drop line usable on a touch screen.
- MARK WELL corrected off the suite's CSS: .cell .dots is align-content
  FLEX-START, not centre — a quiet day's icons belong on the same line as
  every other first row.
- 154 core + 22 server + 32 gesture. Deployed, live == local.

## Iteration 40 shipped — Sean's live batch from the phone
- THE WHITE STATUS BAR, root-caused: the Expo export's head carried no
  viewport-fit=cover, so env(safe-area-inset-*) read 0 on iOS,
  react-native-safe-area-context reported no inset, the app never padded
  for the notch, and iOS painted its OWN status bar on top — light by
  default. Head now carries viewport-fit=cover, the translucent style and
  the standalone flags, patched after export by tools/patch-web-html.mjs
  (Expo gives a non-Router app no documented head hook; checked against
  the v57 docs). No colour is hardcoded — App.tsx's SafeAreaView already
  paints the inset with T.bg, so the strip follows the theme.
  NOT VERIFIED on an installed PWA: the sim refuses synthetic taps in the
  bottom strip (Safari's too, so it's the harness, not our tab bar), so
  Add to Home Screen was out of reach. Sean must DELETE and re-add the
  icon — iOS caches the head at install. Caveat for him: translucent
  forces white status-bar text, poor on the cream Sage theme.
- HABITS: five day columns on a phone, seven from 700px — a width
  breakpoint, not a Platform check, so a tablet gets the full week too.
  Paging now steps by the columns SHOWN; a fixed seven-day step at five
  wide dropped two days between pages.
- THE LEGEND BALANCES: core balanceLines — greedy for the line count,
  a DP minimising squared leftover space for the split, ties breaking
  toward filling the earlier line. BalancedRow measures real widths, so
  nothing is hardcoded. Sean's orphaned "Calendar" is gone: 2+3, same
  line count. Confirmed on the sim against his own store.
- 162 core + 22 server + 34 gesture. Deployed to test, live == local.
- One export path now: `npm run export:web` (export + head patch), used by
  both deploy-test.sh and the gesture harness, so the HTML the specs drive
  is the HTML that ships.

## Iteration 41 shipped — the legend names only what the window holds
- THE TRI-STATE WAS BEING READ PAST. monthLegend already built itself off
  the drawn cells, so the intent was right, but it called dayItems WITHOUT
  the folder modes while the grid drew its marks WITH them. A folder set to
  'none' put no mark on any cell and still earned a chip. The legend reads
  the days through the same tri-state the grid draws through now.
- Both edge cases settle the same way — a heading belongs to its chips: an
  owner whose chips all filter out loses its row and its name, and a month
  holding nothing shows no legend at all. That last case used to leave the
  legend's closing rule behind (two hairlines stacked); the rule goes with
  the legend now.
- The filter runs BEFORE the layout measures: BalancedRow keys its
  measurements by item count, so a legend that gains or loses a chip
  re-measures rather than laying the new set out against the old widths.
- VERIFIED ON DEVICE, paging Sean's own store: August's five-chip SEAN row
  and two-chip AKI row become September's one and one (that month holds
  three marks), and November — empty — shows no legend and one rule.
- 165 core + 22 server + 34 gesture. Deployed, live == local.
- Also: safe-area-context's web build DOES read env(safe-area-inset-*)
  (getInset in NativeSafeAreaProvider.web), so the translucent status bar
  can't slide content under the clock — checked, not assumed.
- Also: the habits-columns spec flaked once in a full run (it read the day
  heads before the window turned over) and is now hardened. A flaky spec is
  the same lie as a green suite that didn't test the drag.

## Iteration 42 shipped — one colour, one source
- SEAN'S CHAIN: manage-menu folder colour → legend chip → the date's mark.
  Core was already honest (cellMarks and monthLegend both read
  folder.payload.color); the RENDER broke it. Calendar.tsx swapped an
  OVERDUE reminder's cell icon for the theme's orange while the legend
  drew that same folder in its own colour, so a late day's square stopped
  matching its chip — and nothing in the manage menu had said so.
- The suite settles it: the folder colour is written INLINE on every
  reminder icon, overdue included, and the `overdue` class recolours
  nothing. Only a finished colour greys (and hides unless Completed is
  shown). Done stays grey here to match — flagged to Sean as the one
  deliberate exception, in case he wants that gone too.
- The spec walks the chain end to end and FAILS against the old code with
  exactly his symptom: mark #f0a860, chip #ea5853. Three cases: due today,
  the repaint (picking any colour the folder isn't already wearing, so it
  can't pass by accident), and the overdue case that was the real bug.
- 165 core + 22 server + 35 gesture. Deployed, live == local.

## Iteration 43 shipped — installable again, and a method that numbers nothing
- THE WEB APP MANIFEST the suite has always had and the export never wrote.
  CalMind could be bookmarked to a home screen but not properly INSTALLED.
  Written by the same head patch as the status-bar metas, so it rides the
  one export path the deploy and the harness share. Every URL inside is
  RELATIVE, so it resolves against wherever it is served — /test/calmind/
  today, /calmind/ on promote — instead of baking the instance prefix into
  a file that ships everywhere. Icons (192/512) come off the same
  assets/icon.png as the apple-touch-icon, beside it in the deploy.
  Apache has no type for .webmanifest and a manifest served as text/plain
  is one a browser can refuse to install from, so the htaccess names it.
  Verified live: 200 as application/manifest+json, both icons 200.
  This is the web tier, and also the honest half of desktop parity —
  Chrome and Edge can install the same page with no Tauri involved.
- A METHOD THAT NUMBERS NOTHING is still a method: cards that write the
  method as prose had every instruction filed as leftover text, so the
  Recipe page opened with an empty Instructions section. Under a
  directions heading a line is a step now, numbered or not, and steps are
  renumbered as they come (OCR skips and repeats numbers).
  The first cut let a NUMBERED line open the steps block and the existing
  checkbox spec caught it — one stray "1." turned the rest of a card into
  instructions, eating the free text the checkbox exists to shed. Only a
  heading opens the method. Both halves pinned.
- TESTING.md caught up with everything this run, and records WHY the PWA
  status bar stays in the by-eye column: iOS caches the head at install
  (delete and re-add, don't just relaunch) and the simulator accepts no
  synthetic tap anywhere in the bottom toolbar — Safari's included, so it
  is the harness and not our tab bar. That same limit is why the native
  drag is still unwitnessed.
- 168 core + 22 server + 35 gesture. Deployed, live == local.

## Iteration 44 — ANDROID RUNS, and the drag is finally WITNESSED
- The emulator needed unsticking first: the Pixel_10_Pro AVD booted with a
  broken graphics state ("Failed to find ColorBuffer" on repeat) and never
  opened its adb port at all. A plain pkill did not kill it either, which
  is what blocked the retry. Killed hard, restarted headless with
  -gpu swiftshader_indirect, and it was up in 25 seconds.
  (`expo run:android --device emulator-5554` is also wrong — that flag
  wants the AVD name, not the adb serial. With one device, omit it.)
- ANDROID RUNS against the live test API on Sean's own store, carrying
  everything this run: the balanced legend (2 chips + 3, no orphan), the
  day panel's group order, the folder-coloured marks.
- FIVE DAY COLUMNS confirmed on a real phone-width device: We 5 · Th 6 ·
  Fr 7 · Sa 8 (today, ringed) · Su 9, and the pager reads the RANGE
  'Aug 5 – Aug 9' rather than 'This week', which is the label rule for a
  window that isn't seven days.
- THE DRAG IS VERIFIED ON A NATIVE DEVICE — the one thing iOS could not
  show. adb takes synthetic input where the iOS sim would not, so: the ✎
  revealed the grips and the × deletes, dragging 'games' below 'music'
  landed it there, and dragging it back restored Sean's order exactly.
  Both directions, on his real data, put back as found. That closes the
  question the ScrollView-responder fix left open: refusing the
  termination request and freezing the scroll DOES hold on native, not
  just under Playwright's mouse.
- Also checked and NOT changed: the suite's day-panel checkbox is
  `accent-color: var(--accent)` — the theme's accent, not the folder's.
  So the colour chain deliberately stops at the grid and the legend;
  CalMind's panel already matches.

## Iteration 45 — desktop parity, and the export path's last three callers
- Centralising the export behind `npm run export:web` had left three
  callers still reaching for the bare `expo export`, which writes an
  index.html with no manifest and no status-bar metas. Two were docs
  (desktop/README's build recipe, TESTING's three-runs block); the third
  was REAL — the Windows workflow, so a Windows bundle built from the
  Actions tab would have shipped a different index.html from the one the
  site serves. Exactly the drift the single path existed to prevent.
  The workflow is corrected but NOT triggered: dispatch-only stands, and
  running it is Sean's call.
- macOS desktop rebuilt off the current export and smoke-tested: builds
  clean in 16s, launches, survives, quits. Tauri compiles the frontend
  INTO the binary, so the html can't be grepped out of the .app — the
  embedded ASSET INDEX is the tell, and it lists /index.html and
  /manifest.webmanifest, so the new export went in.
- The manifest means desktop parity has a second, cheaper half now:
  Chrome and Edge can install the same page as a desktop app with no
  Tauri in the picture at all.

## Iteration 46 — one-tap rename, and a guard against the green that lies
- HABITS RENAME ON ONE TAP once the pencil is on. The suite offers three
  ways into a habit's name — double-click, long-press, or a single tap
  while editing — and the third arrived with the edit mode itself and was
  never wired. The spec holds both halves, so the double-tap gate that
  protects a normal tap still stands with the pencil off.
- THE GESTURE SUITE NOW REFUSES A STALE EXPORT. The specs drive
  apps/app/dist, not the source, so an edit that never got exported is
  tested in its absence: PASS for code that isn't there, FAIL for a fix
  that is. Worse than red, because it looks like an answer.
  It cost real time today — a `cd` left the shell in apps/app, the
  `export:web && playwright` chain short-circuited on a script that
  doesn't exist there, and the next run quietly used the old bundle, which
  made a working change look broken and sent me hunting a testID that was
  fine. TESTING.md had already named a stale dist as the usual reason a
  spec disagrees with dev; nothing was standing in front of it.
  playwright's globalSetup (e2e/freshness.ts) now compares the newest
  source against dist/index.html and stops with the command to fix it.
  Checked both ways: green fresh, refuses after touching one file.
- 168 core + 22 server + 36 gesture. Deployed, live == local.

## Iterations 47–49 — Sean's live batch, then recipes moved up the queue
- THE WIDGET wears the suite's formatting again (header row, uppercase day
  headings with today green over its own rule, heavier rule between days,
  time right-aligned, "No more items today."). It had drifted because the
  script lived in TWO copies — the app's Settings page and
  tools/scriptable-widget.js — and the flat one shipped. Both carry the
  same body now, and the spec holds the copied script to those marks and
  to the ABSENCE of the two the regression shipped (amber headings, the
  inline time).
- THE SERVER'S CLOCK: no timezone was set at all, so PHP kept UTC and the
  feed's `date('Y-m-d')` answered in UTC — from 7pm Chicago the widget
  called TOMORROW today and rolled reminders a day early with it. Config
  key with an America/Chicago default, exactly as the suite pins it. This
  was never a widget bug: anything server-side asking the date was wrong
  five hours a day. It announced itself by turning the feed spec red the
  moment it landed — the harness was still UTC, Aug 9 against Aug 8.
- THE PARSER learned the words people type: yesterday/today/tomorrow,
  spans with or without "in" (days, weeks/wks, months/mos, years/yrs,
  a/an), and relative clocks ("in an hour", "in 30mins", carrying past
  midnight). Two decisions written into the vectors: a span is an OFFSET
  from now, not the start of a period; and a bare time already gone by
  lands on TOMORROW, which is the rule this parser already keeps for a
  bare m/d. Times now always imply a day. Day/week steps anchor at noon
  (DST moves the clock, never the date), month/year steps clamp.
  NOTE: the batch also asked for parsed text to STAY in the title, citing
  a "0.4.1 rule". No such rule exists in this repo, and spec/parse.json
  pins the opposite ("Vet 8/3 2pm" → "Vet"), as does the suite's own
  commit. Left as-is and flagged rather than reversed on a phantom.
- RECIPES, moved up on Sean's word and worked from phone screenshots:
  an ingredient with no number in front of it ("a pinch of salt") was
  landing in the LEFTOVERS instead of the list; lines mend by tapping
  instead of delete-and-retype; both lists reorder by the marker they
  already wear; and delete moved behind the swipe, as every other list in
  the app does it.
- 187 core + 23 server + 41 gesture. Deployed, live == local, pushed.

## Iteration 50 — verified, not assumed
- THE CLOCK, ON THE LIVE SERVER: ssh'd the test instance and asked the
  deployed lib what time it keeps — "America/Chicago | server day:
  2026-08-08 19:40". Before the fix that same instant answered 2026-08-09
  in UTC, which is precisely the evening the widget spent calling tomorrow
  today. Fixed, deployed, and now confirmed where it runs rather than
  where it is tested.
- ANDROID rebuilt on everything this run (parser, recipes, widget script,
  clock) and smoke-checked against Sean's real store: balanced legend
  (2+3, no orphan), the day panel's group order, folder-coloured marks.
- A CORRECTION worth keeping: "the note shows a recipe as a wall of plain
  text" was MY misreading, not a defect. That screenshot was taken
  mid-edit; a saved recipe renders its markers properly — bold Ingredients
  and Directions headings, bulleted ingredients, numbered steps, the
  personal line kept at the end. Checked before changing anything, which
  is the only reason nothing was "fixed" into a difference.

## Iteration 51 — the OCR fixture comes in from /tmp, and Notes gets its + back
- THE OCR SPEC was loading /tmp/recipe-card.svg.png — a file on ONE machine,
  tracked nowhere, gone after a reboot. The only test guarding the photo
  import would have failed a fresh checkout with "file not found", which
  reads like the feature is broken. The card is a tracked fixture now
  (e2e/fixtures/recipe-card.svg), rasterised by the browser that is already
  running when the spec starts.
- The card got harder in the move, and the engine's real read is ASSERTED
  rather than logged — so this run's parsing rules are proven against an
  actual OCR pass instead of against recipe text I typed: "a pinch of salt"
  comes out an INGREDIENT, "1/2 cup whole milk" normalises to "½", and
  "Serves four, generously" stays out of the list.
  Still NOT covered, and TESTING.md now says so: glossy pages, handwriting,
  a photo taken at an angle. That needs Sean's camera, not a card we drew.
- NOTES COULD NOT MAKE A SECTION. Reminders carries a + on its folder head;
  Notes never got one, and there is no other path — the manager makes
  FOLDERS and normalize seeds exactly one section per folder, so every notes
  folder was stuck with the "General" it was born with. Ported line for line
  from the Reminders one (same prepend, same duplicate-name refusal). Found
  by reading the suite's description of the two apps, not by anything going
  wrong: nothing was broken, a whole control was simply absent — the kind of
  gap staring at CalMind alone will never surface.
- 187 core + 23 server + 42 gesture. Deployed, live == local, pushed.

## Iteration 52 — both phones current
- iOS rebuilt on everything this run (parser, recipes, widget script, the
  Chicago clock, the Notes section adder) and smoke-checked against Sean's
  real store: balanced legend 2+3, the day panel's group order, the
  folder-coloured marks. Android was already current from 50; both phones
  now carry the same code.
- Audit continued on the two apps I had never read against the suite
  side by side. Everything else checked out — Notes rows do carry the
  duplicate button, both apps delete sections, all four pickers carry
  their Manage row, Settings changes a password against a server that
  supports it. The section ADDER was the one real hole, and it is closed.

## Iteration 53 — the clock proved through the LIVE feed, and a seam closed
- LIVE SMOKE against the deployed test instance, which is the only place
  the real Apache, htaccess, PHP and TLS are in the picture: signup → sync
  three records → mint a widget token → read the feed → logout, all 200,
  and the revoked token then 401s.
  THE POINT OF IT: the feed answered `today: 2026-08-08` while UTC had
  already turned over to 2026-08-09, with the reminder under that day and
  its time spoken as "3:30pm". That is Sean's widget complaint proved
  fixed where it actually runs — before the timezone pin, this same call
  would have called tomorrow today and the row would have read as
  yesterday's. Residue, as the loop has accepted before: one empty
  throwaway account (smoke1786237192), its token revoked.
- A SEAM I MADE: the title field learned "tomorrow" and "in 2 weeks" but
  the m/d box an inch away still refused them. parseDateField in core is
  the single answer for a date FIELD — explicit first, then the words —
  and all three callers ask it now.
- 190 core + 23 server + 43 gesture. Deployed, live == local, pushed.

## NEXT: the Add-Recipe page (Sean's spec, precise)
- A structured page in Notes, the akisbookshelf add-quote shape: Title;
  an INGREDIENTS section whose + parses units (grams, cups, tsp, tbsp…)
  and formats them nicely, new ingredients landing at the TOP; an
  INSTRUCTIONS section whose + appends the next NUMBERED step at the
  BOTTOM; and the 📷 image button lives ON THIS PAGE — OCR fills the
  structured entries themselves, not raw text. Saving writes the marker-
  formatted note. Core work: parseIngredient + a structured
  recipeFromPages (formatRecipe becomes a wrapper).

## Still queued from Sean
- A back control returning to the previous screen (top-right; needs a small
  tab-history context) + refresh restoring the active tab.
- The calendar rework: two-week fold, week paging there / month paging in
  full view, neighbours' days filling the grid LIGHTENED, cross-month
  selection never switching months (core monthGridFilled/twoWeeksFrom are
  in with tests; screen wiring remains).
- Native icon refresh: rebuild iOS/Android sims so the fixed full-bleed
  icons (and the watch icon) land on home screens.

## Iteration 32 shipped — the third sweep + Sean's live batch
- CELL RULE completed: a fully-done colour's tick icon now LEAVES the month
  cell unless Completed is shown (it drew grey regardless) — spec drives
  add → tick → gone → ☑ → back.
- DAY-PANEL TWO-STEP: the suite's rule lands — ✎ ⧉ × appear only after a
  double-click or long-press on a row, Escape or empty space leaves; the
  tick and swipe-delete stay free-standing. (One replacement had silently
  missed the events block — the spec caught the always-visible pencil.)
- SHARE MARKS (Sean's ask): the pickers' 'Shared with me' rows wear a ⇗ in
  the suite's shared-badge purple, so someone else's container reads at a
  glance.
- server/tools/usagelog.sh: the suite's log reader ported (tail/-f/--real
  over SSH against the test instance's usage.log) — proven live, and it
  showed Sean actively syncing while it ran.
- 130 core + 22 server + 25 gesture tests.

## Iteration 31 shipped — the promote-readiness pass
- LIVE SMOKE against the deployed test instance (real NFSN PHP, htaccess,
  TLS — what the local harness can't see): signup, sync round-trip, widget
  token + feed, shared_pull isolation, tombstone, logout-revokes — 8/8.
  Residue: one empty throwaway account.
- README caught up with reality (parity, sharing scope note, e2e/ in the
  map); all three suites re-run green: 130 core + 22 server + 23 gesture.
- The loop's core parity stands complete. Remaining: Sean's dev-server
  default call, and his steering batches as they come.

## Iteration 13 shipped (this session)
- iOS DEMO DELIVERED: pod install needed only LANG=en_US.UTF-8 (cocoapods
  chokes on ASCII-8BIT paths in a non-UTF-8 shell — remember this); build
  installed to the iPhone 17 Pro sim, launched via simctl when expo's final
  deep-link open failed, live against the test API as sean. Icons verified:
  the one-stroke CM is the app icon + Android adaptive foreground.
- Recipe page: the Include-notes checkbox (Sean's spec) — shown only when
  parsed free text exists, default ON, OFF sheds it on save; spec proves the
  shed. NOTE: the checkbox lives in RecipeEditor.tsx which is still the
  other session's UNTRACKED file — deployed via dist, commit rides with
  their RecipeEditor landing.
- Picker ring: 32px with marginHorizontal 4 (Sean: more space around the
  circle). 28 gesture specs green.

## Iteration 15 shipped
- The ALL rainbow matches Sean's reference exactly now: pink → violet →
  yellow → green pastel (violet was missing), stops compressed inside the
  disc so the circle can't clip them, disc ≈ 56% of the ringed 32px button.
  Proofed at 240px before shipping; verified live on test.
- Fresh full-suite audit: 145 core + 22 server + 28 gesture green; the one
  red is the other session's in-flight ocr.spec (filechooser rework).
  Audit confirmed week mode, per-kind+owner day-panel folds and rendered
  rich-text lines are all present — the old queue items are done.

## Iteration 16 shipped
- THE RAINBOW IS THE SUITE'S OWN: prod's All dot is a CONIC gradient
  (folders.php .fdot.all — #60a5fa → accent → #facc15 → #f472b6 → back),
  an angular sweep no linear gradient imitates. Rendered as 48 interpolated
  SVG slices (no conic primitive in react-native-svg), 16px dot in the 32px
  surface ring — prod's exact proportions. Proofed at 240px, verified live.
  LESSON: when Sean says "look at the other codebase", grep prod's CSS
  FIRST — two guessing rounds cost what one grep would have.
- Tri-state manager earns its gesture spec (rider silenced via None, whole
  chain UI→prefs→core). Residue audit: shared day-panel headings already
  dim (groupTitleShared); day cells are tap-only by Pressable construction.
- 29 gesture specs green.

## Iteration 17 shipped — CalMind Desktop (macOS)
- desktop/: a Tauri 2 shell around the IDENTICAL web export — Rust opens
  the window, nothing else. tauri: origin → live test API (config.ts), so
  same data and logins as web; the local-first snapshot makes it open
  offline. One-stroke CM icons via `tauri icon`. Built and RUNNING on
  Sean's Mac first try (rustup minimal was the only install).
- Windows: tauri-action CI job when wanted (desktop/README.md).
- Sean approved the conic rainbow ("there finally the folder icon is
  correct") — picker iconography is settled.

## Iteration 20 shipped — the tree is CLEAN
- The RecipeEditor extraction landed whole (the other session went quiet
  ~30min; its Notes.tsx + untracked RecipeEditor.tsx were coherent, so this
  session finished the landing): Recipe button → structured page, photos
  from its own 📷, include-notes checkbox, scrubbed OCR intake.
- The ocr spec walks the REAL flow now and passes — 30/30 gesture specs,
  first fully green full-suite run since the refactor began. Deployed.
- Working tree carries no held work for the first time in the loop.

## Next, in pain order — RETIRED (all seven shipped; audited iteration 36)
Kept for the trail. Every line of the old list is in and verified in the
tree: the Habits month view with its pies and key, the section manager,
rename-in-place and collapse-all (Habits.tsx, HabitSectionManager.tsx);
drag-reorder on a PanResponder that works web and native, wired into both
Reminders and Notes (rowdrag.ts, sectiondrag.ts); week mode with the
two-week fold and sideways paging (Calendar.tsx gridPan); rendered rich
text (core richtext.ts, 5 tests, pinned by the shared-notes spec); the
whole sharing arc; all four themes (midnight/sage/forest/olive); and the
widget/feed, quick-add and watch target.
**TODO.md at the repo root is the live list now** — this file stays the
ledger of what shipped.

Genuinely left over from that list's ambitions:
- ~~Habits rows and sections do not drag~~ — STALE and now fully answered
  (2026-08-09). Rows drag and always did; sections drag too, proven by
  e2e/habitsections.spec.ts across a reload. The four attempts that failed
  before it were dropping into the "before this section" zone, which for the
  section directly above the target is a no-op — not a broken gesture.

## Suite notes still to honour (from CLAUDE.md read-through)
- Cells: fixed two-row well, 3/row phone; >6 icons → five + '+'.
- Reminder cell icon: worst state of ITS colour that day; grey only when all
  its colour's are done (and hidden unless Completed shown).
- Legend: kinds events→reminders→notes; hidden when empty; caps height.
- ~~Day-panel fold keys per kind(+owner later)~~ — done in 36, order pinned
  by spec. Partner DIMMING when sharing is still owed.
- A day is selected by tap only (pointerup near pointerdown) once swipes land.
- Icon buttons: circles, flex-centred, one size per row — re-check by eye
  before every deploy.

## Session of 2026-08-08/09 — passkeys, recipe scaling, and six real bugs

Shipped and deployed to TEST (never prod). Suites at the end: 251 core,
32 server, 80 gesture, 9 live checks, 5 desktop.

**Web (Sean's first priority)**
- Passkeys, whole. WebAuthn by hand in PHP (no composer on that host):
  registration, usernameless login, list, remove; ES256 and RS256. RP id and
  origin derived from the request, so no config edit can get them wrong.
  "Use a passkey" on the sign-in card, add/remove in Settings, both hidden
  unless the device can actually make one. Passwords still work, and a spec
  says so. Verified against the DEPLOYED test server as well as locally,
  because RP id, a portless origin and a real secure context only exist there.
- A remote edit can no longer eat the sentence you are typing. The body and
  title were bound straight to the record while the 30s poll replaced it.
- An over-long note says so instead of living on one device while the app
  claims to be synced. The server names what it refused; the engine keeps it
  pending so it heals when the note is shortened.
- theme-color and the page background are written on every load, not only on
  a theme change.

**Recipes (second)**
- Scaling: ½x / 1x / 2x, reading rather than editing — nothing is written,
  and the load-bearing assertion is that the note still says 2 cups after.
  Ingredients only; '20-25 minutes' is a time, not a yield. Present in the
  shared-note view too.
- Numbered steps read as steps: the number in a gutter, air between them.
- Four scaler bugs, all found by opening SEAN'S OWN recipes on the simulator
  and none present in the cards invented for tests: dual-unit lines that
  contradicted themselves after doubling, a range written with a slash, a
  compound noun that pluralised its first word ('6 eggs yolks'), and a bay
  leaf that never became leaves. All eleven recipes now read at both scales.

**iOS**
- Built Release five times and driven by hand. That is where two native-only
  bugs were found: a draft from the previous note appearing as this note's
  body (one keystroke from overwriting it), and the same leak in the shared
  view, which commits on BLUR and so needed no keystroke at all.
- State that belongs to the open note now lets go by itself (useNoteScoped),
  so the class is closed rather than patched: an armed delete no longer
  follows you to the next note either.

**Android** — cannot be verified on this machine at all: no adb, no emulator.
Not a code problem, and better said than left looking checked.

**macOS** — rebuilt on this export and smoke-tested (./desktop/smoke.sh). The
check that matters matches the content-hashed bundle filename against
apps/app/dist, since Tauri compresses the frontend into the binary and "it
built" is otherwise indistinguishable from "it has tonight's work in it".

**Windows** — untouched, dispatch-only by Sean's instruction.

**Calendar integrations** — groundwork only, deliberately: iCalendar parsing
and RRULE expansion in core, both fully tested, neither committing to any
decision about OAuth or CalDAV. Four questions are with Sean.

**On the tests themselves.** Four checks turned out to be green for the wrong
reason and were caught by asking what would make them fail: a shell grep for
the empty string, a browser test that could not see openssl_verify
short-circuited, a PHP spec reading an encrypted store as JSON, and a spec
whose fix it could not detect. `e2e/testids.spec.ts` now fails if any spec
reaches for a testID no component renders — an absence assertion on a typo
passes forever otherwise.

**The one real hole**: no harness drives the native app, so both native-only
bugs were found and re-verified by hand.

## The wrist, and the silences — 2026-08-09 night

**watchOS** — four pages (Summary, Reminders, Events, Calendar), horizontal
paging with the dot indicator, check-off back to the phone through the same
`reminderToggle` a phone tap uses, and a Modular complication showing the
next two CALENDAR events. Reminders group folder → section, matching the
phone; on a ~25-character screen a folder header appears only when there is
more than one folder and a section header only when its folder has more than
one section, every name one line, nothing wrapping. Times are 12-hour
everywhere on the wrist — "Today 3pm Chase", "8/15 5pm Chase" — with an
all-day event showing no time rather than a midnight.

**watchOS, VERIFIED ON SCREEN** (2026-08-10). All four pages rendered on a
watchOS simulator with a seeded grouped feed, because Sean's watch was
off-network all night and none of this had ever been looked at:

- Summary: 'Due today' with its items and NO tally — his first complaint
  about this screen — and a checked-off row disappears from here too.
- Reminders: folder header `Home` (two folders exist), sections `Now` and
  `Later` beneath it (Home has two), and `Work` with NO section header
  because it has only one. Check-off removes the row and closes an emptied
  section.
- Events: `3:30pm`, `2pm` under day headings.
- Month: every day present, the 1st alone on Saturday, today in green.

THREE bugs came out of finally looking, none of them findable by test or by
reading — nothing here runs SwiftUI, and in each case both halves of the code
were correct in isolation:

- a pre-`groups` cache drew a BLANK reminders page (Sean's watch holds exactly
  that cache; it would have hit him on first launch),
- the month grid dropped its first eleven cells, forever, because LazyVGrid
  would not lay them out — the arithmetic was always right,
- check-off did NOTHING after the grouping moved to core: tick() cleared
  `items` while the page drew `groups`, so a tap left the row in place and
  the natural second tap queued a second toggle, rolling a repeat twice.

The lesson, bluntly: three hours went into polling an unreachable watch when
a simulator would have drawn it in one build. Look at the thing.

**iPhone home-screen widget** — written, tested by inspection only, NOT
shipped. It draws like `tools/scriptable-widget.js`, takes a folder
selection through `AppIntentConfiguration`, and checks items off via
AppIntents into the shared App Group. It cannot sign until
`com.seancheren.calmind.appwidget` is registered as an App ID, which needs
an interactive Xcode pass; because an extension embeds in its host, an
unsignable widget blocks EVERY iOS build, and `ios/` is currently rolled
back to before `expo prebuild` so the phone and watch can still ship.

**Recipe import from a URL** — server fetches through `fetchurl.php` (SSRF
checks on every redirect hop; its first caller after months unused), core
parses the page's own schema.org JSON-LD, ingredients and steps only.

**What this night was actually about: silent failures.** Five, each of which
rendered as something normal.

- `updateApplicationContext` behind `try?` swallowed WCSession error 7006
  ("Watch app is not installed") for a day. The watch app had been sideloaded
  wrist-first, so iOS never treated it as the companion.
- The watch's Summary said "Nothing due today" both when the list was present
  and empty AND when nothing had ever arrived — the same words for a working
  screen and a broken one. It now publishes `.waiting` / `.loaded` /
  `.failed(reason)`, and every empty state reads it.
- Both widgets decoded behind `try?`, drawing "Nothing due" on a failed read.
- `apiPost('recipe_fetch', { url })` TYPECHECKED — its signature is
  `(serverUrl, body, token)` — so the URL import posted to a relative path
  with no action and quietly did nothing. Only an e2e test could see it.
- A deploy shipped a bundle its gate never tested, because a native build
  deleted `dist` between the two. The gate now refuses that.

The through-line: nothing here failed loudly. Each looked like an ordinary
empty state, and each made the next diagnosis harder. When something is
"not working" and every log is clean, look for the place that cannot report
its own failure.

## The reachable seams — 2026-08-10

Suites at the end: 351 core, 38 server, 117 gesture (+1 skipped), 16 WebKit,
plus the native checks no browser can reach. Everything below is on TEST;
prod was touched once, and only the `.well-known` pair.

**This section supersedes the "NOT shipped" note above it.** The iPhone
home-screen widget signs, installs and draws on Sean's phone — his words on
seeing it were that it "looks nice". What is still true is narrower and worth
keeping separate: nobody working on it has SEEN it render, and cannot from
here.

**The theme, again: behaviour nothing can reach.** Every seam bug this day
produced had the same shape — two sides, each correct about its own idea, and
nothing running them against each other.

- **The wrist drew one flat page for a week.** `watchFeed` filtered folders
  with `payload.app === 'reminders'`, but a milestone-1 folder carries no
  `app` at all and IS a reminders folder — `types.ts` says so, `folderApp()`
  exists for exactly this, and manage/normalize/FolderPick all go through it.
  Sean's oldest folders are that shape, so the watch got an empty folder list
  and `watchGroups` returned one anonymous group. Silent, because an empty
  folder list is also what a folder-less account sends: the wrist could not
  tell "you have no folders" from "your folders were dropped on the way here",
  and neither could I — I read `folders=0` off the console and concluded the
  phone had not pushed.
- **The phone widget had no data source at all.** `HomeWidget.swift` read
  `watchlist.json` out of the App Group; the only writer was `WatchStore` —
  on the WATCH, filling the watch's own container on a different device. An
  App Group is shared between an app and its extensions on ONE device; it is
  not a wire between phone and wrist. Every individual piece was right
  (entitlements, group name, key), and what was missing was a writer. The
  target's own config comment said "written by WatchBridge on every store
  change"; it was not, and a comment describing something nobody implemented
  reads exactly like something that works. `push()` writes the cache and
  reloads timelines BEFORE any WCSession guard — a phone with no watch at all
  should still fill its widget.
- **The widget ignored the calendar's rules.** `widgetDays` walked every open
  reminder and dropped it on its due date; the calendar obeys the per-folder
  tri-state and gathers what is late onto today. So a folder Sean had switched
  off still filled his home screen. It calls `dayItems()` now — not a second
  implementation that resembles the first.

**Four checks came out of that, and they are the durable part.**
`check-watch-format.sh` runs BOTH real Swift clock copies (the app's and the
complication's deliberate twin) against the cases core pins — nothing
re-typed, so a copy that changes is a copy that gets run. `check-watch-feed.sh`
and `check-widget-feed.sh` push core's REAL feed through the real Codable
structs and then through the wrist's `drawnGroups` and the widget's
`drawnDays`. Both of those were computed properties over live state, reachable
only inside a rendered view on a device; they are static and pure now for one
reason — so something can call them. `check-appgroup.sh` states the general
rule the widget bug broke: every App Group key that is READ has a writer on
the same device, phone and watch counted as the separate devices they are.
Each proven by restoring the original bug and watching it go red.

**Edit mode had no way out on a phone.** The suite's tap-outside rule was
web-only, so on Reminders, Notes and the Calendar's day panel there was no
exit at all once you were in — the Calendar's had never had one. All three now
carry a visible Done, plus a native wrapper (EditExit) for the tap-outside.
Entering edit mode also used to shove the page around; it moves nothing now —
the edit cluster floats, the heads carry a minHeight, the toolbar has a fixed
height. The Done button I added was itself the last 6pt of shift.

**Glyphs, measured rather than eyeballed.** One chevron across folders,
sections and collapse-all, at 60% with its stroke scaled to match (a fixed
stroke would have left a stubbier glyph, not the same one smaller); collapse-
all is a DOUBLE caret so it stops reading as Back; Habits' was a text '⌃' in a
circle and is drawn now. Every icon sat LOW in its button — the line box
reserves descender space `+` and `‹` never use, measured at 2.56pt on the tab
bar and back to 0.00 after. `tools/sweep-tap-targets.mjs` measures every
clickable box on four screens and found two things reading the source did not:
collapse-all shrunk to a 24pt TARGET when its icon was made smaller, and
Reminders' collapse-all still static long after Notes' was made dynamic — a
miss on something Sean asked for directly. All three pickers' checkboxes were
18pt on the web against 32 on a device, the `hitSlop` trap exactly as
CLAUDE.md describes it.

**The deploy scripts had two gates that were decoration.** The PHP lint piped
every file through one grep and ended in `|| true` — grep SUCCEEDS when it
finds a line, so the status was inverted and then discarded, and a file with a
syntax error shipped. The post-gate bundle check never captured a BEFORE, so
it passed whether or not something had rebuilt `dist` underneath it. Both fail
now, both watched failing. `deploy-prod.sh` is new and narrow: the
`.well-known` pair, `--yes` required, `--verify` read-only. The `.htaccess`
that gives the association file its `application/json` had been living ONLY on
the server — lose it and passkeys break everywhere with no error.
`check-deploy-guards.sh` proves all eight guards by breaking copies. Its first
version did not neuter `ssh`/`rsync`, so the case that proves the consent gate
— by removing the consent gate — went on to write production. Byte-identical,
nothing served changed, and the tool and CLAUDE.md both say it now.

**The silent-failure sweep, continued from last night.** Nine `.catch(() => {})`
sites triaged: eight are fold-state writes that lose nothing but which sections
were collapsed, and each now SAYS so rather than making the next reader
re-derive it. The ninth was hiding a real case — `sharedPut` failing AND its
reconcile failing left a partner's row showing a change that existed on no
other device; that sets `syncState: 'offline'` now, the word the top bar
already uses. Beside it: damaged storage bricked the app on launch
*permanently* (the parses were guarded, the reads were not), a correct password
could bounce you back to the login screen, and a failed session removal took
the sign-out with it.

**Recipes and OCR.** One bad photo used to throw away every page already
read — on BOTH readers, and the web one is the one in daily use; each page is
caught separately now and the count of failures is reported. A failed URL
import said nothing at all through an empty `??`. HTML-blob instructions were
being welded into a single step. A real recipe page is pinned as a fixture now
rather than one this repo imagines. The partial-failure path itself is still
verified by reading the code, and TESTING.md says so out loud.

**The WebKit flake, measured instead of theorised.** `app.spec.ts:353`: two
failures in about fifteen runs, both after heavy real work; 7 of 7 idle passes;
5 of 5 passes under deliberate CPU starvation, which killed the tidy "it is
just load" story. The cause stays open, written down as open. The note editor
does contain a 50ms deferred focus that is a race by construction — two of
them, sharing one field — whoever wins it today.

**iOS builds have a build number now**, which is what made the next thing
answerable at all: across four installs iOS never propagated the watch app
from the phone — the wrist sat on build 1 while the phone carried 6. A direct
`devicectl` install fixed it, and only worked while the watch was awake and
holding a tunnel. Before today every build was `0.1.0/1` and the question had
no evidence either way.

### Still open

- **Nobody has SEEN the widget render** beyond Sean's word. Entitlements, the
  cache writer, core's shape, the decoder and `drawnDays` are all covered; the
  pixels are not, and cannot be from here.
- **Why the companion path does not update the watch app.** Until that is
  known, the wrist needs the direct install.
- **E2EE and store builds** — neither started; see README's milestones.

## Iteration — the top bar's one scale, and the complication says "now"

**The top bar was three heights and Sean saw it.** back 28, collapse-all 26,
the picker ring 32, the username pill 28 — four controls, three sizes, in the
row that sits above every screen. The suite settles it in a single rule over
three selectors, `.backbtn, .titlebtn, .usermenu .who { height: 32px }` with
`width: 32px` on the round two, so 32 is not a taste call. The ring's own
comment already claimed "ring and pill both 32 high, the suite's bar height"
while the pill next to it was 28: the comment was right and the code had
drifted out from under it, which is the trap CLAUDE.md already names.

There is one `TOPBAR_CTRL` now and every control reads it. The collapse-all
became a component (`CollapseAllBtn`) because four screens each carried a
byte-identical `collapseAllBtn` style and a byte-identical Pressable around
it — the same four-copy shape that `repeatClean` and the repeat-unit list
were just cured of. `chevrons.spec.ts` policed the old duplication, so it was
rewritten to police the new invariant instead: nobody but `ui.tsx` draws the
double chevron, no screen owns a collapse-all box, and the shared circle is
sized by the constant rather than a literal. All three were broken on purpose
and went red.

**"the back button is wrong right now"** was the same drift, not a centring
bug. Measured rather than argued: on the web the glyph's ink sat 0.31px off
centre, and on the phone — real screenshot pixels, `xcrun simctl io`, divided
by the scale — the circle is 32.00 x 32.00pt and the ink is centred to
+0.167pt in both axes. What read as "wrong" was a 28pt circle sitting between
a 26 and a 32. The whole row now measures 32.00pt tall at centre-y 93.83pt on
the device, all four controls, username pill included.

Along the way the username pill turned out to be a bare `Pressable`:
react-native-web only emits `role="button"` when asked, so the one way into
Settings announced itself to a screen reader as nothing at all. It has a role
and a label now.

**The complication.** Sean: if the event is today, tint the time and drop the
date; with no time, say "now" in that tint. The date was already dropped for
today; "Today" became "now", and today's when is drawn in `Color.green` —
which is not a new invention but the green the watch app's own day list and
month grid already use for today, so the face and the app agree. The words
are gated by `check-watch-format.sh`, which runs BOTH real Swift copies (the
widget extension cannot see the app's sources, so there are two) against
pinned cases; a new case stops "now" leaking onto later all-day events, and
both directions were proven red before being trusted.

Verified: web deployed to test and the served bundle hash compared to the
local one, index.html to index.html. iPhone 17 Pro simulator for the top bar
measurements. watchOS simulator for the watch app, complication extension
embedded in the right target. The complication's green is NOT yet seen —
unsigned simulator builds have no App Group, so it reads an empty feed there.

### Still open

- The complication's tint on a real wrist; the words are gated, the colour is
  read from the source.
- Everything in TODO.md §1, which is unchanged: the oversized record, the
  tie that never resolves, the rotating widget key, the offline PWA.

## Iteration — the widget fits, the wrist counts in items, and a lag named

**The widget overfilled its card, twice.** Three things went unpaid for, and
the "rows" unit hid all of them: the header (26pt) was never charged, so every
card began over budget and sliced its own "Calendar" title; the 2pt divider
between days with 5pt of air each side was free, which is 72pt on a seven-day
card; and a heading was charged 1.4 rows (28pt) for a block that draws 20.
The budget itself was a per-family guess. The card measures ITSELF now —
GeometryReader hands the view its real content height, the header comes off
the top, and costs are points summed from the literals the file draws with,
with line heights measured rather than estimated. Then Sean asked for one
more event and got it honestly: the last row's bottom margin is trailing
whitespace with nothing under it, so it no longer has to fit.

**The watch's first page counted days, not items.** Two nested caps — the
first four days, six lines inside each — multiply into a rule nobody chose:
an item on the fifth day was unreachable however empty the four ahead of it
were. Sean asked for ten items total from the same sources as the widget, and
that is one cap with no blind spot; a quiet day now costs one row rather than
a whole slot, and the last day drawn may be partial.

**A real bug found by being wrong in public.** The four-day window was my
explanation for Sean's shared events showing on the widget and not on the
wrist. It was not the cause: the events reached the watch fine (they were on
the Events tab all along) and the first tab was filtering them out. The widget
filters with its live configuration while every other surface reads a snapshot
it writes to the App Group, so the wrist runs one push behind. It corrected
itself the moment the app pushed again, which is precisely what will make it
get reported as intermittent. Written down in TODO rather than fixed on the
spot: it is a sync-timing change.

**And a diagnostic that outlived its bug** — the viewport readout in Settings,
added for the installed-PWA bottom gap. Sean saw it and called it spurious;
the reading it was showing him said `standalone no` and `safe area bottom 0`,
so it was not even capturing the case it existed for.

Verified: web deployed to test and the served bundle hash compared to the
local one. iPhone and Watch both installed and confirmed by build number —
which is the only proof the wrist actually moved, and it needs bumping by
hand because ios/ is gitignored and app.json had drifted three behind.
Not verified here: the widget's pixels and the complication's tint, both of
which need a real device — an unsigned simulator build has no App Group and
reads an empty feed. Sean confirmed both by eye.

### Still open

- The widget-selection lag above.
- Everything in TODO.md §1, unchanged.

## Iteration — the macOS app had never rendered

Sean asked to get the macOS version working. It built, it launched, it passed
all six of its smoke checks — and it had never once drawn the app. The window
said:

```
CalMind could not start.
SyntaxError: Unexpected token '<'
tauri://localhost/test/calmind/_expo/static/js/web/index-….js:1
```

The website is exported with a base path (`experiments.baseUrl` =
`/test/calmind`), so every asset URL in index.html is absolute. The shell
embedded that export and served it at the root of `tauri://localhost`, where
no such prefix exists: the bundle 404'd, Tauri's asset protocol answered with
index.html, and the JS parser met a `<`.

**The smoke test was the real defect.** Six green checks — it builds, the
bundle is there, it carries THIS export, it launches, it survives six seconds,
it quits — and every one of them is equally true of a window showing an error
message. This is the trap CLAUDE.md already names, found again at full size:
the checks were about the .app as a FILE, and none about the app as a program.
Nothing looked at the window until today, which is why the bug could sit there
while the file-level checks stayed honest and green.

The fix stages the export under the path it was built for and points the
window at it, so the desktop runs the identical bytes the site serves — the
base path is baked into the JS too (async chunk loading), so rewriting the
HTML would have broken on the first lazy import and rewriting the bundle would
have meant shipping code the web suite never ran.

`desktop/check-assets.sh` is the check that cannot pass on a blank app: it
reads the window's start URL out of tauri.conf.json, finds that page in the
staged tree that actually gets embedded, and requires every absolute asset it
references to resolve to a real file. It needs no GUI, so it runs as
`npm run test:desktop`. Broken three ways before being trusted — the original
root-serving bug reproduced exactly, the base path moved in app.json without
restaging, and an asset deleted from the bundle.

Verified by opening the window and reading it: Reminders drawn, folders and
sections intact, signed in and synced against the test API.

### Still open

- **The .app is ad-hoc linker-signed and Gatekeeper rejects it**
  (`code has no resources but signature indicates they must be present`). It
  runs locally and survives being copied, so this is not urgent, but it is not
  distributable and it is not what "signed" normally means.
- Everything in TODO.md §1, unchanged.

## Iteration — two devices no longer disagree forever

Sean asked what could be done about the two oldest §1 entries. Reading them
against the source changed both.

**The oversized record was already fixed.** TODO said "the protocol is
unchanged"; it is not. The server refuses payloads over 64KB and returns
`rejected: [ids]`, the engine keeps those ids dirty and never clears them, the
store raises `syncState: 'refused'`, Settings shows it, and `toolong.spec.ts`
asserts the app never claims to be synced in that state. What is actually left
is smaller and different: the warning is buried, because the top bar's status
dot is GONE — `chrome.tsx` destructures `syncState` and never renders it, while
the file's own header comment still describes the dot. The app tells the truth
in a place you have to go looking for.

**The tie is now resolved, by Sean's call: the server arbitrates.** Both sides
took a remote record only when strictly newer, so equal stamps left every party
holding its own copy — permanently, and silently, because neither was dirty so
neither ever pushed again. The server now accepts an equal-stamped write whose
content differs and bumps its sequence; the client takes the server's copy on
such a tie. The winner is whichever edit reached the server last, which is what
last-write-wins claimed to mean all along.

Three things had to be right for that not to make things worse. Identical
content is still ignored on both sides, or every echo would bump the sequence
and re-broadcast itself for ever. Payload keys are canonicalised before
comparison, so a client that serialises the same object in a different order is
not a conflict — checked on both sides rather than assumed. And a client does
not adopt the server's copy while its own is still dirty: an unsent edit has
never been offered to anyone, and overwriting it would be silent AND pointless,
since the id stays dirty and the next push would just hand back the copy it had
adopted. Six guards, each broken deliberately and watched go red.

One test changed along the way: `a tombstone syncs like any edit` asserted
`changes[0]`, a POSITION, so it depended on that record happening to hold the
lowest sequence in the whole file. Adding any test above it moved the tail and
failed it for a reason that had nothing to do with tombstones. It looks the
record up by id now.

### Still open, and now the larger half of the same problem

- **`put()` clamps to `max(now, prev + 1)`**, so a device that edits rapidly or
  carries a fast clock pushes `updated` ahead of wall clock — and the skew is
  sticky, because every later edit anywhere takes the max against it. A stale
  edit from the skewed device then beats a genuinely newer edit from a correct
  one. The tiebreak does not touch this; it is the same root cause, a local
  clock used as a version number.
- Sean's question, unanswered here: larger notes with images. The current shape
  cannot carry them — the client persists the WHOLE snapshot as one JSON string
  in AsyncStorage (localStorage on web, ~5MB per origin), and the server
  decrypts, mutates and rewrites the WHOLE store file on every sync. Both are
  O(total store) per operation, so images inline would be paid for on every
  keystroke's save and every round trip, on every device.

## Iteration — habits get a frequency, ticks get a grace, deletes get an undo

Four asks in a row, all shipped to web and then to every platform for 0.2.0.

**Habits have a Frequency**, set on a small Name + Frequency screen that both
adding and editing open. The subtlety is that frequency answers two DIFFERENT
questions — "is this listed today?" and "does this count today?" — and only
Never tells them apart: Sean asked for it to stop counting, not to disappear,
so it stays tickable and contributes nothing to the month's circles, numerator
and denominator alike. Weekdays answers both the same way, because "taken out
of the list on weekend days entirely" is what he said, so its weekend cell is
not there rather than an unfilled circle that reads as a habit failed at on a
Sunday. Holding a habit no longer types over its name; it reveals a pencil.

A real bug came out with it: the pie divided by the flat count of every visible
habit on every day, so a Monday-to-Friday habit made Sunday impossible to fill
however much he had done. The denominator is per-day now, and the maths moved
into core — it had been deciding what a day's circle means from inside a screen
where nothing could test it.

**A ticked reminder stays for two seconds**, so a mis-tap can be untapped. The
WRITE is not delayed — only the row leaving the list. A grace that held the
write back would lose the tick if the app closed inside it, which is a worse
bargain than the one it fixes. A repeating reminder rolls rather than
finishing, so it never needed one.

**Undo last delete** sits in the username's dropdown, and remembers nothing new
to do it: a delete here is a tombstone, so the newest tombstone already IS the
last delete. That survives a reload, reads the same on every device rather than
as a per-device stack that disagrees with itself, and cannot drift from what
was actually deleted. Undo repeatedly and it walks back, newest first.

**The complication's time is its calendar's colour**, replacing the fixed green
that meant "today". It gives up marking today by colour and gains saying WHICH
calendar the next thing is on — and today is still answerable at a glance,
because it is the one entry that carries no date.

Three things the work caught that had been wrong or invisible:

- react-native-web emits `role="radio"` and then DROPS accessibilityState, so
  the frequency choice announced nothing to a screen reader. Found by reading
  the rendered element's attributes rather than trusting the prop.
- `testids.spec` refused an absence assertion on `habit-rename` — correctly: a
  testID nothing renders can never fail. Written while removing the very thing
  it named.
- `foregroundStyle(tint(e))` in the complication compiled to SwiftUI's own
  `View.tint(_:)` modifier, failing with "'Ev' conform to 'ShapeStyle'".
  Only building the watch target could have caught that.

### Still open

- Larger notes with images — needs blobs outside the record set; see TODO §3.
- The uncheck grace on the watch and the widget, which are a different design.
- The sticky clock skew in `put()`, unchanged.

## Iteration — three gestures that were broken in ways reading could not find

0.3.0 and 0.4.0. Everything here was reported by Sean using the app, and every
one of them was found by probing rather than by inspection — in each case the
first, plausible reading of the code was wrong.

**Tap-to-leave on habits did nothing across the whole grid.** The listener was
on the BUBBLE phase and react-native-web stops a click at any Pressable; every
tick cell is one, so those clicks never reached document and the KEEP list that
decides could not be consulted. The first diagnosis — that KEEP's
`[data-testid^="habit-"]` was too broad and matching the day-column headings —
was true, and irrelevant: narrowing it changed nothing, because the click was
not arriving. Both were fixed; only the phase was the bug.

**The calendar's swipe would not start on the legend**, and needed two
unrelated fixes. The legend is a sibling of the grid, so it got its own
responder built from the grid's config. But the behaviour was position-
dependent — the legend's empty margins worked, its middle did not,
reproducibly — and that was not the responder at all: dragging from a chip
started a browser TEXT SELECTION which killed the gesture. Three different
responder arrangements produced byte-identical results before that was found;
the arrangement was never the variable. The DOWN swipe is what proved both
halves are load-bearing, because the up one passes on a half-fix: it travels
over the grid, which claims it.

**Double-click stopped entering edit mode on habits** — a regression from this
repo's own previous iteration, which took the double-tap handler away with the
inline rename it replaced. Long-press is no way in with a mouse, so the macOS
app had no way in at all.

**The complication's colour was never the code's to give.** A complication is
rendered `.accented` or `.vibrant` by the watch FACE and never `.fullColor`.
Sean's Modular face overrode the colours; Infograph Modular renders them. This
cost most of a day across two sessions, for want of checking whether the
platform would draw a thing before building it — the rendering-mode API was in
the watchOS SDK on this machine throughout. Written into the source header and
TODO so the next report starts at the face.

Also: the note editor carries the sync status in its top right, pinned to the
corner rather than right-aligned in a header row that wraps on a phone (it sat
44pt below the back button at 390pt). It is the one screen where it earns its
place — a note is the only record the server can refuse for being too long.

### The ledger's own reliability

FIVE §1 entries have now been found stale — the oversized record, the widget
key, the wrist's clock, the complication tint, and Reminders' inline edit and
repeat mini-editor. The first four were each caught by a question of Sean's
rather than by re-reading; the fifth was caught at the moment it went stale, by
whoever made it so, which is the only cheap way to catch one. Each is corrected
in place, but §1 as a whole has not been re-verified against source end to end,
and until it is, it should be read with suspicion. That is a job worth doing on
its own — and the fifth is the argument for it, since a line describing a
feature that had been deleted read as perfectly plausible for as long as nobody
checked.

### Still open

- Larger notes with images: needs blobs outside the record set. The client
  keeps the whole store in one localStorage string and the server rewrites the
  whole file per sync, so both are O(total store) per operation.
- The uncheck grace does not reach the watch or the widget; the watch needs a
  different design (defer the SEND, since a second toggle rolls a repeat twice).
- put()'s clock clamp is still sticky, and is the likelier of the two sync
  problems to bite now that ties resolve.

## Iteration — five nits from a walk through the app, 2026-08-12

Sean's list, in his order. Four of the five are the same shape as things already
argued for elsewhere in this ledger, which is the interesting part: the argument
was written down and the screens had not all been brought into line with it.

**1. The calendar's day panel stopped jumping.** Its `✎ ⧉ ×` were ordinary flex
children appended to each row, and that cost two separate shifts. SIDEWAYS: the
body is `flex: 1`, so three 24pt controls and two 10pt gaps took 92pt off it and
every chip to its right — the time, the `today` rider, an overdue date — slid
left. Measured at 356pt → 242pt. DOWNWARD: the tallest thing in a row was the
22pt tick, so a 24pt control made each row 2pt taller and every row below moved
down. It is an absolutely positioned cluster over `T.bg` now, the third screen
to arrive at the arrangement Reminders' own comment argued for first. The spec
measures the body's WIDTH and the SECOND row's tick — the first row's tick holds
still under both bugs, so measuring it would have proved nothing.

**2. The habits edit icons are opaque.** Their background was the name box's own
`tint(color, '14')` — 8% alpha — so the habit's name read straight through the
icons sitting on top of it. The whole bargain of floating them is that what they
cover is hidden, and the one thing the pattern promised was the one thing it was
not doing. Two layers now: `T.bg` for the hiding, the same wash over it so the
cluster still reads as part of the box. One translucent layer cannot do both
jobs, which is how it went wrong. The spec asserts the ALPHA, not the colour,
since the colour is the section's.

**3. Reminders lost inline name editing and its frequency tabs.** Both were one
piece of state and the whole apparatus is gone: the blur-time save, the
re-parsing of dates out of retyped text, the held-open cluster that let a button
outlive the field's blur, and the third on-screen copy of core's `REPEAT_UNITS`.
A name and a repeat are the item window's business, which is where the date they
interact with already lives, and the screen now agrees with the day panel and
with Habits about what editing a reminder means.

That retired `clusterhold.spec.ts` — three tests of a guard whose mechanism no
longer exists — and the reminders half of `interrupted.spec.ts`, whose claim
("an interrupted edit survives") is now the opposite of correct: the window
writes on Save and on nothing else, so an abandoned edit is DISCARDED by design.
A test asserting the old survival would have been asserting a bug. It also
un-obsoleted the comment explaining why this screen's tap-out listener runs on
the bubble phase — the reason was the inline editor; the listener stays on bubble
anyway, because "habits does it the other way" is not a reason to touch it.

What that deletion nearly took with it is worth naming: `clusterhold` was the
only cover for the row's `+` and `‹`. They are tested on their own terms now
(`subtask.spec.ts`), and the `+` opens the item window rather than a field, since
a row with no text and no way to give it any is litter rather than a subtask. The
blank-row cleanup the inline field did on blur had to be rebuilt to outlive it,
or every cancelled `+` left an empty row behind.

**4. The note editor's Copy moved next to Delete**, out of the pinned top-right
corner it had spent a few hours in beside the sync dot — which put a button
nobody was looking for in the one place on that screen that is not a button. The
footer already held the things you do to the whole note.

And the confirmation became a POPUP. Sean: "copied as markdown should be a popup
in the middle of the screen, not text that randomly inserts itself" — which names
the defect exactly. It was a laid-out `<Text>`, in two places, so appearing
pushed the page down by its own height and vanishing pulled it back up: copying
something moved the thing you were reading. There is one `ToastProvider` at the
root now, and the two reasons it lives there rather than in TopBar are both
load-bearing: a sibling laid out before the page content is painted UNDER it on
the native builds, and `pointerEvents: 'none'` on a plain fill costs no layout
and eats no taps — where a transparent RN Modal is its own window and swallows
touches over its whole area whatever its children say, which would have made the
second of two consecutive undos land on the first one's toast.

**5. The monthly pies show what a day OWED.** Each section now contributes two
adjacent arcs in its colour: what got done, solid, and what was required and not
done, at 15% — so a section is one contiguous wedge the size of everything it
asked for, and how much of that wedge is solid is how much happened. The reading
this fixes is a real ambiguity rather than a decoration: an empty ring used to
mean either "nothing done" or "nothing asked", which are opposite readings of the
same picture. A ring that is all ghost owes you the day; a bare ring asked
nothing. Future days draw neither — a month of ghost circles ahead of today would
read as a month of failure.

The maths went into core beside the rest of the pie's, and `open` needed no rule
of its own: an off-schedule day only enters `counted` when it is ticked, so an
untouched Saturday on a weekdays habit contributes to neither share.

### Two checks that could not fail, caught by mutation

Both were mine, in this iteration, and both looked exactly like passing checks.

The first: `owes nothing for an untouched OFF-schedule day`, written with a lone
weekdays habit. With nothing counted, `dayShares` returns early on `total === 0`
and never reaches the arithmetic the test is about — so it stayed green under the
obvious wrong implementation while two OLDER tests went red. It carries an
always habit in a second section now, so the assertion is on a section that
genuinely owes nothing on a day that genuinely counted something.

The second is the reason the calendar spec measures the second row's tick and not
the first, noted above. Both were found by making the wrong change on purpose and
watching, which is the only thing that finds this class.

## Iteration — the day panel's head row, 2026-08-13

Sean, walking the calendar: "weird space under legend". THE LEGEND WAS INNOCENT,
and establishing that was most of the work — worth recording because the next
report phrased this way will send someone to the same wrong place.

Measured on the web at 390/430/640/900/1160px, in month AND week mode, with one
chip and with a seeded store that wraps to three lines, and then again on the
simulator: the legend band is 20pt of content plus 6pt of padding either side,
with a 1pt rule above and below, and NOTHING unexplained at any width. The
`UNEXPLAINED` figure — the band's height minus its children minus its padding —
came back 0 every time. The hole that does exist near it is the last week row's
empty mark wells (23.5pt, reserved so busy and empty days align, and covered by
its own test), which sits ABOVE the legend and is deliberate.

What he actually meant came out of asking: the head row BELOW it. Three things,
and all three are now pinned by `panelhead.spec.ts`:

- **The date and the + Add share a top edge.** The row was `alignItems:
  'center'`, which centres an 18pt line of text against a taller button and
  leaves the date sitting low. `flex-start` makes the text's own line box start
  exactly where the button's box starts — measured with a Range over the text
  node rather than off the element, since the element box can carry padding the
  glyphs never use. An earlier attempt added `paddingTop: 4` to the title and
  made it worse by 4pt; the arithmetic that justified it had used the element's
  box top and silently ignored its own padding.
- **The gap above the button is 11pt, not 17.** The panel's `paddingTop` is 10
  now rather than 16 — and 10 is not a fresh guess, it is the number Sean chose
  for the gap below the top bar's divider, doing the same job under the same
  kind of line. The other three sides stay at 16.
- **The + Add is drawn 26 instead of 32, and is still 32 to a press.** This is
  the one worth the test. `hitSlop` is a NO-OP under react-native-web, so taking
  6pt off the drawn box takes 6pt off the real target in the engine Sean reads
  the app in — the trap CLAUDE.md keeps. So `Pill` gained a `compact` prop that
  shrinks the paint and adds a `WebHitSlop`, and the spec probes the button's
  REACH with `elementFromPoint` walking outward from the drawn edge rather than
  clicking a point known to be inside it.

  The slop is 5, and it is 5 because it was measured: the box lands on a half
  pixel, so slop 3 gave a 30pt target and slop 4 gave 31 (3 above, 2 below).
  Two rounds of "the arithmetic says 32" produced a target a pixel short. A prop
  rather than editing `pill` itself, because that style is in 45 places and the
  other 44 were not complained about; a prop rather than a bespoke Pressable on
  this screen, because Pill exists precisely to stop four screens inventing four
  button heights.

All three were reverted together and all three specs went red, then restored.

### …and the head row took two more rounds

Written twice, because the first attempt at this section was lost: the machine
filled its disk mid-session and the append reported success but did not survive.
See the entry in TODO — a `cat >>` that echoes "appended" is not evidence the
bytes landed when the volume is full.

Of the three changes above, ONE stood unchanged and two went back and forth:

- **The gap survived.** 10pt of panel padding, not 16. He objected to the
  button, never to the spacing.
- **Aligned tops is gone.** `alignItems` is back to `center` — "looks
  terrible.. make the add button the same height and center aligned vertically
  with the section". Worth recording as a decision rather than a silent revert:
  `flex-start` was not a misreading of "top of date and add button should be
  aligned", it was that ask implemented exactly, and it lost to how it looked.
- **The height went 32 → 26 → 32 → 26**, and the middle step is the mistake
  worth keeping. "Make the add button the same height" was read as "the same
  height as every other Pill", so the compact variant was deleted and the button
  went back to 32 — and the next message was "the add button should be less
  tall, it looks bad still". Two things had changed together in round one (short
  AND top-aligned); when that was rejected, reverting BOTH threw away the half
  that was right. It was the alignment he disliked. Short and centred — the
  combination nobody had tried — is where it landed, and "the same height" most
  likely meant the same height as the section row it sits in.

THE PROCESS LESSON, which cost three device builds: spacing asks were
implemented from description and shipped, and the screenshot came afterwards.
The measuring was all correct and measured the wrong thing. On anything Sean
judges by eye, build it, LOOK at it on the simulator, and SHOW him before the
deploy — a screenshot costs one message and a device build costs fifteen
minutes plus a flaky watch install. The third round was done that way.

`panelhead.spec.ts` has now asserted a claim and its opposite within the hour;
each direction was mutation-checked when it landed. The height test is
relational — shorter than a real Pill, measured via getByRole, because
getByText finds the 17pt line of type inside the 32pt button.

### The month is three letters now, 2026-08-13

Sean: "use 3 chars for month name in the calendar view like 'Aug' instead of
'August' so the text isn't jumping around when i select days". Applied to BOTH
month names on the screen — the pager heading (`cal-ym`, "Aug 2026") and the day
panel's title ("Thursday, Aug 13") — so the screen agrees with itself about how a
month is written.

`month: 'short'` rather than a hand-rolled `slice(0, 3)`. Every other date on
this screen goes through `toLocaleDateString`, and a home-made three-letter list
would be the one thing on the page that disagreed with the reader's locale.

Worth noting which of the two actually MOVES, since the stated reason was
jumping: the pager label is CENTRED between the two arrows, so "May 2026" and
"September 2026" centre at different widths and the header shifts as you page.
The day title is left-aligned and grows rightward instead, and within a single
month its month name does not change at all as you select days — the width
variation there comes from the weekday ("Sunday" to "Wednesday"). Both were
shortened because he asked for the calendar view, but the centred one is the one
that was visibly moving.

The guard came for free: `clock.spec.ts` already asserted `/December 2026/` and
`toContainText('December 31')`, and "December 2026" does not contain the
substring "Dec 2026" — so pointing those at the short form makes them a real
regression test, and reverting the screen to `'long'` turns both red (verified).
`app.spec.ts`'s landing test builds the expected label itself and needed the same
change; `calarrows.spec.ts` and the paging tests only compare labels for
INEQUALITY, so they never cared.
