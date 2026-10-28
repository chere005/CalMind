# Continuation

## Notes editor: one scroll area

Sean reported that the nested scroll bars were awkward after the keyboard
changes in 1.41.0/1.42.0. CalMind commit `1075187` makes the editor page own
scrolling. Plain note bodies, recipe prose banks, and shared-note bodies grow
with their text. Native text fields disable internal scrolling; web text fields
resize after edits and layout changes, including shrinking after deletions.
The existing keyboard insets, interactive dismissal, and Done bar remain.

Typechecks, the development suite, and the affected Notes/recipe browser checks
passed. The new regression checks a long note's height, typing at its end,
shrinking it, and saving/reopening it. CoreMind canon (`0f6eee0`) and MyCalMind
(`b332a5d`) carry identical source; their required checks passed and both are
pushed on main.

CalMind 1.43.0 (`f1b7155`) is deployed to prod and test, pushed and tagged.
Preflight and the published Release both passed:
https://github.com/chere005/CalMind/releases/tag/1.43.0.
The signed production build is installed on Sean's `iPhoooooone` and his
watch. Its version, signature, and production API were verified; it contains
no simulator fixture API. Launching the physical phone app was refused because
the phone was locked; the editor's behavior was verified in the simulator.

Autumn's phone install remains owed: mounting its developer disk image was
refused because the phone was locked. Patricia's phone was unreachable and
skipped. The current signed bundle is
`apps/app/ios/derived-platforms/Build/Products/Release-iphoneos/CalMind.app`;
these device retries require no source change or new release. Device output is
in `/tmp/calmind-single-scroll-phone.log`, and the release lane output is in
`/tmp/calmind-single-scroll-release.log`. A CoreMind ticket proposal was queued
to distinguish locked-phone errors from the script's misleading provisioning
advice.

A headless native simulator check passed using a disposable local API and
account: a drag inside a long note moves the page footer, and Done dismisses
the keyboard across repeated edits. Its result bundle is
`/tmp/calmind-scroll-probe/result2.xcresult`; its log is
`/tmp/calmind-single-scroll-native-test2.log`. The temporary server is stopped
and its simulator deleted. The generated simulator app uses the fixture API;
the installed production phone build uses the production API. SPACE has been
unmounted. Source work is complete; only the other phone installs remain owed.
Sean's cutoff was 11:30 PM America/Chicago on October 27, 2026; this continuation
finished before that cutoff.
