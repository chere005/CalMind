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
- [ ] Keep the suites green: 211 core + 25 server + 67 gesture (Playwright).
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
- [ ] Minor, not done: `listPasskeys` swallows its failure, so an offline
      Settings shows an empty passkey list and an Add button. Misleading
      rather than harmful — you might add a second key you did not need.

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
