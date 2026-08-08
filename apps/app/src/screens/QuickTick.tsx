/**
 * The suite's quick.php?tick= mode: the widget's row link opens THIS — one
 * reminder and a single Done button. The tick deliberately happens here, on
 * the signed-in session, rather than behind the feed's token, so the
 * read-only-token rule still holds: a repeat rolls to its next date
 * (reminderToggle), a plain one marks done, and either way you land on the
 * Calendar like any sign-in.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { reminderToggle, repeatLabel, timeLabel, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { Pill } from '../ui';

export function QuickTick({ id, onDone }: { id: string; onDone: () => void }) {
  const { recs, mutate, syncState } = useStore();
  const r = recs.find((x): x is Rec<'reminder'> => x.type === 'reminder' && x.id === id && !x.deleted);

  return (
    <View style={s.page}>
      <View style={s.card}>
        {r ? (
          <>
            <Text style={s.text}>{r.payload.text}</Text>
            {(r.payload.due || r.payload.time || r.payload.repeat) && (
              <Text style={s.chip}>
                {[r.payload.due, timeLabel(r.payload.time), repeatLabel(r.payload.repeat)].filter(Boolean).join(' · ')}
              </Text>
            )}
            <Pill
              testID="quick-done"
              label={r.payload.repeat ? 'Done — roll to next' : 'Done'}
              primary
              onPress={() => {
                mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));
                onDone();
              }}
            />
          </>
        ) : (
          <>
            <Text style={s.text}>{syncState === 'syncing' ? 'Fetching…' : 'That reminder is gone — maybe already done.'}</Text>
            <Pill label="Open the calendar" primary onPress={onDone} />
          </>
        )}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 24, gap: 14, alignItems: 'center' },
  text: { color: T.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  chip: { color: T.dim, fontSize: 14 },
}));
