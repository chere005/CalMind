/**
 * The watch feed: a small JSON list pushed through WatchConnectivity whenever
 * the store changes. The native module exists only on iOS once the watch target
 * is wired (see apps/watch/README.md); everywhere else this is a no-op, so the
 * shared code never branches on it.
 */
import { Platform } from 'react-native';
import { sortByDate, byOrd, type AnyRec, type Rec } from '@calmind/core';

type WatchRow = { id: string; text: string; due: string | null; time: string | null; done: boolean };

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
  const reminders = recs
    .filter((r): r is Rec<'reminder'> => r.type === 'reminder' && !r.deleted && !r.payload.done)
    .sort((a, b) => byOrd(a.payload, b.payload));
  const rows: WatchRow[] = sortByDate(
    reminders.map((r) => ({ id: r.id, indent: r.payload.indent, due: r.payload.due, time: r.payload.time, text: r.payload.text, done: r.payload.done })),
  ).map(({ id, text, due, time, done }) => ({ id, text, due, time, done }));
  try {
    bridge.push(JSON.stringify({ items: rows }));
  } catch {
    // The watch being unreachable must never cost the phone anything.
  }
}
