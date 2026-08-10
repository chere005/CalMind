# CalMind

I haven't been quite happy with subtle things like not being able to have reminders from previous days on the calendar not continue to show until they are checked off.. I also wanted to tie together reminders, notes, and my calendar.. I also like enforcing date and time patterns.

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

One codebase for web, iOS, Android — and a SwiftUI watch app — for the CalMind
suite: Reminders, Calendar, Notes, Habits and Add, at full feature parity with
the plain-PHP suite at
[chere005/seancheren-site](https://github.com/chere005/seancheren-site) whose
successor architecture this is. Everything the product *does* is written once,
in TypeScript, and every surface renders it: the outline drags, the repeat
rolls, the four full themes, mutual-consent sharing with live ticks, the
Scriptable widget with its setup page, the ?tick= quick-done, and the
watch list pushed over WatchConnectivity — all proven end-to-end by the three
test harnesses (`TESTING.md` is the map; `PARITY.md` is the build ledger).

## The map

```
packages/core/     The brain, shared verbatim by all three surfaces: the
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
apps/watch/        Historical: the hand-wired watch bridge notes. The app
                   itself lives in apps/app/targets/watch/ now.
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
desktop/           CalMind Desktop — a Tauri 2 shell around the identical web
                   export. Rust opens the window; everything else is the
                   shared code. macOS builds locally (desktop/README.md);
                   Windows builds on a manual GitHub Actions job.
```

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
npm run test:core                            # vitest, incl. the spec/*.json replay
npm run test:server                          # boots php -S on a scratch dir, drives real HTTP
npm run test:e2e                             # exports the web app, then drives real gestures
npm run test:webkit                          # the spine + the header rules, in Sean's engine
./desktop/smoke.sh                           # macOS: builds, carries THIS export, runs, quits
php -S 127.0.0.1:8788 -t server/public       # the API
npm run web                                  # Expo web on :8081 (proxies nothing — talks to :8788)
cd apps/app && npx expo start                # then i / a for the iOS / Android simulator
```

Counts live in TODO.md's steady-state line rather than here, because a number
written into prose is a number that goes stale — this file said 145 for a good
while after it stopped being true.

Where the app finds the API (`apps/app/src/config.ts`): the deployed site and
the e2e router use same-origin `api/`; metro dev uses `127.0.0.1:8788`; the
iOS/Android sims and the desktop shell default to the LIVE test instance —
same data and logins as the site — with a Settings override for local work.
The Apple targets (watch app, complication, home-screen widget) are
generated by `expo prebuild` from `apps/app/targets/*` — `ios/` is
gitignored and disposable. Prebuild CLEARS `ios/` before running pods, so
back it up first if a device build matters that day; a target whose bundle
id has never been registered will fail to sign and, because extensions embed
in the host app, will block every build until it is.

## Deploying to the NFSN test instance

```sh
./server/deploy-test.sh --dry-run   # preview
./server/deploy-test.sh             # lint + tests, expo export, rsync
./server/tools/smoke-live.sh        # …then prove the DEPLOY, over real HTTPS
```

Needs `server/deploy.conf` (gitignored) with `SSH_DEST`. Ships the API to
`/test/calmind/api/`, the static web client beside it, and the lib to
`/home/protected/calmind/lib` — config and data dirs are never touched,
nothing is ever `--delete`d, and no hostname lives in this repo.

## Rules of the road

- **Behavior lives in `packages/core` or it doesn't exist.** A screen that
  implements a rule inline is a bug even when it renders correctly.
- **Changing a behavior starts in `spec/`**, then core goes green, then the
  other replayers (the suite's Swift/Kotlin cores) follow.
- **The server stays dumb.** If a feature seems to need server-side logic,
  it's either client logic or new clear *metadata* — never payload reading.
- Tests ride with every change, suite-style: core logic in vitest, server
  endpoints in `server/tools/test.php`, and anything gesture-shaped is checked
  by eye until a browser-driver harness lands.

## Milestones

1. **Reminders end-to-end** *(this repo today)* — auth with change-password and
   email recovery, Reminders on web/iOS/Android, watch list, NFSN test deploy.
2. Calendar, Notes, Habits, Add on the proven skeleton; drag-reorder; sharing.
3. E2EE: client-side KDF, wrapped DEKs, recovery keys; sharing via keypairs.
4. Store builds (EAS), the complication, widgets.
