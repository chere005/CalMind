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

core **401** · gesture **156** (+1 skipped) · WebKit **16** · server **48** ·
live **19** with the API · desktop **7** (+3 in `npm run test:desktop`) · deploy guards **9** · plus the four
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

- ~~**`Pill` announces itself as nothing**~~ — FIXED 2026-08-11, and it was
  never this line's fault. The role is one line and had been added and
  reverted THREE times because `copymd.spec` failed with it. The cause was in
  the spec: it decided whether signup had worked the instant after clicking,
  while the request was still in flight, so it took the "name taken" branch on
  a form that was about to be replaced. That race passed for as long as a bare
  div let Playwright click a control it should have refused — the role only
  made an existing bug visible. Waiting for the outcome first fixes it, and
  the role then lands with the whole suite green. Proven by putting the race
  back with the role on and watching it fail again.

  The lesson is worth more than the fix: three reverts, and each time the
  evidence said "the change broke the test" when it was "the change stopped
  the test getting away with something".

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

- **Three drag grips were 16pt wide on the web; they are 28 now.** Found by
  extending `tools/sweep-tap-targets.mjs` to EDIT MODE, which it had never
  entered — everything it measured before was what the screens draw at rest,
  so every grip, the habit pencil and the note row's buttons were invisible to
  it. Reminders' `row-grip` sat at 16×16 while `sec-grip` two hundred lines
  above it measured 28×28, in the same file, off the same `rowGrip` style: the
  difference was one `<WebHitSlop slop={6} />`. Both of Habits' grips were the
  same, which matters because dragging between sections is what Sean asked
  habits for.

  This is CLAUDE.md's `hitSlop` trap exactly. All three carried `hitSlop={6}`
  and read as fixed; it is a no-op under react-native-web, so the handle was
  as big as the `≡` and no bigger. Reading the source would have said they
  were fine — measuring said otherwise.

  The four new passes each print whether they actually got in. They all
  reported false at first: chained on from the recipe editor the tab clicks
  were landing on the open editor, and Reminders had no row to hold on a fresh
  account. Both were silent, because every click in the sweep is
  `.catch(() => {})` — a pass that never arrives measures the resting screen a
  second time and reports it clean.

- **Half of every note and reminder row did not answer a tap.** Notes draws a
  row 44pt tall and Reminders 36; the Pressable inside each — `note-row`,
  `rem-body` — is a flex child with no height of its own, so it collapsed to
  its single line of text at 18pt and sat centred. The 26pt (Notes) and 18pt
  (Reminders) around it look exactly like the row because they ARE the row,
  and they did nothing.

  Invisible to every test in the suite, and it would have stayed invisible: a
  test clicks the centre of what it means to click, and the centre always
  worked. It came out of the same sweep run as the grips above.

  Notes takes `alignSelf: 'stretch'`. Reminders needed the row's
  `paddingVertical: 8` moved INTO rowBody as well — on the row it was space
  the row owned and would not answer. Both rows still measure 36 and 44
  resting, the reminder row still measures 36 while its inline editor is open
  (`editField` sets its own `height: 20`), and a wrapped two-line row still
  comes out where it did.

  `e2e/rowdead.spec.ts` clicks 15pt (Notes) and 12pt (Reminders) from the row's
  own CENTRE — outside the 9pt half-height of a collapsed press box, inside
  the row's — never as an offset from an edge, which lands inside the element
  whatever size it is. Both were watched failing before the fix.

  Calendar's day panel had it too and got the stretch only, measured 18 -> 22
  in a 30pt row. Its remaining 8pt is the row's own `paddingVertical: 4`, and
  that is left alone DELIBERATELY: not every row in the panel has a body
  Pressable — a partner's reminder is a tick and some text — so moving the
  padding inward the way Reminders did would shorten those and leave the panel
  with two row heights.

- **The sweep now detects the dead-band CLASS, not just the three instances.**
  Notes, Reminders and Calendar each grew the same bug independently, which is
  the argument for a detector: it reports any element materially shorter than
  the centring flex row it sits in. It REPORTS rather than flags, because the
  DOM cannot say which divs are Pressables — react-native-web only sets
  `role="button"` when `accessibilityRole` is given, and a row body does not —
  so a padded heading looks identical from there. Two survivors were triaged
  and are both fine: `cal-day-title` is a `<Text>`, and `rem-edit` is the
  inline field, whose 20pt height and blur-to-save are deliberate.

  It also reaches the Add page, Settings and the sharing sheet now, none of
  which it had ever opened — every earlier measurement was a list screen. That
  found the 12h/24h toggle at 28pt; it is 34 now, by real padding rather than
  a `WebHitSlop`, because `clockSeg` sets `overflow: 'hidden'` (which clips an
  overlay) and the two segments sit edge to edge (so overlapping slop would
  blur the boundary in the one control that must not be ambiguous).

  Two things learned about the tool itself. Settings and the sharing sheet open
  OVER the current screen and it stays in the DOM, so opening them from a list
  re-measures that entire list and buries whatever they contribute — they are
  opened from the near-empty Add page for that reason. And **the Add page
  carries no testIDs at all**, so it cannot be probed and no spec can pin it;
  its Pills are measured through the role selector, but its three kind cards
  and its Done are plain Pressables and stay invisible. Measured by hand off
  their styles they are ~86pt and ~50pt, which is why that gap is recorded
  rather than closed.

- **A non-advancing repeat could never be ticked off.** `repeatDates()` grew a
  guard for `{ n: 0 }` and for units this build has never met; `repeatNext()`,
  its sibling and the function a TICK goes through, did not. So such a record
  DREW correctly as a one-off while `reminderToggle` rolled it to the day it
  was already on and left it undone — a row that absorbed taps for ever, in the
  app, the widget and on the wrist.

  The guard is one exported predicate now, `repeatAdvances()`, asked by both
  walkers so they cannot silently disagree again — which is exactly how this
  happened. `reminderToggle` finishes such a reminder like any one-off.

  The shared vectors gained the two `next` cases they were missing; `window`
  had three from the earlier fix and `next` had none, which is the divergence
  written down. Note what those vectors do NOT cover: `repeatNext`'s own early
  return changes no result for any input — with it or without it the answer is
  `start` — so nothing can distinguish it and the code says so rather than
  implying it is guarded. The behaviour that IS guarded is `reminderToggle`'s,
  and removing its check turns two tests red.

  **THAT CLAIM WAS WRONG, and the correction is the interesting part.** It was
  made by grepping for a named function (`repeat_next|repeat_step|function
  repeat`) and the feed's expansion is an inline CLOSURE — `$expand`/`$step` in
  `handle_feed` — so the grep could not have found it however carefully it was
  read. See the entry below for what it cost.

- **"Undo last delete" offered to resurrect a CONVERSION.** Undo is defined as
  the newest tombstone, which is a good definition and why it needs no
  bookkeeping — but a tombstone is not always a deletion. `convertToNote`,
  `convertReminderToEvent` and `convertEventToReminder` each write the new
  record and tombstone the old one, so any conversion left the freshest
  tombstone in the account. Undo took it, brought back the thing that had been
  converted AWAY while the converted copy was still there, and named the
  original in the message as though the user had deleted it. One item asked
  for, two received.

  Those tombstones carry `superseded` now and `lastDeleted` skips them.

  THE SERVER HAD TO CHANGE TOO, and this is the part worth remembering: the
  sync handler REBUILDS each record from a fixed list of keys, so any other
  top-level field a client sends is dropped without a word. A client-only fix
  would have worked on one device and silently stopped working on the first
  round trip. `app.php` names the field now, writes it only when true (so
  older records are untouched byte for byte), and still drops everything it
  does not recognise — there is a server test for each of those three
  statements, because "the flag comes back" passes just as well against a
  server that stamps EVERY record superseded.

  Any future record-level field needs the same server change. The wire shape is
  closed at the top level; only `payload` is opaque.

  Both halves were broken and watched going red. `superseded` is deliberately
  NOT part of content in `sameContent` or `rec_same`: it says why a record
  went, not what it holds, and never changes after the tombstone is written.

- **The shared write path never got the equal-stamp tie-break.** Sean decided
  on 2026-08-11 that the server arbitrates a tie, because it is the one thing
  both devices agree on. That went into the sync handler; `shared_put` kept
  strictly-newer, so the identical tie resolved two different ways depending on
  whose store was being written. A tick on a partner's row that stamped equal
  to their own last edit was DROPPED while the API replied ok, and the
  reconcile pulled their untouched copy straight back — a tap that did nothing
  and said nothing.

  Same rule now, and compared against what would actually be stored (the
  sanitised `$payload`) rather than the raw request, so the answer cannot turn
  on a shape that is about to be discarded. Both halves broken and watched
  going red: without the tie the write is lost, and without the CONTENT half an
  echo bumps the partner's sequence and re-broadcasts itself to every device on
  every sync.

  The third sibling of that decision is fine and was checked: a conversion can
  never reach `shared_put`, because ItemModal's shared branch returns early
  with a freshly built record and never touches convertToNote and friends. So
  `superseded` does not need to travel this path.

- **The widget feed had its own copy of the expansion, and its own version of
  the same bug.** `handle_feed` expands repeats in PHP rather than reading
  core, so core's non-advancing guard never reached it: every step returned the
  start, `$d > $to` never tripped, and the same day was pushed 400 times.

  The 12-row cap is NOT a defence, which is the part that makes this bad. The
  cap is spent day by day from today forward, so one such record took all
  twelve and every later day got none — twelve copies of one row for three
  weeks, and nothing else in the widget at all. Proven: the row listed 12
  times and the reminder three days out never appeared.

  Both non-advancing shapes are covered, including the one where the port
  could have differed: PHP reaches an unknown unit through `match()`'s
  `default`, where the TypeScript falls through to its month/year branch. A
  missing `n` or `unit` lands there too.

  THE SWEEP, done properly this time rather than by grepping for a name:
  TypeScript has exactly one expansion (`repeatDates`), and the native widget
  and the watch both reach it through `dayItems`, so they were always guarded.
  PHP had the second. Swift has none — its only date arithmetic is the month
  grid's layout.

- **The widget feed always spoke 12-hour, whatever the account had set.**
  Every other surface reads `prefs_suite.clock24` — the app through
  `useClock24`, the watch and the complication through `watchFeed`, which
  carries the flag out to Swift. The feed formats times itself, in PHP, and
  ignored it. That is the straggler that makes a per-account preference feel
  unreliable: you set 24-hour and one surface in four keeps disagreeing.

  It follows core's `timeLabel` exactly now, including the part that looks
  like an inconsistency: 24-hour keeps the leading zero and the minutes ALWAYS
  ('09:00'), because dropping ':00' is a 12-hour habit and '9' on a 24-hour
  clock reads as a number rather than a time. Both halves broken and watched
  going red — removing the branch, and forcing it always-on.

  Found by finishing the audit of `handle_feed` instead of stopping at the
  repeat expansion. That function re-implements THREE things core also does:
  repeats (fixed), time formatting (fixed) and the folder gate — see §1, which
  is a decision rather than a bug.

- **The feed's clock is gated now — it was the FOURTH copy of that rule and
  the only ungated one.** The watch app's `WatchFormat` and the complication's
  twin check each other in `npm run test:watch`; core's `timeLabel` is the
  TypeScript one; `handle_feed` has a fourth, in PHP, because it formats its
  own rows rather than reading core. Nothing ran it against anything, and it
  was found already diverged (see the clock24 entry above) — which is
  TESTING.md's own rule catching up with a copy nobody had noticed:
  duplication that nothing checks is duplication that drifts, and this drift
  reads as a time showing one way on the home screen and another in the app,
  which nobody reports as a bug.

  `tools/check-feed-format.sh` extracts the REAL closure out of app.php —
  nothing re-typed, so a change to the implementation is what gets run — and
  puts it through the same cases `check-watch-format.sh` gives
  `WatchFormat.clockFull`, plus the 24-hour rule from core. It also asserts
  the two branches DISAGREE at 15:30, since one quietly becoming the other
  passes every case otherwise.

  Broken two ways and watched going red: dropping the 24-hour leading zero,
  and `$h % 12` without the `=== 0 ? 12` — the classic that turns midnight
  into '0am' and noon into '0pm', which is exactly the case TESTING.md calls
  out as catching 12-hour clocks out.

  It runs in `npm run test:feed` AND in the deploy gate, unlike the Swift
  checkers: those guard code this script does not ship, and this guards code
  it does.

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
