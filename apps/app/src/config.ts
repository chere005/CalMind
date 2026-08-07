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
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!local) return new URL('api/index.php', location.href).toString();
    return 'http://127.0.0.1:8788/api/index.php';
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:8788/api/index.php';
  return 'http://127.0.0.1:8788/api/index.php';
}
