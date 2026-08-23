# CalMind Desktop

The same app, in a native window. This is a [Tauri 2](https://tauri.app) shell
around the identical web export the site serves (`apps/app/dist`) — every
screen, gesture and sync rule is the shared code; the Rust side only opens
the window. It talks to the same backend and logins as web
(`seancheren.com/calmind/api` — PROD since 2026-08-20), detected in `apps/app/src/config.ts` by
the `tauri:` origin, and keeps the same local-first snapshot in its own
storage, so it opens offline like the phones do.

## Build (macOS)

```sh
npm run export:web                      # refresh the web export first
cd desktop && npm run build             # → src-tauri/target/release/bundle/macos/CalMind.app
```

The build stages the export before compiling (`stage-dist.sh`, wired in as
tauri.conf.json's `beforeBuildCommand`), and that staging is not incidental —
see below.

### Why the export is staged rather than embedded directly

The website is exported with a base path — `experiments.baseUrl` in
`apps/app/app.json` is `/calmind` — so every asset URL in `index.html` is
absolute (`stage-dist.sh` reads that value out of app.json rather than
hardcoding it, so the staged path cannot drift from the export). This shell
used to embed that export and serve it at the ROOT of
`tauri://localhost`, where no such prefix exists: the bundle 404'd, Tauri's
asset protocol answered with `index.html`, and the window opened on

```
CalMind could not start.
SyntaxError: Unexpected token '<'
```

The macOS app had never once rendered, and `./desktop/smoke.sh` passed
throughout — it built, carried the right bundle name, launched, survived six
seconds and quit, all of which a broken window does too.

The base path is baked into the JS as well as the HTML (it is used to load
async chunks at runtime), so rewriting `index.html` would break on the first
lazy import, and rewriting the bundle would mean shipping bytes the web suite
never tested. Instead the export is staged UNDER the path it was built for and
the window opens it there, so the desktop runs the identical bytes the site
serves.

`sh desktop/check-assets.sh` (also `npm run test:desktop`) is what keeps that
true: it reads the window's start URL out of `tauri.conf.json`, finds that page
in the staged tree, and requires every absolute asset it references to be a
real file at exactly that path. It needs no GUI.

Needs the Rust toolchain (`rustup`, minimal profile is enough) and the
`LANG=en_US.UTF-8` habit does not apply here — plain shells are fine.

`npm run dev` opens a live window against the current export without
bundling an .app.

## Windows

Tauri cannot cross-compile from macOS, so Windows builds on a runner:
`.github/workflows/desktop-windows.yml`, `tauri-apps/tauri-action` on
`windows-latest`, same repo and same export, producing the `.msi`/`.exe` as
an artifact. It is `workflow_dispatch` only and never runs on push — but the
dtp/tdtp lane dispatches it at the end of every release, so a shipped version
gets a Windows build without anyone opening the Actions tab; trigger it by
hand there when you want one in between. No one has smoked the artifact yet,
so treat the first one as unverified.

## Icons

`src-tauri/icons/` is generated from the canonical mark
(`apps/app/assets/icon.png`, the one-stroke CM) via `npx tauri icon`.
