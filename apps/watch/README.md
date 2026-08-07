# The watch app — wiring it into the Expo iOS project

The watch stays read-only: the phone pushes the open-reminder list through
WatchConnectivity (`apps/app/modules/watch-bridge`, autolinked by prebuild; the
JS side is `apps/app/src/watch.ts`, a no-op everywhere the module is absent),
and this SwiftUI app draws it. Same division as the suite's native app.

The watch target itself can't be expressed in Expo config — it's added to the
generated Xcode project once, by hand, the way the suite's `pbxproj` is kept:

1. `cd apps/app && npx expo prebuild -p ios` — generates `ios/` with the
   WatchBridge pod already linked (the module's `expo-module.config.json` does
   that part).
2. Open `ios/CalMind.xcworkspace` in Xcode → File → New → Target →
   **App** (watchOS), name it `CalMindWatch`, bundle id
   `com.seancheren.calmind.watchkitapp`, "Watch App for Existing iOS App".
3. Delete the template's generated Swift files and add the three files in
   `apps/watch/WatchApp/` to the watch target (reference them in place — no
   copies; this directory stays the source of truth).
4. Run the phone app on an iPhone simulator with a paired watch simulator
   (Xcode → Window → Devices and Simulators pairs them); the list appears on
   the watch after the first store change.

Once the target exists, `apps/app/ios/` stops being disposable prebuild output:
remove it from `.gitignore` and commit it, hand-kept from then on — the
`.gitignore` note says the same. Until step 2 happens, iOS builds work
normally; the bridge module compiles and `WCSession.isSupported()` simply
answers false without a paired watch.

The complication (a next milestone) hangs off the same `WatchStore`.
