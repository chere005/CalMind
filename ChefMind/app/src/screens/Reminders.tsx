/**
 * The Reminders list. Folder blocks, gold section titles with collapse
 * chevrons, the section-header "+", tick circles that roll a repeat instead of
 * finishing it, subtasks (one level — a + on a task, a ‹ on a subtask), and the
 * two-press ×. All behavior comes from @calmind/core; this file is layout and
 * gestures.
 *
 * INLINE EDITING IS BACK (Sean, 2026-08-20: "tapping on a reminder in the
 * reminders app should go into the edit reminder text mode that it used to
 * and we took away at one point"). It was removed on his own word on
 * 2026-08-18 and returned on his own word two days later — both are his
 * calls, neither was a misreading. A tap on a row in edit mode swaps the
 * text for a focused field; retyping re-parses THE SAME WAY ADDING DOES
 * (core's editReminderLine — typed tokens overwrite the stored date and
 * time, a token-less rename leaves them alone, and \2pm is the literal
 * words), and the frequency pills stay gone — a repeat is still the item
 * window's business, which the pencil opens.
 *
 * The machinery that came back with it is the proven 08-13 code, not a
 * rewrite: the blur-time save, and the held-open cluster (holdCluster) that
 * lets a cluster button's press outlive the field's blur.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { byRecOrd, ordGap, deleteSection, duplicateItem, editReminderLine, moveReminderBlock, moveSection, moveSectionEmptyingFolder, newId, nowStr, ordBetween, parseWhenFromText, reminderLine, reminderToggle, remindersMarkdown, renameSection, repeatLabel, sectionNameTaken, sortByDate, timeLabel, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { useClock24 } from '../useClock24';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { useRowDrag } from '../components/rowdrag';
import { useSwipeLeft } from '../components/swiperow';
import { useSharedTick, useTickGrace } from '../components/tickgrace';
import { Chevron } from '../components/Chevron';
import { EditExit, stayInEdit } from '../components/EditExit';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
import { ItemModal } from '../components/ItemModal';
import { useToast } from '../components/Toast';
import { CircleBtn, CollapseAllBtn, ConfirmDelete, Field, Pill, Scroll, TOPBAR_CTRL, WebHitSlop } from '../ui';

type FolderRec = Rec<'folder'>;
type SectionRec = Rec<'section'>;
type ReminderRec = Rec<'reminder'>;

const FOLD_KEY = 'calmind.folded.reminders';

export function Reminders() {
  const { recs, mutate, sharedRecs, sharedPartnerLabel } = useStore();
  const { view, visible: visibleFolders, visibleShared, sharedView, sharedPartner } = useFolderView('reminders');
  // Remembered, as the suite's remShowDone is. Same gap and same fix as the
  // calendar's: it was plain state, so leaving the tab turned Completed off.
  // The suite's edit-mode transience is not replicated here either — see the
  // note in Calendar.tsx.
  const [showDone, setShowDoneState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('calmind.remShowDone').then((raw) => raw === '1' && setShowDoneState(true));
  }, []);
  const setShowDone = (on: boolean) => {
    setShowDoneState(on);
    // Swallowed for the same reason the fold writes are: what is lost is
    // which view you had, next launch. No content, nothing unrecoverable.
    AsyncStorage.setItem('calmind.remShowDone', on ? '1' : '').catch(() => {});
  };
  const [adding, setAdding] = useState<string | null>(null); // sectionId with the open add row
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // reminder id in inline edit
  const [editText, setEditText] = useState('');
  const holdCluster = React.useRef(false);
  const swipe = useSwipeLeft();
  const grace = useTickGrace();
  // The All view draws a partner's rows too, and they tick through their own
  // grace — a shared tick is a round trip, not a local write. See useSharedTick.
  const shTick = useSharedTick();
  const clock24 = useClock24();
  const toast = useToast();
  const [pageEdit, setPageEdit] = useState(false);
  const exitEdit = () => { setPageEdit(false); setEditing(null); };
  useEffect(() => {
    if (!pageEdit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') exitEdit(); };
    // Capture phase: a focused field can swallow Escape before it bubbles.
    document.addEventListener('keydown', onKey, true);
    // The suite's rule, ported verbatim from reminders/index.php: "A tap stays
    // in edit only if it lands on the thing you're editing or an edit control."
    // Anything else leaves. CalMind approximated that with one Pressable at the
    // bottom of the scroll content, so a tap in the blank space BESIDE a row
    // did nothing, and a list longer than the window had no exit on screen at
    // all — measured before changing it.
    //
    // Web only, like the Escape handler above it: this needs a document, and
    // the phone's reliable way out is the Done button in the toolbar. That is
    // a real divergence and it is deliberate, not an oversight.
    // What may swallow a click and still MEAN "stay in edit mode".
    //
    // This was once just role/input/textarea, on the belief that every row and
    // button is a react-native-web Pressable and those do not propagate their
    // click to document. That belief was WRONG: RNW only sets role="button"
    // when accessibilityRole is given, and a plain <Pressable> — which is what
    // a row is — renders a bare <div> whose click bubbles all the way up. So
    // the rule was closing edit mode on the very long-press that opened it,
    // and the Notes spec caught it the moment the collapse-all stopped being
    // the first thing in the row.
    //
    // Named prefixes, not a whole screen's: '[data-testid^="cal-"]' was tried
    // and it kept the day's own TITLE, which is a label and must exit.
    const KEEP = [
      '[role="button"]', 'input', 'textarea', 'select',
      '[data-testid^="rem-"]', '[data-testid^="sec"]', '[data-testid^="row-"]',
      '[data-testid="tick"]', '[data-testid^="fold"]', '[data-testid^="swipe-"]',
      '[data-testid^="pick-"]', '[data-testid^="tab-"]',
    ].join(',');
    // The click that BELONGS to the gesture that opened edit mode must not
    // also close it. A long-press flips pageEdit at ~480ms, the grips appear,
    // the row shifts under the cursor, and the mouseup that follows lands on
    // whatever is now beneath it — a bare container with no testid, which no
    // allow-list can recognise. So edit mode opened and shut in one press.
    //
    // The suite guards the same thing the same way (`suppressClick`). The
    // rule here is exact rather than a timeout: this listener is attached
    // MID-PRESS, so the opening gesture's pointerdown already happened and
    // its trailing click is the one click that arrives without a pointerdown
    // of its own. Anything a person taps afterwards begins with a pointerdown,
    // which clears the flag. A time window was tried first and swallowed
    // deliberate taps that came too soon after — it made the tests red, which
    // is the tests doing their job.
    let ownClick = true;
    const onDown = () => { ownClick = false; };
    document.addEventListener('pointerdown', onDown, true);
    const onClick = (ev: Event) => {
      if (ownClick) { ownClick = false; return; }
      const t = ev.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest(KEEP)) return;
      exitEdit();
    };
    // BUBBLE, deliberately, though habits needs capture for the same job.
    //
    // Capture was tried here and reverted the same hour: it makes MORE clicks
    // reach this listener — every one react-native-web was stopping at a
    // Pressable — and on this screen that closed the inline editor mid-edit,
    // taking two repeat-editor specs red with it. THAT REASON IS NOW GONE:
    // there is no inline editor to close (2026-08-12). Left on bubble anyway,
    // because it works and the argument for changing it was only ever "habits
    // does it the other way" — which is not a reason to touch a listener whose
    // failure mode is edit mode shutting on the gesture that opened it. If
    // capture is ever wanted here, the allow-list is what needs the attention.
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [pageEdit]);
  /** The long-press and the double-tap both do only this now: arm the page. */
  const enterEdit = () => setPageEdit(true);
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newName, setNewName] = useState('');
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [renameSecText, setRenameSecText] = useState('');
  const lastSecTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [foldedFolders, setFoldedFolders] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.foldedFolders.reminders')
      .then((raw) => raw && setFoldedFolders(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const toggleFolderFold = (id: string) => {
    const next = new Set(foldedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFoldedFolders(next);
    // Swallowed deliberately, and this is the triage: what is lost when a
    // fold write fails is which sections were collapsed, next launch. No
    // user content, nothing unrecoverable, and an alert about a collapsed
    // folder would be worse than the loss. The failures worth surfacing in
    // this app are the ones that lose DATA or lie about state — see
    // store.tsx's persistFailed and the shared-write reconcile.
    AsyncStorage.setItem('calmind.foldedFolders.reminders', JSON.stringify([...next])).catch(() => {});
  };
  // No lastTap here any more: the double-tap-to-arm-edit-mode gesture is
  // gone from a ROW, because a single tap now opens the row for retyping
  // (Sean, 2026-08-20) and the second tap of a double would land in the
  // field. The long-press is the way into edit mode; the section head keeps
  // its own double-tap (lastSecTap) for renaming.
  const [modalRec, setModalRec] = useState<ReminderRec | null>(null); // the full-edit window
  /**
   * A subtask the + has just made and nobody has named yet.
   *
   * The inline field used to drop a blank row on blur — `if (editText.trim()
   * === '' && r.payload.text === '') mutate((e) => e.del(r.id))` — and that
   * cleanup has to survive the field's removal, or the + leaves an empty row
   * behind every time its window is cancelled. The window itself REFUSES to
   * save a blank ("it needs a name"), so a row that is still blank when the
   * window closes was abandoned, and abandoning it means dropping it.
   */
  const pendingSub = React.useRef<string | null>(null);
  const closeModal = () => {
    const id = pendingSub.current;
    pendingSub.current = null;
    setModalRec(null);
    if (id === null) return;
    // e.all(), not recs: the save that may just have named this row has landed
    // in the engine and not yet in this render.
    mutate((e) => {
      const row = e.all().find((x) => x.id === id);
      if (row?.type === 'reminder' && row.payload.text.trim() === '') e.del(id);
    });
  };

  // Collapse state survives visits, per the suite's localStorage habit.
  useEffect(() => {
    AsyncStorage.getItem(FOLD_KEY)
      .then((raw) => raw && setFolded(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const toggleFold = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFolded(next);
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const { folders, sectionsOf, remindersOf } = useMemo(() => {
    const folders = visibleFolders;
    const sections = recs.filter((r): r is SectionRec => r.type === 'section').sort(byRecOrd);
    const reminders = recs.filter((r): r is ReminderRec => r.type === 'reminder').sort(byRecOrd);
    return {
      folders,
      sectionsOf: (fid: string) => sections.filter((x) => x.payload.folderId === fid),
      remindersOf: (sid: string) =>
        sortByDate(
          reminders
            .filter((x) => x.payload.sectionId === sid)
            .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
        ).map((row) => row.rec),
    };
  }, [recs, visibleFolders]);

  // Every visible row in render order — plus one placeholder per EMPTY
  // section, so an empty section is a drop target. Placeholders take a row's
  // height only while a drag is live, which keeps the index math uniform.
  type FlatEntry = { kind: 'row'; rec: ReminderRec; sectionId: string } | { kind: 'empty'; sectionId: string };
  const flatRows = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const f of folders) {
      for (const sec of sectionsOf(f.id)) {
        if (folded.has(sec.id)) continue;
        const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done || grace.held(r.id));
        if (rows.length === 0) out.push({ kind: 'empty', sectionId: sec.id });
        for (const r of rows) out.push({ kind: 'row', rec: r, sectionId: sec.id });
      }
    }
    return out;
  }, [folders, sectionsOf, remindersOf, folded, showDone, grace.version]);

  const drag = useRowDrag(flatRows.length, (from, to) => {
    const src = flatRows[from];
    if (src?.kind !== 'row') return;
    const slotIdx = to > from ? to + 1 : to;
    const before = flatRows[slotIdx];
    const destSectionId = before?.sectionId ?? flatRows[flatRows.length - 1]?.sectionId ?? src.sectionId;
    const beforeId = before?.kind === 'row' ? before.rec.id : null;
    const res = moveReminderBlock(recs, src.rec.id, destSectionId, beforeId);
    if ('error' in res) return;
    mutate((e) => res.put.forEach((r) => e.put(r)));
  });
  const flatIdxOf = (id: string) => flatRows.findIndex((x) => x.kind === 'row' && x.rec.id === id);
  const emptyIdxOf = (sectionId: string) => flatRows.findIndex((x) => x.kind === 'empty' && x.sectionId === sectionId);

  // Level 0: sections travel as blocks and land only between sections. When
  // the move would empty a folder, the suite asks first — so do we.
  const [emptyAsk, setEmptyAsk] = useState<{ sectionId: string; slot: SectionSlot } | null>(null);
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveSection(recs, sectionId, slot.folderId, slot.beforeSectionId);
    if (!('error' in res)) {
      mutate((e) => res.put.forEach((r) => e.put(r)));
      return;
    }
    if (res.error === 'a folder keeps its last section') setEmptyAsk({ sectionId, slot });
  });

  const addReminder = (section: SectionRec) => {
    const raw = addText.trim();
    if (!raw) {
      setAdding(null);
      return;
    }
    // The parser is an instruction, never part of the title — "Vet 8/3 2pm" files itself.
    const [text, due, time] = parseWhenFromText(raw, todayStr(), nowStr());
    mutate((e) => {
      const first = remindersOf(section.id)[0];
      e.put({
        id: newId(),
        type: 'reminder',
        updated: 0,
        payload: {
          text: text || raw,
          due,
          time,
          done: false,
          repeat: null,
          folderId: section.payload.folderId,
          sectionId: section.id,
          indent: 0,
          // Prepended, as on the web: new rows land at the top of their section.
          ord: ordBetween(null, first?.payload.ord ?? null),
        },
      });
    });
    setAddText('');
    setAdding(null);
  };

  /**
   * Saves the inline retype, and RETURNS what it wrote.
   *
   * The return is the fix for a real bug, not a convenience. mutate() applies
   * to the engine synchronously but `recs` and `r` are this render's props —
   * stale until React re-renders. Every cluster button saves first and then
   * acted on that stale copy, so duplicating a row you had just retyped made
   * a copy of the text you had REPLACED, and outdenting one wrote the
   * pre-edit payload straight back over the save.
   *
   * The MERGE is core's (editReminderLine): typed tokens overwrite the stored
   * date and time, a token-less rename leaves them alone — the suite's rule,
   * word for word — and the \-escape works because the parse is the same
   * parseWhenFromText every add goes through.
   */
  const saveEdit = (r: ReminderRec): ReminderRec => {
    const raw = editText.trim();
    if (!raw || raw === r.payload.text) return r;
    const next: ReminderRec = { ...r, payload: editReminderLine(r.payload, raw, todayStr(), nowStr()) };
    mutate((e) => e.put(next));
    return next;
  };

  // Ticking rolls a repeat instead of finishing it — the rule lives in core.
  // A ticked repeat doesn't check off — it ROLLS to its next date, and the
  // roll must be visible or the checkbox reads as dead: the row flashes for
  // the suite's 2.2s and its date chip lights in the accent.
  const [rolledId, setRolledId] = useState<string | null>(null);
  const rollTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const tick = (r: ReminderRec) => {
    const next = reminderToggle(r.payload, todayStr());
    mutate((e) => e.put({ ...r, payload: next }));
    // Sean's two seconds: a row that has just gone done stays put, ticked, so
    // a mis-tap can be undone by tapping it again. Untick lets go at once —
    // there is nothing left to hold. A repeat rolls instead of finishing, so
    // `next.done` is false and it never leaves the list anyway.
    if (next.done) grace.hold(r.id);
    else grace.release(r.id);
    if (r.payload.repeat && !r.payload.done) {
      setRolledId(r.id);
      clearTimeout(rollTimer.current);
      rollTimer.current = setTimeout(() => setRolledId(null), 2200);
    }
  };

  /**
   * A blank subtask directly under its parent — the + on a task.
   *
   * It used to make the row and open it for TYPING, which is the one thing on
   * this screen the inline field was genuinely needed for: a row with no text
   * and no way to give it any is not a subtask, it is litter. So the item window
   * opens on it instead, which is where a name is typed now.
   *
   * The record is built here rather than read back out of `recs` afterwards,
   * because mutate() lands in the engine synchronously while `recs` is this
   * render's array — stale until React comes round again. Handing the modal a
   * record it can already see is the same trick saveEdit's return value was.
   */
  const addSubtask = (parent: ReminderRec) => {
    const siblings = recs
      .filter((x): x is ReminderRec => x.type === 'reminder' && x.payload.sectionId === parent.payload.sectionId)
      .sort(byRecOrd);
    const at = siblings.findIndex((x) => x.id === parent.id);
    const sub: ReminderRec = {
      id: newId(), type: 'reminder', updated: 0,
      payload: {
        text: '', due: null, time: null, done: false, repeat: null,
        folderId: parent.payload.folderId, sectionId: parent.payload.sectionId,
        // ordGap: parent and the row after it can share a key — see order.ts.
        indent: 1, ord: ordBetween(...ordGap(siblings.map((x) => x.payload.ord), at + 1)),
      },
    };
    mutate((e) => e.put(sub));
    pendingSub.current = sub.id;
    setModalRec(sub);
  };

  /** The ‹ on a subtask: lift it back out to a task of its own. */
  const outdent = (r: ReminderRec) => mutate((e) => e.put({ ...r, payload: { ...r.payload, indent: 0 } }));

  const addSection = (folder: FolderRec) => {
    const name = newName.trim();
    setAddingSection(null);
    setNewName('');
    if (!name) return;
    const secs = sectionsOf(folder.id);
    if (sectionNameTaken(recs, folder.id, name)) return;
    mutate((e) => {
      // Prepend, as on the web: a new section lands at the top of its folder.
      e.put({
        id: newId(),
        type: 'section',
        updated: 0,
        payload: { name, folderId: folder.id, ord: ordBetween(null, secs[0]?.payload.ord ?? null) },
      });
    });
  };

  /** Every section, so the button can both act and show which way it points. */
  const mySectionIds = folders.flatMap((f) => sectionsOf(f.id).map((x) => x.id));
  // …and the partner's, when their blocks are actually on screen. Sean asked
  // for this after the shared folds landed: a collapse-all that skipped them
  // left the button claiming "all collapsed" over sections that were still
  // open. Only under the All view with a partner, because that is the only
  // place those blocks render — counting sections that are not drawn would
  // make the arrow point the wrong way for a reason nobody could see.
  const sharedSectionIds =
    view === 'all' && sharedPartner
      ? visibleShared.flatMap((f) =>
          sharedRecs
            .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
            .map((x) => `sh:${x.id}`),
        )
      : [];
  const allSectionIds = [...mySectionIds, ...sharedSectionIds];
  const allCollapsed = allSectionIds.length > 0 && allSectionIds.every((id) => folded.has(id));
  const collapseAll = () => {
    const next = allCollapsed ? new Set<string>() : new Set(allSectionIds);
    setFolded(next);
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };

  /** The visible list as Markdown — sean's personal tool, as in prod. */
  const copyMarkdown = (): string => {
    // The shaping lives in core so it can be tested; this only says WHICH
    // folders, sections and rows are on screen.
    const md = remindersMarkdown(
      folders.map((f) => ({
        name: f.payload.name,
        sections: sectionsOf(f.id).map((sec) => ({
          name: sec.payload.name,
          rows: remindersOf(sec.id).map((r) => ({
            text: r.payload.text,
            due: r.payload.due,
            time: r.payload.time,
            repeat: repeatLabel(r.payload.repeat),
            done: r.payload.done,
            indent: r.payload.indent,
          })),
        })),
      })),
      showDone,
    );
    return md;
  };

  const dueChip = (r: ReminderRec) => {
    const { due, time, repeat, done } = r.payload;
    if (!due && !time && !repeat) return null;
    const overdue = !done && due !== null && due < todayStr();
    const bits = [
      due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      timeLabel(time, clock24),
      repeatLabel(repeat),
    ].filter(Boolean);
    return <Text style={[s.chip, overdue && s.chipOverdue, rolledId === r.id && s.chipRolled]}>{bits.join(' · ')}</Text>;
  };

  // NO repeatEditor. The frequency pills — Once / day / week / month / year and
  // the ± count — used to unfold under whichever row was being edited, and Sean
  // asked for them out of edit mode (2026-08-12). A repeat is set in the item
  // window, which is the only place it can sit beside the date it interacts
  // with. This was also the third copy of core's REPEAT_UNITS on screen; two
  // remain, and testids.spec.ts is what stops a fourth.

  if (sharedView && sharedPartner) {
    return <SharedReminders viewKey={sharedView} partner={sharedPartner} />;
  }

  return (
    <View style={s.page}>
      {/* Collapse-all sits in the TOP BAR, right of the name, where the
          Calendar's picker sits — Sean's placement. It is a view control like
          the picker beside it, not a list action, and the toolbar row below
          is for things that act on the list. */}
      <TopBar
        title="Reminders"
        controls={<CollapseAllBtn open={!allCollapsed} onPress={collapseAll} />}
        copyMarkdown={copyMarkdown}
        completed={<CircleBtn testID="rem-completed" glyph="☑" label="Completed" size={TOPBAR_CTRL} active={showDone} onPress={() => setShowDone(!showDone)} />}
        picker={<FolderPick app="reminders" />}
      />

      {/* A live drag holds the scroll still — see Habits for the why. */}
      <Scroll contentContainerStyle={s.scrollWrap} scrollEnabled={drag.dragIdx === null && secDrag.dragging === null}>
        {/* On a PHONE this wrapper is what makes a tap outside leave edit
            mode: the web's document listener needs a document, so until now
            the only way out on iOS was the Done button. It CARRIES the
            content layout (s.scroll) so that arming edit mode cannot move
            anything and the padding gutters are its own tappable surface —
            see EditExit for both stories. */}
        {/* Also armed while a swipe-delete is PARKED, so a tap anywhere puts
            it away on the phone — the web has its own document listener in
            useSwipeLeft, and this is the native half of the same rule (Sean,
            2026-08-20: "tap to exit swipe to delete doesn't work"). */}
        <EditExit
          active={pageEdit || swipe.swiped !== null}
          onExit={() => { if (swipe.swiped !== null) swipe.clear(); else exitEdit(); }}
          style={s.scroll}
        >
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            {/* The header ROW is the reliable way out: always on screen, full
                width, and taller than the 1pt rule. With Done gone, tapping
                out is the ONLY exit, so it must not depend on blank space
                below a list that fills the screen. The controls inside keep
                their own presses — this fires on the row's bare surface. */}
            <View testID={`head-fold-${f.payload.name}`} style={s.folderHead}>
              {/* The folder's colour is the wash behind its name, not a dot beside it. */}
              <Pressable onPress={() => toggleFolderFold(f.id)} hitSlop={8} style={s.chevWrap}>
                <WebHitSlop />
                <Chevron open={!foldedFolders.has(f.id)} color={T.text} />
              </Pressable>
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn testID={`foldadd-${f.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewName(''); }} />
              <View style={s.folderRule} />
            </View>
            {addingSection === f.id && (
              <Field
                value={newName}
                onChangeText={setNewName}
                placeholder="New section"
                autoFocus
                onBlur={() => addSection(f)}
                onSubmitEditing={() => addSection(f)}
              />
            )}
            {/* level-0 landing at this folder's end */}
            {!foldedFolders.has(f.id) && sectionsOf(f.id).map((sec) => {
              const rows = remindersOf(sec.id).filter((r) => showDone || !r.payload.done || grace.held(r.id));
              const isFolded = folded.has(sec.id);
              return (
                <View key={sec.id} style={s.section}>
                  {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                  <View
                    testID={`head-sec-${sec.payload.name}`}
                    ref={secDrag.registerHeader(sec.id, f.id)}
                    style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                  >
                    <View testID={`sec-grip-${sec.payload.name}`} {...(pageEdit ? secDrag.gripFor(sec.id) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                    <WebHitSlop slop={6} />
                      <Text style={s.rowGripText}>≡</Text>
                    </View>
                    <Pressable testID={`secfold-${sec.payload.name}`} onPress={() => toggleFold(sec.id)} hitSlop={8} style={s.chevWrap}>
                      <WebHitSlop />
                      <Chevron open={!isFolded} />
                    </Pressable>
                    {renamingSec === sec.id ? (
                      <Field
                        testID="sec-rename"
                        value={renameSecText}
                        onChangeText={setRenameSecText}
                        autoFocus
                        style={s.secRename}
                        onBlur={() => {
                          setRenamingSec(null);
                          const res = renameSection(recs, sec.id, renameSecText);
                          if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                        }}
                        onSubmitEditing={() => {
                          setRenamingSec(null);
                          const res = renameSection(recs, sec.id, renameSecText);
                          if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                        }}
                      />
                    ) : (
                      <Pressable
                        testID={`sec-name-${sec.payload.name}`}
                        onPress={() => {
                          const now = Date.now();
                          if (lastSecTap.current.id === sec.id && now - lastSecTap.current.at < 300) {
                            setPageEdit(true);
                            setRenamingSec(sec.id);
                            setRenameSecText(sec.payload.name);
                          }
                          lastSecTap.current = { id: sec.id, at: now };
                        }}
                        onLongPress={() => { setPageEdit(true); setRenamingSec(sec.id); setRenameSecText(sec.payload.name); }}
                        delayLongPress={350}
                      >
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                    )}
                    <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => { setAdding(sec.id); setAddText(''); if (isFolded) toggleFold(sec.id); }} />
                    {/* No × on a folder's ONLY section, exactly as the suite
                        does it: "No × on a folder's only section — its last
                        section can't be deleted." core's deleteSection refuses
                        it, and both screens swallowed that refusal, so the
                        button was offered and did nothing — in the state every
                        folder STARTS in, since normalize seeds each with one
                        section. The two-press × then answered a confirmed
                        delete with silence. */}
                    {pageEdit && sectionsOf(f.id).length > 1 && (
                      <ConfirmDelete testID={`secdel-${sec.payload.name}`} size={22} onDelete={() => {
                        const res = deleteSection(recs, sec.id);
                        if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                      }} />
                    )}
                  </View>
                  {adding === sec.id && (
                    <Field
                      testID="rem-add-field"
                      value={addText}
                      onChangeText={setAddText}
                      placeholder="New reminder — try “Vet 8/3 2pm”"
                      autoFocus
                      onBlur={() => addReminder(sec)}
                      onSubmitEditing={() => addReminder(sec)}
                    />
                  )}
                  {!isFolded && rows.length === 0 && (
                    <View>
                      {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                      <View testID={`secempty-${sec.payload.name}`} ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot}>
                      </View>
                    </View>
                  )}
                  {!isFolded &&
                    rows.map((r, ri) => (
                      <View key={r.id}>
                        {drag.slot !== null && flatIdxOf(r.id) === drag.slot && <View style={s.dropLine} />}
                        <View
                          testID="rem-row"
                          ref={drag.registerRow(flatIdxOf(r.id))}
                          {...(pageEdit ? stayInEdit : swipe.handlersFor(r.id))}
                          style={[
                            s.row,
                            rolledId === r.id && s.rowRolled,
                            ri === rows.length - 1 && s.rowLast,
                            s.rowNoSelect,
                            r.payload.indent > 0 && s.rowIndented,
                            drag.dragIdx !== null && flatIdxOf(r.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] },
                          ]}
                        >
                          <View
                            testID="row-grip"
                            {...(pageEdit ? drag.handleFor(flatIdxOf(r.id)) : {})}
                            style={[s.rowGrip, !pageEdit && s.gripHidden]}
                            pointerEvents={pageEdit ? 'auto' : 'none'}
                            hitSlop={6}
                          >
                            <WebHitSlop slop={6} />
                            <Text style={s.rowGripText}>≡</Text>
                          </View>
                          <Pressable testID="tick" onPress={() => tick(r)} hitSlop={8} style={[s.tick, r.payload.done && s.tickDone]}>
                            <WebHitSlop />
                            {r.payload.done && <Text style={s.tickMark}>✓</Text>}
                          </Pressable>
                          {editing === r.id ? (
                            <Field
                              testID="rem-edit"
                              value={editText}
                              onChangeText={setEditText}
                              autoFocus
                              style={s.editField}
                              onBlur={() => {
                                saveEdit(r);
                                // A pointer already down on a cluster button: keep the
                                // cluster mounted so its press can land (blur fires between
                                // pointerdown and click, and unmounting kills the tap).
                                if (holdCluster.current) { holdCluster.current = false; return; }
                                setEditing(null);
                              }}
                              onSubmitEditing={() => { saveEdit(r); setEditing(null); }}
                            />
                          ) : (
                          <Pressable
                            testID="rem-body"
                            style={s.rowBody}
                            onPress={() => {
                              if (swipe.justSwiped()) return;
                              if (swipe.swiped) { swipe.clear(); return; }
                              // A tap OUTSIDE edit mode opens the row for
                              // retyping (Sean, 2026-08-20: "tap to edit in
                              // reminders should work when not in edit mode..
                              // in edit mode one would still hit the pencil").
                              // So edit mode is for ARRANGING — drag,
                              // duplicate, subtask, delete, and the pencil for
                              // the full sheet — and a plain tap is for the
                              // words. The long-press still arms edit mode.
                              if (!pageEdit) { setEditing(r.id); setEditText(r.payload.text); }
                            }}
                            onLongPress={enterEdit}
                            delayLongPress={350}
                          >
                            {/* Done keeps the folder's hue, faded — Sean's
                                word over the suite's grey, 2026-08-18.

                                ONE LINE, elided (Sean, 2026-08-20: "elide
                                long reminders, don't wrap"). A wrapped row
                                grew to whatever its text needed — a pasted
                                URL made a row six lines tall — so the list
                                stopped being a list of rows and the tick,
                                the chip and the cluster all floated in the
                                middle of a paragraph. */}
                            <Text numberOfLines={1} style={[s.rowText, r.payload.done && s.rowTextDone, r.payload.done && { color: f.payload.color + '77' }]}>{r.payload.text || '…'}</Text>
                          </Pressable>
                          )}
                          {editing !== r.id && dueChip(r)}
                          {/* The edit cluster FLOATS over the row's right edge
                              rather than taking layout space in it.

                              As an ordinary flex child it squeezed the text
                              from 298pt to 160pt, which made a long reminder
                              re-wrap; the row grew, and the row below it moved
                              down 86pt. Measured, not guessed. Sean asked for
                              the buttons to "just appear" and said the text may
                              be elided, which is exactly what an absolutely
                              positioned cluster with an opaque background does:
                              nothing reflows, and the text it covers is simply
                              not shown. */}
                          {/* onPressIn on every cluster button: each carries
                              `holdCluster.current = true` so its press can
                              outlive the inline field's blur, and each saves
                              the in-flight text before acting on it — the
                              machinery that returned with the editor. */}
                          {pageEdit && (
                            <View style={s.editCluster}>
                              <CircleBtn testID="rem-pencil" glyph="✎" label="Edit" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { const saved = editing === r.id ? saveEdit(r) : r; setEditing(null); setModalRec(saved); }} />
                              {/* Copy (Sean, 2026-08-20). The clipboard gets
                                  core's reminderLine — the words plus the
                                  date and time as the TOKENS that made them,
                                  so "vet visit 9/3 2pm" both reads as a
                                  sentence in a message and pastes back into
                                  the add field as the same reminder. Copying
                                  the bare text would drop the half that is
                                  hardest to retype.

                                  It saves an in-flight inline edit FIRST, and
                                  copies what was saved: every other button in
                                  this cluster learned that lesson the hard
                                  way (a duplicate made from the pre-edit
                                  payload), and a copy of the text you had
                                  just replaced is the same bug, quieter.

                                  The glyph is DRAWN (ui's DrawnGlyph), not
                                  typed: it shipped as 📋 and Sean asked for
                                  "monochrome simple clipboard" the same day,
                                  which no text glyph provides — the nearest
                                  ones are all two overlapping squares, i.e.
                                  the ⧉ two buttons along. */}
                              <CircleBtn testID="rem-copy" glyph="clipboard" label="Copy" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => {
                                const saved = editing === r.id ? saveEdit(r) : r;
                                setEditing(null);
                                Clipboard.setStringAsync(reminderLine(saved.payload, todayStr()))
                                  .then(() => toast('Copied'))
                                  .catch(() => toast('Could not copy'));
                              }} />
                              {r.payload.indent === 0 && (
                                <CircleBtn testID="rem-dup" glyph="⧉" label="Duplicate" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => {
                                  if (editing === r.id) saveEdit(r);
                                  setEditing(null);
                                  // e.all(), not recs: the save above has already
                                  // landed in the engine and not yet in this render.
                                  mutate((e) => {
                                    const res = duplicateItem(e.all(), r.id, newId);
                                    if (!('error' in res)) res.put.forEach((p) => e.put(p));
                                  });
                                }} />
                              )}
                              {r.payload.indent === 0 ? (
                                <CircleBtn glyph="+" label="Add" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { if (editing === r.id) saveEdit(r); setEditing(null); addSubtask(r); }} />
                              ) : (
                                <CircleBtn glyph="‹" label="Previous" size={24} onPressIn={() => { holdCluster.current = true; }} onPress={() => { const saved = editing === r.id ? saveEdit(r) : r; setEditing(null); outdent(saved); }} />
                              )}
                              <ConfirmDelete onPressIn={() => { holdCluster.current = true; }} onDelete={() => { setEditing(null); mutate((e) => e.del(r.id)); }} />
                            </View>
                          )}
                          {swipe.swiped === r.id && !pageEdit && (
                            <View style={s.swipePark}>
                              <ConfirmDelete
                                testID="swipe-del"
                                forceArmed
                                onDelete={() => { swipe.clear(); mutate((e) => e.del(r.id)); }}
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                </View>
              );
            })}
            {secDrag.lineKey === `end:${f.id}` && <View style={s.dropLine} />}
          </View>
        ))}

        {view === 'all' && sharedPartner &&
          visibleShared
            .slice()
            .sort(byRecOrd)
            .map((f) => (
              <View key={`sh${f.id}`} style={s.folderBlock}>
                {/* A partner's folder collapses like my own. It had no control
                    at all, so the one list I cannot reorder was also the one I
                    could not put away. The state is MINE: it lives in this
                    device's AsyncStorage under the same key as my own folds,
                    is never written to their store and never synced, so
                    folding Aki's list away changes nothing on Aki's screen. */}
                <Pressable style={s.folderHead} onPress={() => toggleFolderFold(`sh:${f.id}`)} hitSlop={8}>
                  <View style={s.chevWrap}><WebHitSlop /><Chevron open={!foldedFolders.has(`sh:${f.id}`)} color={T.text} /></View>
                  <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
                  {/* Beside the name, LEFT of the divider. It used to sit
                      between two rule segments, which read as a label on the
                      line rather than on the folder. */}
                  <Text testID="shared-owner-badge" style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  <View testID="shared-folder-rule" style={s.folderRule} />
                </Pressable>
                {!foldedFolders.has(`sh:${f.id}`) && sharedRecs
                  .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
                  .sort(byRecOrd)
                  .map((sec) => (
                    <View key={sec.id} style={s.section}>
                      {/* A partner's section collapses like my own. The
                          folder above it already did; the sections inside it
                          did not, so the only way to put one away was to put
                          the whole partner away. Keyed 'sh:' so a shared
                          section id can never collide with one of mine, and
                          the fold is MINE — device-local, never written to
                          their store, never synced. */}
                      <Pressable testID={`shared-secfold-${sec.payload.name}`} style={[s.secHead, s.sharedSecHead]} onPress={() => toggleFold(`sh:${sec.id}`)} hitSlop={8}>
                        <View style={s.chevWrap}><WebHitSlop /><Chevron open={!folded.has(`sh:${sec.id}`)} /></View>
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                      {!folded.has(`sh:${sec.id}`) && sortByDate(
                        sharedRecs
                          .filter((r): r is ReminderRec => r.type === 'reminder' && r.payload.sectionId === sec.id && shTick.shows(r))
                          .sort(byRecOrd)
                          .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
                      ).map(({ rec: r }, ri, arr) => (
                        <View key={r.id} style={[s.row, s.sharedRow, ri === arr.length - 1 && s.rowLast, r.payload.indent > 0 && s.rowIndented]}>
                          <Pressable
                            testID="all-shared-tick"
                            onPress={() => shTick.tick(r)}
                            hitSlop={8}
                            style={[s.tick, shTick.done(r) && s.tickDone]}
                          >
                            {shTick.done(r) && <Text style={s.tickMark}>✓</Text>}
                          </Pressable>
                          <Text numberOfLines={1} style={s.rowText}>{r.payload.text}</Text>
                          {dueChipStatic(r, todayStr(), clock24)}
                        </View>
                      ))}
                    </View>
                  ))}
              </View>
            ))}
        {pageEdit && <Pressable style={s.editBackdropFill} onPress={exitEdit} />}
        </EditExit>
      </Scroll>

      {modalRec && <ItemModal mode="edit" kind="reminder" rec={modalRec} onClose={closeModal} />}
      {emptyAsk && (
        <Modal transparent animationType="fade" onRequestClose={() => setEmptyAsk(null)}>
          <Pressable style={s.askBackdrop} onPress={() => setEmptyAsk(null)}>
            <Pressable style={s.askCard} onPress={() => {}}>
              <Text style={s.askText}>That's the folder's last section — move it and delete the emptied folder?</Text>
              <View style={s.askRow}>
                <Pill label="Cancel" onPress={() => setEmptyAsk(null)} />
                <Pill
                  label="Move & delete"
                  primary
                  onPress={() => {
                    const res = moveSectionEmptyingFolder(recs, emptyAsk.sectionId, emptyAsk.slot.folderId, emptyAsk.slot.beforeSectionId);
                    if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                    setEmptyAsk(null);
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

/**
 * A partner's shared folder: their sections and rows, MY tick — the one view
 * where every write goes to their store (sharedPut), and structure is
 * read-only: no edit mode, no grips, no cluster, no swipe. The section +
 * still adds a row into their section, as the suite allows.
 */
function SharedReminders({ viewKey, partner }: { viewKey: string; partner: string }) {
  const { sharedRecs, sharedPut, sharedPartnerLabel } = useStore();
  const shTick = useSharedTick();
  // MY clock setting, not the partner's — it is how I read a time, and their
  // prefs are not in my store anyway.
  const clock24 = useClock24();
  const shown = sharedPartnerLabel ?? partner;
  const today = todayStr();
  const folderId = viewKey.slice(viewKey.indexOf(':') + 1);
  const folder = sharedRecs.find((r): r is Rec<'folder'> => r.type === 'folder' && r.id === folderId);
  const sections = sharedRecs
    .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === folderId)
    .sort(byRecOrd);
  const rowsOf = (secId: string) =>
    sortByDate(
      sharedRecs
        .filter((r): r is ReminderRec => r.type === 'reminder' && r.payload.sectionId === secId && shTick.shows(r))
        .sort(byRecOrd)
        .map((x) => ({ due: x.payload.due, indent: x.payload.indent, rec: x })),
    ).map((row) => row.rec);
  const [adding, setAdding] = useState<string | null>(null);
  const [addText, setAddText] = useState('');

  return (
    <View style={s.page}>
      <TopBar title="Reminders" picker={<FolderPick app="reminders" />} />
      <Scroll contentContainerStyle={s.scroll}>
        <View style={s.folderHead}>
          <Text style={[s.folderName, { backgroundColor: (folder?.payload.color ?? '#888888') + '33' }]}>@{shown}: {folder?.payload.name ?? '…'}</Text>
        </View>
        {sections.map((sec) => (
          <View key={sec.id} style={s.section}>
            <View style={s.secHead}>
              <Text style={s.secName}>{sec.payload.name}</Text>
              <CircleBtn glyph="+" label="Add" size={22} onPress={() => { setAdding(sec.id); setAddText(''); }} />
            </View>
            {adding === sec.id && (
              <Field
                testID="shared-add-field"
                value={addText}
                onChangeText={setAddText}
                autoFocus
                placeholder="New reminder"
                onSubmitEditing={() => {
                  const text = addText.trim();
                  setAdding(null);
                  if (!text) return;
                  const [title, due, time] = parseWhenFromText(text, today, nowStr());
                  void sharedPut({
                    id: newId(), type: 'reminder', updated: 0,
                    payload: { text: title, due, time, done: false, repeat: null, folderId, sectionId: sec.id, indent: 0, ord: ordBetween(null, rowsOf(sec.id)[0]?.payload.ord ?? null) },
                  } as Rec<'reminder'>);
                }}
              />
            )}
            {rowsOf(sec.id).map((r) => (
              <View key={r.id} style={[s.row, r.payload.indent > 0 && s.rowIndented]}>
                <Pressable
                  testID="shared-tick"
                  onPress={() => shTick.tick(r)}
                  hitSlop={8}
                  style={[s.tick, shTick.done(r) && s.tickDone]}
                >
                  {shTick.done(r) && <Text style={s.tickMark}>✓</Text>}
                </Pressable>
                <Text numberOfLines={1} style={s.rowText}>{r.payload.text}</Text>
                {dueChipStatic(r, today, clock24)}
              </View>
            ))}
          </View>
        ))}
      </Scroll>
    </View>
  );
}

function dueChipStatic(r: ReminderRec, today: string, clock24: boolean) {
  if (!r.payload.due) return null;
  const overdue = r.payload.due < today && !r.payload.done;
  return <Text style={[s.chip, overdue && s.chipOverdue]}>{r.payload.due}{r.payload.time ? ` ${timeLabel(r.payload.time, clock24)}` : ''}</Text>;
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  // flexGrow so the edit backdrop below the list can actually take the
  // leftover height; without it the content container is only as tall as
  // its content and the backdrop's flexGrow has nothing to grow into.
  scrollWrap: { flexGrow: 1 },
  // The content layout lives on EditExit, NOT on the scroll's container:
  // the wrapper must render identically in and out of edit mode (or arming
  // it shifts the list — it did), and owning the padding is what makes a
  // tap in the gutter beside a row land on something that can exit.
  // paddingTop 0 — the gap below the divider is TopBar's now (chrome.tsx).
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 48, gap: 18, flexGrow: 1 },
  folderBlock: { gap: 8 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderName: {
    color: T.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  // The width a section head is pushed in by the drag grip it carries
  // (16) plus the head's own gap (8). A partner's sections have no grip
  // to push them, so they get the same distance as padding instead.
  sharedSecHead: { paddingLeft: 24 },
  // …and the same for a partner's ROWS. Mine lead with a drag grip (16)
  // plus the row's own gap (10); theirs have no grip, so they sat 26pt
  // to the left of mine. Fixing the section heads alone left the rows
  // under them still hanging out past their own header.
  sharedRow: { paddingLeft: 26 },
  ownerBadge: { color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  folderRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  section: { gap: 6 },
  // minHeight so swapping the section NAME for its rename field cannot
  // change the head's height. Measured: the name is 20pt, the field 28,
  // and that difference moved every row below it down by 12 the moment
  // edit mode opened. Sean asked for the buttons to just appear, and a
  // list that jumps is the opposite of that.
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, minHeight: 28 },
  chevron: { color: T.dim, fontSize: 16, width: 20, textAlign: 'center' },
  // An explicit HEIGHT, not the glyph's. This box had width 20 and no
  // height, so its height WAS the chevron — and on the web, where
  // hitSlop does nothing, taking the chevron from 11 to 7 would have
  // taken the tap target with it. 20x20 regardless of what is drawn.
  chevWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  copyNote: { color: T.dim, fontSize: 12, alignSelf: 'center' },
  // ONE collapse-all across the app: Notes drew it at 24 and Reminders at
  // 26, and Habits drew a text '⌃' in a 30pt CircleBtn instead. Same
  // control, three sizes and two symbols. 26 is the largest of them, and
  // the circle IS the tap target here — the chevron inside is decoration.
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  secRename: { flex: 1, paddingVertical: 4 },
  // …and the same for a ROW, whose text swaps for an inline field two
  // points taller.
  // The vertical padding lives on rowBody, not here. On the row it was space
  // the row OWNED and did not answer: rowBody is what a tap goes to, and as a
  // centred flex child inside 8pt of parent padding it was 18pt tall in a 36pt
  // row. Moved inward, the same 8pt is inside the press box, the row is still
  // 36 (minHeight) and everything in it is still centred — the layout is
  // unchanged and the dead half of the row is gone.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, borderBottomWidth: 1, borderBottomColor: T.lineSoft },
  rowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  // Pinned to the row's right edge and OUT of the flex flow, so turning
  // edit mode on cannot change a single measurement in the row. The
  // opaque background is what makes the covered text read as elided
  // rather than as two things overlapping.
  editCluster: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 10, backgroundColor: T.bg,
  },
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  rowGripText: { color: T.lineSoft, fontSize: 13, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 0, overflow: 'hidden' },
  askBackdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  askCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20, gap: 14 },
  askText: { color: T.text, fontSize: 15, lineHeight: 22 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  // A swipe target never starts a text selection (a selection terminates the pan).
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  // visibility, not display: entering edit mode must not nudge text sideways.
  gripHidden: { opacity: 0 },
  // Fills whatever is left below the list, rather than a fixed 160: on a
  // short list the blank area a person actually taps is all of it.
  editBackdropFill: { flexGrow: 1, minHeight: 160 },
  editDone: { marginLeft: 'auto' },
  rowIndented: { paddingLeft: 28 },
  rowBody: { flex: 1, alignSelf: 'stretch', paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // The inline field wears the row's own height so swapping text for input
  // cannot change a single measurement — the row is minHeight 36 and stays 36.
  editField: { flex: 1, height: 20, paddingVertical: 0, paddingHorizontal: 6, borderRadius: 6 },
  // The parked swipe-delete floats over the row's right edge, OUT of the flex
  // flow, exactly as the edit cluster does and for the same reason: as a flex
  // child it squeezed the body and every chip slid left the moment the ×
  // parked ("things shift with slide to delete" — Sean, 2026-08-20). The
  // opaque background makes what it covers read as elided, not overlapped.
  swipePark: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 10, backgroundColor: T.bg,
  },
  rowText: { color: T.text, fontSize: 16, flexShrink: 1 },
  rowTextDone: { color: T.muted, textDecorationLine: 'line-through' },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: { backgroundColor: T.accentInk, borderColor: T.accent },
  tickMark: { color: T.accent, fontSize: 13, fontWeight: '700' },
  chip: { color: T.dim, fontSize: 13, backgroundColor: T.surface2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', marginLeft: 'auto' },
  chipOverdue: { color: T.overdue, fontWeight: '600' },
  rowRolled: { backgroundColor: T.accentSoft, borderRadius: 8 },
  chipRolled: { color: T.accent, fontWeight: '700' },
  // minHeight 32 — a Pill's height — so the Done button appearing in edit
  // mode cannot make this row taller. It could, and did: the toolbar grew by
  // 6 and pushed the entire list down with it. The control Sean asked for to
  // FIX the shift was the thing causing the remaining shift.
  // 8pt below the divider on every tab. Measured before touching it: 6 on
  // Reminders, 9 on Habits, 11 on Calendar, 16 on Notes. Sean named Habits as
  // closest and a hair tall, so 8 is the target and every screen is tuned to
  // land there rather than to carry the same number in its own style.
  // paddingTop 0 — the gap below the divider is TopBar's now (chrome.tsx).
  // minHeight is gone with it: at 42 against a 32pt button the row had 10pt
  // of slack that `alignItems: center` split above and below, so the first
  // thing you SEE still sat 5pt lower than on the other tabs even with the
  // padding zeroed. The row's natural height is the button's, and the text
  // beside it is shorter, so nothing was relying on the floor.
  // paddingBottom 10 matches the gap above the row, so the toolbar sits in
  // even air rather than being welded to the first folder — Sean's ask once
  // the top gap landed. It is the toolbar's own, not the scroll's: the
  // scroll's paddingTop is 0 by design (see the divider note above), and
  // putting it back there would space every OTHER screen too.
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10 },
}));
