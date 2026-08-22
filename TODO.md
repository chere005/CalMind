# TODO — what is still owed

`README.md` is the map, `TESTING.md` is what the tests are worth, `PARITY.md`
is the ledger of what shipped. This is the live list, highest first.
Standing rules live in `CLAUDE.md`, not here.

Compressed 2026-08-19 (1,400 → this), on Sean's word: "cut any old dead
stuff out." The full pre-compression file, with every resolved entry's
history, is the parent of the compressing commit — `git show 7eefa6c:TODO.md`
— and the closed stories live in PARITY.md and the commit log.

**Every compression of this file has tried to lose an open item — three for
three.** The 2026-08-10 rewrite dropped five (recovered 08-12) and the
device-profile expiry with them; the 08-12 compression dropped the
login-throttling decision; and the loss-check before THIS one caught the
store-pruning note, dropped 08-10 and missed by the 08-12 recovery — two
generations lost, found only because the check runs against the OLDEST
file, not the previous one. An item sitting in the wrong section is what a
compression deletes, because compressing is done by section. So the check
is the second half of the job, not optional housekeeping:

```sh
git show 29686f2:TODO.md | grep -n "^\s*- \[ \]"   # the oldest full file
git show 7eefa6c:TODO.md                            # the newest full file
```

Verify every unchecked hit against the source before trusting a compressed
file, and run this as part of ANY future compression.

## Suite counts, as of this commit

core **664** · gesture **276** (+2 skipped: the two live specs) · WebKit **15** · server **63** ·
live **19** with the API · desktop **7** (+3 in `npm run test:desktop`) · deploy guards **22** · plus the four
native seam checkers no browser can reach: `npm run test:watch`,
`npm run test:widget`, `npm run test:deploy`.

`npm run test:counts` checks this line against the suites, so it cannot
drift silently; `live` needs the deployed server and is the one figure still
on trust. The README points here rather than carrying its own numbers.
`npm run test:dev` is the between-runs mini-suite (typechecks, core, server,
counts — ~40s, no browser).

## 1 · Parked on Sean

Each is blocked on his word, not on work.

- **Gmail calendar** needs a Google Cloud project he creates himself. On a
  personal gmail.com account, an app left in Testing mode expires its
  refresh token roughly weekly; escaping that means Google verification,
  onerous for these scopes, with no Workspace "Internal" shortcut. Parked
  until he wants Gmail specifically — subscribe-by-link ICS shipped
  2026-08-19 and covers "read someone else's calendar" today. CalDAV and
  write-back are a different milestone he has de-prioritised ("read only").

- **E2EE envelopes** (P2, 2026-08-19 — "lets discuss e2ee and larger notes
  later"). Design settled, build gated: X25519 + Argon2id-wrapped private
  key, per-container content keys, per-recipient wraps, passkey unwrap via
  WebAuthn PRF, recovery codes required. Changes the password-recovery
  contract, so it does not start until he says go. Today the server
  encrypts payloads at rest and holds the key, which is not the same
  promise.

- **Larger notes, with images** (P2, same word). Not a bigger cap — the
  shape cannot carry it: client and server are both O(whole store) per
  operation, and one 200KB photo inlined base64 costs the snapshot the same
  room as ~187 long recipes, re-serialised on every save, re-sent on every
  sync, on every device, for ever. Ten of them is the entire ~5MB web
  budget. What it needs instead: content-addressed blobs OUTSIDE the record
  set, references in records, upload/download off the sync path, lazy
  fetch + cache, a collection rule, ENC1 at rest — and probably IndexedDB
  on the web. Its own design pass, WITH him, before any code. (The 64KB
  record cap question folds into this conversation.)

- **The oversized-note warning names the record but offers no way to ACT**
  — no jump-to-note, no split. He has not asked for one; recorded so the
  gap is a choice, not an oversight.

- **Meeting-request emails and notifications are STUBS** (his word,
  2026-08-19: "stub in notifications/badges, and also stub in an email
  response"). The email answer logs to `meetreq-mail.log` and sends for
  real the day `send_mail` is configured — same switch as the recovery
  codes; badges/notifications have their number (`meetreqBadgeCount`) and
  no surface. Both flip on when he says.

## 2 · Open bugs

- **A record whose id the server dislikes is dropped SILENTLY.** `handle_sync`
  checks the id against `REC_ID_RE` (`[A-Za-z0-9_-]{1,64}`) and `continue`s
  past anything else — no entry in `rejected`, `ok: true`, and the client
  marks itself synced. Found 2026-08-21 by giving the new availability record
  a colon in its id: the write reported success and nothing was stored, on
  every device, for ever. Nothing in the app produces a bad id today, so no
  data is being lost — but the oversized-payload path already learned this
  lesson and answers `rejected`, and this branch is one line from doing the
  same. (The same `continue` also swallows a bad `type` and `updated <= 0`.)

Nothing else known right now. Before believing a new intermittent WebKit failure,
read the note-focus flake's twelve-occurrence history first
(`git show 7eefa6c:TODO.md`, §2) — it died of a design decision on
2026-08-18, and two rate claims about it were made and retracted on the way.

## 3 · Deliberate non-fixes, recorded so nobody reopens them as gaps

- **Nothing PRUNES the store.** A deleted record keeps its payload as a
  tombstone forever, so deleting a long note frees nothing. Dropping the
  payload on delete looks obvious and is not — the shared-write scope check
  reads the STORED payload, so a null one may refuse a legitimate write.
  Left alone deliberately rather than optimised into a sharing bug.
  (Written 2026-08-09; dropped by the 08-10 rewrite; recovered 08-19 by
  this compression's own loss-check.)
- **Two devices editing from the same starting point** resolve by whichever
  clock is higher, not by who was actually later. Inherent to wall-clock
  LWW; only a server-assigned receipt time would change it, a
  protocol-sized change. Sean's call if it ever shows up in practice —
  `clockdrift.test.ts` pins that the ALARMING cases (stickiness, an
  hour-fast clock beating a later edit) do not exist.
- **`clear_done` stays unported** ("bless hiding", 2026-08-18): the ☑
  toggle is the answer; the suite's clear-completed footer is deliberately
  not wanted.
- **The circular complication shows a bare time for an event days away**
  ("a bare 5 is ok", 2026-08-18). `whenShort` stays; check-watch-format
  pins it.
- **A bare 'COUNT SIZE NOUN' line ('1 2kg whole chicken') still scales
  wrong** ('2 4 kg'). Recognising it means calling every such line a count
  of sized items — a guess about lines that are not in Sean's recipes,
  re-verified against every ingredient line in them 2026-08-19: the shape
  appears in none. Pinned as current behaviour in `tinsize.test.ts`. New
  evidence in a card of his is a question for him, not a green light.
- **Ingredient names keep their adjectives** ('large free range egg' is
  what the thing is called) and **'chili' pluralises to 'chilis'** (real
  English, nothing broken). The pluralisation-through-adjectives bug itself
  was fixed 2026-08-19.
- **Reminders and events will never notify.** Sean, 2026-08-20: "i don't
  want notifications for reminders or events." Not a gap, not deferred, and
  not a thing to re-propose — it was suggested as the biggest functional
  hole in the app and answered directly. This is a calendar you LOOK at:
  the widget, the complication and the day panel are the surfaces, which is
  why they get the care they do. Note the scope — it is reminders and
  events. The MEETING-REQUEST notification is a separate stub (§1) and
  stays on its own switch; its badge shipped 2026-08-20.
- **Three suggested features, answered no** (Sean, 2026-08-21): a global
  search — there already is one; **scaling a recipe by servings** — not
  wanted; a **habits widget/complication** — "the widget and complication
  are already sufficient". Recorded because all three read as obvious gaps
  from the code and are not.
- **The native toast eats one tap at worst** while showing (its window
  dismisses on first touch). The cost of "always on top" on a surface where
  nothing else draws over a Modal; the web keeps full click-through.

## 4 · Steady state, every iteration

- `git pull --autostash` first; stage explicit paths; never `git add -A`.
  Two sessions share this repo.
- **Web first, always**: deploy the web before any device build. Two lanes
  since 2026-08-20, and both mean PROD since 2026-08-21 ("dtp should be prod
  now generally"): **dtp** = `./server/deploy.sh prod test --yes-prod
  --quick` (seconds-cost gates plus a spot test; his word: "even if it means
  some things could occasionally break"), then tag and push; **tdtp** = the
  same command without `--quick`, so every suite runs. Test ships in the
  same command rather than in a second run — the gates are what cost the
  time, and they run once for both. `deploy-test.sh` still exists and is
  still test-only; nothing routine uses it now. A failed deploy in either lane gets fixed BEFORE tagging and
  pushing, never tagged around. Both lanes dispatch the `desktop-windows`
  workflow AFTER the push (CI builds the pushed tree). Windows stays
  untested by hand on his word: "i just want it to stay up to date."
- Keep every suite in the counts above green, including the native four.
  `npm run test:dev` between runs; the deploy runs the browser gates
  itself. One Playwright suite at a time.
- Before trusting a new check, break the thing it guards and watch it go
  red.
- Confirm live test == local dist by comparing `index.html` to
  `index.html` — `dist` holds more than one `index-*.js`.
- Keep `PARITY.md` honest; act on Sean's steering the moment it arrives.
- **Free-team profiles expire every 7 days** (current ones run to
  2026-08-26). A rebuild only renews AFTER expiry — installing early buys
  nothing — and renewal needs the Apple ID session in Xcode (it has been
  lost once: "No Accounts"). A renewal DROPPED the watch from its own
  profile once (0xe8008012): check `ProvisionedDevices` in the embedded
  profile before blaming the tunnel.
- **The watch is installed DIRECTLY, always** — `devicectl device install`
  of `CalMind.app/Watch/CalMindWatch.app` to the watch UDID over Wi-Fi;
  the companion path has never once worked here. Retry loops must log the
  MESSAGE, not the code: tunnel noise (4000, 1011, 3002, NWError 60,
  RemotePairingError 1001) is patience; "device was still locked" (10003 /
  1016) needs Sean's wrist and retrying never fixes it. Prove any install
  by asking the device: `devicectl device info apps`.
- **A device build eats gigabytes of derived data** — delete the previous
  `apps/app/ios/build/dd<N>` once an install lands. Three of them filled
  the disk once, and a full disk kills every shell command including the
  cleanup. Bump `ios.buildNumber` in app.json AND
  `CURRENT_PROJECT_VERSION` (8 places in the pbxproj) or the install is
  unprovable.

## 5 · Back burner — recipes

- OCR keeps improving pattern-wise: pull name + quantity + unit where a
  pattern is visible. Imperfect text is fine (the user fixes it); junk
  non-letter characters are not — `scrubLine()` in
  `packages/core/src/recipe.ts` is the gate, extend it there.
- Keep `recipe-incnotes` honored on every save path if the editor grows
  new ones.
- **His recipes' layout, settled 2026-08-19**: both sets stay — originals
  raw in Recipes·General (never touched; the recipe FLAG is what un-dressed
  them), curated copies flagged `recipe: true` in Recipe Form. The empty
  "Aug 18, 2026 at 5:50pm" note stays on his word. Don't reopen these as
  anomalies.
