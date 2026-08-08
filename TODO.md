# TODO — in priority order

The working list as of 2026-08-08 (ralph iteration 22). PARITY.md stays the
ledger of what's *done*; this is what's still owed, top priority first.
Standing rules: behavior lives in packages/core, RN primitives only, the old
suite (seancheren-reminders) IS the spec — grep its CSS/PHP before guessing a
visual. Deploy to **test only** (`./server/deploy-test.sh`) as changes land.

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

Next up on web, in order:

- [ ] **The month cell on a phone** — the suite says three icons per row on
      a phone; CalMind forces three everywhere via a 40px cap. Check what a
      wide screen should do before changing anything.
- [ ] Nothing else is known-broken on web. The next real work is the recipe
      OCR pass (§3), which is where Sean's priority order points once web is
      clean.

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
