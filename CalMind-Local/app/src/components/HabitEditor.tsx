/**
 * The small screen a habit is added and edited on: a Name and a Frequency.
 *
 * Sean, 2026-08-11: "adding a habit should go to a small screen with Name and
 * Frequency", and holding one "displays pencil edit icons next to the delete
 * icons which goes to this new edit habit screen". One component for both, so
 * the two cannot drift into offering different things — adding a habit and
 * editing one are the same question asked at different times.
 *
 * It replaces an inline add row and an inline rename field, neither of which
 * had anywhere to put a second field.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FREQUENCIES, frequencyOf, type Frequency, type Rec } from '@calmind/core';
import { themed, T } from '../theme';
import { Field, Pill, Scroll } from '../ui';

export function HabitEditor({
  habit,
  sectionName,
  onSave,
  onClose,
}: {
  /** null when adding; the record when editing. */
  habit: Rec<'habit'> | null;
  sectionName: string;
  onSave: (name: string, frequency: Frequency) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(habit?.payload.name ?? '');
  // A brand-new habit is an every-day habit until said otherwise, which is
  // what every habit was before Frequency existed.
  const [freq, setFreq] = useState<Frequency>(habit ? frequencyOf(habit) : 'always');

  const save = () => {
    const trimmed = name.trim();
    // An empty name is not a habit. Closing without saving is what the
    // backdrop is for, so this stays a no-op rather than deleting anything.
    if (!trimmed) return onClose();
    onSave(trimmed, freq);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        {/* The card swallows presses so a tap inside it does not close. */}
        <Pressable style={s.card} onPress={() => {}}>
          <Scroll keyboardShouldPersistTaps="handled">
            <Text style={s.title}>{habit ? 'Edit habit' : 'New habit'}</Text>
            <Text style={s.where}>in {sectionName}</Text>

            <Text style={s.label}>Name</Text>
            <Field
              testID="habit-name-field"
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Name"
              onSubmitEditing={save}
            />

            <Text style={s.label}>Frequency</Text>
            {/* A row of choices rather than a native picker: three options
                fit, and this reads the same on every platform — the suite has
                no native select either. The chosen one is the accent pill. */}
            <View style={s.freqRow}>
              {FREQUENCIES.map((f) => (
                <Pressable
                  key={f.value}
                  testID={`habit-freq-${f.value}`}
                  // A radio group, which is what it is: one of three, exactly
                  // one chosen.
                  //
                  // BOTH attributes, and that is not belt-and-braces:
                  // react-native-web emits role="radio" from the first and
                  // then drops accessibilityState entirely — measured, by
                  // reading the rendered element's attributes — so on the web
                  // this was a radio that never said which one was chosen.
                  // `aria-checked` is carried through verbatim there, and
                  // React Native maps it back onto accessibilityState on the
                  // native builds, so one line covers both.
                  accessibilityRole="radio"
                  accessibilityState={{ checked: freq === f.value }}
                  aria-checked={freq === f.value}
                  onPress={() => setFreq(f.value)}
                  style={[s.freq, freq === f.value && s.freqOn]}
                >
                  <Text style={[s.freqText, freq === f.value && s.freqTextOn]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            {/* Each option says what it DOES, because "Never" on a habit
                tracker is not self-explanatory — it is the one that stays
                tickable and stops counting. */}
            <Text style={s.hint}>
              {freq === 'always'
                ? 'Counts every day.'
                : freq === 'weekdays'
                  ? 'Monday to Friday. Not shown at all on Saturday and Sunday.'
                  : 'Still here to tick, but never counted in the month’s circles.'}
            </Text>

            <View style={s.actions}>
              <Pill label="Cancel" onPress={onClose} />
              <Pill label="Save" primary testID="habit-save" onPress={save} />
            </View>
          </Scroll>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 16,
    padding: 18,
  },
  title: { color: T.text, fontSize: 20, fontWeight: '800' },
  where: { color: T.muted, fontSize: 13, marginTop: 2, marginBottom: 12 },
  label: { color: T.dim, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  freqRow: { flexDirection: 'row', gap: 8 },
  freq: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqOn: { backgroundColor: T.accentInk, borderColor: T.accent },
  freqText: { color: T.dim, fontSize: 14 },
  freqTextOn: { color: T.accent, fontWeight: '700' },
  hint: { color: T.muted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
}));
