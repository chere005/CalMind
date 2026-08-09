/**
 * The watch feed: a small JSON list pushed through WatchConnectivity whenever
 * the store changes. The native module exists only on iOS once the watch target
 * is wired (see apps/watch/README.md); everywhere else this is a no-op, so the
 * shared code never branches on it.
 */
import { Platform } from 'react-native';
import { watchRows, type AnyRec } from '@calmind/core';

let bridge: { push: (json: string) => void } | null = null;
if (Platform.OS === 'ios') {
  try {
    // requireOptionalNativeModule keeps Expo Go and Android builds clean.
    const { requireOptionalNativeModule } = require('expo-modules-core');
    bridge = requireOptionalNativeModule?.('WatchBridge') ?? null;
  } catch {
    bridge = null;
  }
}

export function pushWatchList(recs: AnyRec[]): void {
  if (!bridge) return;
  try {
    bridge.push(JSON.stringify({ items: watchRows(recs) }));
  } catch {
    // The watch being unreachable must never cost the phone anything.
  }
}
