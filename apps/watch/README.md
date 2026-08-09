# The watch app

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
