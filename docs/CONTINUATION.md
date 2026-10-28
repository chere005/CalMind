# Continuation

## Real card dots and bottom-field reach — 1.47.0

Daily-log card fields display real `•` bullets, including legacy saved star
and dash markers. Opening a card does not rewrite its record; edits store
the dots. The projection preserves string length and queued native input
mapping. Return continues a dot and Return on an empty item exits.

Focused fields are measured against the actual editor viewport and keyboard
in window coordinates, leaving room for Done. Focus, selection, and layout
growth reveal the bottom field. Tall fields only reveal their bottom for a
tail caret, so selecting earlier text does not pull the page back down.
Reveal state is reset between notes.

Application commit `41f9a72`; release/tag `1.47.0` at `4f62f74`. Prod/test
are deployed, Release `40785279215` is published, and Sean's `iPhoooooone`
reports 1.47.0 installed. Preflight `40784278087` passed. The signed phone
bundle has the dot code and production API, with no fixture API. The watch
was unreachable; local Mac and Android installs were not part of this run.

Development, core/fuzz, app, and browser regressions passed. The headless
iPhone 15 Pro test used multiple cards, a long upper field, and a long
Graffirmations field in the bottom card. Its screenshot shows `END OF CARD`
and the caret above Done and the keyboard. Dismissal and persistence passed.
Evidence: `/tmp/calmind-card-dots/probe/result.xcresult` and the exported
screenshots under `/tmp/calmind-card-dots/screenshots/`. Use
`ONLY_ACTIVE_ARCH=YES ARCHS=arm64` for simulator builds; the unnecessary
universal archive ran out of internal disk space before the ARM build passed.

Shared source is pushed on main: CoreMind `6233765`, MyCalMind `c2f2ca6`,
ChefMind `3745f78`. ChefMind source preflight `40783325248` passed; no
ChefMind or MyCalMind app release was made. All consumer drift checks pass.
The fixture API is stopped, the disposable simulator deleted, and SPACE
unmounted.

## Earlier notes input and dismissal — 1.46.0

Star-space and dash-space start note lists. Return continues the marker;
Return on an empty item exits. This works in daily-log cards, plain notes,
and recipe prose. `noteListEdit` and `spec/richtext.json` define the behavior.
`NoteBodyInput` and `noteInputState` preserve text and selection when native
keystrokes arrive before an earlier automatic correction is acknowledged.

Notes now uses a measured Done overlay instead of changing native keyboard
accessory views. Native scrolling dismisses on drag. A blurred body remains
mounted until the keyboard finishes hiding; navigation has a bounded fallback.
The web note-type modal is retired before its closing animation can steal
focus from a new card field.

Application commit: `8033725`. CalMind 1.46.0 is pushed/tagged at `1802b3a`,
deployed to prod/test, and installed on Sean's `iPhoooooone`. Preflight
`40774486358` and published Release `40775299332` passed. Signature, installed
version, production API, and the queued-input code were checked. No fixture
API is in the phone bundle. The watch was unreachable and was not updated;
no local Mac or Android install was requested in this run.

The development suite, app input regressions, related browser checks, repeated
bullet checks, and headless native quick/full probes passed. Native probes
cover rapid Return/Return/typing, repeated Done dismissal, drag dismissal,
persistence, and navigation. Evidence is under `/tmp/calmind-bullet-keyboard/`;
the successful full result is
`full-native-input-final-20261028-164017.xcresult`. The fixture API is stopped,
the disposable simulator deleted, and SPACE unmounted.

Source copies are pushed on main: CoreMind `552caf4`, MyCalMind `53c69e6`,
ChefMind `f732752`. All consumer drift checks pass. ChefMind's source-only
preflight `40772053063` passed; no ChefMind or MyCalMind app release was made.
A follow-up to preserve the native regression runner in the repo is queued
in Sean's ticket Inbox.

## Earlier daily-log and ChefMind handoff (1.44.0)

The new Note / Recipe / Daily log dropdown is first in the note editor's
button row. Daily log creates a dated card with Food, Exercise, and Mood
fields. + adds another card dated today in the same note. Cards autosave,
can be dated, and use the existing two-press delete. Dates cannot be cleared.
Switching types preserves the existing body and saved log cards. The recipe
editor writes the explicit Recipe type; legacy notes/recipes retain their
previous behavior.

Core behavior is in `packages/core/src/dailylog.ts`, with optional fields in
`types.ts`, shared `spec/dailylog.json`, and contract tests. Search and Copy as
Markdown include active log card contents. The server payload remains opaque;
no server schema or record type changed.

All ChefMind notes are now beneath one collapsible ChefMind parent, with
source folders and sections as subgroups. This changes presentation only:
reading and folding still write nothing to ChefMind's records.

The shared dropdown now exposes individual accessible choices. The note-type
picker waits for iOS dismissal before opening RecipeEditor. CoreMind carries
these exact changes and manifests for the new module/spec/test; source copies
in MyCalMind and the compatible ChefMind core are updated. CoreMind is pushed
at `c31dd5e`; MyCalMind at `d16ad93`.

## Earlier verification

Typechecks, the development suite, relevant daily-log/Recipe/Markdown browser
checks, ChefMind grouping checks, canon tests, and all consumer drift checks
passed. The native headless probe verified all three daily fields, adding a
second card, persistence after reopening, type changes without losing cards,
and opening Recipe from the dropdown. Result:
`/tmp/calmind-scroll-probe/dailylog5.xcresult`. Its log is
`/tmp/calmind-dailylog-native-test5.log`. The temporary server is stopped and
the disposable simulator deleted. Generated simulator builds use a local
fixture API; production phone builds must use the production API.

## Earlier release and device state

CalMind 1.44.0 is deployed to prod/test, pushed and tagged at `9aafa60`.
Preflight 40630834089 and published Release 40631599434 both passed.
Release: https://github.com/chere005/CalMind/releases/tag/1.44.0.
The signed 1.44.0 production bundle is installed on Sean's `iPhoooooone` and
his watch. Its signature, version, production API, Daily log code, and
ChefMind parent-group code were checked; no fixture API is bundled.

The device run used `IOS_DEVICE=iPhoooooone` to finish within the cutoff.
Autumn's and Patricia's phones were not updated in this run. The signed bundle
is at `apps/app/ios/derived-platforms/Build/Products/Release-iphoneos/CalMind.app`.
Device output: `/tmp/calmind-dailylog-phone.log`. Release output:
`/tmp/calmind-dailylog-release3.log`. The installed local desktop and Android
apps were not rebuilt, and no MyCalMind app release was performed.

ChefMind's compatible source is pushed on main at `1f2bd27`, prepared as
untagged 1.31.0 because its preflight refuses an already published version.
No ChefMind release or deployment was requested or performed. Preflight
40630737075 passed for `63185b0`; the final merge only retains a remote TODO,
and application/build inputs were verified identical to that checked commit.
The prior local/remote divergence was merged, preserving local pantry/note
improvements and the published release tooling. Its log is
`/tmp/calmind-dailylog-chef-preflight3.log`. The existing pantry identity/aisle
backlog was preserved and proposed to Sean's ticket Inbox for approval.

SPACE is unmounted, the temporary test server is stopped, and the disposable
simulator is deleted. Implementation and the requested phone install are
complete. Only other device/platform installs remain deferred. This run
finished before Sean's 11:30 PM America/Chicago October 27 cutoff.
