# Parity ledger — seancheren.com/calmind → /test/calmind

The Ralph loop's working memory: what's shipped, what's in flight, what's next,
checked against the suite's CLAUDE.md/TESTING.md notes each pass. Keep this
honest — the next iteration trusts it.

## Shipped (verified on web against seeded example/buddy)
- Core: spec replay (parse/repeats/sort), day model (overdue collection,
  rideAlong riders, repeat expansion), normalize guarantees, manage rules
  (folder/section/calendar delete·rename refusals + re-homes), reminderToggle
  (max(due,today) roll), sectionNameTaken, ord keys, LWW sync engine.
  94 core + 15 server tests.
- Reminders: folder blocks (wash chips), gold sections, chevron collapse
  (persisted), undated-first block sort, subtasks (+/‹), repeat mini-editor,
  inline edit (re-parses dates), full-edit ✎ → ItemModal, toolbar row under
  divider (collapse-all ⌄, completed ☑ icon, sean-only ⧉ markdown), FolderPick.
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

## In flight (iteration 21 — start here)
- By-eye pass on test against prod, side by side, page by page (spacing,
  icon centring — the CLAUDE.md pre-deploy rule — fonts, empty states).
- Scriptable script parity check (tools/scriptable-widget.js vs the suite's
  generated script: day headings, tick links, rolled tint).
- Native targets: expo run:ios / run:android smoke, watch bridge check.

## Next, in pain order
1. Habits month view (day pies + its legend) + Manage-sections window +
   habit rename in place + collapse-all wiring.
2. Drag-reorder (rows/sections/folders; ord keys are ready) — needs a
   pan-gesture implementation that works on web + native.
3. Week mode (swipe up on grid; wk paging), sideways swipe paging.
4. Rendered rich text in notes (markers → styled runs); suite rt parity later.
5. Sharing: partner lists, share window, @partner views, live ticks in All,
   shared recolour overrides (APP_PALETTES_SHARED staged).
6. Themes: midnight/sage/forest/olive full palettes; login stays midnight.
7. Widget/feed + quick-add equivalents; watch target wiring; simulators.

## Suite notes still to honour (from CLAUDE.md read-through)
- Cells: fixed two-row well, 3/row phone; >6 icons → five + '+'.
- Reminder cell icon: worst state of ITS colour that day; grey only when all
  its colour's are done (and hidden unless Completed shown).
- Legend: kinds events→reminders→notes; hidden when empty; caps height.
- Day-panel fold keys per kind(+owner later); partner dimming when sharing.
- A day is selected by tap only (pointerup near pointerdown) once swipes land.
- Icon buttons: circles, flex-centred, one size per row — re-check by eye
  before every deploy.
