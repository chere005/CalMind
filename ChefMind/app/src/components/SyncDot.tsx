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
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { SYNC_DOT } from '../ui';

export type SyncLook = { color: string; text: string };

/** Pure, so both surfaces and any test agree on what a state looks like. */
export function syncLook(
  syncState: 'idle' | 'syncing' | 'offline' | 'refused',
  persistFailed: boolean,
  /** Names of the refused records, so the message can point at one. */
  refused: string[] = [],
): SyncLook {
  if (persistFailed) {
    return { color: T.danger, text: 'This device cannot save its copy — a reload may lose recent changes.' };
  }
  if (syncState === 'refused') {
    // Name it. "A note is too long to save" in an app holding hundreds leaves
    // Sean to find it himself, and it is by definition not the one on screen.
    // More than one is listed rather than counted: two names fit, and "3
    // notes" would send him hunting again.
    const named = refused.filter((n) => n.trim() !== '').slice(0, 2).join('”, “');
    return {
      color: T.danger,
      text: named
        ? `“${named}” is too long to save — it is on this device only. Shorten it to sync.`
        : 'A note is too long to save — it is on this device only. Shorten it to sync.',
    };
  }
  if (syncState === 'offline') return { color: T.gold, text: 'Offline — changes sync when you are back' };
  if (syncState === 'syncing') return { color: T.accent, text: 'Syncing…' };
  return { color: T.accent, text: 'Online — synced' };
}

/**
 * The same state as ONE WORD, for a corner with no room for a sentence.
 *
 * The note editor's footer used to print the literal string 'Saved' — not a
 * state, a hardcoded word — so it said "Saved" while this device could not
 * write its own snapshot, while a note was refused for being too long, and
 * while the app was offline. Once the editor grew an honest dot the two sat
 * three inches apart contradicting each other, which is the same fault Settings
 * had and had fixed: a second copy of a message beside a dot that reads the
 * shared one.
 */
export function syncWord(
  syncState: 'idle' | 'syncing' | 'offline' | 'refused',
  persistFailed: boolean,
): string {
  if (persistFailed || syncState === 'refused') return 'Not saved';
  if (syncState === 'offline') return 'Offline';
  return syncState === 'syncing' ? 'Saving…' : 'Saved';
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
  const { syncState, persistFailed, refusedLabels } = useStore();
  const look = syncLook(syncState, persistFailed, refusedLabels);
  const bad = look.color === T.danger || look.color === T.gold;
  return (
    // The word goes to the LEFT of the dot so the DOT is what the right edge
    // anchors. With the dot first, the group was right-aligned and the word
    // shoved the dot leftwards — so the one indicator on the screen jumped
    // sideways at exactly the moment it turned red, which is the moment you
    // want to find it in the same place as always. Now the word grows away
    // from the dot and the dot does not move, in the editor or the top bar.
    <View style={s.row} testID={testID} accessibilityLabel={look.text}>
      {withText && bad && <Text style={s.short} numberOfLines={1}>{syncWord(syncState, persistFailed)}</Text>}
      <View style={[s.dot, { backgroundColor: look.color }]} />
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: SYNC_DOT, height: SYNC_DOT, borderRadius: SYNC_DOT / 2 },
  short: { color: T.dim, fontSize: 11 },
}));
