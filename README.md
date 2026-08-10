# CalMind

I haven't been quite happy with subtle things like not being able to have reminders from previous days on the calendar not continue to show until they are checked off.. I also wanted to tie together reminders, notes, and my calendar.. I also like enforcing date and time patterns.

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

One codebase for web, iOS, Android and a macOS desktop shell — plus a SwiftUI
watch app, a watch-face complication and an iPhone home-screen widget — for the
CalMind suite: Reminders, Calendar, Notes, Habits and Add, at full feature
parity with the plain-PHP suite at
[chere005/seancheren-site](https://github.com/chere005/seancheren-site) whose
successor architecture this is. Everything the product *does* is written once,
in TypeScript, and every surface renders it: the outline drags, the repeat
rolls, the four full themes, mutual-consent sharing with live ticks, recipes
read out of a photo or a URL, the Scriptable widget with its setup page, the
?tick= quick-done, and the watch and widget feeds — all proven by the harnesses
in `TESTING.md`, which is the map of which one watches what. `PARITY.md` is the
build ledger and `TODO.md` is what is still owed, including the current test
counts.

## The map

```
packages/core/     The brain, shared verbatim by every surface: the
                   slash-only US-order parser (and the relative words people
                   actually type — tomorrow, in 2 weeks, in 30mins), repeats
                   with month/year clamping, undated-first outline-block sort,
                   fractional order keys, shape normalization, and the LWW sync
                   engine. Also the recipe reader — OCR text into ingredients
                   and steps, and the scaling that halves or doubles them — the
                   rich-text and markdown shaping, base64url, and iCalendar
                   parsing with RRULE expansion for reading somebody else's
                   calendar. No dependencies, no build step — consumed as
                   TypeScript source. Its test suite replays spec/*.json.
spec/              The behavior contract, carried over from the suite — the
                   same vectors the Swift and Kotlin native cores replay.
                   Changing a behavior starts HERE.
apps/app/          One Expo (React Native) app → iOS, Android, and web
                   (react-native-web). Screens, gestures and styling only;
                   all behavior is imported from @calmind/core.
apps/app/modules/watch-bridge/   iOS-only native module: WatchConnectivity
                   push, the watch's check-offs back, and the home-screen
                   widget's queued ticks.
apps/app/targets/  Apple targets GENERATED into the Xcode project by
                   @bacons/apple-targets — the SwiftUI watch app (four pages,
                   and it checks items off; no longer read-only), the
                   watch-face complication, and the iPhone home-screen widget.
                   Directory ORDER matters: the plugin embeds in sort order,
                   which is why 'appwidget' and 'watchwidget' are named as
                   they are.
apps/watch/        A signpost only — one README, no code. Kept because
                   'watch' is what you search for; it points at the three
                   places the watch actually lives.
server/            The sync API in PHP — deployable to NearlyFreeSpeech
                   unchanged. A dumb store with auth — passwords, and passkeys
                   via WebAuthn written by hand, since the host has no
                   composer: it merges by clear metadata and stays out of
                   payloads, except where sharing
                   must scope a partner's reads and row-writes to the
                   containers they opted in (both lists must name each other,
                   re-checked on every request).
e2e/               Playwright: the exported web app + the real PHP API on a
                   scratch dir, driven by real mouse events.
tools/             The checks no browser can reach, plus the export's own
                   plumbing: the two Swift seams (core's JSON through the
                   wrist's and the widget's REAL decoders and their drawing
                   logic), the App Group rule, the deploy guards proven by
                   breaking copies, the web-head patch every export needs,
                   the tap-target sweep, and the Scriptable widget script.
desktop/           CalMind Desktop — a Tauri 2 shell around the identical web
                   export. Rust opens the window; everything else is the
                   shared code. macOS builds locally (desktop/README.md);
                   Windows builds on the manual `desktop-windows` GitHub
                   Actions job.
```

`server/prod-only/` is the one exception to "nothing here goes to prod": the
`.well-known` passkey pair, which only works at the apex. It has its own
README and its own script.

## The sync model

Local-first. Every client keeps the full store and renders from it instantly;
the server reconciles. One request shape:

```
POST api/index.php   { action: "sync", cursor: N, changes: [Rec...] }   (Bearer token)
  →                  { ok: true, cursor: M, changes: [Rec...] }
```

A `Rec` is `{ id, type, updated, deleted?, payload }`. Merging is per-record
last-write-wins on `updated` (ties keep the incumbent, so echoes are no-ops);
`cursor` is a per-user sequence number, so a pull is only ever the tail.
Deletes are tombstones. Drag order is a fractional key ON each record
(`payload.ord`), never array position — array position cannot survive
per-record merging.

**The envelope.** Sync metadata stays in the clear; `payload` is opaque to the
server (it stores it encrypted at rest, suite-style `ENC1:` AES). The E2EE
milestone — client-derived keys, wrapped DEKs, recovery codes — encrypts
`payload` alone: the protocol, the server, and the merge rules do not change.

**Auth.** Passwords are `password_hash()` only — nothing recoverable is stored.
Bearer tokens, hashed at rest, revoked wholesale on password change/reset.
Recovery is a 6-digit emailed code (15 minutes, 5 tries); without mail config
codes land in `data/mail.log`, which is also how the server tests read them.

## Running it

```sh
npm install                                  # once, at the root
npm test                                     # the two fast ones: core + server
npm run test:core                            # vitest, incl. the spec/*.json replay
npm run test:server                          # boots php -S on a scratch dir, drives real HTTP
npm run test:e2e                             # exports the web app, then drives real gestures
npm run test:e2e:fast                        # …the same, against the export already built
npm run test:webkit                          # the spine + the header rules, in Sean's engine
npm run test:watch                           # the two Swift copies agree, and the wrist
                                             #   decodes and DRAWS what core actually sends
npm run test:widget                          # the phone widget decodes and draws what core
                                             #   sends, and no App Group key is read with
                                             #   no writer on the same device
npm run test:deploy                          # the deploy guards, proven by breaking copies
./desktop/smoke.sh                           # macOS: builds, carries THIS export, runs, quits
node tools/sweep-tap-targets.mjs             # every clickable box on the web, in points
                                             #   (wants dist served on :8791 — see its header)
php -S 127.0.0.1:8788 -t server/public       # the API
npm run web                                  # Expo web on :8081 (proxies nothing — talks to :8788)
npm run export:web                           # the dist the e2e suite and both shells run on
cd apps/app && npx expo start                # then i / a for the iOS / Android simulator
```

`export:web` is the export PLUS `tools/patch-web-html.mjs`; a bare
`expo export` ships an `index.html` with no manifest and no status-bar metas,
so nothing should call it directly. The gesture run refuses to start against a
stale `dist` rather than lying in either direction.

Counts live in TODO.md's steady-state line rather than here, because a number
written into prose is a number that goes stale — this file said 145 for a good
while after it stopped being true.

**Times.** One setting on 'suite' (Settings → Time format) switches 12- and
24-hour, and all four surfaces honour it: web, iOS, the watch and the
home-screen widget. It syncs like the theme, so it is chosen once. The watch
and the widget are separate processes in another language and cannot read a
pref record, so `watchFeed` carries `clock24` and each decoder sets its own
copy — three implementations of one rule, which is why
`tools/check-watch-format.sh` runs both Swift copies against the same cases.

Where the app finds the API (`apps/app/src/config.ts`): the deployed site and
the e2e router use same-origin `api/`; metro dev uses `127.0.0.1:8788`; the
iOS/Android sims and the desktop shell default to the LIVE test instance —
same data and logins as the site — with a Settings override for local work.
The Apple targets (watch app, complication, home-screen widget) are
generated by `expo prebuild` from `apps/app/targets/*` — `ios/` is
gitignored and disposable. Prebuild CLEARS `ios/` before running pods, so
back it up first if a device build matters that day; a target whose bundle
id has never been registered will fail to sign and, because extensions embed
in the host app, will block every build until it is. `ios.buildNumber` in
`app.json` is HAND-bumped and worth bumping: every build used to be
`0.1.0/1`, so "is the thing I just installed actually on the device?" had no
evidence either way. The watch app picks it up through
`CURRENT_PROJECT_VERSION`, which is the only reason it was possible to see
that iOS had left the wrist on an older build than the phone.

## The three environments

Only one of them is a deploy.

| | where | how |
|---|---|---|
| **dev** | a local `php -S` on 8788, data in `server/data/` (gitignored, or `$CALMIND_DATA_DIR`) | nothing — it's a process on your Mac |
| **test** | `https://seancheren.com/test/calmind/` — the only deployed instance of this app | `./server/deploy-test.sh` |
| **prod** | `https://seancheren.com/` is the **old PHP suite**, not this app | `./server/deploy-prod.sh`, which ships the `.well-known` passkey pair and nothing else |

There is no production instance of this app. `/calmind/` and `/dev/calmind/`
on that domain are the old suite's areas, still live; `deploy-test.sh` names
them explicitly and refuses. The one thing CalMind legitimately puts at the
production root is `apple-app-site-association` plus the `.htaccess` that
gives it `application/json` — iOS will only fetch that from the apex, and a
wrong first serve is cached for hours.

```sh
./server/deploy-test.sh --dry-run   # preview
./server/deploy-test.sh             # lint + tests, expo export, rsync
./server/tools/smoke-live.sh        # …then prove the DEPLOY, over real HTTPS

./server/deploy-prod.sh --verify    # what is prod serving right now?
./server/deploy-prod.sh --yes       # only when Sean has said prod, in that message

sh tools/check-deploy-guards.sh     # prove the guards by breaking copies
```

Both need `server/deploy.conf` (gitignored) with `SSH_DEST` — copy
`server/deploy.conf.sample`. The test deploy ships the API to
`/test/calmind/api/`, the static web client beside it, and the lib to
`/home/protected/calmind/lib`; config and data dirs are never touched,
nothing is ever `--delete`d, and no hostname lives in this repo.

The gates are gates, not decoration: a PHP syntax error, a red core or server
suite, a red gesture run, or a `dist` that some other build rewrote between
the tests and the upload each stop the deploy. Two of those used to pass
unconditionally — see `tools/check-deploy-guards.sh`, which re-proves them by
breaking a copy and requiring the copy to fail.

## Rules of the road

- **Behavior lives in `packages/core` or it doesn't exist.** A screen that
  implements a rule inline is a bug even when it renders correctly.
- **Changing a behavior starts in `spec/`**, then core goes green, then the
  other replayers (the suite's Swift/Kotlin cores) follow.
- **The server stays dumb.** If a feature seems to need server-side logic,
  it's either client logic or new clear *metadata* — never payload reading.
- Tests ride with every change, suite-style: core logic in vitest, server
  endpoints in `server/tools/test.php`, gestures in Playwright under a real
  mouse, and the native seams in `tools/*.sh`. What is left for an eye is
  named in TESTING.md rather than assumed — colour, rhythm, and the pixels
  only a phone or a wrist can draw.
- **A new check is worth nothing until it has been watched failing.** Break
  the thing it guards, see it go red, put it back. Green that cannot go red
  is the most expensive kind of green here; TESTING.md keeps the tally of
  the ones that fooled us.

## Milestones

1. ~~**Reminders end-to-end**~~ — auth with change-password and email recovery
   (and passkeys since), Reminders on web/iOS/Android, watch list, NFSN test
   deploy. **Done.**
2. ~~**Calendar, Notes, Habits, Add** on the proven skeleton; drag-reorder;
   sharing.~~ **Done** — mutual-consent sharing with live ticks, drags on every
   list, and recipes on top (OCR from photos, import from a URL, ½x/1x/2x
   scaling).
3. ~~**The complication and the widgets.**~~ **Done** — the watch app checks
   items off, the Modular complication shows the next two events, and the
   iPhone home-screen widget draws the calendar's own day list with
   interactive check-off. Everything but the pixels is under test; see
   TESTING.md for where that stops.
4. **E2EE** — client-side KDF, wrapped DEKs, recovery keys; sharing via
   keypairs. **Not started.** Today the server encrypts `payload` at rest
   (`ENC1:`) and holds the key, which is not the same promise. The protocol,
   the merge rules and the server do not change when this lands — only who
   can read the payload.
5. **Store builds (EAS)** — **not started**; there is no `eas.json`. iOS and
   Android install from local builds, signed by the free Personal Team, which
   is why provisioning profiles expire every seven days.
6. **Calendar integrations** — groundwork only, on purpose. Core parses
   iCalendar and expands RRULEs, both fully tested; nothing yet commits to
   OAuth or CalDAV, and the questions are with Sean.
