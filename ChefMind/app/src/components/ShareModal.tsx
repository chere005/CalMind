/**
 * The suite's share window: who I share with (strictly mutual — the badge
 * says 'sharing' only when both lists name each other, 'waiting for them'
 * otherwise), and the three opt-in tick lists — calendars, reminder folders,
 * note folders. Nothing is visible to the other person until it's ticked,
 * and everything here edits MY share record only; the server re-checks the
 * handshake from both stores on every shared read and write.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { byRecOrd, SHARE_ID, shareOf, type AnyRec, type Rec, type Share } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill, Scroll } from '../ui';

export function ShareModal({ onClose }: { onClose: () => void }) {
  const { recs, mutate, partners, syncNow } = useStore();
  const share = shareOf(recs);
  const [newPartner, setNewPartner] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');

  const putShare = (next: Share) => {
    mutate((e) => e.put({ id: SHARE_ID, type: 'share', updated: 0, payload: next } as AnyRec));
    void syncNow();
  };
  const toggle = (bucket: 'calendars' | 'folders' | 'notefolders', id: string) => {
    const list = share[bucket];
    putShare({ ...share, [bucket]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  const foldersOf = (app: 'reminders' | 'notes') =>
    recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && !r.deleted && (r.payload.app ?? 'reminders') === app)
      .sort(byRecOrd);
  const calendars = recs
    .filter((r): r is Rec<'calendar'> => r.type === 'calendar' && !r.deleted)
    .sort(byRecOrd);

  const badge = (name: string) => partners.find((p) => p.name === name)?.mutual ? 'sharing' : 'waiting for them';

  const tickRow = (id: string, name: string, color: string, bucket: 'calendars' | 'folders' | 'notefolders') => {
    const on = share[bucket].includes(id);
    return (
      <Pressable key={id} testID={`share-${bucket}-${name}`} style={s.row} onPress={() => toggle(bucket, id)}>
        <View style={[s.box, on && s.boxOn]}>{on && <Text style={s.boxTick}>✓</Text>}</View>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.rowText}>{name}</Text>
      </Pressable>
    );
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.h2}>Sharing</Text>
          <Scroll style={s.scroll}>
            {share.partners.length === 0 && (
              <Text style={s.empty}>
                Sharing is a handshake: add someone below, and it starts only once they add you back.
                Then tick what they may see — nothing is shared until it's ticked.
              </Text>
            )}
            {share.partners.map((name) => (
              <View key={name} style={s.row}>
                {renaming === name ? (
                  <Field
                    value={labelText}
                    onChangeText={setLabelText}
                    autoFocus
                    style={s.addField}
                    onBlur={() => setRenaming(null)}
                    onSubmitEditing={() => {
                      setRenaming(null);
                      const label = labelText.trim();
                      const labels = { ...share.labels };
                      if (label && label !== name) labels[name] = label;
                      else delete labels[name];
                      putShare({ ...share, labels });
                    }}
                  />
                ) : (
                  <Text style={s.partnerName}>{share.labels?.[name] ?? name}</Text>
                )}
                <Text style={[s.badge, badge(name) === 'sharing' && s.badgeOn]}>{badge(name)}</Text>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => { setRenaming(name); setLabelText(share.labels?.[name] ?? name); }} />
                <ConfirmDelete
                  size={24}
                  onDelete={() => putShare({ ...share, partners: share.partners.filter((p) => p !== name) })}
                />
              </View>
            ))}
            <View style={s.row}>
              <Field
                testID="share-add-partner"
                value={newPartner}
                onChangeText={setNewPartner}
                placeholder="Add a partner by username"
                autoCapitalize="none"
                style={s.addField}
                onSubmitEditing={() => {
                  const name = newPartner.trim().toLowerCase();
                  if (name && !share.partners.includes(name)) putShare({ ...share, partners: [...share.partners, name] });
                  setNewPartner('');
                }}
              />
            </View>

            <Text style={s.group}>Calendars</Text>
            {calendars.map((c) => tickRow(c.id, c.payload.name, c.payload.color, 'calendars'))}
            <Text style={s.group}>Reminder folders</Text>
            {foldersOf('reminders').map((f) => tickRow(f.id, f.payload.name, f.payload.color, 'folders'))}
            <Text style={s.group}>Note folders</Text>
            {foldersOf('notes').map((f) => tickRow(f.id, f.payload.name, f.payload.color, 'notefolders'))}
          </Scroll>
          <View style={s.footRow}>
            <Pill label="Done" primary onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20 },
  h2: { color: T.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  scroll: { flexGrow: 0 },
  empty: { color: T.dim, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  partnerName: { color: T.text, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { color: T.muted, fontSize: 12 },
  badgeOn: { color: T.accent, fontWeight: '700' },
  addField: { flex: 1 },
  group: { color: T.gold, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 2 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  boxTick: { color: T.accent, fontSize: 13, fontWeight: '800' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  footRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
}));
