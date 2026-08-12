# TODO — what is still owed

`README.md` is the map, `TESTING.md` is what the tests are worth, `PARITY.md`
is the ledger of what shipped. This is the live list, highest first.

Rewritten 2026-08-10. It had grown to 2140 lines of running narrative, and
that is not a list you can act on — four things it still carried as OPEN had
in fact shipped (legend rows grouped by kind, native iOS OCR, URL recipe
import, the watch's month grid), and 68 of its "open" checkboxes were prose
rather than tasks. The old file is in git at `29686f2` if you want the
story. Everything below was checked against the source on the day.

**BOTH compressions of this file lost open items — two for two.** That is
the useful form of the lesson, not "one rewrite was careless".

- The 2026-08-10 rewrite (2140 → 587) dropped five, all recovered 2026-08-12:
  calendar integrations with three unanswered questions, the blocked ssh key,
  the native-passkey probe and its two asks, the widget/watch
  one-push-behind bug, and the unverified PWA bottom gap. The device-profile
  expiry went with them, which is why nobody noticed the apps were four days
  from not launching.
- The 2026-08-12 compression (`58ea89d`, 1034 → 458) dropped the
  login-throttling entry, and its own message says why: it was the one item
  in §3 that was a DECISION rather than work, so it fitted neither the
  "still owed" nor the "shipped" bucket and fell between them.

Both losses have the same shape — an item sitting in the wrong section is
what a compression deletes, because compressing is done by section. So the
check below is not optional housekeeping; it is the second half of the job.

They were found by diffing the older file's UNCHECKED items against this one
rather than by reading it, and 68 of them is more than anyone re-reads. If
something you remember asking about is not here, it may not have been
answered — check before assuming, and run this as part of ANY future
compression rather than after someone notices:

```sh
git show 29686f2:TODO.md | grep -n "^\s*- \[ \]"
```

Verify each hit against the source before re-recording it. Several were STALE
as well as missing: the calendar entry called RRULE "not yet expanded" when
`rrule.ts` had been written since, and its stated expiry date had moved
because of a rebuild.

Standing rules live in `CLAUDE.md`, not here.

## Suite counts, as of this commit

core **500** · gesture **194** (+2 skipped) · WebKit **16** · server **48** ·
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

### The watch app stops launching on 2026-08-16 — four days from now
Not a decision so much as a clock. Free Personal Team profiles last 7 days,
the last device install was build 22 on 2026-08-11, and the apps stop
launching when their profiles expire. Read out of the profiles themselves on
2026-08-12 rather than counted forward from the build:

| profile | expires (UTC) |
|---|---|
| `com.seancheren.calmind.watchkitapp` | **2026-08-16 19:29** |
| `com.seancheren.calmind.watchkitapp.widget` | 2026-08-16 19:31 |
| `com.seancheren.calmind` (phone) | 2026-08-17 02:37 |
| `com.seancheren.calmind.appwidget` | 2026-08-17 18:41 |

So the WRIST goes first, complication with it, and the phone follows about
seven hours later. Renewal is a rebuild and reinstall of both.

The catch, and the reason this is here rather than filed as routine: the
rebuild needs an Apple ID session in Xcode, and the last recorded state of
that was `No Accounts` — xcodebuild had lost it, which is what stopped the
native passkey probe on 2026-08-09 (below). If that is still true, the
renewal hits the same wall on the day the apps stop working. Worth checking
BEFORE the 16th rather than on it: Xcode → Settings → Accounts.

This was written down on 2026-08-09 as "both device profiles expire
2026-08-16" and the rewrite dropped it the next day.

**Build 23 was installed on 2026-08-12 and the dates above did NOT move.**
Checked by re-reading the profiles after the build: a rebuild only renews
when the profile it needs is invalid, and these are still good, so
`-allowProvisioningUpdates` reused them and bought nothing. So installing
again before the 16th does not help — the renewal is a rebuild ON or AFTER
the expiry, and that is the one that needs the Apple ID session in Xcode.
Do not read a fresh install as a reset clock.

### Passkeys from the native iOS app — INCONCLUSIVE, and two asks
RESTORED 2026-08-12; the probe key is still reverted from `app.json`, which
matches what the dropped entry said. Passkeys are web-only by design today —
the screens hide the button rather than offer something that throws.

What the probing established, in order, and both halves are worth keeping:

- `ios.entitlements` SILENTLY IGNORES an associated-domains key. The first
  probe "succeeded" while testing nothing: the signed app, read back with
  codesign, carried no such entitlement. The supported key is
  `ios.associatedDomains` (checked against the SDK 57 docs), and with that
  the entitlement verifiably lands.
- The real probe then failed with `No Accounts` — xcodebuild had lost the
  Apple ID session, so nothing could mint a profile and the capability
  question never actually reached Apple. That is NOT a refusal, and reading
  it as one would abandon the feature on no evidence.

Asks for Sean: (1) re-add his Apple ID in Xcode → Settings → Accounts —
needed for the profile renewal above regardless; (2) the AASA file needs the
PROD domain root, prepared in `server/prod-only/` with instructions, and
ships only on his word. Then the probe is one build away, and if Apple signs
it the rest is the Swift credential bridge.

### ~~Deploys are blocked on an ssh key~~ — CLEARED 2026-08-12
Sean loaded the key. Verified read-only, not by asking the agent but by using
it: `ssh -o BatchMode=yes <dest> hostname` answers `seancheren.nfshost.com`
with no prompt, so the deploy's own transport works.

Worth keeping for the next time it looks blocked: `ssh-add -l` said "The agent
has no identities" in one shell while the key worked in another, so the agent
listing is not the test — the connection is. The blocker had been live and
unwritten-down since 2026-08-09, because the entry recording it was lost in a
rewrite.

### Calendar integrations — three questions, and code already waiting on them
RESTORED 2026-08-12. This was §3d and the rewrite on 2026-08-10 dropped it
whole, questions and all. That is the SECOND entry the rewrite lost — the
login-throttling one was recovered earlier the same way — so if something you
remember asking is not here, `git show dfac36d -- TODO.md` and its neighbours
are where to look, not memory.

It matters more than the average dropped entry because one of the questions
says outright that it should be answered *before any code is written against
it*, and because two pieces of code are already sitting finished and unwired
waiting for the answers:

- `packages/core/src/ical.ts` — 234 lines, 13 tests. Folding, quoted TZID
  params, TEXT escaping, and the three kinds of moment a calendar carries: a
  date with no time, a UTC instant, and a wall clock in a named zone. Zone
  maths probes Intl rather than carrying a table; the tests pin both US DST
  changeovers. Driven with real-world shapes on 2026-08-12 — exclusive all-day
  DTEND, escaped commas, folded lines, TZID and floating times, LF-only line
  endings, lowercase keys — and it was right on every one.
- `packages/core/src/rrule.ts` — 19 tests. `parseRrule` and `expandRrule`,
  covering FREQ/INTERVAL/COUNT/UNTIL/BYDAY and EXDATE, monthly-on-the-31st
  skipping short months, and yearly on Feb 29. The old entry listed this as
  "not yet expanded"; it has been done since, which is another reason not to
  trust a dropped entry's status.

Neither has a single consumer anywhere in the app or the server — deliberately,
since both routes into a calendar hand back the same VEVENTs and neither file
commits to an auth decision. What is blocked:

- **Gmail needs a Google Cloud project Sean creates himself.** On a personal
  gmail.com account, an app left in Testing mode expires its refresh token
  roughly weekly; escaping that means Google verification, which is onerous
  for mail scopes, and there is no Workspace "Internal" shortcut on a personal
  account. Worth confirming before any code is written against it. CalDAV
  calendars carry no equivalent problem and could go first.
- **Subscribe-by-link vs full CalDAV first?**
- **Do imported events stay read-only forever?** This one changes the record
  model, so it is cheaper to answer now than after.

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
- **Habit sections recolour by CYCLING; folders and calendars use the tray.**
  Tapping a habit section's swatch advances one step through the palette, so
  reaching a specific colour means tapping until it comes round. Folders and
  calendars open `SwatchTray` and let you pick. Found 2026-08-12 because
  `HabitSectionManager` still IMPORTED SwatchTray without rendering it —
  a migration that stopped one file short, and the import was the only thing
  that remembered. Removing the dead import erased that evidence, which is
  why it is written down here. Which interaction he wants everywhere is his
  call; they should not stay different.

## 2 · Open bugs

### Habits' edit mode had NO way out on a phone — fixed, UNVERIFIED on device
Found 2026-08-12 by mutation. Every screen leaves edit mode three ways: the
Escape key, a document pointerdown listener, and `EditExit`. The first two
live inside `if (!edit || typeof document === 'undefined') return;` — WEB
ONLY. `EditExit` is the native half, and it renders nothing on the web at
all.

Reminders, Notes and the Calendar are all wrapped in it. Habits was not, and
had no backdrop either. So on iOS a long press opened Habits' edit mode and
nothing closed it: not a tap outside, not Escape, not the listener. Leaving
the tab is the only escape, and it works by accident — the screen unmounts
and the state resets.

The comment in Reminders.tsx describes this exact situation as the bug
EditExit was written to fix ("until now the only way out on iOS was the Done
button"). Habits is the one screen of four that never got it.

FIXED by wrapping its ScrollView the same way, character for character with
its three siblings.

**What is verified and what is not, because the distinction matters here.**
The gesture suite is 181 green after the change — but `EditExit` returns its
children untouched on the web, so that proves only that nothing regressed,
NOT that the fix works. It cannot: the whole mechanism is native-only, and a
mutation that made EditExit do nothing at all passed all 181 tests. That is
measured, not assumed.

So this needs one look on a phone or simulator: Habits → long-press a section
to open edit mode → tap an empty part of the screen → the grips and × should
go. Not done here because `tools/check-sim-fresh.sh` reports three reasons to
distrust what the current simulator would show, and the Metro serving it
started 2026-08-08 and may be the other session's — restarting it is not
mine to do.

### The watch mirrors the widget's selection ONE PUSH BEHIND
RESTORED 2026-08-12 and confirmed still live in the source. Sean reported
shared events on the widget and missing from the watch's first tab. The
four-day-window explanation given at the time was wrong — the events had
reached the wrist and were on the Events tab all along.

The actual cause, and `apps/app/src/watch.ts:63` states it plainly: the
widget's calendar selection rides along with each push, "read fresh on every
push: the widget rewrites it whenever its configuration changes, **and
nothing notifies the app when that happens**." So changing the widget's
selection leaves the watch mirroring the old one until the app pushes again
for some unrelated reason — at which point it corrects itself, which is
exactly what gets a bug reported as intermittent and then not believed.

Left as a decision rather than fixed on the spot because it changes sync
timing. PARITY.md:1412 says it was "written down in TODO"; it was, and the
rewrite dropped it, which is how a known bug becomes a mystery twice.

### The installed PWA's bottom gap is still UNVERIFIED
RESTORED 2026-08-12. Sean reported a black gap below the tab bar in the
installed home-screen app. It was never reproduced: on the simulator in real
standalone the tab icons centre at ~96.7% of screen height, against ~85.9%
in his screenshot, so his layout was sized to a shorter screen and the
likeliest reason was his install running old code — an installed iOS web app
keeps the page it has.

Two things have changed since, and neither closes it:

- A `dvh` fix DID ship (`tools/patch-web-html.mjs` — `@supports
  (height:100dvh)` on html, body and #root). Nobody has confirmed it against
  the device that showed the gap. It is the fix for the symptom, unverified.
- The viewport read-out that was supposed to settle it is GONE. Sean saw it
  in Settings, called it spurious, and it was removed (`bd59af7`) — rightly,
  since the numbers it showed him said `standalone no` and `safe area bottom
  0`, so it was not even capturing the case it existed for. That commit says
  it plainly: "The bottom gap stays unverified either way."

So the settling step written down in the old entry — re-add the icon and
screenshot the three grey lines — cannot be followed: there are no lines to
screenshot. What is needed now is one look at the installed app after a
deploy carrying the dvh fix, and deploys are blocked (§1).

Also never explained, and not to be guessed at: his 393x852 against the
simulator's 402x874 is a different device size, and it cannot be ruled out
that the gap only appears at his.

Separate and still unfixed, noticed in the same investigation: the installed
web-app icon is the site-wide "SC" mark rather than CalMind's. The deploy DOES
add `apple-touch-icon` (deploy-test.sh:235) and iOS was not using it.
Cosmetic.

### The new-note focus is a 50ms race (WebKit only)
STILL LIVE, and the count is 8 in ~47 full runs: it recurred on
2026-08-11 and five times on 2026-08-12, all at `app.spec.ts:359` ("note body
renders its markers as styled text when you tap away"), each time passing
in isolation and clean on the very next full run. Consistent with
everything below — and worth knowing that the line number moved, so anyone
searching for :353 will not find it.

The seventh is the best example yet of why the protocol exists: it failed the
WebKit gate of a REAL deploy, in the same session that changed the note
editor's focus and title handling — the one change most likely to have caused
it. It had not. Five isolation runs and a clean 16/16 WebKit suite said so,
and the deploy went through on the retry. Four minutes to tell a flake from a
regression, spent at exactly the moment it is tempting to skip.

The EIGHTH came the same afternoon, on the WebKit gate again, after the
Scriptable removal and the habits change — a different set of changes, the
same line, cleared the same way (5/5 isolated, 16/16 full). Twice in one
session is within a rate of roughly one full run in six; it is not evidence
that anything got worse.

The 2026-08-12 recurrences are the useful ones: the first landed in the same
run as a sweep that touched every screen, which is exactly when a flake is
easiest to mistake for the change. Isolation and a clean re-run are what
separate them, and they cost four minutes.

**The rate did NOT change — that was a cluster, and measuring said so.**
The two failures on 2026-08-12 arrived within four runs of each other, which
looked like the rate jumping from 1-in-8 to 1-in-2 and got written down as
such. Fifteen consecutive clean runs followed on the same machine the same
afternoon. Over the day it is 2 in 19, which is the rate it always was.

Worth keeping because it cost nothing and rules things out. Measured
2026-08-12, all full WebKit runs, all clean:

- **10 runs on a quiet machine** — nothing else running.
- **4 runs under 8 busy loops** on an 8-core machine, run time pushed from
  26s to 28s so the load was real. A 50ms race that CPU starvation does not
  move is a useful thing to know: it points away from "the machine was busy"
  and towards something in the page's own sequencing.
- **1 run immediately after a full 7-minute gesture suite**, which is the
  condition the failures keep sharing — all three on 2026-08-12 came
  straight after one. That single control run passed, so it is a correlation
  with one counter-example and not a reproduction; it is the next thing to
  test properly, with several runs rather than one.

So two plausible causes are eliminated and the obvious third — that the
day's changes moved the timing — is unsupported: those changes were removals
of dead code, and 15 runs of the changed tree came back clean.

The practical note stands, inverted: at ~1 in 10 this is expensive to bisect
by re-running, and the failures CLUSTER, so a single red run says very little.
Confirm with isolation plus a clean full re-run before believing it is
anything but this.

Ruled out 2026-08-11: the note editor's status dot, which was new that day and
the obvious suspect — a clean A/B on the same spec passes with it and without.

THE MECHANISM, read out of the code 2026-08-12 (reasoned, not demonstrated):
`setBodyEditing(true)` mounts the body and `setTimeout(…, 50)` focuses it once
it exists. A spec that fills the body and clicks the TITLE inside that window
gets the focus stolen back when the timer fires, so the body never blurs, the
`onBlur` collapse never runs, and `note-body-view` never appears — which is
exactly what :359 asserts. The 50ms is not tuned to anything; it is a guess at
how long the mount takes.

Also worth knowing before the next attempt: the title has NO `autoFocus` any
more, only `selectTextOnFocus`. The body's comment about "title wins the race,
body blurs, and onBlur collapses the editor" describes a state that no longer
exists, so that particular objection to focusing the body earlier is stale.

An attempt was made and reverted the same night. Focusing at mount through the
ref, plus cancelling the pending timer when the title takes focus, is the
obvious shape — and the second half is precisely the "focus being stolen back"
that three specs depend on, so it cannot be done without answering the design
question above. It is not a patch.

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

- **The circular complication shows a bare time for an event days away.**
  `whenShort` (ComplicationWidget.swift) drives accessoryCorner and
  accessoryCircular. Its rule is "the circle has room for one thing": the
  time if there is one, else the day. So an event on the 15th at 5pm reads
  **"5"** — identical to one today at 5pm, and the phone sends the next 30
  events, so a next-two that is days out is ordinary rather than rare.

  `when`, its wider sibling in the same file, argues the opposite in its own
  comment: "A date appears exactly when it is not today, which is when it
  carries information." One of the two is wrong and only Sean can say which,
  since it is his face and the circle really does hold one thing.

  Found 2026-08-12 by listing the Swift functions no checker runs — this was
  the only formatter in that file nothing exercised. Its current behaviour is
  now pinned in `check-watch-format.sh`, including this case, so whichever
  way he decides the change is deliberate rather than drift.

- **The desktop shell ships with `"csp": null`.** `desktop/src-tauri/tauri.conf.json`
  sets no Content Security Policy, which Tauri treats as "inject nothing".

  The blast radius is small and worth stating so nobody panics or ignores it:
  the Rust side is `tauri::Builder::default().run(...)` with no commands, no
  plugins and no features, so a webview here reaches no filesystem, no shell
  and no IPC — it is about as capable as a browser tab. The app also loads its
  JavaScript from the bundled export rather than the network, and the API
  returns JSON, not scripts.

  Not done because it cannot be verified from here. A strict policy has to
  allow what react-native-web actually does — it injects styles at runtime,
  and the patched index.html carries an inline `<script id="calmind-sw">` —
  so getting it wrong shows up as a blank window, and proving it right needs a
  Tauri build (Rust, minutes) rather than a re-export. Whoever does it should
  build and open the window, not read the config and assume.

  Checked at the same time and clean: the deploy publishes nothing it should
  not (no source maps, and Expo's metadata.json is 49 bytes of empty
  fileMetadata), web.htaccess gets index.html, the manifest and sw.js
  no-cache while the hashed bundles are immutable, and the api directory ships
  its own .htaccess carrying `CGIPassAuth On`, without which every bearer
  token would arrive empty.

- **A shared calendar cannot be isolated; a shared folder can.** Found
  2026-08-12, and left alone because the fix needs one visual decision that
  is Sean's.

  Every other row in every picker isolates on a tap — press a folder, a
  shared folder, a calendar, or (since today) a habit section, and you see
  only that one. `CalendarPick`'s shared row is a plain `<View>`
  (CalendarPick.tsx ~133) where `FolderPick`'s is a `Pressable`
  (FolderPick.tsx ~130). Pressing a partner's calendar does nothing.

  The suite isolates it too, by a different route: `cal_vis_only` builds its
  hidden list from `array_merge($calList ids, $sharedIds)` — mine AND theirs
  — and the row is an ordinary link to `?cal=<id>`. Worth knowing that the
  MODELS diverge here rather than assuming a straight port: the suite gives a
  shared calendar no show/hide box at all (it renders a `cvis-pad` in its
  place), while CalMind gives it one backed by `hiddenShared`. So CalMind has
  more than the suite in one direction and less in the other.

  Why it is not a one-line fix, and the part that needs deciding: the
  calendar's `lastView` can only ever name one of MY calendars
  (`ids.has(prefs.lastView)`), so isolating a partner's has to be expressed
  as hidden + hiddenShared instead. That works — but the picker's button
  draws `visible.map(colors)`, my visible calendars only, so a view holding
  nothing but a partner's calendar would leave the button blank. Either the
  pie learns to include visible shared calendars, or isolating a shared one
  stays out. That is a call about what his own top bar shows.

- **`clear_done` was never ported, and nothing was tracking that.** Found
  2026-08-12 by listing the reference suite's POST actions and checking each
  against CalMind: reminders has `add`, `add_subtask`, `clear_done`,
  `delete`, `duplicate`, `edit_full`, `toggle`. Six are here. `clear_done`
  appears nowhere in the app, core, PARITY.md or this file.

  What the suite does (`reminders/index.php`, the `clear_done` case and the
  footer at ~1942): a footer appears ONLY when something is done, its button
  reads "Clear N completed", it confirms with "Clear completed reminders?",
  and it removes done reminders **in the folder being viewed — or in every
  folder when the view is All**. Sections are never touched.

  CalMind hides done rows instead: `showDone` starts false and the ☑ in the
  header toggles them. That is why the gap is easy to miss — they are out of
  sight rather than gone. They still accumulate for ever, still sync on every
  round trip, and there is no way to remove them but one at a time.

  Worth deciding before building: hiding them may be the better answer and
  the suite's footer may simply not be wanted. But the choice should be made,
  not arrived at by nobody noticing.

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

  MEASURED 2026-08-12, so the argument stops being qualitative. Snapshot cost
  per record, real records through the real engine:

  | record | bytes in the snapshot | fit in 5MB |
  |---|---|---|
  | reminder, short text | 229 | ~22,900 |
  | reminder, typical text | 279 | ~18,800 |
  | note, a small recipe | 265 | ~19,800 |
  | note, a long recipe with method prose | 1,427 | ~3,675 |

  Halve those if the browser counts its quota in UTF-16 units rather than
  bytes, which several do. So the TEXT headroom is comfortable — thousands of
  recipes either way — and this entry is not about running out of room today.

  It is about what ONE image costs. A 200KB photo, base64'd into a record,
  is about 267KB of snapshot: **the same room as 187 long recipes, or 950
  typical reminders**, re-serialised on every save and re-sent on every sync,
  on every device. Ten of them is the entire budget. That is the number that
  makes "just inline it" a non-starter, and it is worth having in hand before
  the design pass rather than after.

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

### Shipped 2026-08-12 — one line each

- **The Scriptable widget was removed ENTIRELY**, on Sean's word. Gone: the
  script, its setup page and the Settings button that opened it, the server's
  `widget_token` action and read-only GET feed with their token store, and the
  tests for all of it (7 server, 2 gesture, the core suite that executed the
  script). The NATIVE home-screen widget is untouched and is now the only one
  — it reads the App Group, never that feed, which is what made the removal
  separable. Two questions in §1 died with it: which folder rule the feed
  should obey, and whether to store the token so it could be re-shown.

- The item sheet PUT BACK a record deleted on another device. It was handed a
  snapshot rather than an id, so the 30s pull took the row away underneath it
  and Save wrote the snapshot back with a fresh stamp, beating the tombstone
  on LWW. It now leaves when its record does, which is what the note editor
  already did — `e2e/zombiesheet.spec.ts`.
- Typing a NEW note's title lost the first letter. The select-all raced the
  click's own caret placement and arrived a keystroke late, so the letter
  landed mid-title and the next key replaced everything. A title nobody has
  written is a PLACEHOLDER now: nothing to select, nothing to race.
  `e2e/titlerace.spec.ts` is no longer a fixme, and it still goes red against
  the old field.

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
  are still missed — the quantity IS found, it is the name that keeps its
  adjectives. Nothing is pluralised there either, because the rule only counts
  a word whose preceding words are participles ('2 dried chili' → '4 dried
  chilis', which the entry here used to say did not happen; it does).
- The '1 x 400g tin' shape is CONFIRMED, 2026-08-12, along with the other
  three ways to write it — see `packages/core/test/tinsize.test.ts`. Driving
  the claim instead of re-filing it found a real bug: the bare
  '1 400g tin chopped tomatoes' doubled to '2 800 g tin', four times the
  tomatoes. Fixed; the guard tested only for a literal 'x' rather than for
  what the 'x' meant.
- Still open from that, and deliberately not guessed at: a sized item with NO
  container word — '1 2kg whole chicken' — doubles to '2 4 kg', the same
  four-times shape. Recognising it means calling every bare 'COUNT SIZE NOUN'
  a count of sized items, which is a guess about lines that are not in Sean's
  recipes. Pinned as current behaviour in that test rather than changed.
- Keep `recipe-incnotes` honored on every save path if the editor grows new ones.
