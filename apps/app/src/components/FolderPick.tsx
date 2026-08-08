/**
 * The folder picker — the suite's round colour button by the username,
 * dropping a menu grouped like prod's: All at the top, every folder with a
 * show/hide checkbox, "Manage folders" as the last row. Tapping a ROW opens
 * that folder; tapping the BOX toggles it in the All view and lands on All
 * (the ticks describe the All canvas). View + hidden live in the synced pref
 * record, so the choice follows the account across devices.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { byOrd, prefsOf, prefsPut, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { T } from '../theme';
import { FolderManager } from './FolderManager';
import { PieDot } from './PieDot';

export type FolderView = { view: string; hidden: string[]; folders: Rec<'folder'>[]; visible: Rec<'folder'>[] };

/** The screens' read model: current view, and the folders it puts on screen. */
export function useFolderView(app: 'reminders' | 'notes'): FolderView {
  const { recs } = useStore();
  return useMemo(() => {
    const folders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app)
      .sort((a, b) => byOrd(a.payload, b.payload));
    const prefs = prefsOf(recs, app);
    const ids = new Set(folders.map((f) => f.id));
    const view = prefs.lastView && ids.has(prefs.lastView) ? prefs.lastView : 'all';
    const hidden = (prefs.hidden ?? []).filter((id) => ids.has(id));
    const visible = view === 'all' ? folders.filter((f) => !hidden.includes(f.id)) : folders.filter((f) => f.id === view);
    return { view, hidden, folders, visible };
  }, [recs, app]);
}

export function FolderPick({ app }: { app: 'reminders' | 'notes' }) {
  const { recs, mutate } = useStore();
  const { view, hidden, folders, visible } = useFolderView(app);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const active = folders.find((f) => f.id === view);
  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, app, next)));

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        {/* One folder = its colour; several = the pie; everything on = the rainbow. */}
        <PieDot colors={active ? [active.payload.color] : visible.map((f) => f.payload.color)} />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <ScrollView>
                <Pressable style={s.row} onPress={() => { setPrefs({ lastView: 'all' }); setOpen(false); }}>
                  <PieDot colors={folders.map((f) => f.payload.color)} size={14} />
                  <Text style={[s.rowText, view === 'all' && s.rowActive]}>All</Text>
                </Pressable>
                {folders.map((f) => {
                  const off = hidden.includes(f.id);
                  return (
                    <View key={f.id} style={s.row}>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: f.id }); setOpen(false); }}>
                        <View style={[s.dot, { backgroundColor: f.payload.color }]} />
                        <Text style={[s.rowText, view === f.id && s.rowActive]}>{f.payload.name}</Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          // The box: toggle this folder on the All canvas, and land on All.
                          setPrefs({ hidden: off ? hidden.filter((id) => id !== f.id) : [...hidden, f.id], lastView: 'all' })
                        }
                      >
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage folders…</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {manage && <FolderManager app={app} onClose={() => setManage(false)} />}
    </>
  );
}

const s = StyleSheet.create({
  dotBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface2,
  },
  allRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: T.dim },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  allDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: T.dim },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
  box: { color: T.muted, fontSize: 16 },
  boxOn: { color: T.accent },
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
});
