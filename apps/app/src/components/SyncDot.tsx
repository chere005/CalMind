/**
 * The sync status, as one dot and one sentence.
 *
 * Extracted rather than copied. Sean asked for a status indicator in the note
 * editor as well as in Settings, and this app has already been bitten by the
 * same control existing twice — four copies of the collapse-all button, three
 * treatments of the chevron. The colour rule is the interesting part and it
 * belongs in exactly one place.
 *
 * The ORDER of the states matters and is the reason this is not a lookup
 * table: a device that cannot write its own copy comes first, because being
 * online is no comfort if a reload loses the morning.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import { themed, T } from '../theme';

export type SyncLook = { color: string; text: string };

/** Pure, so both surfaces and any test agree on what a state looks like. */
export function syncLook(
  syncState: 'idle' | 'syncing' | 'offline' | 'refused',
  persistFailed: boolean,
): SyncLook {
  if (persistFailed) {
    return { color: T.danger, text: 'This device cannot save its copy — a reload may lose recent changes.' };
  }
  if (syncState === 'refused') {
    return { color: T.danger, text: 'A note is too long to save — it is on this device only. Shorten it to sync.' };
  }
  if (syncState === 'offline') return { color: T.gold, text: 'Offline — changes sync when you are back' };
  if (syncState === 'syncing') return { color: T.accent, text: 'Syncing…' };
  return { color: T.accent, text: 'Online — synced' };
}

/**
 * The dot alone, for a corner that has no room for a sentence.
 *
 * It carries the sentence as its accessibility label, because a bare coloured
 * circle tells a screen reader — and a colour-blind reader — nothing at all.
 * That is also why the note editor's one is a dot AND the word when there is
 * something wrong: green needs no explanation, red does.
 */
export function SyncDot({ testID, withText = false }: { testID?: string; withText?: boolean }) {
  const { syncState, persistFailed } = useStore();
  const look = syncLook(syncState, persistFailed);
  const bad = look.color === T.danger || look.color === T.gold;
  return (
    <View style={s.row} testID={testID} accessibilityLabel={look.text}>
      <View style={[s.dot, { backgroundColor: look.color }]} />
      {withText && bad && <Text style={s.short} numberOfLines={1}>{look.color === T.gold ? 'Offline' : 'Not saved'}</Text>}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  short: { color: T.dim, fontSize: 11 },
}));
