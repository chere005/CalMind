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

## In flight (iteration 9 — start here)
- Notes row drag (same flat model) + section drag as blocks with the suite's
  cross-folder rules (duplicate-name refusal, last-section-out ask).
- Empty-section drop targets (a boundary per section head).

## Next, in pain order
1. Habits month view (day pies + its legend) + Manage-sections window +
   habit rename in place + collapse-all wiring.
2. Drag-reorder (rows/sections/folders; ord keys are ready) — needs a
   pan-gesture implementation that works on web + native.
3. Week mode (swipe up on grid; wk paging), sideways swipe paging.
4. Rendered rich text in notes (markers → styled runs); suite rt parity later.
5. Reminders full-edit kind conversions (reminder⇄event, →note one-way,
   subtasks keep the reminder home rule); duplicate buttons; swipe-delete.
6. Sharing: partner lists, share window, @partner views, live ticks in All,
   shared recolour overrides (APP_PALETTES_SHARED staged).
7. Themes: midnight/sage/forest/olive full palettes; login stays midnight.
8. Widget/feed + quick-add equivalents; watch target wiring; simulators.

## Suite notes still to honour (from CLAUDE.md read-through)
- Cells: fixed two-row well, 3/row phone; >6 icons → five + '+'.
- Reminder cell icon: worst state of ITS colour that day; grey only when all
  its colour's are done (and hidden unless Completed shown).
- Legend: kinds events→reminders→notes; hidden when empty; caps height.
- Day-panel fold keys per kind(+owner later); partner dimming when sharing.
- A day is selected by tap only (pointerup near pointerdown) once swipes land.
- Icon buttons: circles, flex-centred, one size per row — re-check by eye
  before every deploy.
