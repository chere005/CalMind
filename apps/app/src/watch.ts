/**
 * The watch feed: a small JSON list pushed through WatchConnectivity whenever
 * the store changes. The native module exists only on iOS once the watch target
 * is wired (see apps/watch/README.md); everywhere else this is a no-op, so the
 * shared code never branches on it.
 */
import { Platform } from 'react-native';
import { todayStr, watchFeed, type AnyRec } from '@calmind/core';

type Bridge = {
  push: (json: string) => void;
  drainWidgetTicks?: () => string[];
  widgetCalendars?: () => string[];
  addListener?: (event: string, cb: (payload: { id: string }) => void) => { remove(): void };
};
let bridge: Bridge | null = null;
if (Platform.OS === 'ios') {
  try {
    // requireOptionalNativeModule keeps Expo Go and Android builds clean.
    const { requireOptionalNativeModule } = require('expo-modules-core');
    bridge = requireOptionalNativeModule?.('WatchBridge') ?? null;
  } catch {
    bridge = null;
  }
}

/**
 * The watch's check-offs, queued through WatchConnectivity and applied on the
 * phone by whoever subscribes (the store). No-op without the bridge, exactly
 * like the push side.
 */
export function onWatchTick(cb: (id: string) => void): () => void {
  const sub = bridge?.addListener?.('onTick', ({ id }) => cb(id));
  return () => sub?.remove();
}

/**
 * The home-screen widget's queued check-offs, read and cleared in one step.
 *
 * The widget cannot reach the store, so it leaves ids in the shared App
 * Group and the app drains them when it comes forward. Empty everywhere the
 * bridge does not exist, which is every platform but iOS.
 */
export function drainWidgetTicks(): string[] {
  try {
    return bridge?.drainWidgetTicks?.() ?? [];
  } catch {
    // A widget that cannot hand its ticks over must not stop the app opening.
    return [];
  }
}

export function pushWatchList(recs: AnyRec[], shared: { recs: AnyRec[]; partner: string } | null = null): void {
  if (!bridge) return;
  try {
    // items + events in one context: an old watch build decodes {items} and
    // ignores the rest, so the payload widens without a lockstep upgrade.
    //
    // The partner's records travel too, for their shared CALENDARS: the
    // widget's picker was offering none, because the feed is built from my
    // store and theirs is a separate one.
    // The widget's own calendar selection rides along, so the watch's first
    // page can mirror it (Sean's ask). Read fresh on every push: the widget
    // rewrites it whenever its configuration changes, and nothing notifies
    // the app when that happens.
    let cals: string[] = [];
    try {
      cals = bridge.widgetCalendars?.() ?? [];
    } catch {
      // An older build of the native module has no such function. The watch
      // then mirrors nothing and shows everything, which is what it did
      // before this existed — a worse page, never a broken one.
    }
    bridge.push(JSON.stringify(watchFeed(recs, todayStr(), shared, cals)));
  } catch {
    // The watch being unreachable must never cost the phone anything.
  }
}
