import { Platform } from 'react-native';

/**
 * Where the sync API lives, per surface. There are three environments and
 * only one of them is a deploy:
 *
 *   TEST   https://seancheren.com/test/calmind/ — the only DEPLOYED instance
 *          of this app. server/deploy-test.sh puts it there.
 *   DEV    a local `php -S 127.0.0.1:8788 -t server/public`, whose data dir
 *          is server/data/ (gitignored) unless $CALMIND_DATA_DIR says
 *          otherwise. Nothing deploys it; it is a process on the Mac.
 *   PROD   https://seancheren.com/ is the old PHP suite, NOT this app. The
 *          only thing CalMind puts there is the .well-known passkey pair
 *          (server/deploy-prod.sh). There is no production instance of this
 *          app to point at, which is why no branch below names one.
 */
const TEST_API = 'https://seancheren.com/test/calmind/api/index.php';

export function defaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    // The Tauri desktop shell serves the bundle from its own origin, so
    // same-origin api/ points nowhere — it talks to the live test API.
    if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') {
      return TEST_API;
    }
    // Only the Expo dev server (metro) needs the absolute fallback — its port
    // serves no api/. Anything else (deployed, the e2e router, a local php -S)
    // serves api/ beside the page, so same-origin relative is the truth.
    const metro = ['8081', '19006'].includes(location.port);
    if (!metro) return new URL('api/index.php', location.href).toString();
    return 'http://127.0.0.1:8788/api/index.php';
  }
  // Native sims/dev builds default to the LIVE test instance (Sean's call,
  // 2026-08-08) — trying the app should mean trying your real data. A local
  // php -S is still one Settings override away.
  //
  // iOS and Android agree here. There was a `if (Platform.OS === 'android')`
  // branch returning the same string as the line below it, under a comment
  // about the emulator reaching the host Mac as 10.0.2.2 — true when dev
  // builds pointed at localhost, and untrue since they stopped. A dead branch
  // under a stale comment reads like a rule somebody is relying on.
  return TEST_API;
}
