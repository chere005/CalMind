# CalMind-Local

CalMind with the server taken out.

It is not a rewrite and not a lookalike — it is the app from `apps/` and
`packages/core`, copied whole and then gutted of everything that needed a
server. Every screen, every gesture, every rule is the one upstream ships,
because it is literally the same code.

```
app/            The Expo app, cloned from apps/app — screens, gestures,
                styling, the native watch/complication/widget targets.
packages/core/  The brain, cloned verbatim minus the two modules that only
                existed to talk to a server.
spec/           The behaviour contract, copied so core's suite runs here.
```

## What was taken out, and why

| Gone | Because |
|---|---|
| `src/api.ts`, `src/config.ts` | the HTTP edge and the URL it pointed at |
| `Login`, `signIn`/`signOut`, `src/passkey.ts` | there is no account to sign into |
| `Requests`, `Request`, `core/meetreq.ts` | the public request page is a server endpoint |
| `ShareModal`, the shared-partner reads | sharing needs two accounts and a server to arbitrate |
| `QuickTick` | the widget's `?tick=` link is a URL on a server |
| `src/subs.ts`, `core/calsub.ts` | an ICS by link is fetched through the server's proxy — a browser cannot (no CORS) and a phone should not (the SSRF guard lived there) |
| the recipe URL import | same reason; **photo import stays**, that OCR is on-device |
| `src/update.ts` | it existed to reload a web build that is served |

The **store** kept its shape and lost its server half: the engine, the merge
rules, normalization and one snapshot on disk are all still there; the session,
the cursor, the dirty set and the push/pull are gone.

The context still exposes `session`, `syncState` and `sharedRecs` because twenty
screens read them. They tell the truth about an app with no server rather than
being rewritten out of twenty call sites: the name is a constant, the state is
always idle, sharing is always empty.

Two visible consequences, both deliberate:

- The top-right control is a **menu button**, not the account pill. Upstream its
  border carries the sync state and its letter is your initial; neither means
  anything here. It still turns red when this device cannot save its own copy,
  which is the one failure this build can actually have.
- The status line reads **"Saved on this device"**. It used to say
  "Online — synced", which would be a lie about a connection that does not exist.

## Identity

Its own bundle ids (`com.seancheren.calmindlocal…`), its own App Group
(`group.com.seancheren.calmindlocal`), its own storage key — so it sits beside
the real CalMind on the same phone and wrist and shares nothing with it. The
watch app and the widgets say **CalMind Local**, because two identical icons is
a trap. The icon is CalMind's own.

## Running it

```sh
npm install
npm -w @calmind/core run test -- --run     # 612 tests
npm run typecheck
cd app && LANG=en_US.UTF-8 npx expo prebuild --platform ios --clean
```

`LANG` is not optional — CocoaPods dies with a Unicode normalization error
without a UTF-8 locale.

Build and install with `xcodebuild -allowProvisioningUpdates` against the
device; `expo run:ios` cannot mint provisioning, and these bundle ids are new.
The watch app installs **directly**:

```bash
xcrun devicectl device install app --device <watch-udid> <CalMindLocal.app>/Watch/CalMindWatch.app
```

**A Debug build is not self-contained.** It loads its bundle from Metro on
:8081 — and if the parent repo's Metro is running there, your Debug build
silently gets *that* app, login screen and all. Build Release to look at this
one.

## Still owed

- **Bonjour** — phone ↔ Mac ↔ watch over the local network. Not built yet.
- **macOS** — no desktop shell has been cloned.
