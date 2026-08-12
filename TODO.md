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

core **477** · gesture **162** (+2 skipped) · WebKit **16** · server **53** ·
live **19** with the API · desktop **7** (+3 in `npm run test:desktop`) · deploy guards **9** · plus the four
native seam checkers no browser can reach: `npm run test:watch`,
`npm run test:widget`, `npm run test:deploy`.

`npm run test:counts` checks this line against the suites, so it can no longer
drift — it went stale by three in the very session that added the tests, which
is how a number kept right by remembering to keep it right always ends up.
It measures core, gesture, WebKit, server and the deploy guards, and counts
desktop statically out of smoke.sh; `live` needs the deployed server and is
the one figure still on trust. The README points here rather than carrying its
own numbers, precisely because its own "145 tests" went stale unnoticed.

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

~~What IS left:~~ **DONE 2026-08-11**, both halves:

- The warning is no longer buried. chrome.tsx's own header had described a
  status dot since the file was written while nothing drew it — `syncState`
  was destructured and never used — so the app's one honest signal that a note
  did not save lived only inside Settings. The dot is in the bar on every
  screen now, carrying the full sentence as its accessibility label because a
  coloured circle tells a screen reader nothing.
- It NAMES the record. "A note is too long to save" in an app holding hundreds
  left you to go and find it, and it is by definition not the one on screen.
  Settings reads the same sentence from the same rule now; it used to carry
  its own copy beside a dot that read the shared one, so the two could
  disagree — and did, the moment the message learned to name anything.

Still open: no way to ACT on it from the warning (no jump to the note, no
split). Sean has not asked for one.

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

~~Still true, and now the bigger of the two…~~ — **MEASURED, and the alarming
half was wrong.** `packages/core/test/clockdrift.test.ts` pins the numbers:

- a burst of edits runs ahead of the clock by ONE MILLISECOND PER EDIT (200
  edits in one millisecond = 200ms of drift, not hours), and
- the drift SELF-HEALS exactly when wall clock passes it, and
- a device whose clock is an HOUR fast does **not** beat a later edit made
  elsewhere: anyone editing a record they have SEEN stamps it above what they
  saw, so the later editor wins whatever their clock reads.

That last point is the one this entry got backwards, and it is the property
the clamp exists to provide — removing it would break the case it protects.

What IS exposed is narrower and is not stickiness: two devices editing from
the same starting point, neither having seen the other, resolve by whoever's
clock is higher rather than by who was actually later. That is inherent to
wall-clock last-write-wins and no client-side scheme fixes it; only a
server-assigned receipt time would, which is a protocol change of the same
size as the tie-break. Sean's call if it ever shows up in practice.

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

### ~~The PWA cannot open offline~~ — SHIPPED 2026-08-11
It opens offline now, and the "head-on collision" this entry feared was not
one. The server already publishes the caching policy in web.htaccess, and the
worker is that policy said a second time for when there is no server to ask:
index.html and the manifest are no-cache, so the worker is NETWORK-FIRST for
the document and only reaches its cache when there is nothing to revalidate
against; the bundles are content-hashed and declared immutable, so they are
cache-first. The failure the entry feared — a phone running last week's app
against this week's API — comes from a cache-FIRST document, which this is not.

Three things worth knowing before touching it:

- **The shell list is generated at export time** from what dist actually
  contains. It has to be: a worker does not control the load that registers
  it, so the first visit fetches the bundle without the worker seeing it, and
  a runtime-only cache is empty of the one file the app cannot start without.
  The first offline boot failed exactly that way.
- **sw.js must stay no-cache**, and the live smoke now checks it on the real
  server. The `*.js` rule beside it says immutable; if that won, a bad worker
  would be permanent and the site unloadable. `tools/sw-kill.js` is the escape
  hatch and it only works because of that header.
- **The offline gate is real.** `e2e/offlineboot.spec.ts` boots the app with
  the network off and asserts the calendar draws with its own data. Its
  "document came from the network" check had to be rewritten: watching for a
  document request passed with a cache-first worker too, because the browser
  emits one either way. It asserts the WORKER initiated the fetch, which is
  the thing that differs, and was proven by breaking it.

### ~~The wrist's clock on the mirrored page~~ — NOT AN ISSUE, entry was stale
Sean, 2026-08-11: "the wrist complication is correct as 3:30 over 3:30pm. it
should be 3:30pm everywhere except the complication, and i don't think there's
any issue with this". He is right, and the code already does exactly that:
every watch page uses `WatchFormat.clockFull`/`whenFull` (`3:30pm`) and only
the complication uses the compact `clock12` (`3:30`). check-watch-format.sh
pins both, and pins that the two DISAGREE below 8pm so one cannot become the
other. This entry described a state that is not the case.

### Which rule should the SCRIPTABLE widget's feed obey? — needs one word
Two widgets, two folder rules, and they disagree. Found 2026-08-11.

- The NATIVE widget (`widgetDays` → `dayItems`) obeys the calendar's tri-state
  from `prefs_calendar.folderModes`: a folder is 'all' (its undated items ride
  along on today), 'dated' (only items carrying a date) or 'none' (never
  appears). It was changed to that deliberately, because a folder you had
  switched off for the calendar still filled the home screen — your report.
- The SCRIPTABLE widget's feed (`handle_feed`) still reads
  `prefs_reminders.hidden`, which is the ALL VIEW's switch, a different
  preference entirely, and takes riders from the folder's raw `rideAlong` flag
  rather than from its mode.

So today: a folder set to 'none' for the calendar still feeds that widget; a
folder set to 'dated' still drops its undated items onto today there if it
carries `rideAlong`; and a folder merely hidden in the All view vanishes from
it while the calendar still shows it.

The feed's own comment says "the widget follows what the calendar shows",
which is the intent and no longer the code — CLAUDE.md's drifted-comment trap,
found by reading the two rules side by side.

NOT CHANGED, because either answer contradicts something already written down:
the server test 'the feed follows the suite … hidden folders drop out' pins
`hidden`, ported from the old suite's feed.php, and CLAUDE.md says where the
suite's code and its intent disagree that is a question for you rather than a
side to pick. One word settles it — "match the native widget" (port
folderModes into the feed and rewrite that test) or "leave the feed on the
suite's rule" (and fix the comment instead).

### Scaled quantities round DOWN to a whole but never up — 0.99 stays 0.99
Noticed 2026-08-11 while pinning the fraction rendering. `qtyText` drops a
remainder under 0.02 and prints the whole number, so `0.67 cup × 3 = 2.01`
reads "2 cups". The mirror case is not handled: `0.33 cup × 3 = 0.99` reads
"0.99 cup", and 1.99 reads "1.99", rather than 1 cup and 2 cups.

Both are accurate; neither is a measurement anyone owns a cup for. The
existing down-snap says the intent is that a hundredth is noise, and if that
is true going down it is true going up — but changing how your recipes round
is your call, not a tidy-up I should make quietly. One word either way.

The rest of that rendering is pinned now (`scalefrac.test.ts`), including the
tolerance and the down-snap, both of which mutation showed nothing was
watching.

### The phone's top-bar title disappears behind a long username — your call
Found by LOOKING at the app rather than testing it, 2026-08-11, which is a
method this session had not used at all.

At 390px the title is clipped once a username passes five characters, and it
degrades badly: 6 chars leaves 119px of the 123 it needs, 8 leaves 105, 10
leaves 91, and 17 leaves **4px** — the screen title renders as "R..", "C..",
"H..". At desktop width everything fits.

IT DOES NOT AFFECT YOU TODAY. Your username is four characters, which fits
exactly — measured, not assumed. So this is about anyone else, and about the
day a name gets longer.

The code already states the rule it is following: "The title is what gives at a
narrow width — it can ellipsize; the back control, the picker and the username
cannot shrink without becoming unhittable." That is true of the back button and
the picker, which are fixed 32pt circles. It is NOT true of the username's
LABEL: the pill can ellipsize its text and keep every pixel of its hit area.
So the stated criterion points at capping the username rather than the title —
the title is the only thing in that bar that differs between screens, and you
already know who you are.

A `maxWidth` on the pill would be a no-op at four characters and would leave
the title intact at seventeen. NOT DONE, because you have been specific about
this bar before and how your own name renders is yours to decide.

### Two browser TABS lose each other's offline work — architectural, your call
Proven 2026-08-11 by `e2e/twotab.spec.ts`, which is parked as `test.fixme` so
the bug stays visible without turning the suite red.

`twodevice.spec` opens a second browser CONTEXT — "its own storage, its own
session" — so it tests two machines and passes. Two TABS of one browser are a
different animal: they share the localStorage snapshot, each holds its own
SyncEngine in memory, and each writes the WHOLE snapshot over that one key on
every mutate. There is no `storage` listener and no BroadcastChannel; neither
tab knows the other is there.

Online this is harmless — the server is the meeting point and the snapshot is
only a cache, refilled on the next sync. OFFLINE it is data loss: add a
reminder in tab A, add one in tab B, reload, and **tab A's is gone**. It was
never on the server, and B's snapshot never contained it.

Three ways out, and the choice is a real one:

- **A `storage` listener** that merges the other tab's snapshot through the
  engine's existing last-write-wins. Cheap when there is one tab, uses
  machinery that already exists, and is the usual answer on the web. The risk
  is precisely what `clobber.spec` exists for: a merge arriving mid-sentence
  must not eat the sentence.
- **A single writer** — Web Locks or a BroadcastChannel election, one tab owns
  the snapshot. Cleanest semantics, most machinery.
- **Leave it.** Two tabs AND offline AND closing before reconnecting is a
  narrow path, and the app is honest about being offline throughout.

Not chosen here: inventing merge semantics for someone's notes is not a
tidy-up, and this repo has already paid once for a remote edit landing on a
sentence being typed.

### Login has no throttling of any kind — needs a policy, not a patch
Read rather than grepped, 2026-08-11: `handle_login` does a `password_verify`
and a `login_fail` log on every attempt, with no counter, no delay and no
lockout. `handle_recover` has `RECOVER_TRIES = 5`, so there is precedent in the
same file for limiting something.

NOT changed, because the policy IS the question — how many attempts, over what
window, per IP or per account, a delay or a lockout — and a lockout on a
personal app is also a way to be locked out of your own. Bcrypt makes each
guess slow, which buys time but is not an answer. One word settles it.

(Filed under §3 when it was found, which was wrong: it is a decision, not work.
It was then dropped entirely when §3 was cut back — recovered from git.)

### Smaller, still his
- A FINISHED item greys out rather than keeping its folder colour. That is
  the suite's rule; it can go.
- "standup at 9am" is titled "standup at" — the preposition is left behind
  when the time is lifted out. VERIFIED against core on 2026-08-11, and the
  only §1 entry so far that was already accurate: `parseWhenFromText('standup
  at 9am')` really does return the title `"standup at"`, with due=today and
  time=09:00. Same for "call mum at 5pm" → "call mum at". It is the reference
  behaviour. The fix is one line and was written, then reverted pending his
  word.

- **A weekday name is not read as a date, and quietly becomes today.**
  Measured beside the above: `"party on saturday at 8pm"` gives due=TODAY and
  time=20:00, titled "party on saturday at". So a reminder that says Saturday
  lands on Tuesday with no sign that the day was ignored. `"lunch friday"`
  parses no date at all, with or without the preposition — weekday names are
  simply not supported.

  NOT a bug against the spec: the old suite does not parse weekday names
  either, so this matches it. But the combination — the day silently dropped
  while the TIME is honoured, dating it today — is the surprising half, and it
  is Sean's call whether weekdays should parse or whether a dropped day should
  stop the time being taken too.
- "Adding a note should go straight to the note editor" — it already does
  (`app.spec.ts:157`), so he either means native-only or means it should land
  in TYPING mode. Awaiting which. Cannot test it myself: it writes to his data.
- Ok to make a throwaway account on the TEST server? It would let the watch
  tick round-trip be verified end to end without touching his data.

## 2 · Open bugs

### The new-note focus is a 50ms race (WebKit only)
STILL LIVE, and the count is now 3 in ~24 full runs: it recurred on
2026-08-11 at `app.spec.ts:359` ("note body renders its markers as styled text
when you tap away"), then passed 3/3 in isolation and passed the very next
full run clean. Consistent with everything below — and worth knowing that the
line number moved, so anyone searching for :353 will not find it.

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

- **The two-second uncheck grace reaches the WATCH now; the widget still has
  none.** On the wrist what is deferred is the SEND, which is the opposite of
  the phone's grace and deliberately so: in the app the write happens at once
  and only the row lingers, because a delayed write could be lost if the app
  closed inside the window. On the watch the "write" is a message to the phone,
  and the phone applies reminderToggle to whatever arrives — so sending twice
  does not undo, it rolls a repeating reminder TWICE. An undo therefore has to
  stop the message, not send another. A tick that is never confirmed is not
  lost either: the row stays until the phone's next push says otherwise.

  Verified on a watchOS simulator by tapping it, not by reading it: the row
  stays with a filled green check, and a second tap inside the window returns
  it to an empty circle and leaves it there. The two-second window is shorter
  than a screenshot round trip, so the observation was made with the grace
  temporarily raised — the committed value is 2.

  THE WIDGET HAS ONE NOW TOO, and the shape is different again because a
  widget has no timer. A queued tick used to remove the row outright, which
  left nothing to tap; it stays, drawn done, and a second tap takes the id back
  OUT of the queue so the app never hears about it. The window is therefore
  "until the app next comes forward" rather than two seconds — longer than the
  phone's grace and, unlike before, not nothing.

  The queue rule was pulled out of TickIntent into a free `toggledTicks` for
  the usual reason: an AppIntent reaches into UserDefaults and nothing here can
  run one, so the toggle was written, broken deliberately, and the whole suite
  stayed green. It is checked now.

  AND THE SHARED LISTS, which were the last surface without it and the one
  where it matters most — a mis-tap on a PARTNER's reminder cannot be found
  again in my Completed, and they see it. Three sites tick one (Reminders' All
  view, the shared folder view, Calendar's day panel); all three now go through
  `useSharedTick`.

  Its second tap is not the owned one. An owned tick writes locally and the
  next render reads the new payload; a shared tick is a POST followed by a
  re-pull, so inside the grace the record on screen can still say `done:
  false`. Toggling from it again would send done a SECOND time and finish the
  partner's reminder — the mis-tap "corrected" into itself. The pre-tick
  payload is therefore put aside at the first tap and put back verbatim at the
  second; `release()` returns it rather than offering a getter, so reading it
  after dropping it is not a spelling mistake away.

  The spec for that (`e2e/sharedgrace.spec.ts`) PASSED WITH THE BUG IN when it
  was first written: a loopback server answers so fast the stale window never
  opened. It now holds `shared_pull` for 1.5s inside the grace, which makes the
  race a fact rather than a hope, and both breaks — no grace at all, and the
  near-miss that re-toggles from the stale copy — were watched going red.

### Shipped 2026-08-11 — one line each, on purpose

This section was 696 lines of finished work before it was cut back. The file's
own header explains why that matters: it was rewritten once from 2140 lines
because "that is not a list you can act on", and a list of what is DONE is not
a list at all. The reasoning is not lost — each line below is the subject of a
commit whose message carries the whole argument (`git log --grep`), the code
carries the why beside the code, and the testing lessons are in TESTING.md
where someone writing a test will meet them.

**Bugs found and fixed**

- A non-advancing repeat could never be ticked off — `repeatDates` had the
  guard, `repeatNext` did not.
- The widget feed had its own copy of the repeat expansion, and the same bug;
  the 12-row cap made it twelve identical rows for three weeks.
- The widget feed always spoke 12-hour, ignoring `prefs_suite.clock24`.
- The shared write path never got the equal-stamp tie-break sync had.
- "Undo last delete" offered to resurrect a CONVERSION, not a deletion.
- A drag between two rows sharing an order key threw, unhandled — in
  manage.ts's ten sites and, one round later, the app's two.
- Two devices drew the same account in different orders, permanently.
- `ordBetween` answered wrongly instead of refusing a bound it cannot fit under.
- One bad HTML entity refused a whole recipe import.
- Three drag grips were 16pt wide on the web; half of every note and reminder
  row did not answer a tap at all.
- The note editor's footer said "Saved" whatever had happened.
- A sync that HANGS stacked another every thirty seconds, for ever — and the
  in-flight guard that fixed it was itself half a fix until requests coalesced.
- The service worker's CRITICAL list could silently lose the entry bundle.
- A redirect could change the port out from under a fetch.

**Tests and guards that were not doing their job**

- 33 of manage.ts's 48 error guards were watched by nothing.
- The store's exclusive lock had no test; the passkey UV flag and
  require_auth's anchors had none either.
- `hitarea`'s scans passed clean on a screen that never rendered.
- `habitfreq` proved nothing on Thursdays.
- A test docstring overstated its own fixture by 572KB.
- The WebKit suite was not in the deploy gate.
- The desktop check passed over an eight-hour-old stage and never looked at
  relative asset references.
- The core suite's timezone was the machine's; it is pinned now.
- New checkers: suite counts, feed clock, simulator freshness — and one shared
  `spec/clock.json` for cases that had been typed out twice.

**Audited and found clean** (recorded so it is not re-derived)

- richLines, b64u, the calendar grids, day.ts, watch.ts, habit.ts, normalize.ts,
  sync.ts, update.ts — 151 mutations across core, the server and the Swift the
  checkers extract.
- The per-keystroke watch-feed cost: 4.9ms at 1800 records.
- All eighteen Modals for the safe-area trap; one assumption remains unverified
  and is named in TESTING.md.

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
