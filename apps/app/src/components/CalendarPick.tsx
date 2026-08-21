/**
 * The calendar picker — the Calendar's twin of the folder picker: the pie
 * button by the username, a dropdown of All + every calendar with a show/hide
 * box, and Manage calendars… with add / rename / recolor / delete (rules from
 * core) and the default calendar for new events.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  byRecOrd,
  calendarNameTaken,
  deleteCalendar,
  folderApp,
  folderMode,
  newId,
  ordBetween,
  prefsOf,
  prefsPut,
  renameCalendar,
  type FolderMode,
  type Rec,
} from '@calmind/core';
import { CalGlyph } from './KindIcons';
import { useStore } from '../store';
import { themed, APP_PALETTES, T , APP_PALETTES_SHARED } from '../theme';
import { CircleBtn, ConfirmDelete, Field, pickHit, Pill, Scroll, WebHitSlop } from '../ui';
import { Dropdown } from './Dropdown';
import { ordForMove, useRowDrag } from './rowdrag';
import { SwatchTray } from './SwatchTray';
import { PieDot } from './PieDot';

export type CalendarView = {
  sharedCals: Rec<'calendar'>[];
  hiddenShared: string[];
  visibleShared: Rec<'calendar'>[];
  subs: Rec<'calsub'>[];
  hiddenSubs: string[];
  visibleSubs: Rec<'calsub'>[];
  sharedPartner: string | null; view: string; hidden: string[]; calendars: Rec<'calendar'>[]; visible: Rec<'calendar'>[] };

export function useCalendarView(): CalendarView {
  const { recs, sharedRecs, sharedPartner } = useStore();
  return useMemo(() => {
    const calendars = recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort(byRecOrd);
    const prefs = prefsOf(recs, 'calendar');
    const ids = new Set(calendars.map((c) => c.id));
    const view = prefs.lastView && ids.has(prefs.lastView) ? prefs.lastView : 'all';
    const hidden = (prefs.hidden ?? []).filter((id) => ids.has(id));
    const visible = view === 'all' ? calendars.filter((c) => !hidden.includes(c.id)) : calendars.filter((c) => c.id === view);
    // The partner's shared calendars ride beside mine, with their own
    // show/hide flags in hiddenShared — never merged into one list, so whose
    // calendar an event lands in is never a guess.
    const sharedCals = sharedPartner
      ? sharedRecs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').sort(byRecOrd)
      : [];
    const hiddenShared = (prefs.hiddenShared ?? []).filter((id) => sharedCals.some((c) => c.id === id));
    const visibleShared = sharedCals.filter((c) => !hiddenShared.includes(c.id));
    // Subscribed-by-link calendars: a third list beside mine and the
    // partner's, same shape, read-only by construction (their events are
    // never records — see core/calsub.ts).
    const subs = recs.filter((r): r is Rec<'calsub'> => r.type === 'calsub').sort(byRecOrd);
    const hiddenSubs = (prefs.hiddenSubs ?? []).filter((id) => subs.some((c) => c.id === id));
    const visibleSubs = subs.filter((c) => !hiddenSubs.includes(c.id));
    return { view, hidden, calendars, visible, sharedCals, hiddenShared, visibleShared, subs, hiddenSubs, visibleSubs, sharedPartner };
  }, [recs, sharedRecs, sharedPartner]);
}

export function CalendarPick() {
  const { recs, mutate, sharedPartnerLabel } = useStore();
  const [manageRem, setManageRem] = useState(false);
  const { view, hidden, calendars, visible, sharedCals, hiddenShared, visibleShared, subs, hiddenSubs, visibleSubs } = useCalendarView();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);

  const setPrefs = (next: Parameters<typeof prefsPut>[2]) => mutate((e) => e.put(prefsPut(recs, 'calendar', next)));

  return (
    <>
      <Pressable testID="pick-calendar" style={pickHit} onPress={() => setOpen(true)} hitSlop={8}>
        {/* Visible SHARED calendars are in the pie too — the half that made
            isolating a partner's calendar possible at all: a view holding
            only theirs used to draw a blank button (TODO §1, decided
            2026-08-18: "shared calendars should work on tap"). */}
        <PieDot rainbow={hidden.length === 0 && hiddenShared.length === 0 && hiddenSubs.length === 0} colors={[...visible, ...visibleShared, ...visibleSubs].map((c) => c.payload.color)} size={16} />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={s.menu} onPress={() => {}}>
              <Scroll>
                {(() => {
                  // All is the MASTER: ticked only when everything shows; one
                  // tap shows the lot, a second (all already on) hides the lot.
                  const allOn = hidden.length === 0 && hiddenShared.length === 0 && hiddenSubs.length === 0;
                  return (
                    <View style={s.row}>
                      <Pressable
                        testID="cal-all-box"
                        hitSlop={8}
                        onPress={() => setPrefs(allOn
                          ? { hidden: calendars.map((c) => c.id), hiddenShared: sharedCals.map((c) => c.id), hiddenSubs: subs.map((c) => c.id) }
                          : { lastView: 'all', hidden: [], hiddenShared: [], hiddenSubs: [] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, allOn && s.boxOn]}>{allOn ? '☑' : '☐'}</Text>
                      </Pressable>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: 'all', hidden: [], hiddenShared: [], hiddenSubs: [] }); setOpen(false); }}>
                        <PieDot rainbow colors={calendars.map((c) => c.payload.color)} size={14} />
                        <Text style={[s.rowText, view === 'all' && s.rowActive]}>All calendars</Text>
                      </Pressable>
                    </View>
                  );
                })()}
                {calendars.map((c) => {
                  const off = hidden.includes(c.id);
                  return (
                    <View key={c.id} style={s.row}>
                      <Pressable
                        // The shared and subscribed rows have carried a testID
                        // since they were written; this one never did, so the
                        // one box a test most wants to tick was the only one
                        // it could not name.
                        testID={`calbox-${c.payload.name}`}
                        hitSlop={8}
                        onPress={() => setPrefs({ hidden: off ? hidden.filter((id) => id !== c.id) : [...hidden, c.id], lastView: 'all' })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      <Pressable style={s.rowMain} onPress={() => { setPrefs({ lastView: c.id, hidden: calendars.filter((x) => x.id !== c.id).map((x) => x.id), hiddenShared: sharedCals.map((x) => x.id), hiddenSubs: subs.map((x) => x.id) }); setOpen(false); }}>
                        <View style={[s.dot, { backgroundColor: c.payload.color }]} />
                        <Text style={[s.rowText, view === c.id && s.rowActive]}>{c.payload.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {sharedCals.length > 0 && <Text style={s.groupHead}>Shared with me</Text>}
                {sharedCals.map((c) => {
                  const off = hiddenShared.includes(c.id);
                  return (
                    <View key={c.id} style={s.row}>
                      <Pressable
                        testID={`calshared-box-${c.payload.name}`}
                        hitSlop={8}
                        onPress={() => setPrefs({ hiddenShared: off ? hiddenShared.filter((id) => id !== c.id) : [...hiddenShared, c.id] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      {/* Isolate on tap, like every other row in every picker
                          (Sean, 2026-08-18). lastView can only name one of
                          MINE, so a partner's isolation is said the other way
                          it can be said: everything else hidden. */}
                      <Pressable
                        testID={`calshared-row-${c.payload.name}`}
                        style={s.rowMain}
                        onPress={() => {
                          setPrefs({
                            lastView: 'all',
                            hidden: calendars.map((x) => x.id),
                            hiddenShared: sharedCals.filter((x) => x.id !== c.id).map((x) => x.id),
                            hiddenSubs: subs.map((x) => x.id),
                          });
                          setOpen(false);
                        }}
                      >
                        <View style={[s.dot, { backgroundColor: c.payload.color }]} />
                        <Text style={s.rowText}>{c.payload.name}</Text>
                        <Text style={s.partnerChip}>{sharedPartnerLabel}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {subs.length > 0 && <Text style={s.groupHead}>Subscribed</Text>}
                {subs.map((c) => {
                  const off = hiddenSubs.includes(c.id);
                  return (
                    <View key={c.id} style={s.row}>
                      <Pressable
                        testID={`calsub-box-${c.payload.name}`}
                        hitSlop={8}
                        onPress={() => setPrefs({ hiddenSubs: off ? hiddenSubs.filter((id) => id !== c.id) : [...hiddenSubs, c.id] })}
                      >
                        <WebHitSlop />
                        <Text style={[s.box, !off && s.boxOn]}>{off ? '☐' : '☑'}</Text>
                      </Pressable>
                      {/* Isolate on tap, said the shared way: everything else
                          hidden, since lastView can only name one of mine. */}
                      <Pressable
                        testID={`calsub-row-${c.payload.name}`}
                        style={s.rowMain}
                        onPress={() => {
                          setPrefs({
                            lastView: 'all',
                            hidden: calendars.map((x) => x.id),
                            hiddenShared: sharedCals.map((x) => x.id),
                            hiddenSubs: subs.filter((x) => x.id !== c.id).map((x) => x.id),
                          });
                          setOpen(false);
                        }}
                      >
                        <View style={[s.dot, { backgroundColor: c.payload.color }]} />
                        <Text style={s.rowText}>{c.payload.name}</Text>
                        <Text style={s.subChip}>link</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable style={[s.row, s.manageRow]} onPress={() => { setOpen(false); setManage(true); }}>
                  <Text style={s.manageText}>Manage calendars</Text>
                </Pressable>
                <Pressable testID="manage-reminders-row" style={[s.row, s.manageRow2]} onPress={() => { setOpen(false); setManageRem(true); }}>
                  <Text style={s.manageText}>Manage reminders</Text>
                </Pressable>
              </Scroll>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {manage && <CalendarManager onClose={() => setManage(false)} />}
      {manageRem && <ReminderFoldersManager onClose={() => setManageRem(false)} />}
    </>
  );
}

/**
 * The suite's "Reminder folders" half of the calendar manager: one row per
 * reminder folder (a partner's under their own heading), each carrying the
 * tri-state — ● All / calendar-glyph Dated / ✕ None — that decides how that
 * folder's reminders reach the calendar. Viewer-side pref, stored in the
 * calendar prefs' folderModes, so a partner's folders gate the same way.
 */
function ReminderFoldersManager({ onClose }: { onClose: () => void }) {
  const { recs, mutate, sharedRecs, sharedPartner, sharedPartnerLabel } = useStore();
  const modes = prefsOf(recs, 'calendar').folderModes ?? {};
  const [openFor, setOpenFor] = useState<string | null>(null);
  const own = recs
    .filter((r): r is Rec<'folder'> => r.type === 'folder' && folderApp(r.payload) === 'reminders')
    .sort(byRecOrd);
  const shared = sharedPartner
    ? sharedRecs.filter((r): r is Rec<'folder'> => r.type === 'folder' && folderApp(r.payload) === 'reminders').sort(byRecOrd)
    : [];
  const set = (id: string, mode: FolderMode) => {
    mutate((e) => e.put(prefsPut(recs, 'calendar', { folderModes: { ...modes, [id]: mode } })));
    setOpenFor(null);
  };
  const face = (f: Rec<'folder'>) => folderMode(f.payload, f.id, modes);
  const row = (f: Rec<'folder'>) => (
    <View key={f.id}>
      <View style={s.mrow}>
        <Text style={s.mname}>{f.payload.name}</Text>
        <Pressable testID={`remmode-${f.payload.name}`} style={s.triBtn} hitSlop={6} onPress={() => setOpenFor(openFor === f.id ? null : f.id)}>
          {face(f) === 'all' && <View style={s.triAll} />}
          {face(f) === 'dated' && <CalGlyph color={T.dim} size={15} />}
          {face(f) === 'none' && <Text style={s.triNone}>✕</Text>}
        </Pressable>
      </View>
      {openFor === f.id && (
        <View style={s.triMenu}>
          <Pressable testID="trimode-all" style={s.triOpt} onPress={() => set(f.id, 'all')}>
            <View style={s.triAll} /><Text style={s.triOptText}>All</Text>
          </Pressable>
          <Pressable testID="trimode-dated" style={s.triOpt} onPress={() => set(f.id, 'dated')}>
            <CalGlyph color={T.dim} size={15} /><Text style={s.triOptText}>Dated</Text>
          </Pressable>
          <Pressable testID="trimode-none" style={s.triOpt} onPress={() => set(f.id, 'none')}>
            <Text style={s.triNone}>✕</Text><Text style={s.triOptText}>None</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop2} onPress={onClose}>
        <Pressable style={[s.card, { padding: 16 }]} onPress={() => setOpenFor(null)}>
          <Text style={s.h2}>Reminder folders</Text>
          <Text style={s.subhead}>Which folders' reminders show up on the calendar.</Text>
          <Scroll style={{ maxHeight: 420 }}>
            {own.map(row)}
            {shared.length > 0 && <Text style={s.groupHead}>{sharedPartnerLabel}'s folders</Text>}
            {shared.map(row)}
          </Scroll>
          <View style={s.doneRow}>
            <Pill testID="remfolders-done" label="Done" primary onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CalendarManager({ onClose }: { onClose: () => void }) {
  const { recs, mutate, sharedRecs, sharedPartner, sharedPartnerLabel } = useStore();
  // The viewer's recolour of a partner's shared calendar — my override, my
  // prefs, the lighter shared palette, their data untouched.
  const sharedCalRows = sharedPartner ? sharedRecs.filter((r): r is Rec<'calendar'> => r.type === 'calendar') : [];
  const { calendars, subs } = useCalendarView();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [err, setErr] = useState('');
  const defaultCalendarId = prefsOf(recs, 'calendar').defaultCalendarId;

  const flash = (m: string) => {
    setErr(m);
    setTimeout(() => setErr(''), 3000);
  };

  const drag = useRowDrag(calendars.length, (from: number, to: number) => {
    const item = calendars[from];
    if (!item) return;
    const ord = ordForMove(calendars, from, to);
    mutate((e) => e.put({ ...item, payload: { ...item.payload, ord } }));
  });

  const add = () => {
    const name = newName.trim();
    setNewName('');
    if (!name) return;
    if (calendarNameTaken(recs, name)) {
      flash('that name is taken');
      return;
    }
    mutate((e) => {
      const last = calendars[calendars.length - 1];
      e.put({
        id: newId(), type: 'calendar', updated: 0,
        payload: { name, color: APP_PALETTES.calendar[calendars.length % APP_PALETTES.calendar.length]!, ord: ordBetween(last?.payload.ord ?? null, null) },
      });
    });
  };

  /**
   * Subscribe by link. The NAME is not asked for up front: nearly every feed
   * URL names its host, and the row can be renamed like any calendar — one
   * field beats two for a thing pasted from a clipboard. Validation is only
   * the scheme; whether the link actually answers with a calendar is the
   * server's question (calsub_fetch says 'that link is not a calendar'), and
   * the row appearing immediately with events arriving on the next fetch is
   * the same local-first shape as everything else here.
   */
  const subscribe = () => {
    const url = subUrl.trim();
    if (!url) return;
    if (!/^(https?|webcal):\/\//i.test(url)) {
      flash('a calendar link starts with https:// or webcal://');
      return;
    }
    let name = 'Subscribed';
    try {
      name = new URL(url.replace(/^webcal:/i, 'https:')).hostname.replace(/^www\./, '');
    } catch { /* keep the fallback name */ }
    setSubUrl('');
    mutate((e) => {
      const last = subs[subs.length - 1];
      e.put({
        id: newId(), type: 'calsub', updated: 0,
        payload: { url, name, color: APP_PALETTES.calendar[(calendars.length + subs.length) % APP_PALETTES.calendar.length]!, ord: ordBetween(last?.payload.ord ?? null, null) },
      });
    });
  };

  const commitSubRename = (c: Rec<'calsub'>) => {
    setRenaming(null);
    const name = renameText.trim();
    if (name === '' || name === c.payload.name) return;
    mutate((e) => e.put({ ...c, payload: { ...c.payload, name } }));
  };

  const commitRename = (c: Rec<'calendar'>) => {
    setRenaming(null);
    const res = renameCalendar(recs, c.id, renameText);
    if ('error' in res) {
      if (renameText.trim() !== '' && renameText.trim() !== c.payload.name) flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  const remove = (c: Rec<'calendar'>) => {
    const res = deleteCalendar(recs, c.id);
    if ('error' in res) {
      flash(res.error);
      return;
    }
    mutate((e) => res.put.forEach((r) => e.put(r)));
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop2} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Scroll contentContainerStyle={s.scroll}>
            <Text style={s.h2}>Calendars</Text>
            <View style={s.addRow}>
              <Field value={newName} onChangeText={setNewName} placeholder="New calendar" style={s.addField} onSubmitEditing={add} />
              <CircleBtn glyph="+" label="Add" color={T.accent} size={34} onPress={add} />
            </View>
            {calendars.map((c, i) => (
              <View key={c.id}>
                {drag.slot === i && <View style={s.dropLine} />}
                <View ref={drag.registerRow(i)} style={[s.mrow, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                <View {...drag.handleFor(i)} style={s.grip} hitSlop={8}><WebHitSlop /><Text style={s.gripText}>≡</Text></View>
                <SwatchTray palette={APP_PALETTES.calendar} color={c.payload.color} onPick={(hex) => mutate((e) => e.put({ ...c, payload: { ...c.payload, color: hex } }))} />
                {renaming === c.id ? (
                  <Field
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    style={s.renameField}
                    onBlur={() => commitRename(c)}
                    onSubmitEditing={() => commitRename(c)}
                  />
                ) : (
                  <Text style={s.rowText}>{c.payload.name}</Text>
                )}
                <CircleBtn glyph="✎" label="Edit" size={26} onPress={() => { setRenaming(c.id); setRenameText(c.payload.name); }} />
                <ConfirmDelete onDelete={() => remove(c)} />
                </View>
              </View>
            ))}
            {drag.slot === calendars.length && <View style={s.dropLine} />}
            <Text style={s.mlabel}>Subscribed by link</Text>
            <Text style={s.subhead}>Read-only: another calendar's events, drawn here, never edited here.</Text>
            <View style={s.addRow}>
              <Field testID="calsub-url" value={subUrl} onChangeText={setSubUrl} placeholder="https://… or webcal://… (.ics link)" style={s.addField} autoCapitalize="none" onSubmitEditing={subscribe} />
              <CircleBtn testID="calsub-add" glyph="+" label="Subscribe" color={T.accent} size={34} onPress={subscribe} />
            </View>
            {subs.map((c) => (
              <View key={c.id} style={s.mrow}>
                <SwatchTray palette={APP_PALETTES.calendar} color={c.payload.color} onPick={(hex) => mutate((e) => e.put({ ...c, payload: { ...c.payload, color: hex } }))} />
                {renaming === c.id ? (
                  <Field
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    style={s.renameField}
                    onBlur={() => commitSubRename(c)}
                    onSubmitEditing={() => commitSubRename(c)}
                  />
                ) : (
                  <Text style={s.rowText} numberOfLines={1}>{c.payload.name}</Text>
                )}
                <CircleBtn glyph="✎" label="Edit" size={26} onPress={() => { setRenaming(c.id); setRenameText(c.payload.name); }} />
                <ConfirmDelete onDelete={() => mutate((e) => e.del(c.id))} />
              </View>
            ))}
            <Text style={s.label}>Default for new events</Text>
            <Dropdown
              value={defaultCalendarId ?? null}
              options={calendars.map((c) => ({ id: c.id, label: c.payload.name }))}
              onPick={(id) => mutate((e) => e.put(prefsPut(recs, 'calendar', { defaultCalendarId: id })))}
            />
            {sharedCalRows.length > 0 && (
              <>
                <Text style={s.mlabel}>Shared with me</Text>
                {sharedCalRows.map((c) => (
                  <View key={c.id} style={s.mrow}>
                    <SwatchTray palette={APP_PALETTES_SHARED.calendar} color={c.payload.color} onPick={(hex) => {
                      const key = `@${sharedPartner}:${c.id}`;
                      const cur = prefsOf(recs, 'calendar').sharedColors ?? {};
                      mutate((e) => e.put(prefsPut(recs, 'calendar', { sharedColors: { ...cur, [key]: hex } })));
                    }} />
                    <Text style={s.sharedCalName}>{c.payload.name}</Text>
                    <Text style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  </View>
                ))}
              </>
            )}
            {err !== '' && <Text style={s.err}>{err}</Text>}
            <View style={s.doneRow}>
              <Pill label="Done" primary onPress={onClose} />
            </View>
          </Scroll>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop2: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 16 },
  menu: { width: '100%', maxWidth: 340, maxHeight: '70%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, paddingVertical: 6 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16 },
  scroll: { padding: 18, gap: 12 },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addField: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  mrow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  grip: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gripText: { color: T.muted, fontSize: 15, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowActive: { color: T.accent, fontWeight: '700' },
  box: { color: T.muted, fontSize: 16 },
  boxOn: { color: T.accent },
  partnerChip: { color: '#c4b5fd', backgroundColor: '#3b3355', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginLeft: 'auto' },
  subChip: { color: T.dim, borderWidth: 1, borderColor: T.line, fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginLeft: 'auto' },
  groupHead: { color: T.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 12, paddingTop: 10 },
  manageRow2: {},
  manageRow: { borderTopWidth: 1, borderTopColor: T.lineSoft, marginTop: 4 },
  manageText: { color: T.dim, fontSize: 14 },
  renameField: { flex: 1, paddingVertical: 6 },
  label: { color: T.dim, fontSize: 13, marginTop: 6 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mlabel: { color: T.gold, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  ownerBadge: { color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden', marginLeft: 'auto' },
  sharedCalName: { color: T.dim, fontSize: 15, flex: 1 },
  err: { color: T.danger, fontSize: 13 },
  doneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  subhead: { color: T.muted, fontSize: 13, marginTop: -6, marginBottom: 8 },
  mname: { color: T.text, fontSize: 15, flex: 1 },
  triBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' },
  triAll: { width: 13, height: 13, borderRadius: 7, backgroundColor: T.accent },
  triNone: { color: T.accent, fontSize: 15, fontWeight: '700', lineHeight: 16 },
  triMenu: { alignSelf: 'flex-end', backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, borderRadius: 12, paddingVertical: 4, marginBottom: 6, minWidth: 130 },
  triOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  triOptText: { color: T.text, fontSize: 15 },
}));
