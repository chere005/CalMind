/**
 * The habits picker — the folder picker's shape over habit sections: the pie
 * button by the username, All + each section with a show/hide box, and
 * "Manage sections…" as the last row, exactly the suite's filter dropdown.
 * Visibility lives in the synced habits pref.
 *
 * That claim was UNTRUE until 2026-08-12, and the claim is why nobody looked.
 * The suite carries three actions here — msec_vis, msec_only, msec_all — and
 * the folder picker implements all three shapes for folders; this had only
 * the first. Pressing a section's name did nothing (it was a plain Text), and
 * All cleared `hidden` unconditionally instead of toggling, so there was no
 * way to turn the whole board off. Both now match the twin beside them, and
 * e2e/habitpick.spec.ts pins them against the section list rather than
 * against this menu's own ticks.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { byRecOrd, prefsOf, prefsPut, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { pickHit, Scroll, WebHitSlop } from '../ui';
import { HabitSectionManager } from './HabitSectionManager';
import { PieDot } from './PieDot';

export function useHabitSections(): { sections: Rec<'habitsection'>[]; hidden: string[]; visible: Rec<'habitsection'>[] } {
  const { recs } = useStore();
  return useMemo(() => {
    const sections = recs
      .filter((r): r is Rec<'habitsection'> => r.type === 'habitsection')
      .sort(byRecOrd);
    const ids = new Set(sections.map((s) => s.id));
    const hidden = (prefsOf(recs, 'habits').hidden ?? []).filter((id) => ids.has(id));
    return { sections, hidden, visible: sections.filter((s) => !hidden.includes(s.id)) };
  }, [recs]);
}

export function SectionPick() {
  const { recs, mutate } = useStore();
  const { sections, hidden, visible } = useHabitSections();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, 'habits', next)));

  return (
    <>
      <Pressable testID="pick-habits" style={pickHit} onPress={() => setOpen(true)} hitSlop={8}>
        {/* size={16} explicitly, like the other three pickers. Passing
            nothing took PieDot's own default of 22, so the Habits button drew
            a glyph 6px wider than the identical button on Reminders, Notes
            and Calendar — the bar's placement and ring were already pinned
            identical, which is why this was the part left to notice. */}
        {/* Rainbow when everything is on, the pie of what is visible
            otherwise — the rule FolderPick and CalendarPick already draw.
            This one was the odd picker of the four (Sean, 2026-08-12): it
            never went rainbow, so "everything is showing" looked the same
            here as a partial selection did. */}
        <PieDot rainbow={hidden.length === 0} colors={visible.map((s) => s.payload.color)} size={16} />
      </Pressable>
      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <Scroll>
                {(() => {
                  const allOn = hidden.length === 0;
                  return (
                    <View style={s.row}>
                      {/* The box TOGGLES, as the folder picker's does and as
                          the suite's msec_all does: on when everything is
                          already on turns everything off. Clearing hidden
                          unconditionally was the old behaviour and gave no way
                          to clear the board. */}
                      <Pressable
                        testID="msec-all-box"
                        hitSlop={8}
                        onPress={() => setPrefs({ hidden: allOn ? sections.map((x) => x.id) : [] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, allOn && s.boxOn]}>{allOn ? '☑' : '☐'}</Text>
                      </Pressable>
                      <Pressable testID="msec-all" style={s.rowMain} onPress={() => { setPrefs({ hidden: [] }); setOpen(false); }}>
                        {/* The All row wears the rainbow unconditionally, as
                            the folder picker's does — it is the icon FOR all,
                            not a reading of the current selection. */}
                        <PieDot rainbow colors={sections.map((x) => x.payload.color)} size={14} />
                        <Text style={[s.rowText, allOn && s.rowActive]}>All</Text>
                      </Pressable>
                    </View>
                  );
                })()}
                {sections.map((sec) => {
                  const off = hidden.includes(sec.id);
                  const only = !off && hidden.length === sections.length - 1;
                  return (
                    <View key={sec.id} style={s.row}>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setPrefs({ hidden: off ? hidden.filter((id) => id !== sec.id) : [...hidden, sec.id] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      {/* Pressing the NAME shows only this one — the suite's
                          msec_only, and the same gesture the folder picker
                          already gave folders. The box beside it still
                          toggles, so both readings of a tap are available
                          exactly where they are on the other picker. */}
                      <Pressable
                        testID={`msec-only-${sec.payload.name}`}
                        style={s.rowMain}
                        onPress={() => { setPrefs({ hidden: sections.filter((x) => x.id !== sec.id).map((x) => x.id) }); setOpen(false); }}
                      >
                        <View style={[s.dot, { backgroundColor: sec.payload.color }]} />
                        <Text style={[s.rowText, only && s.rowActive]}>{sec.payload.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage sections…</Text>
                </Pressable>
              </Scroll>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {manage && <HabitSectionManager onClose={() => setManage(false)} />}
    </>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 340, maxHeight: '70%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
  box: { color: T.muted, fontSize: 16 },
  boxOn: { color: T.accent },
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
}));
