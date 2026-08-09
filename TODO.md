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

- [x] **Recipes, Sean's elevated priority** — four things off the phone
      screenshots: an ingredient with no number in front of it now counts as
      one; a line mends by TAPPING it rather than delete-and-retype; both
      lists reorder by the marker they already wear; delete moved behind the
      swipe, as every other list does it. The fifth thing I listed turned out
      to be my own misreading — a SAVED recipe already renders properly in
      the note (bold headings, bullets, numbered steps); the "wall of plain
      text" screenshot was taken mid-edit.
- [ ] **OCR quality is the one recipe thread left, and it is BLOCKED on
      Sean.** Everything so far is tuned against recipe text I invented. Two
      or three photos of real cards would let it be tuned against what his
      camera actually produces.

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
- [ ] Keep the suites green: 187 core + 23 server + 41 gesture (Playwright).
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
