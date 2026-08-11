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

core **388** · gesture **139** (+1 skipped) · WebKit **16** · server **38** ·
live **16** with the API · desktop **7** (+3 in `npm run test:desktop`) · deploy guards **9** · plus the four
native seam checkers no browser can reach: `npm run test:watch`,
`npm run test:widget`, `npm run test:deploy`.

`npx playwright test --list` gives the gesture total without a run. Keep this
line right — the README points here rather than carrying its own numbers,
precisely because its own "145 tests" went stale unnoticed.

---

## 1 · Decisions only Sean can make

Each is blocked on a call, not on work. Options are given because the choice
is between real tradeoffs, not because the answer is unclear.

### The oversized record — option (a) SHIPPED; what is left is smaller
This entry claimed "the protocol is unchanged". It was already wrong when
read against the source on 2026-08-11: the server refuses payloads over 64KB
and returns `rejected: [ids]` (app.php), the engine keeps those ids dirty and
never clears them (sync.ts), the store raises `syncState: 'refused'`, Settings
shows it, and `toolong.spec.ts` asserts the app never claims to be synced in
that state. It no longer lies.

What IS left:
- **The warning is buried.** The top bar's status dot is gone — chrome.tsx
  destructures `syncState` and never renders it, while that file's own header
  comment still describes the dot. You only find out by opening Settings.
- **It does not name the record.** "Something is too long" in an app with
  hundreds of them.
- **It offers no way out** — no jump to the note, no split.

And Sean's own question, still open: he wants larger notes WITH IMAGES. That
is not a bigger cap; see §3.

### ~~Two devices can disagree forever~~ — DECIDED and shipped 2026-08-11
Sean chose: the server arbitrates. It now accepts an equal-stamped write whose
CONTENT differs and bumps its sequence, so its copy means "whichever edit
reached the server last"; the client takes the server's copy on such a tie and
the two converge. An equal stamp with identical content is still ignored on
both sides, or every echo would bump the sequence and re-broadcast itself for
ever. Payload keys are canonicalised before comparison, so a client that
serialises the same object in a different order is not a conflict.

One exception, and it matters: a client does NOT adopt the server's copy while
its own is still dirty. An unsent edit has never been offered to anyone, so
overwriting it would be silent and pointless — the id stays dirty, so the next
push would send back the copy just adopted, which the server sees as identical
and ignores. Keeping it means it gets pushed and the OTHER device converges.

Still true, and now the bigger of the two: **`put()` clamps to
`max(now, prev + 1)`, so a device that edits rapidly or carries a fast clock
pushes `updated` ahead of wall-clock time — and the skew is STICKY, because
every later edit anywhere takes the max against it.** A stale edit from the
skewed device then beats a genuinely newer edit from a correct one. Same root
cause as the tie (a local clock used as a version), not fixed by the tiebreak,
and more likely to bite than an exact tie ever was.

### ~~The widget key rotates on every visit~~ — ALREADY FIXED, entry was stale
Checked against the source 2026-08-11 when Sean asked what was needed: option
(b) shipped some time ago. `handle_widget_token` mints only when asked —
without `rotate`, an account that already holds a key is told `exists: true`
and nothing changes — and WidgetSetup only sends `rotate` from the explicit
button. Opening the page costs you nothing.

The one thing still true: the key cannot be SHOWN again, because only its
hash is stored. Lose the Scriptable script and you must rotate and re-paste.
Option (a) — keeping the token itself so the page can redisplay it — is the
only outstanding choice, and it is a real tradeoff: that token is a bearer
credential for a read-only feed of everything, and storing it in plaintext to
save a re-paste is not obviously the right trade. Sean's call if it ever
annoys him.

### The PWA cannot open offline
No service worker, so a phone with no signal never gets `index.html`. Native
and the Tauri shell carry their bundle and genuinely do open offline. Fixing
it collides head-on with the deploy's own rule — index.html must always
revalidate, or a phone runs last week's app against this week's data. A
careless caching worker turns an annoyance into the worse failure.

### ~~The wrist's clock on the mirrored page~~ — NOT AN ISSUE, entry was stale
Sean, 2026-08-11: "the wrist complication is correct as 3:30 over 3:30pm. it
should be 3:30pm everywhere except the complication, and i don't think there's
any issue with this". He is right, and the code already does exactly that:
every watch page uses `WatchFormat.clockFull`/`whenFull` (`3:30pm`) and only
the complication uses the compact `clock12` (`3:30`). check-watch-format.sh
pins both, and pins that the two DISAGREE below 8pm so one cannot become the
other. This entry described a state that is not the case.

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

- **Larger notes, with images** (Sean asked, 2026-08-11). Not a bigger cap:
  the shape cannot carry it. The client persists the WHOLE snapshot as one
  JSON string through AsyncStorage — localStorage on the web, ~5MB for the
  entire origin — and the server decrypts, mutates and rewrites the WHOLE
  store file on every sync. Both are O(total store) per operation, so an
  inlined image is paid for on every save and every round trip, on every
  device, for ever. What it needs instead: blobs stored OUTSIDE the record
  set, content-addressed, with records holding only a reference; upload and
  download off the sync path; the client fetching bytes lazily and caching
  them; a rule for when an unreferenced blob is collected; and the same ENC1
  treatment the store gets. The web client's ~5MB localStorage ceiling is the
  binding constraint and probably forces IndexedDB there. Worth its own
  design pass before any of it is written.

- **The two-second uncheck grace does not reach the watch or the widget.**
  It is done in the shared React app, so web and iOS both have it. The watch
  ticks by queueing the id to the phone through `transferUserInfo` and
  removing the row locally, and its own comment warns that a second toggle
  rolls a repeating reminder TWICE — so a grace there means deferring the
  send by two seconds and cancelling it, not sending an undo. That is a
  different design from the app's (which never delays the write), and it is
  Swift that cannot be verified from a web-only run. The widget queues ticks
  into the App Group and redraws on its own schedule; what a grace even means
  there is an open question.


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

- **The macOS .app is ad-hoc linker-signed, and Gatekeeper rejects it**
  (`code has no resources but signature indicates they must be present`;
  `Info.plist=not bound`). It launches locally and survives being copied to
  another directory, so nothing is blocked today — but it is not distributable,
  and a quarantined copy (anything downloaded) would be refused. Fixing it
  means a real signing identity in `tauri.conf.json` and, for anyone else's
  Mac, notarisation. Not started; nobody has asked to hand this app to anyone.
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
