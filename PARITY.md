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

## In flight (iteration 2 — start here)
- Month cells: kind ICONS (cal glyph / tick box / page) per kind+colour,
  legend order, worst-state reminder colouring, capped well with +N.
- Legend bar between grid and panel (own items; partner rows when sharing).
- Day panel: collapsible kind groups, persisted fold per group.
- Tab bar: full SVG icon set in the mark's language (no emoji).

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
