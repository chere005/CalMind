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
    // Only the Expo dev server (metro) needs the absolute fallback — its port
    // serves no api/. Anything else (deployed, the e2e router, a local php -S)
    // serves api/ beside the page, so same-origin relative is the truth.
    const metro = ['8081', '19006'].includes(location.port);
    if (!metro) return new URL('api/index.php', location.href).toString();
    return 'http://127.0.0.1:8788/api/index.php';
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:8788/api/index.php';
  return 'http://127.0.0.1:8788/api/index.php';
}
