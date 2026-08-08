import { Platform } from 'react-native';

/**
 * Where the sync API lives. Deployed web is served beside its api/ so a relative
 * URL just works; dev falls back to the local php -S on 8788. The Android
 * emulator reaches the host Mac as 10.0.2.2, the iOS simulator directly.
 * Settings can override this (stored with the session), so a phone on the LAN
 * can point at the Mac's IP without a rebuild.
 */
export function defaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    // The Tauri desktop shell serves the bundle from its own origin, so
    // same-origin api/ points nowhere — it talks to the live test API.
    if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') {
      return 'https://seancheren.com/test/calmind/api/index.php';
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
  if (Platform.OS === 'android') return 'https://seancheren.com/test/calmind/api/index.php';
  return 'https://seancheren.com/test/calmind/api/index.php';
}
