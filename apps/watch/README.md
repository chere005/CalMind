# The watch app — a signpost, not the code

Nothing in this directory builds anything: `ios-bridge/` is an empty husk
from the hand-wired era and only this README is tracked. The code is in
three places now, and this file exists so that a search for "watch" lands
somewhere useful:

- `apps/app/targets/watch/` — the SwiftUI app itself (four pages).
- `apps/app/targets/watchwidget/` — the Modular complication, which is a
  separate target and therefore carries a deliberate TWIN of the app's time
  formatter; a widget extension cannot see its host app's sources.
- `apps/app/modules/watch-bridge/` — the phone's half, plus the App Group
  cache the iPhone home-screen widget reads.

What is checkable without a wrist is checked: `npm run test:watch` runs both
Swift clock copies against core's pinned cases (they have drifted once) and
pushes core's real feed through the wrist's real decoder and its
`drawnGroups`. What that cannot reach is the rendering, which is why the
rule is to open a watchOS SIMULATOR rather than wait for the wrist — three
bugs came out of the first time anyone did.

The watch CHECKS OFF now (Sean's call, 2026-08-09) but still never edits:
a tap queues {tick: id} through transferUserInfo — it survives the phone
being away — and the phone applies the same reminderToggle a tap there
uses, so repeats roll on the phone, never here. Everything else stays
one-way: the phone pushes the list+events feed through
WatchConnectivity (`apps/app/modules/watch-bridge`, autolinked by prebuild;
the JS side is `apps/app/src/watch.ts`, a no-op everywhere the module is
absent), and a SwiftUI app draws it — the suite's phone/watch division.

The target is GENERATED now: the sources live in `apps/app/targets/watch/`
(the `@bacons/apple-targets` magic folder) beside their
`expo-target.config.js`, and `npx expo prebuild -p ios --clean` adds the
watchOS target to the Xcode project — no hand-editing, re-runnable forever.
Build the `CalMindWatch` scheme on a paired watch simulator to see it.
