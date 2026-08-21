/**
 * The folder picker — the suite's round colour button by the username,
 * dropping a menu grouped like prod's: All at the top, every folder with a
 * show/hide checkbox, "Manage folders" as the last row. Tapping a ROW opens
 * that folder; tapping the BOX toggles it in the All view and lands on All
 * (the ticks describe the All canvas). View + hidden live in the synced pref
 * record, so the choice follows the account across devices.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { byRecOrd, prefsOf, prefsPut, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { pickHit, Scroll, WebHitSlop } from '../ui';
import { FolderManager } from './FolderManager';
import { PieDot } from './PieDot';

export type FolderView = {
  sharedFolders: Rec<'folder'>[];
  hiddenShared: string[];
  visibleShared: Rec<'folder'>[];
  sharedPartner: string | null;
  sharedView: string | null; view: string; hidden: string[]; folders: Rec<'folder'>[]; visible: Rec<'folder'>[] };

/** The screens' read model: current view, and the folders it puts on screen. */
export function useFolderView(app: 'reminders' | 'notes'): FolderView {
  const { recs, sharedRecs, sharedPartner } = useStore();
  return useMemo(() => {
    // The shopping list is a reminders folder wearing the `shopping` flag, and
    // it has its own tab. Excluded HERE rather than in each screen, because
    // this hook feeds the Reminders list AND its folder picker AND the manage
    // sheet — leaving it in meant the list you shop from also appeared as an
    // ordinary reminders folder you could hide, rename or delete.
    const folders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app && !r.payload.shopping)
      .sort(byRecOrd);
    const prefs = prefsOf(recs, app);
    const ids = new Set(folders.map((f) => f.id));
    // The partner's shared folders ride along as @partner:folderId views.
    const sharedFolders = sharedPartner
      ? sharedRecs
          .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === app)
          .sort(byRecOrd)
      : [];
    const sharedKey = (fid: string) => `@${sharedPartner}:${fid}`;
    const sharedView =
      prefs.lastView?.startsWith('@') && sharedFolders.some((f) => sharedKey(f.id) === prefs.lastView)
        ? prefs.lastView
        : null;
    const view = sharedView ?? (prefs.lastView && ids.has(prefs.lastView) ? prefs.lastView : 'all');
    const hidden = (prefs.hidden ?? []).filter((id) => ids.has(id));
    const visible = view === 'all' ? folders.filter((f) => !hidden.includes(f.id)) : folders.filter((f) => f.id === view);
    const hiddenShared = (prefs.hiddenShared ?? []).filter((id) => sharedFolders.some((f) => f.id === id));
    const visibleShared = sharedFolders.filter((f) => !hiddenShared.includes(f.id));
    return { view, hidden, folders, visible, sharedFolders, hiddenShared, visibleShared, sharedPartner, sharedView };
  }, [recs, sharedRecs, sharedPartner, app]);
}

export function FolderPick({ app }: { app: 'reminders' | 'notes' }) {
  const { recs, mutate, sharedPartnerLabel } = useStore();
  const { view, hidden, folders, visible, sharedFolders, hiddenShared, sharedPartner, sharedView } = useFolderView(app);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const active = folders.find((f) => f.id === view);
  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, app, next)));

  return (
    <>
      <Pressable testID={`pick-${app}`} style={pickHit} onPress={() => setOpen(true)} hitSlop={8}>
        {/* One folder = its colour; several = the pie; everything on = the rainbow. */}
        <PieDot rainbow={!active && hidden.length === 0 && hiddenShared.length === 0} colors={active ? [active.payload.color] : visible.map((f) => f.payload.color)} size={16} />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <Scroll>
                {(() => {
                  const allOn = hidden.length === 0 && hiddenShared.length === 0;
                  return (
                    <View style={s.row}>
                      <Pressable
                        testID={`fold-all-box-${app}`}
                        hitSlop={8}
                        onPress={() => setPrefs(allOn
                          ? { hidden: folders.map((f) => f.id), hiddenShared: sharedFolders.map((f) => f.id) }
                          : { lastView: 'all', hidden: [], hiddenShared: [] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, allOn && s.boxOn]}>{allOn ? '☑' : '☐'}</Text>
                      </Pressable>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: 'all', hidden: [], hiddenShared: [] }); setOpen(false); }}>
                        <PieDot rainbow colors={folders.map((f) => f.payload.color)} size={14} />
                        <Text style={[s.rowText, view === 'all' && s.rowActive]}>All</Text>
                      </Pressable>
                    </View>
                  );
                })()}
                {folders.map((f) => {
                  const off = hidden.includes(f.id);
                  return (
                    <View key={f.id} style={s.row}>
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          // The box: toggle this folder on the All canvas, and land on All.
                          setPrefs({ hidden: off ? hidden.filter((id) => id !== f.id) : [...hidden, f.id], lastView: 'all' })
                        }
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: f.id, hidden: folders.filter((x) => x.id !== f.id).map((x) => x.id), hiddenShared: sharedFolders.map((x) => x.id) }); setOpen(false); }}>
                        <View style={[s.dot, { backgroundColor: f.payload.color }]} />
                        <Text style={[s.rowText, view === f.id && s.rowActive]}>{f.payload.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {sharedFolders.length > 0 && <Text style={s.groupHead}>Shared with me</Text>}
                {sharedFolders.map((f) => {
                  const key = `@${sharedPartner}:${f.id}`;
                  const off = hiddenShared.includes(f.id);
                  return (
                    <View key={key} style={s.row}>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setPrefs({ hiddenShared: off ? hiddenShared.filter((id) => id !== f.id) : [...hiddenShared, f.id], lastView: 'all' })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      <Pressable testID={`pick-shared-${f.payload.name}`} style={s.rowMain} onPress={() => { setPrefs({ lastView: key, hidden: folders.map((x) => x.id), hiddenShared: sharedFolders.filter((x) => x.id !== f.id).map((x) => x.id) }); setOpen(false); }}>
                        <View style={[s.dot, { backgroundColor: f.payload.color }]} />
                        <Text style={[s.rowText, sharedView === key && s.rowActive]}>{f.payload.name}</Text>
                        <Text style={s.partnerChip}>{sharedPartnerLabel}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage folders…</Text>
                </Pressable>
              </Scroll>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {manage && <FolderManager app={app} onClose={() => setManage(false)} />}
    </>
  );
}

const s = themed(() => StyleSheet.create({
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
  partnerChip: { color: '#c4b5fd', backgroundColor: '#3b3355', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginLeft: 'auto' },
  groupHead: { color: T.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 12, paddingTop: 10 },
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
}));
