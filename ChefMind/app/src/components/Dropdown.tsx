/**
 * The dropdown — prod's select, one look everywhere: a bordered pill showing
 * the current choice with a ⌄, opening a scrollable menu. Gold variant for
 * section pickers, matching the suite's gold section titles.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Scroll } from '../ui';
import { themed, T } from '../theme';

export type DropdownOption = { id: string; label: string };

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
  const current = options.find((o) => o.id === value)?.label ?? placeholder;
  return (
    <>
      <Pressable testID={testID} style={[s.pill, gold && s.pillGold]} onPress={() => setOpen(true)}>
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
  row: { paddingHorizontal: 16, paddingVertical: 11 },
  rowText: { color: T.text, fontSize: 15 },
  rowActive: { color: T.accent, fontWeight: '700' },
}));
