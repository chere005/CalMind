#!/bin/sh
# The platforms this repo ships that server/deploy.sh does not: the macOS
# desktop bundle, one iOS build installed on every phone CalMind belongs on —
# carrying the watch companion onto a paired Apple Watch when one is reachable
# — and an Android build on an emulator. Windows is CI's
# (.github/workflows/desktop-windows.yml) — Tauri does not cross-compile.
#
#   sh tools/build-platforms.sh              all three
#   sh tools/build-platforms.sh --mac        just the desktop bundle
#   sh tools/build-platforms.sh --ios        just the phones (watch rides along)
#   sh tools/build-platforms.sh --android    just the emulator
#   sh tools/build-platforms.sh --dry-run    print the plan
#
# Flags compose, and naming none means all three — the same positive selection
# CoreMind's script uses, because zeroing the OTHERS per flag does not compose
# past two.
#
# WHY THIS LIVES HERE. These builds were CoreMind's alone
# (bin/build-platforms.sh CalMind), and this repo's own dtp shipped the web
# and nothing else. ChefMind fell into the hole that arrangement leaves,
# first: a release tagged and pushed while its Mac bundle stayed a day
# behind, built before the Pantry tab existed. Sean, 2026-08-23: "all apps
# should have a deploy on their own mechanism inside their repo" — so the
# machinery is HERE, the dtp lane runs it, and CoreMind orchestrates ACROSS
# apps by calling each app's own lane rather than reaching into it.
#
# This is a copy-down, like packages/core — CoreMind's script is the origin
# and its comments are the record of what each line cost to learn. Keep them.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APPDIR="apps/app"
DESKTOP_WS="@calmind/desktop"

# ------------------------------------------------------------------- argv
DRY=0; PICKED=0; WANT_MAC=0; WANT_IOS=0; WANT_ANDROID=0
while [ $# -gt 0 ]; do
  case "$1" in
    --mac)        WANT_MAC=1;     PICKED=1 ;;
    --ios)        WANT_IOS=1;     PICKED=1 ;;
    --android)    WANT_ANDROID=1; PICKED=1 ;;
    --dry-run)    DRY=1 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done
[ "$PICKED" = 1 ] || { WANT_MAC=1; WANT_IOS=1; WANT_ANDROID=1; }

# Xcode derivedData and gradle's home stay on the INTERNAL disk, deliberately.
# A scratch volume mounted exFAT was tried on 2026-08-22 and reverted: exFAT
# cannot store the extended attributes codesign needs, so any signed product
# gets a "._<name>" AppleDouble sidecar that codesign then tries to sign as a
# subcomponent and fails on. The same root cause broke gradle's cache there in
# the same session. Large and untracked is a real cost; it has to be paid.
BUILD_SCRATCH="$ROOT/$APPDIR/ios"

if [ "$DRY" = 1 ]; then
  [ "$WANT_MAC" = 1 ]     && echo "would: npm run export:web (clean), npm -w $DESKTOP_WS run build, then install to /Applications"
  [ "$WANT_IOS" = 1 ]     && echo "would: prebuild $APPDIR (ios) if no workspace, sync app.json's version into it, xcodebuild Release against one reachable phone, devicectl install that one bundle to every phone this app belongs on (watch companion too, when one is reachable)"
  [ "$WANT_ANDROID" = 1 ] && echo "would: prebuild $APPDIR (android), gradlew assembleRelease, adb install"
  echo "each block under the suite's heavy-build lock (tools/heavy-lock.sh)"
  exit 0
fi

# ------------------------------------------------------------ one at a time
# Every platform block below runs under the suite's heavy-build lock,
# tools/heavy-lock.sh — CoreMind canon, copied down byte for byte, so it is
# sourced here and never edited here. "Never two heavy builds at once" was a
# rule every AGENTS.md stated and nothing kept: on 2026-09-30 one session's
# gradle ran beside another's xcodebuild and an AcctMind lane took 1574 s
# instead of 246. Now a block that finds another build holding the lock —
# this repo's or another app's, this session's or another's — waits for it,
# saying whose it is, instead of running beside it.
#
# It sees only builds that TAKE it: the suite's build-platforms.sh, MyCalMind's
# deploy-device.sh, AcctMind's building smoke and CoreMind's fallback. WriteMind,
# the TestMindSuite forks, a hand-typed xcodebuild/gradle/cargo and an Xcode
# window's build are not seen.
#
# Taken around each BLOCK, because a block is the unit the lane runs one at a
# time (--mac before the tag, --ios and --android after the push). Let go
# explicitly at each block's end; every `exit 1` inside one lets go through
# the helper's EXIT trap — or, in the iOS block, through the trap that block
# sets for its own temp file, which calls heavy_unlock too — and a kill -9
# through the next waiter's takeover.
. "$ROOT/tools/heavy-lock.sh"

# The export the desktop shell stages: a CLEAN one. Unlike ChefMind, whose
# deploy runs the head patch as a separate step, this repo's `export:web`
# script already ends in tools/patch-web-html.mjs — so one npm script produces
# the same patched dist the site serves, PWA furniture (sw.js,
# manifest.webmanifest, the registration snippet) included. The desktop
# build's beforeBuildCommand (desktop/stage-dist.sh) then stages that dist
# UNDER the /calmind base path it was exported for — see stage-dist.sh for
# the blank-window bug that staging exists to prevent.
#
# CLEAN because `expo export` does not empty the directory, so a dist left by
# a previous run would be copied along with whatever else is in it. The export
# is deterministic — the same source produces the same content-hashed bundle
# name — which is what makes it possible to check a .app against the live
# site at all, and it costs about thirty seconds.
ensure_dist() {
  rm -rf "$ROOT/$APPDIR/dist"
  npm run -s export:web >/dev/null || { echo "the web export failed" >&2; return 1; }
}

# --------------------------------------------------------------- the iOS project
# Prebuild only runs when the workspace is MISSING — regenerating it every
# build would also wipe ios/derived-platforms and turn each release into a
# cold build. The price of reuse: the generated project froze the version at
# whatever app.json said the day the workspace was first generated, and six
# releases of phone installs reported 1.11.0 while the app shipped 1.17.0
# (found 2026-08-30). So the version is SYNCED into the generated project on
# every run: MARKETING_VERSION in the pbxproj covers the watch and widget
# targets (their tracked Info.plists in apps/app/targets carry no version
# key), and the app's generated ios/*/Info.plist holds a literal
# CFBundleShortVersionString that needs setting directly. Both rewrites are
# verified by reading the value back — a perl that matches nothing exits 0
# and reports success (AcctMind's plist-a-version-behind scar, AGENTS.md).
# ios/ is gitignored, so this edits generated files only, never the tree
# the lane is about to tag.
IOS_WS=""
sync_ios_version() {
  V=$( cd "$ROOT/$APPDIR" && node -p "require('./app.json').expo.version" 2>/dev/null )
  # digits-and-dots or refuse: node -p prints the STRING "undefined" for a
  # missing key, which is non-empty and would sync verbatim into the project.
  case "$V" in
    ''|*[!0-9.]*) echo "no usable expo.version in $APPDIR/app.json (got '$V')" >&2; return 1 ;;
  esac
  PBX=$(ls "$ROOT/$APPDIR"/ios/*.xcodeproj/project.pbxproj 2>/dev/null | head -1)
  [ -n "$PBX" ] || { echo "no project.pbxproj beside the workspace" >&2; return 1; }
  perl -i -pe "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $V;/g" "$PBX"
  if grep 'MARKETING_VERSION' "$PBX" | grep -qv " = $V;"; then
    echo "MARKETING_VERSION did not sync to $V in $PBX" >&2; return 1
  fi
  PLIST="$ROOT/$APPDIR/ios/$(basename "$IOS_WS" .xcworkspace)/Info.plist"
  CUR=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null)
  case "$CUR" in
    ''|*MARKETING_VERSION*) : ;;  # absent, or a build-setting reference the pbxproj now feeds
    "$V") : ;;
    *) /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $V" "$PLIST" \
         || { echo "could not set CFBundleShortVersionString in $PLIST" >&2; return 1; }
       CUR=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null)
       [ "$CUR" = "$V" ] || { echo "CFBundleShortVersionString did not sync to $V in $PLIST" >&2; return 1; } ;;
  esac
  echo "    version: $V (synced into the generated project)"
}
prebuild_ios() {
  [ -n "$IOS_WS" ] && return 0
  IOS_WS=$(ls -d "$ROOT/$APPDIR"/ios/*.xcworkspace 2>/dev/null | head -1)
  if [ -z "$IOS_WS" ]; then
    # LANG is not optional: CocoaPods dies in unicode_normalize without a UTF-8
    # locale, naming nothing useful.
    ( cd "$ROOT/$APPDIR" && LANG=en_US.UTF-8 npx expo prebuild --platform ios --clean ) \
      || { echo "prebuild failed" >&2; return 1; }
    IOS_WS=$(ls -d "$ROOT/$APPDIR"/ios/*.xcworkspace 2>/dev/null | head -1)
    [ -n "$IOS_WS" ] || { echo "prebuild produced no xcworkspace" >&2; return 1; }
  fi
  # Even a fresh prebuild goes through the sync: the verify is the point.
  sync_ios_version || return 1
}

# ------------------------------------------------------------------- macOS
if [ "$WANT_MAC" = 1 ]; then
  echo "==> macOS desktop bundle"
  heavy_lock "CalMind macOS" || exit 1
  ensure_dist || exit 1
  ( cd "$ROOT" && npm -w "$DESKTOP_WS" run build ) \
    || { echo "the macOS bundle failed to build" >&2; exit 1; }
  APPBUNDLE=$(ls -d "$ROOT"/desktop/src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1)
  [ -n "$APPBUNDLE" ] || { echo "the build reported success and produced no .app" >&2; exit 1; }
  echo "    $APPBUNDLE"
  # WAS IT OPEN? Sean, 2026-09-21: "make sure to reopen already opened apps in
  # a dtp.. i was looking at an old acctmind". An rm -rf and a cp -R under a
  # RUNNING app change nothing you can see: macOS still has the old bundle's
  # code mapped, the window keeps the JS it launched with, and the release
  # looks like it did nothing. That is the afternoon he spent reading a stale
  # AcctMind while the same build was live on the web, on his phone and in
  # /Applications.
  #
  # MATCH THE BUNDLE PATH, NOT THE APP NAME. The executable inside the bundle
  # is not named after the app — AcctMind.app runs
  # Contents/MacOS/acctmind-desktop, and CalMind.app runs
  # Contents/MacOS/calmind-desktop — so `pgrep -x CalMind` finds nothing and
  # the whole feature silently no-ops on exactly the app that prompted it.
  # APPNAME comes off $APPBUNDLE, the same variable the install below uses, so
  # the two can never disagree about which app this is, and the leading
  # /Applications/ keeps MyCalMind.app out of CalMind.app's match.
  #
  # THIS ASKS BEFORE THE SMOKE RUNS, NOT AFTER, and that ordering is the whole
  # feature. desktop/smoke.sh launches the new bundle, then quits `app
  # "CalMind"` BY NAME and, if that is refused, `pkill -f calmind-desktop` —
  # neither of which can tell his /Applications copy from the one it launched
  # itself. Probe after the smoke and his app is already gone, WASRUNNING
  # reads 0, and the reopen never fires: the exact stale-window afternoon this
  # exists to prevent, with a clean lane log over it. Quitting first also
  # means the smoke launches the bundle it is trying to test, instead of
  # LaunchServices activating the already-running instance of the same bundle
  # id.
  APPNAME=$(basename "$APPBUNDLE" .app)
  WASRUNNING=0
  # 1 means "nothing of his is in the way" — the state the install wants, and
  # the state we are already in when he had nothing open.
  GONE=1
  if pgrep -f "/Applications/$APPNAME.app/Contents/MacOS/" >/dev/null 2>&1; then
    WASRUNNING=1
  fi
  if [ "$WASRUNNING" = 1 ]; then
    echo "    $APPNAME is open — quitting it so the copy lands on a bundle nobody is running"
    # ASKED, NOT KILLED. This is the gesture desktop/smoke.sh already uses. The
    # app holds the only copy of whatever is unsaved in that window, and a
    # release has no business destroying it, so this never escalates to
    # kill -9: if it has not gone after a few seconds, say so and install over
    # it anyway — a stale window is a smaller problem than a skipped deploy.
    #
    # `with timeout` is not decoration. A quit is an Apple Event, and osascript
    # WAITS for the reply — two minutes by default. An app sitting on a "save
    # changes?" sheet, or a first run where macOS is still showing its
    # "Terminal wants to control CalMind" prompt, would hold the whole release
    # there before the few-second loop below ever got to run. Five seconds
    # abandons the WAIT, never the quit: the app goes on quitting, and the
    # process table underneath is the signal we actually trust.
    osascript -e "with timeout of 5 seconds" \
              -e "quit app \"$APPNAME\"" \
              -e "end timeout" >/dev/null 2>&1 || true
    GONE=0
    for _ in 1 2 3 4 5 6 7 8; do
      pgrep -f "/Applications/$APPNAME.app/Contents/MacOS/" >/dev/null 2>&1 || { GONE=1; break; }
      sleep 1
    done
    [ "$GONE" = 1 ] || echo "    $APPNAME would not quit — installing over it anyway" >&2
  fi
  # The smoke's middle check is the one worth having: the content-hashed
  # bundle name links the .app to THIS export, so "it built" cannot be
  # mistaken for "it has tonight's work in it". --no-build: the build above
  # already happened, and tauri build twice is twice the wait for no proof.
  if [ -f "$ROOT/desktop/smoke.sh" ]; then
    ( cd "$ROOT" && sh desktop/smoke.sh --no-build ) || { echo "the macOS smoke failed" >&2; exit 1; }
  fi
  # INSTALL IT. A build sitting in target/release/bundle/macos/ is not a
  # deploy — it is the thing nobody looks at while the app in /Applications
  # goes stale.
  rm -rf "/Applications/$(basename "$APPBUNDLE")"
  cp -R "$APPBUNDLE" /Applications/ \
    || { echo "copying the .app into /Applications failed" >&2; exit 1; }
  echo "    installed: /Applications/$(basename "$APPBUNDLE")"
  # AND PUT HIS SESSION BACK — only if it was open when this started. An app he
  # had closed stays closed: a release that conjures windows onto his desktop
  # is its own kind of rude. Best-effort, like the quit: failing to reopen a
  # window must never turn a shipped release into a failed lane, so nothing
  # here touches the exit status.
  if [ "$WASRUNNING" = 1 ] && [ "$GONE" = 1 ]; then
    if open -a "/Applications/$APPNAME.app" >/dev/null 2>&1; then
      echo "    reopened: $APPNAME (it was running before the install)"
    else
      echo "    could not reopen $APPNAME — it was running before the install" >&2
    fi
  elif [ "$WASRUNNING" = 1 ]; then
    # It refused to quit, so the process still on his screen is the one that
    # was mapped BEFORE the copy — `open -a` would only bring that stale
    # window forward and let the lane log call it "reopened", which is the
    # same lie in different words. Say what is actually true instead.
    echo "    $APPNAME never quit — the window still open is the build from BEFORE this install; quit and reopen it to see this one" >&2
  fi
  heavy_unlock
fi

# --------------------------------------------------------------------- iOS
if [ "$WANT_IOS" = 1 ]; then
  echo "==> iOS"
  # Before the device list, not after it: a wait for the lock can be long,
  # and the phones read after it are the phones that are actually there.
  heavy_lock "CalMind iOS" || exit 1

  # THE PHONES CalMind BELONGS ON. Sean, 2026-09-21, after a release reached a
  # single handset: "you should have dtp to all platforms and all 3 phones and
  # my watch". So a release is not "install to the phone" — and it is not
  # "install to whatever is plugged in" either. Each app in the suite belongs
  # on a SPECIFIC set of handsets, and that set is a fact about the app, not
  # about what is on the desk: "the only apps installed on autumn's phone are
  # ChefMind and CalMind", "patricia's phone only gets CalMind", "my phone gets
  # all 6 (including the test ones)". CalMind is the app that is on all three,
  # which is why all three are listed here and why this list is not shared.
  #
  # BY UDID, NEVER BY NAME. Two of these three names carry an apostrophe and
  # they are not the same character: devicectl reports Autumn's with a plain
  # ASCII ' (U+0027) and Patricia‘s with a CURLY one (U+2018) — read off the
  # live list on 2026-09-21, not guessed. A name matched in a script is a name
  # you typed at both ends, so it matches in a test and not on the day. The
  # udid is what devicectl, the provisioning profile and -destination all
  # speak anyway.
  #
  # IOS_PHONES replaces the list wholesale (udids, space- or newline-separated)
  # and IOS_DEVICE, below, still narrows a run to one handset by name.
  if [ -z "${IOS_PHONES:-}" ]; then
    IOS_PHONES="00008130-000E3D060E20001C"              # iPhoooooone, Sean's
    IOS_PHONES="$IOS_PHONES 00008130-001A645E1E98001C"  # Autumn's iPhone 15 Pro
    IOS_PHONES="$IOS_PHONES 00008130-0002605E0243001C"  # Patricia‘s iPhone
  fi

  DEVJSON=$(mktemp -t calmind-devices)
  xcrun devicectl list devices --json-output "$DEVJSON" >/dev/null 2>&1 \
    || { echo "devicectl cannot list devices — is Xcode installed?" >&2; exit 1; }
  # Every iPhone this Mac can reach right now, one "<udid> <name>" per line.
  # The UDID, not the CoreDevice identifier: xcodebuild's -destination matches
  # a physical device by UDID, and handing it the other one finds nothing. The
  # name comes along only so the run can say which phone it is talking about.
  SEEN=$(mktemp -t calmind-seen)
  # This one outlives the build — it is read again after the .app exists, to
  # name each phone — so it is cleaned up on the way OUT. Removing it inline,
  # the way $DEVJSON is, would leave it behind on exactly the runs that fail.
  #
  # Setting it REPLACES the heavy-build lock's own EXIT trap (POSIX traps do
  # not stack), so it lets the lock go as well. Without that, every `exit 1`
  # below left the lock behind, held by a pid that no longer existed, for the
  # next build to notice and break.
  trap 'rm -f "$SEEN"; heavy_unlock' EXIT
  python3 - "$DEVJSON" >"$SEEN" <<'PY' || { echo "could not read the device list" >&2; exit 1; }
import json, sys
d = json.load(open(sys.argv[1]))
# tunnelState: a paired phone that is merely idle lists as 'disconnected'
# until something warms the tunnel, so excluding it skipped the iOS step of
# CalMind 1.17.0 with the phone sitting right there (2026-08-30). Only
# 'unavailable' is a genuinely absent device — the second paired handset
# proves it.
for x in d.get('result', {}).get('devices', []):
    hw = x.get('hardwareProperties', {})
    if hw.get('platform') != 'iOS' or not hw.get('udid'):
        continue
    if x.get('connectionProperties', {}).get('tunnelState') not in ('connected', 'available', 'disconnected'):
        continue
    print(hw['udid'] + ' ' + x.get('deviceProperties', {}).get('name', '?'))
PY
  rm -f "$DEVJSON"
  # Two questions, and they are NOT the same one: is this udid in the list
  # devicectl just gave us, and what is the phone called. Answering the first
  # with the second — treating "no name came back" as "no such phone" — would
  # report a connected handset as switched off and quietly skip it, and the
  # run would still exit 0 having missed a phone. The name is for the humans
  # reading the output; only phone_seen decides anything.
  phone_seen() { awk -v u="$1" '$1 == u { found = 1 } END { exit !found }' "$SEEN"; }
  phone_name() { awk -v u="$1" '$1 == u { sub(/^[^ ]* */, ""); print ($0 == "" ? u : $0); exit }' "$SEEN"; }

  # IOS_DEVICE is the older override and it still wins: it narrows the whole
  # run — build and install — to the one reachable handset with that name. It
  # is deliberately by name, because a name is what you have when someone hands
  # you a phone; the list above is by udid because that is what survives.
  if [ -n "${IOS_DEVICE:-}" ]; then
    NAMED=''; NAMEDN=0
    while read -r _u _n; do
      [ "$_n" = "$IOS_DEVICE" ] || continue
      NAMED="$_u"; NAMEDN=$((NAMEDN + 1))
    done < "$SEEN"
    [ "$NAMEDN" = 1 ] || {
      echo "IOS_DEVICE='$IOS_DEVICE' matched $NAMEDN reachable iPhones" >&2
      while read -r _u _n; do echo "    seen: $_n" >&2; done < "$SEEN"
      exit 1
    }
    IOS_PHONES="$NAMED"
  fi

  # A listed phone devicectl does not report at all is SKIPPED with a note, not
  # an error: it is switched off or off the network, which is a normal Tuesday
  # and not a broken release. Refusing the run over it would be the 2026-08-23
  # bug in a new costume — the script demanded EXACTLY one reachable device
  # then, and a second paired handset made it report "no single reachable
  # iPhone" for three releases in a row with the right phone sitting there the
  # whole time.
  PHONES=''; UDID=''
  for U in $IOS_PHONES; do
    if ! phone_seen "$U"; then
      echo "    skipping $U — devicectl does not see it (switched off, or off the network)"
      continue
    fi
    PHONES="$PHONES $U"
    # The FIRST phone on the list that devicectl reports is the one the build
    # is aimed at — list order, not whoever replied quickest, so two runs with
    # the same phones on the desk build against the same handset. Every
    # reachable phone gets the install either way: nothing about the bundle is
    # per-handset, so this choice only decides whose tunnel gets warmed.
    [ -n "$UDID" ] || UDID="$U"
  done
  [ -n "$PHONES" ] || {
    echo "no usable iPhone: none of the phones this app belongs on are reachable" >&2
    echo "  Plug one in, or name it:  IOS_DEVICE='Some iPhone' sh tools/build-platforms.sh --ios" >&2
    echo "  or aim the run elsewhere: IOS_PHONES='<udid> <udid>' sh tools/build-platforms.sh --ios" >&2
    exit 1
  }
  echo "    building on: $UDID ($(phone_name "$UDID"))"
  for U in $PHONES; do echo "    installing to: $(phone_name "$U")"; done

  prebuild_ios || exit 1
  SCHEME=$(basename "$IOS_WS" .xcworkspace)
  DERIVED="$BUILD_SCRATCH/derived-platforms"
  echo "    workspace: $(basename "$IOS_WS")  scheme: $SCHEME"

  # REGISTER A NEW WATCH BEFORE THE PHONE BUILD — 2026-09-07. The embedded
  # watch app is signed for whatever devices the team's watchkit profile holds,
  # and a build whose -destination is the PHONE never adds the watch: its
  # profile came out WITHOUT the watch's UDID, and the watch install failed
  # 0xe8008012 ("provisioning profile cannot be installed on this device") with
  # a paired watch sitting right there. A device is registered by building
  # something with THAT device as the destination — which is what
  # -allowProvisioningUpdates keys off. So if exactly one watch is reachable
  # and it is not yet in any cached profile, build the watch scheme against it
  # once, here, so the phone build below signs the embedded copy for a profile
  # that includes it. EVERY step is non-fatal: a failure just leaves the old
  # behaviour (the watch install warns, the release goes on).
  watch_in_profile() {
    for _p in "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/"*.mobileprovision; do
      [ -f "$_p" ] || continue
      security cms -D -i "$_p" 2>/dev/null \
        | plutil -extract ProvisionedDevices xml1 -o - - 2>/dev/null \
        | grep -q "$1" && return 0
    done
    return 1
  }
  # The watch scheme is synthesized by xcodebuild from the target, so there is
  # no .xcscheme file to look for; the generated target directory is the marker
  # that this app has a watch at all (a watchless app has none, and skips).
  WATCH_SCHEME="${SCHEME}Watch"
  if [ -d "$BUILD_SCRATCH/.targets/$WATCH_SCHEME" ]; then
    WJSON0=$(mktemp -t calmind-watch0)
    WUDID0=''
    xcrun devicectl list devices --json-output "$WJSON0" >/dev/null 2>&1 && WUDID0=$(python3 - "$WJSON0" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
# Same tunnelState set the phone uses: a paired-but-idle watch lists as
# 'disconnected' until something warms the tunnel, and is still usable.
ok = [x['hardwareProperties']['udid'] for x in d.get('result', {}).get('devices', [])
      if x.get('hardwareProperties', {}).get('platform') == 'watchOS'
      and x.get('connectionProperties', {}).get('tunnelState') in ('connected', 'available', 'disconnected')
      and x.get('hardwareProperties', {}).get('udid')]
print(ok[0] if len(ok) == 1 else '')
PY
)
    rm -f "$WJSON0"
    if [ -n "$WUDID0" ] && ! watch_in_profile "$WUDID0"; then
      echo "    registering watch $WUDID0 (one-time — it is in no watchkit profile yet)"
      if xcodebuild -workspace "$IOS_WS" -scheme "$WATCH_SCHEME" -configuration Release \
          -destination "platform=watchOS,id=$WUDID0" -derivedDataPath "$DERIVED" \
          -allowProvisioningUpdates build >/dev/null 2>&1; then
        echo "    watch registered — the phone build will sign the watch app for it"
      else
        echo "    watch registration build did not complete; the watch install may still need a hand" >&2
      fi
    fi
  fi

  LOG=$(mktemp -t calmind-ios)
  # -destination with a SPECIFIC device, never -sdk: -sdk overrides SDKROOT
  # for every target in the scheme, so the watch complication compiles
  # against the iOS SDK and fails on code that is perfectly correct.
  if ! xcodebuild -workspace "$IOS_WS" -scheme "$SCHEME" -configuration Release \
      -destination "platform=iOS,id=$UDID" -derivedDataPath "$DERIVED" \
      -allowProvisioningUpdates -allowProvisioningDeviceRegistration build >"$LOG" 2>&1; then
    echo "the iOS build failed — last lines:" >&2
    tail -25 "$LOG" >&2; echo "full log: $LOG" >&2; exit 1
  fi
  rm -f "$LOG"

  BUNDLE="$DERIVED/Build/Products/Release-iphoneos/$SCHEME.app"
  [ -d "$BUNDLE" ] || { echo "the build succeeded and produced no $SCHEME.app" >&2; exit 1; }
  # devicectl installs onto a LOCKED phone; only launching needs it awake.
  #
  # ONE BUILD, EVERY PHONE. The .app is not per-handset — it is signed for a
  # profile that carries every registered device — so the build above happened
  # once and this walks the list installing that same bundle.
  #
  # There is NO per-phone app cap to ration here, and the comment that stood in
  # this spot until 2026-09-21 — counting the phone's slots against Apple's
  # free-tier limit of 3 apps on a device, CalMind, ChefMind, AcctMind and no
  # room for a fourth — was describing a limit this suite is not under. The
  # team, 2LGYTL3FSJ ("Sean Cheren"), is PAID, and the profile is the tell: an
  # Xcode-managed profile for this team carries TimeToLive 365 where a personal
  # team's carries 7. Sean, 2026-09-21: "no more caps per phone."
  OK=0
  for U in $PHONES; do
    N=$(phone_name "$U")
    # Retried once — the same shape, and for the same reason, as the watch
    # install below: the first call routinely times out enabling developer
    # disk image services and succeeds immediately afterwards.
    if xcrun devicectl device install app --device "$U" "$BUNDLE" \
       || xcrun devicectl device install app --device "$U" "$BUNDLE"; then
      OK=$((OK + 1))
      echo "    installed $SCHEME.app on $N"
    else
      echo "    the install failed on $N ($U) — is it paired with this Mac?" >&2
      echo "    If it is not REGISTERED with the team yet, devicectl refuses with a" >&2
      echo "    provisioning error and one build against it is the cure:" >&2
      echo "      IOS_PHONES=$U sh tools/build-platforms.sh --ios" >&2
    fi
  done
  # THE FAILURE RULE, and it is not the old one. A release that reached two of
  # the three phones SHIPPED: the build is live on a handset Sean can open, and
  # a phone that refused is a phone — asleep, unregistered, someone else's
  # pocket — not a broken build. Only NONE is the failure the single `exit 1`
  # here used to catch, back when there was one phone and "the install failed"
  # and "nothing got installed" were the same sentence.
  [ "$OK" -gt 0 ] || { echo "not one phone took $SCHEME.app" >&2; exit 1; }

  # The watch companion (apps/app/targets/watch) is embedded under Watch/ in
  # the phone bundle and installs SEPARATELY — devicectl talks to the watch
  # as its own device. Not fatal when no single watch answers: the phone
  # installs above are the release artifact, the watch is its rider.
  WATCHAPP=$(ls -d "$BUNDLE"/Watch/*.app 2>/dev/null | head -1)
  if [ -n "$WATCHAPP" ]; then
    echo "==> watch app"
    WJSON=$(mktemp -t calmind-watch)
    xcrun devicectl list devices --json-output "$WJSON" >/dev/null 2>&1 || true
    WUDID=$(python3 - "$WJSON" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(''); raise SystemExit
ok = [x['hardwareProperties']['udid'] for x in d.get('result', {}).get('devices', [])
      if x.get('hardwareProperties', {}).get('platform') == 'watchOS'
      and x.get('hardwareProperties', {}).get('udid')]
print(ok[0] if len(ok) == 1 else '')
PY
)
    rm -f "$WJSON"
    if [ -n "$WUDID" ]; then
      # Retried once: the first call routinely times out enabling developer
      # disk image services and succeeds immediately afterwards.
      xcrun devicectl device install app --device "$WUDID" "$WATCHAPP" \
        || xcrun devicectl device install app --device "$WUDID" "$WATCHAPP" \
        || { echo "    the watch install failed — unlock the watch and retry:" >&2
             echo "      xcrun devicectl device install app --device $WUDID \"$WATCHAPP\"" >&2; }
    else
      echo "    no single watch found; install by hand:"
      echo "      xcrun devicectl device install app --device <watch-udid> \"$WATCHAPP\""
    fi
  fi
  heavy_unlock
fi

# ----------------------------------------------------------------- Android
if [ "$WANT_ANDROID" = 1 ]; then
  echo "==> Android"
  # Before the emulator boot, which is itself part of what must not run
  # beside another build: on 2026-08-22 the emulator's CPU thread hung with a
  # gradle and an xcodebuild going at once.
  heavy_lock "CalMind Android" || exit 1
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  [ -d "$ANDROID_HOME" ] || { echo "no Android SDK at \$ANDROID_HOME ($ANDROID_HOME)" >&2; exit 1; }
  command -v adb >/dev/null || { echo "adb not on PATH under \$ANDROID_HOME" >&2; exit 1; }

  # A device already reachable — real hardware or an emulator someone left
  # running — wins outright; nothing here boots a second one on top of it.
  SERIAL=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  if [ -z "$SERIAL" ]; then
    AVD="${ANDROID_AVD:-}"
    if [ -z "$AVD" ]; then
      # `avdmanager` reports a system image as installed from its OWN
      # metadata, which can be stale — one on this machine names a directory
      # that does not exist. Each candidate is checked on DISK.
      for CAND in $(emulator -list-avds 2>/dev/null); do
        IMG=$(sed -n 's/^image\.sysdir\.1=//p' "$HOME/.android/avd/$CAND.avd/config.ini" 2>/dev/null)
        if [ -n "$IMG" ] && [ -d "$ANDROID_HOME/$IMG" ]; then AVD="$CAND"; break; fi
      done
    fi
    [ -n "$AVD" ] || { echo "no Android emulator running and no bootable AVD found" >&2; exit 1; }
    echo "    booting $AVD"
    nohup emulator -avd "$AVD" -no-snapshot-load -no-boot-anim -netdelay none -netspeed full \
      >"/tmp/calmind-emulator-$AVD.log" 2>&1 &
    disown 2>/dev/null || true
    i=0
    while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
      sleep 5; i=$((i + 1))
      [ "$i" -le 72 ] || { echo "$AVD did not finish booting within 6 minutes" >&2; exit 1; }
    done
    SERIAL=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
    [ -n "$SERIAL" ] || { echo "$AVD booted but adb sees no device" >&2; exit 1; }
  fi
  echo "    device: $SERIAL"

  ( cd "$ROOT/$APPDIR" && LANG=en_US.UTF-8 npx expo prebuild --platform android --clean ) \
    || { echo "android prebuild failed" >&2; exit 1; }

  # assembleRelease, not debug: gradle here signs BOTH build types with the
  # auto-generated debug keystore (there is no release keystore in the suite),
  # so release installs exactly as easily and is what a real release uses.
  # A build killed by a full disk leaves a Gradle LOCK behind and the next run
  # fails in under a second — `./gradlew --stop` and remove
  # apps/app/android/.gradle.
  ( cd "$ROOT/$APPDIR/android" && ANDROID_HOME="$ANDROID_HOME" ./gradlew assembleRelease ) \
    || { echo "the Android build failed" >&2; exit 1; }

  APK=$(find "$ROOT/$APPDIR/android/app/build/outputs/apk" -name "*.apk" 2>/dev/null | head -1)
  [ -n "$APK" ] || { echo "the Android build produced no APK" >&2; exit 1; }

  # Package and launch activity read OFF THE BUILT APK via aapt, not guessed
  # from app.json — the source of truth for what just got built.
  AAPT=$(ls "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort -V | tail -1)
  [ -n "$AAPT" ] || { echo "no aapt under \$ANDROID_HOME/build-tools" >&2; exit 1; }
  BADGING=$("$AAPT" dump badging "$APK")
  PKG=$(printf '%s\n' "$BADGING" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
  ACTIVITY=$(printf '%s\n' "$BADGING" | sed -n "s/^launchable-activity: name='\([^']*\)'.*/\1/p")
  [ -n "$PKG" ] && [ -n "$ACTIVITY" ] \
    || { echo "could not read package/activity from the built APK" >&2; exit 1; }

  adb -s "$SERIAL" install -r "$APK" || { echo "adb install failed" >&2; exit 1; }
  adb -s "$SERIAL" shell am start -n "$PKG/$ACTIVITY" >/dev/null \
    || { echo "the app installed but would not launch" >&2; exit 1; }
  # Polled, not one sleep-then-check: a cold RN launch loads a dozen native
  # libraries before the process is fully up, and 5 seconds flat once reported
  # "not running" for a process ps showed alive a moment later.
  RUNNING=0
  for _ in 1 2 3 4 5 6; do
    if adb -s "$SERIAL" shell "ps -A" 2>/dev/null | grep -q "$PKG"; then RUNNING=1; break; fi
    sleep 3
  done
  [ "$RUNNING" = 1 ] || { echo "installed and launched but never showed up running" >&2; exit 1; }
  echo "    installed and running: $PKG on $SERIAL"
  heavy_unlock
fi
