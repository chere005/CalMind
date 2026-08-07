# CalMind

One codebase for web, iOS, Android — and a SwiftUI watch app — for the CalMind
suite (Reminders first; Calendar, Notes, Habits and Add port onto the same
skeleton). The successor architecture to the plain-PHP suite: everything the
product *does* is written once, in TypeScript, and every surface renders it.

## The map

```
packages/core/     The brain, shared verbatim by all three surfaces: the
                   slash-only US-order parser, repeats with month/year clamping,
                   undated-first outline-block sort, fractional order keys,
                   shape normalization, and the LWW sync engine. No dependencies,
                   no build step — consumed as TypeScript source. Its test suite
                   replays spec/*.json.
spec/              The behavior contract, carried over from the suite — the
                   same vectors the Swift and Kotlin native cores replay.
                   Changing a behavior starts HERE.
apps/app/          One Expo (React Native) app → iOS, Android, and web
                   (react-native-web). Screens, gestures and styling only;
                   all behavior is imported from @calmind/core.
apps/app/modules/watch-bridge/   iOS-only native module: WatchConnectivity push.
apps/watch/        The SwiftUI watch app (read-only list) + wiring README.
server/            The sync API in PHP — deployable to NearlyFreeSpeech
                   unchanged. A dumb store with auth: it merges by clear
                   metadata and never reads a payload.
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
npm run test:core                            # vitest: 61 tests incl. the spec replay
npm run test:server                          # boots php -S on a scratch dir, drives real HTTP
php -S 127.0.0.1:8788 -t server/public       # the API
npm run web                                  # Expo web on :8081 (proxies nothing — talks to :8788)
cd apps/app && npx expo start                # then i / a for the iOS / Android simulator
```

The app finds the API at `127.0.0.1:8788` in dev (`10.0.2.2` from the Android
emulator) — override lives in `apps/app/src/config.ts`. The watch target is a
one-time Xcode wiring step: `apps/watch/README.md`.

## Deploying to the NFSN test instance

```sh
./server/deploy-test.sh --dry-run   # preview
./server/deploy-test.sh             # lint + tests, expo export, rsync
```

Needs `server/deploy.conf` (gitignored) with `SSH_DEST`. Ships the API to
`/test/calmind-app/api/`, the static web client beside it, and the lib to
`/home/protected/calmind-test/lib` — config and data dirs are never touched,
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
