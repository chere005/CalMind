/**
 * The dropdown — prod's select, one look everywhere: a bordered pill showing
 * the current choice with a ⌄, opening a scrollable menu. An option may carry
 * a `color` — a calendar's colour, or a section's parent-folder colour (Sean,
 * 2026-09-15): the pill and the menu row then wear a dot of it, and the pill's
 * border tints to match, so the destination reads as the thing it files into.
 * The `gold` variant is the fallback tint where no colour is supplied.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Scroll } from '../ui';
import { themed, T } from '../theme';

export type DropdownOption = { id: string; label: string; color?: string };

export function Dropdown({
  value,
  options,
  onPick,
  gold = false,
  placeholder = '—',
  testID,
}: {
  value: string | null;
  options: DropdownOption[];
  onPick: (id: string) => void;
  gold?: boolean;
  placeholder?: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const currentOpt = options.find((o) => o.id === value);
  const current = currentOpt?.label ?? placeholder;
  const curColor = currentOpt?.color;
  return (
    <>
      <Pressable
        testID={testID}
        style={[s.pill, gold && s.pillGold, curColor ? { borderColor: curColor } : null]}
        onPress={() => setOpen(true)}
      >
        {curColor ? <View style={[s.dot, { backgroundColor: curColor }]} /> : null}
        <Text style={[s.text, gold && s.textGold]} numberOfLines={1}>
          {current}
        </Text>
        <Text style={[s.chev, gold && s.textGold]}>⌄</Text>
      </Pressable>
      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <Scroll>
                {options.map((o) => (
                  <Pressable
                    key={o.id}
                    style={s.row}
                    onPress={() => {
                      setOpen(false);
                      onPick(o.id);
                    }}
                  >
                    {o.color ? <View style={[s.dot, { backgroundColor: o.color }]} /> : null}
                    <Text style={[s.rowText, o.id === value && s.rowActive]}>{o.label}</Text>
                  </Pressable>
                ))}
              </Scroll>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const s = themed(() => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: T.surface,
    maxWidth: 220,
  },
  pillGold: { borderColor: T.gold },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { color: T.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  textGold: { color: T.gold },
  chev: { color: T.dim, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 14,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11 },
  rowText: { color: T.text, fontSize: 15, flexShrink: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
}));
