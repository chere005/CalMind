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
read out of a photo or a URL (with subheaders, scaling, and a first-ordering
for fresh lists), search across reminders, notes and events, the whole store
exported as one JSON file, a public /request page where anyone with the
link can ask for an hour of calendar time, the ?tick= quick-done, and the watch and widget feeds — all proven by the harnesses
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
                   The watch's FIRST page is the widget's own day list, drawn
                   from the same core `days` and filtered by the same calendar
                   selection — the widget writes its WidgetKit configuration
                   into the App Group, which is the only way anything outside
                   that one widget instance can see it.
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
tools/             The release lane, and the checks no browser can reach.
                   `dtp.sh` / `tdtp.sh` are the one gesture that ships (see
                   "The three environments"); `build-platforms.sh` is this
                   repo's OWN macOS / iOS / Android builder, which that lane
                   runs — the platform builds used to live in CoreMind and
                   moved here on 2026-08-23 so a repo ships itself. The rest
                   is the export's plumbing and the seams: the two Swift ones
                   (core's JSON through the wrist's and the widget's REAL
                   decoders and their drawing logic), the App Group rule, the
                   deploy guards proven by breaking copies, the web-head
                   patch every export needs, and the tap-target sweep.
desktop/           CalMind Desktop — a Tauri 2 shell around the identical web
                   export. Rust opens the window; everything else is the
                   shared code. macOS builds locally (desktop/README.md);
                   Windows builds on the manual `desktop-windows` GitHub
                   Actions job.
```

Two clones grew up here and moved into their own repos on 2026-08-22, history
and all — still kept in lockstep with this one, deliberately, across repos:

- [chere005/MyCalMind](https://github.com/chere005/MyCalMind) (né
  CalMind-Local) — the server taken out: one device's data, mirrored to
  paired devices over Bonjour and nowhere else. iOS + watchOS only.
- [chere005/ChefMind](https://github.com/chere005/ChefMind) — recipes and a
  shopping list, syncing through THIS server on THESE accounts, kept apart by
  a sync SPACE (`records-chef-<user>.json`), not a second server. Its deploy
  gates read this checkout as `$CALMIND_REPO`.

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
npm run test:dev                             # the between-runs mini-suite: typechecks,
                                             #   core, server, counts — ~40s, no browser
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

Shipping is deliberately not in that list: `npm run dtp` / `npm run tdtp` is
the one gesture that releases, and it lives under "The three environments"
below with the thing it deploys to.

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
native builds and the desktop shell default to PROD (Sean, 2026-08-20: "all
apps and devices should point to prod, not test now"), because trying the app
should mean trying your real data. Nothing defaults to test any more, and a
local `php -S` or test is still one Settings override away.
**Build numbers.** `ios.buildNumber` in app.json is the durable one, written
into the generated plist by prebuild. The generated `ios/CalMind/Info.plist`
is also patched to read `$(CURRENT_PROJECT_VERSION)` so a single bump of that
build setting moves the phone AND the watch together — without it the phone's
plist carries a literal `1` forever while the watch tracks the setting, which
is how a whole day's installs left no way to tell which build was on the
phone. `ios/` is disposable, so re-apply that reference after a prebuild, or
bump app.json instead.

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

All three are deploys now. Prod has existed since 2026-08-20, when CalMind
took `/calmind/` over from the old plain-PHP suite — which was itself deleted
from `seancheren-site` on 2026-08-22 (commit `665dff8`) and no longer serves
anything. One script ships any instance:

| | where | how |
|---|---|---|
| **prod** | `https://seancheren.com/calmind/` — what every app, device, browser and the public request link points at | `./server/deploy.sh prod --yes-prod` |
| **test** | `https://test.seancheren.com/calmind/` — sandbox, its own data dir | `./server/deploy.sh` (a bare run is test) |
| **dev** | `https://dev.seancheren.com/calmind/`, and a local `php -S` on 8788 with data in `server/data/` (gitignored, or `$CALMIND_DATA_DIR`) | `./server/deploy.sh dev` — the local one needs no deploy, it's a process on your Mac |

Where a file lands on disk and what the world calls it are two different
facts: test and dev moved to their own subdomains on 2026-08-20, so test's
files still sit in `/home/public/test/calmind` while
`seancheren.com/test/calmind` 404s by design. `server/deploy.sh`'s path table
holds both halves and is the source of truth; nothing here is derived from an
argument, and every row is re-checked against a hardcoded allow-list after
resolution.

**The deploy is one gesture.** `npm run dtp` — or `npm run tdtp`, which puts
every suite in front of it — is what actually ships: it bumps the minor
version, runs `./server/deploy.sh prod test --yes-prod [--quick]`, builds the
macOS bundle, tags `x.y.0`, pushes, and then builds the phone and the
emulator. Prod and test go out of ONE run of the gates, because the gates are
what cost the time and running them twice per release is how people learn to
skip them. Reach for `deploy.sh` directly only when you want one instance and
no release; `--yes-prod` is mandatory and always spelled out in the same
command.

```sh
npm run dtp                         # deploy prod+test, tag, push, build the platforms
npm run tdtp                        # …with the full suites in front

./server/deploy.sh --dry-run        # preview a test upload; touches nothing
./server/deploy.sh prod test --yes-prod --quick   # the deploy alone, no release
./server/tools/smoke-live.sh --static https://seancheren.com/calmind
                                    # what is that address serving right now?
                                    #   (a deploy already runs this per instance)

./server/deploy-prod.sh --verify    # the .well-known passkey pair, read-only
./server/deploy-prod.sh --yes       # …and to write it

sh tools/check-deploy-guards.sh     # prove the guards by breaking copies
```

`deploy-prod.sh` is a separate script for a separate thing and always was: the
pair at the site ROOT — `apple-app-site-association` plus the `.htaccess` that
gives it `application/json`. iOS will only fetch that from the apex and caches
a wrong first serve for hours, so it has constant destinations, no bare form,
and a `--verify` that reads without writing. Owning `/calmind/` changed none
of that. `deploy-test.sh` also still exists, still writes test and only test,
and nothing routine uses it — `tools/check-deploy-guards.sh` still proves its
guards, which is the reason to leave it standing.

Every one of them needs `server/deploy.conf` (gitignored) with `SSH_DEST` —
copy `server/deploy.conf.sample`. A deploy ships the API and the static web
client to the instance's own web dir and the lib to its own
`/home/protected` dir; config and data dirs are never touched, nothing is
ever `--delete`d, and no hostname lives in this repo.

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
6. **Calendar integrations** — subscribe-by-link shipped 2026-08-19:
   read-only ICS subscriptions end to end (an authed server proxy with
   per-hop SSRF guards and a 15-minute cache, core's iCalendar + RRULE
   expansion into day-chips, and Manage calendars grows "Subscribed by
   link"). OAuth, CalDAV and Gmail remain not started, deliberately — the
   Gmail question (his own Google Cloud project) is still with Sean.

## License

BSD 3-Clause — see [LICENSE](LICENSE). Do what you like with it: use it,
change it, fold it into something else, commercially or not, no permission
needed and no warranty given. The two things the licence does ask are that
the copyright notice travels with the source, and that you don't use Sean's
name to endorse whatever you build from it.
