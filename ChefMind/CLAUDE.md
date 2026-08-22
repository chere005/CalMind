# Working in ChefMind

CalMind's recipes plus a shopping list, on CalMind's server and
CalMind's accounts. (Reminders were removed 2026-08-21 on Sean's word — the
`reminder` record type stays, because the shopping rows are reminder records.) A CLONE of `apps/app` and `packages/core`. `README.md` is
the map.

## Standing rules

- **Only this folder, and the API's own seam.** Another session shares this
  repo and works in `apps/`, `packages/` and `server/`. `git pull --autostash`
  first, stage explicit paths, never `git add -A` — and when a shared file
  holds both sessions' work, stage YOUR HUNKS, not the file.
- **It is a clone, so keep it one.** A fix that belongs to the product belongs
  upstream first and gets copied down. The deliberate divergences are written
  down: `core/shopping.ts` (no twin), `core/normalize.ts` (no calendar or habit
  starters, plus the shopping folder), the `shopping` flag on `Folder`, and the
  screens listed in the README's "what was taken out".
- **The space is not configurable.** `SYNC_SPACE` in `app/src/api.ts` is a
  constant. A build that could be aimed at CalMind's records would merge two
  stores into whichever one synced last, silently.
- **Never point a local build at the production API.** `config.ts` derives the
  API from the page's ORIGIN for exactly this reason. It said
  `https://seancheren.com/...` first, and running the app on a laptop under
  that would have written test records into Sean's real store through an API
  that does not know the space yet.
- **Prod is the only instance.** Sean, 2026-08-21: straight to
  seancheren.com/ChefMind. So `deploy.sh`'s gates are not optional and there is
  no rehearsal to fall back on.

## Traps that have cost real time here

- **`space` reaches a filename.** It is whitelisted in `sync_space()`, never
  sanitised. "Reject anything not on the list" and "strip the characters I
  thought of" are not the same door.
- **`simctl`/browser text injection lowercases and drops characters.** The
  `**Ingredients**` heading typed into the note body came out
  `**ingredients**`; core matches it case-insensitively, so this cost only
  confusion — but the same injection silently truncated a URL at the first `.`
  elsewhere in this repo. Read back what you typed before believing a failure.
- **A two-handled basket icon reads as a WASTE BIN at tab-bar size.** Next to a
  list of things you are about to buy, that is the worst possible misread. One
  arc over the top is the shape nothing else has.
- **`␡` has no glyph in the app's font** and renders as a literal `DEL` box.
- **tauri.conf.json takes NO extra keys.** A `"_note"` alongside the real ones
  fails the schema outright: `Additional properties are not allowed`. Notes
  about that file go here. Two of them: the bundle targets exclude `dmg`,
  because create-dmg's bundle_dmg.sh needs Finder/AppleScript and dies on this
  machine while the `.app` bundles fine; and `msi`/`nsis` are config-only,
  since Tauri does not cross-compile and Windows needs its own toolchain.
- **The desktop shell's `location.origin` is `tauri://localhost`.** Deriving
  the API from it aims every request at a path the asset protocol answers with
  index.html, which reads back as "server error (500)" on the login card.
  `config.ts` carries an explicit tauri branch; CalMind's does too.
- **`app/ios/build/` is NOT disposable.** It looks like derived output and is
  gitignored, but ReactCodegen's generated sources live under
  `build/generated/ios/` and are written by `pod install`, not by xcodebuild.
  Delete it to free disk and the next build dies on seven "Build input file
  cannot be found" errors naming files nobody wrote. `pod install` (with the
  UTF-8 locale) puts them back.
- **A build killed by a full disk leaves a Gradle LOCK behind.** The next run
  fails in under a second with "Cannot lock file hash cache … already been
  locked by this process", which reads as a concurrency bug rather than
  wreckage. `./gradlew --stop` and remove `app/android/.gradle`.
- **The shell's working directory persists between Bash calls.** Use absolute
  paths.
- **Ask what happens when a write fails.** Same rule as upstream: the snapshot
  is the device's only copy between syncs, and a store that will not parse is
  moved aside and reported, never treated as an empty account.
