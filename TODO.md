# TODO — what is still owed

`README.md` is the map, `TESTING.md` is what the tests are worth, `PARITY.md`
is the ledger of what shipped. This is the live list, highest first.

Rewritten 2026-08-10. It had grown to 2140 lines of running narrative, and
that is not a list you can act on — four things it still carried as OPEN had
in fact shipped (legend rows grouped by kind, native iOS OCR, URL recipe
import, the watch's month grid), and 68 of its "open" checkboxes were prose
rather than tasks. The old file is in git at `29686f2` if you want the
story. Everything below was checked against the source on the day.

Standing rules live in `CLAUDE.md`, not here.

## Suite counts, as of this commit

core **372** · gesture **130** (+1 skipped) · WebKit **16** · server **38** ·
live **16** with the API · desktop **6** · deploy guards **9** · plus the four
native seam checkers no browser can reach: `npm run test:watch`,
`npm run test:widget`, `npm run test:deploy`.

`npx playwright test --list` gives the gesture total without a run. Keep this
line right — the README points here rather than carrying its own numbers,
precisely because its own "145 tests" went stale unnoticed.

---

## 1 · Decisions only Sean can make

Each is blocked on a call, not on work. Options are given because the choice
is between real tradeoffs, not because the answer is unclear.

### The oversized record — the one with teeth
A payload over 64KB (~10,000 words) is skipped by the server, which still
answers 200 with a fresh cursor; the client then clears its dirty flag. The
note saves locally, says "synced", and dies with that device. `toolong.spec.ts`
now makes the app SAY so, which stops the silence — but the protocol is
unchanged. (a) server returns `refused: [ids]` and the client keeps them
dirty and says so; (b) client refuses to save past the cap; (c) raise the cap
and move the problem. (a) is the honest one and needs a little UI. Not doing
it unasked: this is the sync contract.

### Two devices can disagree forever
The merge takes a remote record only when it is strictly newer, and `put()`
clamps timestamps — so a tie is more reachable than it sounds, and a tie
never resolves. Any fix picks a winner by something other than time (device
id, a lexical tiebreak on content), which means picking whose edit loses.
That is a product decision.

### The widget key rotates on every visit
Opening Settings → Widget mints a new key and retires the one already on the
home screen — it holds a dead key and simply stops updating. The page now
says so out loud, which costs nothing. Better: (a) store the token, not just
its hash, so the page shows the SAME key; (b) mint only behind an explicit
"new key" button; (c) leave it rotating and rely on the warning.

### The PWA cannot open offline
No service worker, so a phone with no signal never gets `index.html`. Native
and the Tauri shell carry their bundle and genuinely do open offline. Fixing
it collides head-on with the deploy's own rule — index.html must always
revalidate, or a phone runs last week's app against this week's data. A
careless caching worker turns an annoyance into the worse failure.

### The wrist's clock on the mirrored page
The new first watch page uses the WRIST's compact clock (`3:30`, no suffix
below 8pm — Sean's own rule), while the widget it mirrors always shows the
suffix (`3:30pm`). Kept consistent with the watch pages beside it rather than
with the widget. Say the word and it flips.

### Smaller, still his
- A FINISHED item greys out rather than keeping its folder colour. That is
  the suite's rule; it can go.
- "standup at 9am" is titled "standup at" — the preposition is left behind
  when the time is lifted out. It is the reference behaviour. The fix is one
  line and was written, then reverted pending his word.
- "Adding a note should go straight to the note editor" — it already does
  (`app.spec.ts:157`), so he either means native-only or means it should land
  in TYPING mode. Awaiting which. Cannot test it myself: it writes to his data.
- Ok to make a throwaway account on the TEST server? It would let the watch
  tick round-trip be verified end to end without touching his data.

## 2 · Open bugs

### The new-note focus is a 50ms race (WebKit only)
2 failures in ~22 runs; every deliberate reproduction has failed, including
replaying the exact sequence. Do not spend time on synthetic load or suite
ordering — both were tried. What is real and reachable: for the first 50ms
after `+` the body is not focused, so a fast typist's first keystrokes go
nowhere. The deferral is not incidental — the body's `onBlur` collapses the
editor, so three other specs DEPEND on the focus being stolen back. Removing
it means changing WHEN the field mounts, and that is the design question in
§1 territory: should tapping the title close the body editor at all?
Whoever takes it: change `useNoteScoped`'s reset, the onBlur collapse and the
fresh-note effect TOGETHER, and run both configs after every step. Four
one-at-a-time patches each fixed one spec and broke another.

### iOS never propagates the watch app
Across four installs the wrist sat on build 1 while the phone carried 6. A
direct `devicectl` install fixes it, and only while the watch is awake and
holding a tunnel. Why the companion path does not update it is unknown; until
then the watch needs the direct install and the build number is the proof.

## 3 · Work, not decisions

- **The watch's copy of the widget's calendar selection lags by one push.**
  The widget filters with its LIVE configuration; every other surface reads a
  snapshot it writes to the App Group during `getTimeline` (`WIDGET_CALS`).
  The phone reads that snapshot when it builds the feed, so the wrist is
  always one generation behind: change the widget's calendars and the watch
  keeps filtering by the old set until some unrelated store change causes
  another push. Seen 2026-08-11 — Sean's shared events were on the widget and
  missing from the first watch tab, then appeared on their own once the app
  pushed again. It self-heals, which is exactly why it will be reported as
  intermittent. Fixes worth weighing: push again on app foreground; or have
  the phone re-read `WIDGET_CALS` after `reloadAllTimelines()` and push a
  second time only if it changed. Not done unasked — it is a sync-timing
  change and the symptom is transient.

- **The complication's today tint, on a real wrist.** The WORDS are gated —
  `check-watch-format.sh` runs both Swift copies and pins "now" for an all-day
  event today, plus a later all-day event still naming its date; both halves
  were broken deliberately and went red. The GREEN is not gated: it is a view
  concern the string checker cannot see, and an unsigned simulator build has
  no App Group, so the complication there reads an empty feed whatever the
  code says. Confirm it on the wrist next install. The green is the same
  `Color.green` the watch app already uses for today, so it should match the
  page beside it rather than introduce a second idea of "today".

- **The widget's pixels with REAL data** — everything upstream is covered
  (entitlements, the cache writer, core's shape, the decoder, `drawnDays`),
  but an unsigned simulator build has no App Group at all, so the last mile
  is Sean's phone.
- **The watch tick round-trip** — code-complete and installed, never verified
  end to end. Gated on the test account above, or on his thumb.
- **Passkeys from the native app** — two asks, both his: re-add his Apple ID
  in Xcode → Settings → Accounts (also needed before the profiles expire), and
  the AASA file needs the PROD domain root (prepared in `server/prod-only/`,
  ships only on his word). Then the probe is one build away.
  NOTE: signing worked on 2026-08-10, so the "No Accounts" wall that stopped
  the last probe may already be gone. Worth retrying before asking him.
- **Calendar integrations** (Sean: "Extracted data and via oauth") — reading
  Gmail needs a Google Cloud project and consent screen, which is his. Also
  unanswered: subscribe-by-link vs full CalDAV first.
- **Android** cannot be verified on this machine — no `adb`, no emulator.
- **Windows** stays dispatch-only by his instruction.

## 4 · Steady state, every iteration

- `git pull --autostash` first; stage explicit paths; never `git add -A`.
- Keep every suite in the counts above green, including the native four.
- Confirm live test == local dist by comparing `index.html` to `index.html`
  — `dist` holds more than one `index-*.js`, so never `find | head -1`.
- Before trusting a new check, break the thing it guards and watch it go red.
- Keep `PARITY.md` honest; act on Sean's steering the moment it arrives.

## 5 · Gated — waiting on his explicit word

- **E2EE envelopes** (design settled, build gated): X25519 + Argon2id-wrapped
  private key, per-container content keys, per-recipient wraps, passkey unwrap
  via WebAuthn PRF, recovery codes required. Changes the password-recovery
  contract, so it does not start until he says go.
- **Windows desktop build**: `.github/workflows/desktop-windows.yml` is
  dispatch-only. When he runs it, smoke the artifact per `TESTING.md`.

## 6 · Back burner — recipes

- OCR keeps improving pattern-wise: pull name + quantity + unit where a
  pattern is visible. Imperfect text is fine (the user fixes it); junk
  non-letter characters are not — `scrubLine()` in `packages/core/src/recipe.ts`
  is the gate, extend it there.
- Known and deliberate: '1 large free range egg' and '1 finely chopped onion'
  are still missed; '2 dried chili' doubles to '4 dried chili'; the
  '1 x 400g tin' shape is standard and still unconfirmed.
- Keep `recipe-incnotes` honored on every save path if the editor grows new ones.
