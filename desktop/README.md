# CalMind Desktop

The same app, in a native window. This is a [Tauri 2](https://tauri.app) shell
around the identical web export the site serves (`apps/app/dist`) — every
screen, gesture and sync rule is the shared code; the Rust side only opens
the window. It talks to the same backend and logins as web
(`seancheren.com/test/calmind/api`), detected in `apps/app/src/config.ts` by
the `tauri:` origin, and keeps the same local-first snapshot in its own
storage, so it opens offline like the phones do.

## Build (macOS)

```sh
npm run export:web                      # refresh the web export first
cd desktop && npm run build             # → src-tauri/target/release/bundle/macos/CalMind.app
```

Needs the Rust toolchain (`rustup`, minimal profile is enough) and the
`LANG=en_US.UTF-8` habit does not apply here — plain shells are fine.

`npm run dev` opens a live window against the current export without
bundling an .app.

## Windows

Tauri cannot cross-compile from macOS, so Windows builds on a runner:
`.github/workflows/desktop-windows.yml`, `tauri-apps/tauri-action` on
`windows-latest`, same repo and same export, producing the `.msi`/`.exe` as
an artifact. It is `workflow_dispatch` only — trigger it from the Actions
tab when a Windows build is actually wanted; it never runs on push. No one
has smoked the artifact yet, so treat the first one as unverified.

## Icons

`src-tauri/icons/` is generated from the canonical mark
(`apps/app/assets/icon.png`, the one-stroke CM) via `npx tauri icon`.
