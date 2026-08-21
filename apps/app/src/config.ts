import { Platform } from 'react-native';

/**
 * Where the sync API lives, per surface. There are three environments and
 * only one of them is a deploy:
 *
 *   PROD   https://seancheren.com/calmind/ — the real one since 2026-08-20,
 *          and what every app and device points at ("all apps and devices
 *          should point to prod, not test now"). It replaced the old PHP
 *          suite at that path; the suite's pages are in
 *          /home/protected/suite-retired.
 *   TEST   https://test.seancheren.com/calmind/ — a sandbox with its own
 *          data dir, deployed by the same script. Nothing defaults here any
 *          more. It served at seancheren.com/test/calmind until 2026-08-20;
 *          that path 404s now.
 *   DEV    https://dev.seancheren.com/calmind/, plus a local
 *          `php -S 127.0.0.1:8788 -t server/public` whose data dir is
 *          server/data/ (gitignored) unless $CALMIND_DATA_DIR says otherwise.
 */
const PROD_API = 'https://seancheren.com/calmind/api/index.php';

export function defaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    // The Tauri desktop shell serves the bundle from its own origin, so
    // same-origin api/ points nowhere — it talks to the live test API.
    if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') {
      return PROD_API;
    }
    // Only the Expo dev server (metro) needs the absolute fallback — its port
    // serves no api/. Anything else (deployed, the e2e router, a local php -S)
    // serves api/ beside the page, so same-origin relative is the truth.
    const metro = ['8081', '19006'].includes(location.port);
    if (!metro) return new URL('api/index.php', location.href).toString();
    return 'http://127.0.0.1:8788/api/index.php';
  }
  // Native builds default to PROD (Sean, 2026-08-20). The rule behind it has
  // not changed since 2026-08-08 — trying the app should mean trying your
  // real data — only where the real data lives. A local php -S, or test, is
  // still one Settings override away.
  //
  // iOS and Android agree here. There was a `if (Platform.OS === 'android')`
  // branch returning the same string as the line below it, under a comment
  // about the emulator reaching the host Mac as 10.0.2.2 — true when dev
  // builds pointed at localhost, and untrue since they stopped. A dead branch
  // under a stale comment reads like a rule somebody is relying on.
  return PROD_API;
}
