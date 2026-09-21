# CalMind on Arch Linux

The same app the website serves, in a native window. CalMind's desktop
surface is a Tauri 2 shell around the identical Expo web export — no Linux
code, no second backend; it talks to `https://seancheren.com/calmind/api`
like the phones do and keeps the same local-first snapshot, so it opens
offline.

---

## Read this first

**Nothing on this page has been built or run.** It was written on a Mac on
2026-09-21. Tauri does not cross-compile, so no Linux binary for CalMind
exists anywhere yet — not on that machine, not in a GitHub Release (there are
none), not in an Actions artifact (the only desktop CI job is Windows). The
first person to follow these steps is doing the first Linux build of CalMind,
and should expect to debug something.

**The first command whose output would prove any of this is real** is step 2's

```sh
makepkg -si
```

specifically its final line,

```
==> Finished making: calmind-desktop 1.32.0-1 (<date>)
```

Everything above that line in this document is reasoning; that line is
evidence. The second piece of evidence is `calmind` opening a window with
*your* reminders in it — the package can install perfectly and still show a
blank window, which is exactly the failure this repo has already met once on
macOS (see §5).

### What *was* verified, and how

| claim | how it was checked |
| --- | --- |
| every `pacman` package name below exists **today** | `https://archlinux.org/packages/search/json/?name=<pkg>` (exact-name query, official repos only), 2026-09-21 — repo and version noted in the table in §1 |
| `rust` provides `cargo`; `rustup` conflicts with `rust`; `nodejs-lts-jod` provides `nodejs=22.23.2`; `webkit2gtk-4.1` already depends on `gtk3` | the per-package detail endpoint `https://archlinux.org/packages/<repo>/<arch>/<pkg>/json/`, same day |
| **WebKitGTK 4.1, not 4.0** | `desktop/src-tauri/Cargo.lock` resolves tauri 2.11.5 / wry 0.55.1 / the `webkit2gtk` crate 2.0.2 with `soup3` — that is the 4.1 API. Read from the lockfile, not from docs. |
| **Tauri's own Arch instructions are stale** | Tauri v2's prerequisites page tells Arch users to install `libappindicator-gtk3`; the Arch API returns **zero results** for that name. The live package is `libayatana-appindicator`. Copy Tauri's line and you get `error: target not found`. |
| version to build | `https://api.github.com/repos/chere005/CalMind/tags` → newest tag `1.32.0` (bare numbers, no `v`); the repo is public, so the clone needs no credentials |
| the PKGBUILD is at least syntactically valid bash | `bash -n PKGBUILD`, and sourcing it in bash to print every field and function (`pkgname`, `pkgver`, `arch`, `depends`, `makedepends`, `source`, `sha256sums`, `prepare`/`build`/`check`/`package`). **`makepkg` has never parsed it.** |
| `--no-bundle` is a real flag | `npx tauri build --help` against this repo's own pinned `@tauri-apps/cli` 2.11.4, on the Mac. Its `--bundles` possible-values list prints `ios, app, dmg` there, which is the platform filtering §8 relies on, seen rather than argued |
| `npm ci` will actually get a Linux `tauri` binary | the committed `package-lock.json` pins `@tauri-apps/cli-linux-x64-gnu` 2.11.4 beside the darwin/win32 ones. Worth checking, because a lockfile without it would install the JS wrapper and no binary, and the build would die *after* the export |
| the binary is `calmind-desktop`, at `desktop/src-tauri/target/release/` | `[package] name` in `desktop/src-tauri/Cargo.toml`, no `[[bin]]`, and no cargo workspace above `src-tauri` (so no shared `target/` elsewhere) |
| the files `package()` installs exist | `LICENSE` at the repo root is BSD 3-Clause; the five icons are present and are the pixel sizes they are filed under (32, 64, 128, 256 for `128x128@2x.png`, 512 for `icon.png`), read off the PNG headers |
| the file list `package()` produces | `package()` was executed on the Mac against a `git archive` of tag 1.32.0 with a stub binary and a GNU-style `install -D` shim (macOS `install` has no `-D`). It wrote exactly: `usr/bin/calmind` (755), `usr/share/applications/calmind.desktop`, five `hicolor/<size>/apps/calmind.png`, `usr/share/licenses/calmind-desktop/LICENSE` — every source path resolved. That is the file layout checked, **not** a package built: no `makepkg`, no real binary |
| **`sh` on Arch is bash** — which this whole page quietly depends on | `core/bash`'s file list contains `usr/bin/sh`. See "One landmine you are on the right side of" below; the opposite case was reproduced with `dash` on the Mac |

### One landmine you are on the right side of

Two of this repo's shell scripts are bash that gets invoked as `sh`:
`desktop/stage-dist.sh` (Tauri runs it as `beforeBuildCommand`, literally
`sh stage-dist.sh`) and `desktop/check-assets.sh` (root `package.json` runs
`sh desktop/check-assets.sh`). Both find their own directory with
`${BASH_SOURCE[0]}`, which a real POSIX shell cannot expand. Run under `dash`
on the Mac, both print `27: Bad substitution`; the whole command substitution
dies, so `ROOT` collapses to `/` and they go looking for
`//apps/app/app.json`. `stage-dist.sh` then exits 1, which on Linux CI would
take the Tauri build down with it.

**Arch is fine**, because Arch's `bash` package owns `/usr/bin/sh` — so `sh`
*is* bash and `${BASH_SOURCE[0]}` works. That is why `makepkg` can build this
at all, and it is checked rather than assumed. It is also the reason the
proposed CI job (§8) has an extra step nobody expects, and the reason this
page says `bash smoke-linux.sh` rather than `sh smoke-linux.sh`.

### What was *not* verified

That the build completes, that the app launches, that the window renders, or
that `libayatana-appindicator` is needed at all (§5 has the one-line test for
that, for when a binary exists). Nothing here has been run on Linux at all.

---

## 0. Why a PKGBUILD, and why built from source

Arch does not use `.deb` or `.rpm`, and an AppImage bypasses the package
manager entirely — nothing knows what is installed, nothing updates it,
nothing removes it cleanly. A `.pkg.tar.zst` built by `makepkg` is the
idiomatic answer: `pacman -Qi calmind-desktop` tells you what you have,
`pacman -Rns calmind-desktop` removes every file it added.

The other option would be a PKGBUILD that repackages a CI-built AppImage or
`.deb`. **There is nothing to repackage.** CalMind publishes no GitHub
Release, and the Windows job uploads an Actions *artifact* — which expires and
needs an authenticated download, so a PKGBUILD cannot use one as a `source=()`
at all. That route needs a Linux workflow written, bundle targets added, a run
made green, and release publishing set up *before* the first install. Building
from source needs none of that and works today. (Once a Release exists, a
second, much smaller PKGBUILD becomes the better *update* path — the two can
coexist.)

Files in this directory:

| file | what it is |
| --- | --- |
| `PKGBUILD` | the package recipe — the thing you actually use |
| `calmind.desktop` | the application-menu entry the package installs |
| `.SRCINFO` | only needed to publish on the AUR (§7). Generated by sourcing the PKGBUILD in bash on macOS, **not** by `makepkg --printsrcinfo`; regenerate it on Arch before any AUR upload. Its format has no comment syntax, so it is the one file here that cannot carry its own warning. |
| `smoke-linux.sh` | the Linux twin of `desktop/smoke.sh`, which is macOS-only. Also never run. |
| `config/` | repo-side changes, none of them needed to install on your box: `tauri.conf.linux-targets.patch` (add `deb`/`rpm`/`appimage` to `bundle.targets` — **CI only**, this PKGBUILD builds `--no-bundle`), `tauri.conf.linux-icons.OPTIONAL.patch`, `src-tauri-linux-changes.md`, `PLATFORM-REGISTRATION.md`. Both patches apply cleanly to today's `tauri.conf.json`, separately and in either order (checked with `git apply --check` against a throwaway copy). |
| `ci/.github/workflows/desktop-linux.yml` | the proposed Linux CI workflow, modelled on `desktop-windows.yml`. |

There used to be second copies of the workflow and the targets patch at the
top level of this directory. They were duplicates of the `ci/` and `config/`
ones, they had drifted apart, and the top-level workflow carried a `set -e`
bug the `ci/` one does not. They are deleted: one copy of each, `ci/` and
`config/`.

---

## 1. Prerequisites

```sh
sudo pacman -Syu
sudo pacman -S --needed \
  base-devel \
  git \
  rust \
  nodejs npm \
  webkit2gtk-4.1 \
  gtk3 \
  libayatana-appindicator \
  librsvg \
  hicolor-icon-theme
```

**If you already use `rustup`, leave `rust` out of that line.** The `rustup`
package (extra 1.29.1-1) both provides and conflicts with `rust`; pacman will
otherwise offer to replace your toolchain manager with the system compiler.

| package | repo, version seen 2026-09-21 | why |
| --- | --- | --- |
| `base-devel` | core 1-2 | `makepkg`, `gcc`, `pkgconf`, `binutils` (`strings`, used by the smoke script) |
| `git` | extra 2.55.0-1 | fetching the tagged source (~16 MB of history) |
| `rust` | extra 1.98.1-1 | **provides `cargo`** — there is no `cargo` package on Arch; do not try to install one |
| `nodejs` / `npm` | extra 26.9.0-1 / 12.0.2-1 | the Expo web export |
| `webkit2gtk-4.1` | extra 2.52.6-1 | the webview. Not `webkit2gtk`, not `webkit2gtk-4.0` — neither name exists any more |
| `gtk3` | extra 3.24.52-1 | `webkit2gtk-4.1` already depends on it; named explicitly because the binary links it directly |
| `libayatana-appindicator` | extra 0.6.0-2 | the live replacement for the dead `libappindicator-gtk3`. Possibly unnecessary — see §5 |
| `librsvg` | extra 2.62.3-1 | SVG loading. Strictly only needed if you run Tauri's own Linux bundler (`deb`/`rpm`/`appimage`); harmless and cheap to have |
| `hicolor-icon-theme` | extra 0.18-1 | owns the icon directories the package writes into |

The PKGBUILD's own `depends` also names `libsoup3` (extra 3.6.6-2), `dbus`
(core 1.16.2-1), `glibc` and `gcc-libs` — libraries the binary links that are
not in the line above because they are on every Arch system already and
`makepkg -si` would pull them in regardless. Nothing to do about them.

Also exist but are **not** needed here despite appearing in Tauri's Arch line:
`appmenu-gtk-module` (extra 25.04-3) and `xdotool` (extra 4.20260303.1-1).
Install `xdotool` only if you want `smoke-linux.sh`'s window check to run.

Budget roughly **3 GB of free disk** (the Rust build of Tauri is large) and a
working network connection during the build — `git`, `npm ci` and
`cargo fetch` all reach out.

> On Node: Arch ships `nodejs` 26.9.0, and the Mac this was written on runs
> node 26.8.2 and exports the web app with it daily, so Node 26 is not an
> exotic choice here. CI happens to pin node 22. If `npm run export:web`
> fails, §5 has the swap.

---

## 2. Build and install

```sh
mkdir -p ~/build/calmind && cd ~/build/calmind
cp /path/to/PKGBUILD /path/to/calmind.desktop .

# The PKGBUILD pins pkgver=1.32.0, the newest tag as of writing.
# If there is a newer one, edit pkgver — nothing else changes.
git ls-remote --tags https://github.com/chere005/CalMind.git

makepkg -si
```

`makepkg -si` will, in order:

1. clone the repo at tag `1.32.0`;
2. `npm ci` (every workspace — this is where the Tauri CLI comes from) and
   `cargo fetch --locked`;
3. `npm run export:web` — the repo's own export script, so the bundle carries
   the same head patch the live site serves;
4. `npm -w @calmind/desktop run tauri -- build --no-bundle` — compiles the
   Rust shell and skips Tauri's own deb/rpm/AppImage bundlers, because we are
   making an Arch package;
5. run `desktop/check-assets.sh`, the repo's headless gate, as `check()`;
6. build `calmind-desktop-1.32.0-1-x86_64.pkg.tar.zst` and install it with
   `pacman -U`.

Expect **10–30 minutes**, nearly all of it step 4. `makepkg` downloads and
compiles inside `~/build/calmind/src`; the PKGBUILD also points `CARGO_HOME`
and the npm cache in there, so it does not reshape `~/.cargo` or `~/.npm`.

Then:

```sh
calmind
```

or launch **CalMind** from your application menu.

### Rebuilding from a working tree, no package

For iterating on the shell:

```sh
git clone https://github.com/chere005/CalMind.git
cd CalMind
npm ci
npm run export:web
npm -w @calmind/desktop run tauri -- build --no-bundle
./desktop/src-tauri/target/release/calmind-desktop
```

`npm -w @calmind/desktop`, run **from the repo root**, is not a stylistic
choice: it puts the Tauri CLI's working directory at `desktop/`, which is
where `stage-dist.sh` lives — and `tauri.conf.json`'s `beforeBuildCommand`
names it by a bare relative path, `sh stage-dist.sh`. Every build path in
this repo arranges that same cwd: `tools/build-platforms.sh:143` does
`cd "$ROOT" && npm -w "$DESKTOP_WS" run build`, `desktop/smoke.sh:39` does
`cd "$ROOT/desktop" && npx tauri build`, and the Windows workflow passes
`projectPath: desktop`. That the hook really does run in `desktop/` is one of
the few things here that *was* tested: tauri-cli runs it with
`cwd = script_cwd.unwrap_or(frontend_dir)`, and a probe build on the Mac —
a copy of `desktop/` outside the repo, with `beforeBuildCommand` replaced by
`echo … $PWD; exit 3` — printed that directory and nothing else. Running the
build from the repo root has not been tried, and by the same rule it would
put the hook's cwd somewhere `stage-dist.sh` is not.

For a live window against the current export, without bundling:

```sh
npm -w @calmind/desktop run dev
```

---

## 3. Check it actually works

Headless, and the check that matters most — the one that cannot pass on a
blank window. `makepkg` already ran it as `check()`, but you can run it again
by hand; if you only built the package, the checkout it left behind is
`~/build/calmind/src/calmind-desktop-1.32.0`:

```sh
cd ~/build/calmind/src/calmind-desktop-1.32.0   # or your own clone
npm run test:desktop                            # = sh desktop/check-assets.sh
bash desktop/check-assets.sh                    # the same thing, spelled so it
                                                # does not lean on Arch's sh
```

It reads the window's start URL out of `tauri.conf.json`, finds that page in
the staged tree, and requires every asset it references to be a real file at
exactly that path. This guard exists because the macOS app once shipped having
never rendered: the export is built for the base path `/calmind`, the shell
served it at the root, the bundle 404'd, Tauri's asset protocol answered with
`index.html`, and the window read `SyntaxError: Unexpected token '<'` — while
the smoke test passed all six of its checks, because a broken window also
builds, launches, survives six seconds and quits.

Then the GUI-side twin, against the installed package:

```sh
CALMIND_BIN=/usr/bin/calmind CALMIND_REPO=~/path/to/CalMind \
  bash smoke-linux.sh --no-build
```

It checks the binary carries *this* export (by content-hashed bundle name),
that the assets resolve, and that a real window titled CalMind appears — with
`xdotool` under X11. Under Wayland, or with no display, it says so and
**skips** rather than pretending. It has never been run either.

And then the boring, decisive one: open the app and see whether your real
reminders are there. The shell points at PROD.

---

## 4. Updating

```sh
cd ~/build/calmind
sed -i 's/^pkgver=.*/pkgver=1.33.0/' PKGBUILD   # whatever the new tag is
makepkg -si
```

`pacman` upgrades the installed package in place. There is no auto-update in
the app; the version also lives in four files inside the repo, and this
PKGBUILD deliberately avoids becoming a fifth place to forget — it tracks the
git tag instead.

---

## 5. Troubleshooting

**Blank or white window, or it hangs on launch.** The single most common
Tauri-on-Linux failure, most likely on NVIDIA and/or Wayland: WebKitGTK's
DMABUF renderer asks the driver for buffer formats it will not provide. Tauri
documents this at <https://v2.tauri.app/develop/debug/linux-graphics/>. Try,
in this order:

```sh
__NV_DISABLE_EXPLICIT_SYNC=1 calmind      # NVIDIA + Wayland, no perf cost
WEBKIT_DISABLE_DMABUF_RENDERER=1 calmind  # the usual fix, slower path
WEBKIT_DISABLE_COMPOSITING_MODE=1 calmind # last resort
```

If one is needed every time, put it in a *user-level* override rather than
editing the packaged file (pacman would overwrite that on upgrade):

```sh
cp /usr/share/applications/calmind.desktop ~/.local/share/applications/
sed -i 's|^Exec=calmind|Exec=env WEBKIT_DISABLE_DMABUF_RENDERER=1 calmind|' \
  ~/.local/share/applications/calmind.desktop
```

Do **not** hardcode it into the app: it disables a faster path for everyone,
including machines that never had the bug.

**`error: target not found: libappindicator-gtk3`.** You followed Tauri's docs
instead of this page. The package is `libayatana-appindicator`.

**`error: target not found: webkit2gtk` / `webkit2gtk-4.0`.** Neither exists
in the official repos any more. It is `webkit2gtk-4.1`. (`webkitgtk-6.0` is
the GTK4 build — that is for Tauri's GTK4 work, not this shell.)

**`npm run export:web` fails.** Try the LTS toolchain before assuming the
export is at fault:

```sh
sudo pacman -S nodejs-lts-jod     # extra 22.23.2-1, provides nodejs=22.23.2
```

It conflicts with `nodejs`; pacman will offer the replacement. Node 22 is what
this repo's CI builds on.

**`makepkg` refuses to run.** It will not run as root, and it will not run
without `base-devel`. Neither is a CalMind problem.

**The build dies in `check()`.** `desktop/check-assets.sh` has only ever been
run on macOS. Note that despite what its own comments imply it is **not**
POSIX sh — it is bash (`#!/usr/bin/env bash`, and it locates itself with
`${BASH_SOURCE[0]}`), which is why the PKGBUILD runs it with `bash` and not
with `sh`. On Arch either would work, because Arch's `sh` is bash. If it
fails for some other reason, that is worth fixing in the repo rather than
deleting the `check()` function over; `makepkg --nocheck` gets you past it in
the meantime, and you should say out loud that you did.

**`Bad substitution`, from anything.** You are not on Arch, or your `/bin/sh`
is not bash. See "One landmine you are on the right side of" at the top.

**Is `libayatana-appindicator` really needed?** Probably not.
`desktop/src-tauri/Cargo.toml` asks for `tauri = { version = "2", features =
[] }` and Tauri's tray support is feature-gated, so the library should not be
linked at all — but `Cargo.lock` lists optional dependencies whether or not
they are activated, so the lockfile cannot settle it and nobody has inspected
a real Linux binary. Once one exists:

```sh
ldd /usr/bin/calmind | grep -i appindicator
```

No hit means the `depends=()` line in the PKGBUILD can lose it.

**A duplicate or unnamed entry in the taskbar.** `calmind.desktop` has no
`StartupWMClass`, because nobody has seen what the window reports. Under X11,
run `xprop WM_CLASS`, click the CalMind window, and add the second string it
prints as `StartupWMClass=` in your local copy of the desktop entry.

**You are on aarch64.** `arch=('x86_64')` in the PKGBUILD only because that is
the one nobody has to guess about. Tauri builds on aarch64 Linux; add it to
the array and find out.

---

## 6. Uninstall

```sh
sudo pacman -Rns calmind-desktop
```

`-Rns` removes the package and its no-longer-needed dependencies. It does not
remove the app's own local snapshot, which pacman never owned: on Linux that
should be under `~/.local/share/` in a directory named for the bundle
identifier, `com.seancheren.calmind.desktop` — *should*, because nobody has
run this app on Linux to look. Check with `ls ~/.local/share | grep -i
calmind` and delete it by hand if you want a clean slate. Your actual data is
on the server either way.

---

## 7. Optional: publish it on the AUR

`calmind-desktop` is a free name — the AUR RPC search returned zero results
for `calmind` on 2026-09-21. If you ever want `yay -S calmind-desktop` to
work, the sequence on the Arch box is:

```sh
makepkg --printsrcinfo > .SRCINFO     # regenerate; do not trust the one here
git clone ssh://aur@aur.archlinux.org/calmind-desktop.git
# copy PKGBUILD, calmind.desktop, .SRCINFO in, commit, push
```

Do that only after the package has actually built and run at least once. An
AUR package nobody has installed is a bug report waiting for a stranger.

---

## 8. What still has to happen in the repo

Installing on your own box needs none of this. Treating Linux as a platform
the repo ships does:

0. **`sh` is not bash everywhere, and CI is where that first bites.**
   `desktop/stage-dist.sh` and `desktop/check-assets.sh` are bash invoked as
   `sh` (`${BASH_SOURCE[0]}`); on an Ubuntu runner `/bin/sh` is dash and the
   build fails inside `beforeBuildCommand` before any Rust compiles —
   reproduced with `dash` on the Mac. The workflow in `ci/` works around it
   by repointing `/bin/sh`, but the fix belongs in the repo: either
   `stage-dist.sh` uses `$0` instead of `${BASH_SOURCE[0]}` (correct
   everywhere, and it fixes the same latent bug in ChefMind and AcctMind —
   but that file is mode `exact` in CoreMind's `consumers/CalMind.tsv`
   line 58, so canon must carry the same bytes or the drift gate fails the
   release), or `tauri.conf.json` says `bash stage-dist.sh` (one repo, that
   file is mode `fork`, but it changes a hook the Mac and Windows lanes also
   run). Root `package.json`'s `test:desktop` should say `bash` either way —
   it is in neither the drift manifest nor anyone's way.
1. `desktop/src-tauri/tauri.conf.json` → add `deb`, `rpm`, `appimage` to
   `bundle.targets` (`config/tauri.conf.linux-targets.patch`). Safe for the Mac build:
   tauri-bundler filters configured targets against the platform before it
   runs anything, and those three are not macOS types — unlike `dmg`, which
   *is*, which is why it ran create-dmg, needed Finder and AppleScript, and
   failed the build after a good `.app` had been produced. `msi` and `nsis`
   already sit in that list today and the Mac bundle builds.
2. `.github/workflows/desktop-linux.yml` (`ci/.github/workflows/desktop-linux.yml`
   here) — Tauri does not cross-compile, so the artifact has to be built on
   Linux. It passes `--bundles deb,rpm,appimage` on the command line, so it
   does not actually depend on item 1 landing first. See also
   `config/PLATFORM-REGISTRATION.md` for the full list of places a new
   platform has to be registered.
3. `tools/dtp.sh` ~line 298 — a second `gh workflow run desktop-linux` beside
   the Windows dispatch, non-fatal the same way.
4. `AGENTS.md` "Platforms" — a `**Linux**` bullet beside the Windows one.
5. `desktop/README.md` — a Linux section beside "## Windows".
6. `tools/build-platforms.sh` — its header says "Windows is CI's"; Linux is
   CI's too. No `--linux` flag belongs there: that script runs on the Mac.
