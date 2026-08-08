# TODO — in priority order

The working list as of 2026-08-08 (ralph iteration 22). PARITY.md stays the
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

## 2 · Steady state (every iteration)

- [ ] `git pull --autostash` first — two sessions share this repo; stage
      explicit paths only, never `git add -A`, hold commits on files the other
      session has half-refactored.
- [ ] Keep the suites green: 145 core + 22 server + 30 gesture (Playwright).
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
- [ ] Photo import flow (recipe-import → recipe-photos → recipe-title →
      recipe-save) is covered by e2e/ocr.spec.ts — keep that spec on the real
      flow, not a shortcut.

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
