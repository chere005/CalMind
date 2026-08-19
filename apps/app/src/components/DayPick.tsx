/**
 * The month-grid day picker the Add page's m/d field became (Sean,
 * 2026-08-19: "m/d should be a calendar picker in the add page"). A compact
 * Modal over a dimmed backdrop: ‹ Aug 2026 ›, the weekday row, one tappable
 * cell per day — the calendar screen's grid idioms at picker size. Typed
 * dates did not lose their home: the Add line itself still parses "8/3" out
 * of the text, which is where a typing hand already was.
 *
 * Out-of-month cells follow the calendar screen's rule: lightened, and
 * picking one selects it without paging the shown month first.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { monthGridFilled, todayStr } from '@calmind/core';
import { CircleBtn, Pill } from '../ui';
import { themed, T } from '../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DayPick({ value, onPick, onClose }: {
  value: string | null;
  /** null = the Clear pill: the field goes back to no date at all. */
  onPick: (date: string | null) => void;
  onClose: () => void;
}) {
  const today = todayStr();
  const [ym, setYm] = useState((value ?? today).slice(0, 7));
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const cells = monthGridFilled(year, month);
  const page = (n: number) => {
    // Day 15 so the month arithmetic can never spill over a short month.
    const d = new Date(Date.UTC(year, month - 1 + n, 15));
    setYm(d.toISOString().slice(0, 7));
  };
  // month: 'short', never slice(0, 3) — the calendar screen's own rule, so a
  // locale that writes months differently is not overruled by this window.
  const ymLabel = new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable testID="daypick" style={s.card} onPress={() => {}}>
          <View style={s.head}>
            <CircleBtn testID="daypick-prev" glyph="‹" label="Previous month" size={28} onPress={() => page(-1)} />
            <Text testID="daypick-ym" style={s.ymLabel}>{ymLabel}</Text>
            <CircleBtn testID="daypick-next" glyph="›" label="Next month" size={28} onPress={() => page(1)} />
          </View>
          <View style={s.grid}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`w${i}`} style={s.weekday}>{w}</Text>
            ))}
            {cells.map((d) => {
              const out = d.slice(0, 7) !== ym;
              const picked = d === value;
              return (
                <Pressable
                  key={d}
                  testID="daypick-cell"
                  accessibilityRole="button"
                  accessibilityLabel={d}
                  style={s.cell}
                  onPress={() => { onPick(d); onClose(); }}
                >
                  <View style={[s.cellInner, picked && s.cellPicked, !picked && d === today && s.cellToday]}>
                    <Text style={[s.cellText, out && s.cellOutText, picked && s.cellPickedText]}>
                      {Number(d.slice(8, 10))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {value !== null && (
            <View style={s.foot}>
              <Pill label="Clear" onPress={() => { onPick(null); onClose(); }} />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.line, padding: 12, width: 300, maxWidth: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  ymLabel: { color: T.text, fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  cellInner: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 1, borderColor: T.accent },
  cellPicked: { backgroundColor: T.accent },
  cellText: { color: T.text, fontSize: 13 },
  cellOutText: { color: T.dim },
  cellPickedText: { color: T.accentInk, fontWeight: '600' },
  foot: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
}));
