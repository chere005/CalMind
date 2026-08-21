# Working in CalMind-Local

CalMind with the server taken out — a CLONE of `apps/app` and `packages/core`,
not a rewrite. `README.md` is the map.

## Standing rules

- **Only this folder.** Another session shares this repo and works outside it.
  `git pull --autostash` first, stage explicit paths, never `git add -A`.
- **It is a clone, so keep it one.** A fix that belongs to the product belongs
  upstream first and gets copied down. Diverging by hand is how the two stop
  being the same app, which is the entire value of this being a copy.
- **Nothing may reference the server.** No `fetch`, no URL, no token, no
  `serverUrl`. If a feature needs one it does not belong here — take it out
  rather than stubbing it, so nobody later mistakes a stub for a gap.
- **CalMind-Local is not part of the CalMind release.** Sean, 2026-08-20: it is
  not tagged. Commit and push it; do not tag it.

## Traps that have cost real time here

- **A Debug build silently loads the OTHER app.** Metro serves on :8081, and
  the parent repo's dev server is often on it — a Debug build of this app then
  renders the parent's bundle, login screen and all, and looks like the gutting
  failed. Build Release for anything you intend to look at.
- **CocoaPods needs a UTF-8 locale.** Without `LANG=en_US.UTF-8` prebuild dies
  in `unicode_normalize` with an ASCII-8BIT error that names nothing useful.
- **`rsync --exclude ios` also excludes `modules/*/ios`.** The generated
  `app/ios` should be skipped; the native modules' own `ios/` directories are
  SOURCE and must not be. The watch bridge went missing this way.
- **The App Group id is in Swift as well as in the configs.** Four files carry
  it — the bridge module, the widget, the complication, the watch store — and a
  missed one reads an empty container and shows a waiting state forever.
- **The shell's working directory persists between Bash calls.** Use absolute
  paths; a `cd app` earlier in the session breaks the next relative command.
- **Ask what happens when a write fails.** The snapshot here is the ONLY copy —
  upstream it is a cache of what the server holds. A snapshot that will not
  parse is moved aside and reported, never treated as an empty store: empty and
  lost look identical, and the next write would go over the top of it.
