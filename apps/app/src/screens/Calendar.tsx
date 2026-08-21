/**
 * The Calendar: month grid over a day panel, the suite's split. Cells carry the
 * day's marks (event dots in calendar colors, the worst reminder state, a note
 * mark); the panel lists events → reminders → notes in the suite's order, ticks
 * roll repeats, and the add row files a reminder or event by kind. A day is
 * selected by a tap and nothing else.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addDays,
  cellMarks,
  type CellMark,
  dayHeading,
  dayItems,
  duplicateItem,
  eventLine,
  monthGridFilled,
  monthLegend,
  newId,
  prefsOf,
  reminderToggle,
  subOccurrences,
  timeLabel,
  timeRangeLabel,
  todayStr,
  twoWeeksFrom,
  type Rec,
  viewMarkdown,
} from '@calmind/core';
import { useStore } from '../store';
import { useSubIcs } from '../subs';
import { useClock24 } from '../useClock24';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { CalendarPick, useCalendarView } from '../components/CalendarPick';
import { CalGlyph, PageGlyph, TickBoxGlyph } from '../components/KindIcons';
import { ItemModal, type ItemKind } from '../components/ItemModal';
import { useSwipeLeft } from '../components/swiperow';
import { BalancedRow } from '../components/BalancedRow';
import { Chevron } from '../components/Chevron';
import { useSharedTick, useTickGrace } from '../components/tickgrace';
import { EditExit } from '../components/EditExit';
import { useToast } from '../components/Toast';
import { CircleBtn, CollapseAllBtn, ConfirmDelete, Rule, Scroll, TOPBAR_CTRL, WebHitSlop } from '../ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The suite's remembered day (calDay): restored when you come back to the
// tab, reset by a fresh load — deliberate paging never rewrites it.
let calDay: string | null = null;

/** The day the calendar is showing right now — what the Add tab defaults to
 *  when it is opened FROM this screen (Sean, 2026-08-20: "the add app when
 *  launched from a particular day should default from that day"). */
export function calSelectedDay(): string {
  return calDay ?? todayStr();
}

export function Calendar({ onNoteCreated }: { onNoteCreated?: (id: string) => void }) {
  const { recs, mutate, sharedRecs, sharedPartner, sharedPartnerLabel, session } = useStore();
  const { visible: visibleCals, calendars, visibleShared, visibleSubs } = useCalendarView();
  const clock24 = useClock24();
  const toast = useToast();
  const today = todayStr();
  const [ym, setYm] = useState((calDay ?? today).slice(0, 7));
  const [day, setDayState] = useState(calDay ?? today);
  const setDay = (d: string) => { calDay = d; setDayState(d); };
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.calFold')
      .then((raw) => raw && setFolded(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const toggleFold = (kind: string) => {
    const next = new Set(folded);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setFolded(next);
    // Swallowed deliberately, and this is the triage: what is lost when a
    // fold write fails is which sections were collapsed, next launch. No
    // user content, nothing unrecoverable, and an alert about a collapsed
    // folder would be worse than the loss. The failures worth surfacing in
    // this app are the ones that lose DATA or lie about state — see
    // store.tsx's persistFailed and the shared-write reconcile.
    AsyncStorage.setItem('calmind.calFold', JSON.stringify([...next])).catch(() => {});
  };
  // Remembered, like calWeekMode and calFold beside it — the suite keeps this
  // in localStorage as calShowDone and restores it on load. It was the one
  // toggle on this screen that did not persist, so switching tabs (which
  // unmounts the screen) silently turned Completed back off.
  //
  // NOT replicated: the suite makes this transient while EDITING — toggling
  // it there leaves the saved preference alone, so leaving edit mode restores
  // what you had. CalMind's edit mode does not touch showDone at all, so
  // there is nothing to be transient about; if that behaviour is wanted it is
  // a separate change and Sean's call.
  const [showDone, setShowDoneState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('calmind.calShowDone').then((raw) => raw === '1' && setShowDoneState(true));
  }, []);
  const setShowDone = (on: boolean) => {
    setShowDoneState(on);
    // Swallowed for the same reason the fold writes are: what is lost is
    // which view you had, next launch. No content, nothing unrecoverable.
    AsyncStorage.setItem('calmind.calShowDone', on ? '1' : '').catch(() => {});
  };
  const swipe = useSwipeLeft();
  /**
   * THREE views, not two (Sean, 2026-08-20: "swiping up again should go to a
   * list view … grouped by day … go out 3 months by default"). Up folds
   * month → fortnight → list; down opens it back out. Sticks per device, as
   * the fortnight always has.
   *
   * calWeekMode is still read on boot and never written again: it is what
   * every existing install has, and dropping it would silently unfold the
   * fortnight for anyone who had it. The new key supersedes it when present.
   */
  type CalView = 'month' | 'week' | 'list';
  const VIEWS: CalView[] = ['month', 'week', 'list'];
  const [calView, setCalViewState] = useState<CalView>('month');
  const weekMode = calView === 'week';
  const [wkAnchor, setWkAnchor] = useState(today);
  useEffect(() => {
    AsyncStorage.getItem('calmind.calView')
      .then(async (v) => {
        if (v === 'month' || v === 'week' || v === 'list') { setCalViewState(v); return; }
        const legacy = await AsyncStorage.getItem('calmind.calWeekMode').catch(() => null);
        if (legacy === '1') setCalViewState('week');
      })
      .catch(() => {});
  }, []);
  const setCalView = (v: CalView) => {
    setCalViewState(v);
    // Fold onto the selected day when it's in the shown month, else onto the
    // shown month itself — folding must never yank the view somewhere else.
    if (v === 'week') setWkAnchor(day.startsWith(ym) ? day : `${ym}-01`);
    AsyncStorage.setItem('calmind.calView', v).catch(() => {});
  };
  /** Up is further in (month → week → list); down is back out. Clamped at
   *  both ends, so a swipe past the last view does nothing rather than
   *  wrapping around to the first. */
  const stepView = (inward: boolean) => {
    const i = VIEWS.indexOf(calView);
    const next = VIEWS[Math.min(VIEWS.length - 1, Math.max(0, i + (inward ? 1 : -1)))]!;
    if (next !== calView) setCalView(next);
  };
  // Edit only: the panel's own "+ Add" pill is gone (Sean, 2026-08-20 —
  // "remove the additional add button on calendar"). Creating on a day is
  // the Add tab's job now, and it defaults to this screen's selected day.
  const [modal, setModal] = useState<null | { mode: 'edit'; kind: ItemKind; rec: Rec<'event'> | Rec<'reminder'> | Rec<'note'> }>(null);

  const [year, month] = ym.split('-').map(Number) as [number, number];
  // The picker's ticks are what's on screen: events on switched-off calendars
  // leave the grid and the panel together.
  const drawn = useMemo(() => {
    const on = new Set(visibleCals.map((c) => c.id));
    return on.size === calendars.length ? recs : recs.filter((r) => r.type !== 'event' || on.has(r.payload.calendarId));
  }, [recs, visibleCals, calendars]);
  // The partner's shared items, filtered by their own show/hide boxes; their
  // reminders and notes ride along whole — folder-level hiding is theirs.
  const sharedDrawn = useMemo(() => {
    if (!sharedPartner) return [] as typeof sharedRecs;
    const on = new Set(visibleShared.map((c) => c.id));
    return sharedRecs.filter((r) => r.type !== 'event' || on.has(r.payload.calendarId));
  }, [sharedRecs, sharedPartner, visibleShared]);
  const folderModes = useMemo(() => prefsOf(recs, 'calendar').folderModes ?? {}, [recs]);
  // For the done rows' faded folder hue — the day panel knows its reminders
  // only by record, and a record names its folder by id.
  const folderColor = useMemo(
    () => new Map(recs.filter((r): r is Rec<'folder'> => r.type === 'folder').map((f) => [f.id, f.payload.color])),
    [recs],
  );
  const sharedItems = useMemo(() => dayItems(sharedDrawn, day, today, folderModes), [sharedDrawn, day, today, folderModes]);
  const sharedCalById = useMemo(() => new Map(sharedRecs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [sharedRecs]);
  // The filled grid: every cell a real date, the neighbours' lightened.
  // Week mode is Sean's TWO-week fold: the anchor's week plus the next.
  const monthCells = useMemo(() => monthGridFilled(year, month), [year, month]);
  const cells = useMemo(() => (weekMode ? twoWeeksFrom(wkAnchor) : monthCells), [weekMode, wkAnchor, monthCells]);
  /**
   * Subscribed calendars' chips for the visible window — computed from the
   * fetched ICS, never records, never editable, and gone the moment the
   * picker's box is unticked (visibleSubs is the filter). The zone is the
   * DEVICE's: a 02:00Z instant is yesterday evening here, and drawing it on
   * the UTC day would file the launch party on the wrong night.
   */
  const subIcs = useSubIcs(recs, session);
  const subOccs = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
    const from = cells[0]!;
    const to = cells[cells.length - 1]!;
    return visibleSubs.flatMap((sub) => {
      const text = subIcs[sub.id];
      if (!text) return [];
      try {
        return subOccurrences(text, tz, from, to).map((occ) => ({ occ, color: sub.payload.color, subId: sub.id }));
      } catch {
        return []; // a feed that stops parsing draws nothing, it does not crash the month
      }
    });
  }, [visibleSubs, subIcs, cells]);
  const subDay = useMemo(() => subOccs.filter((o) => o.occ.date === day), [subOccs, day]);
  const marks = useMemo(
    () => new Map(cells.filter(Boolean).map((d) => [d!, [
      ...cellMarks(drawn, d!, today, folderModes),
      ...cellMarks(sharedDrawn, d!, today, folderModes),
      // Subscribed events wear the event glyph in the subscription's colour —
      // one glyph per subscription per day, the cell rule's shape.
      ...[...new Map(subOccs.filter((o) => o.occ.date === d).map((o) => [o.subId, o])).values()]
        .map((o): CellMark => ({ kind: 'event', color: o.color })),
    ]])),
    [drawn, sharedDrawn, cells, today, folderModes, subOccs],
  );
  // Same modes the grid draws through, so the key can only name things the
  // window actually holds.
  const legend = useMemo(() => monthLegend(drawn, cells, today, folderModes, showDone), [drawn, cells, today, folderModes, showDone]);
  const sharedLegend = useMemo(() => monthLegend(sharedDrawn, cells, today, folderModes, showDone), [sharedDrawn, cells, today, folderModes, showDone]);
  const items = useMemo(() => dayItems(drawn, day, today, folderModes), [drawn, day, today, folderModes]);
  // The suite drops a group whose every item is filtered out, so a day of
  // finished reminders wears no stray heading until Completed is switched on.
  // …|| grace.held: Sean's two seconds. A row that has just gone done stays
  // on the day panel long enough to untick a mis-tap.
  const grace = useTickGrace();
  const shTick = useSharedTick();
  const myReminders = useMemo(
    () =>
      items.reminders.filter(({ rec: r, late }) => {
        if (!r.payload.done) return true;
        // Held by the tick grace: it stays for its two seconds wherever it
        // is, so the tap can be taken back. This is why core collects a late
        // row whether or not it is done — a filter cannot hold a row that is
        // not in the list.
        if (grace.held(r.id)) return true;
        // Completed, and Completed is on. Show it on the day it BELONGS to,
        // never on today merely because it is late (Sean, 2026-08-20: "show
        // completed only shows completed reminders from the day being
        // selected"). A finished reminder has nothing left to be late for,
        // and rolling it forward put every past completion on today.
        return showDone && !late;
      }),
    [items, showDone, grace.version],
  );
  // shTick.version for the same reason as grace.version above: a memo filtered
  // by a held row has to recompute when the hold starts and when it ends.
  const theirReminders = useMemo(
    () => sharedItems.reminders.filter(({ rec: r }) => shTick.shows(r)),
    [sharedItems, shTick.version],
  );
  /**
   * The groups the day panel can draw, so collapse-all knows what "all" is.
   * Only the ones actually on screen count — a key for a group that is not
   * drawn would make the arrow claim everything is folded while something
   * visible is still open.
   */
  const groupKeys = useMemo(() => {
    const keys: string[] = [];
    if (items.events.length) keys.push('events');
    if (sharedItems.events.length) keys.push('events:@');
    if (myReminders.length) keys.push('reminders');
    if (theirReminders.length) keys.push('reminders:@');
    if (items.notes.length) keys.push('notes');
    if (sharedItems.notes.length) keys.push('notes:@');
    return keys;
  }, [items, sharedItems, myReminders, theirReminders]);
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => folded.has(k));
  const collapseAllGroups = () => {
    const next = allCollapsed ? new Set<string>() : new Set(groupKeys);
    setFolded(next);
    AsyncStorage.setItem('calmind.calFold', JSON.stringify([...next])).catch(() => {});
  };

  const calById = useMemo(() => new Map(recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [recs]);

  /**
   * The LIST view: every day from today out three months that has anything on
   * it (Sean, 2026-08-20). Shaped like the widget's feed — events, reminders
   * and notes under a day heading — but filtered by the picker, so switching a
   * calendar off empties it here exactly as it empties the grid.
   *
   * dayItems per day rather than one pass over the records, because BELONGING
   * to a day is not a property of a record: a repeat lands on many days, a
   * rider lands on today, and an overdue reminder is collected onto today
   * while still being due last week. That logic lives in core and asking it
   * ninety-two times is cheaper than keeping a second copy of it here that
   * could disagree.
   *
   * Only computed in list view: it is ninety-two passes over the whole record
   * set, and the month grid has no use for it.
   */
  const LIST_DAYS = 92;
  const agenda = useMemo(() => {
    if (calView !== 'list') return [];
    const out: { date: string; items: ReturnType<typeof dayItems> }[] = [];
    for (let i = 0; i < LIST_DAYS; i++) {
      const d = addDays(today, i);
      const it = dayItems(drawn, d, today, folderModes);
      const shown = it.reminders.filter(({ rec: r, late }) => !r.payload.done || (showDone && !late));
      if (it.events.length + shown.length + it.notes.length > 0) {
        out.push({ date: d, items: { ...it, reminders: shown } });
      }
    }
    return out;
  }, [calView, drawn, today, folderModes, showDone]);

  const page = (dir: -1 | 1) => {
    // The arrows and a sideways swipe do the same thing: a week in week
    // mode (crossing into the neighbour month's row), a month otherwise.
    if (weekMode) {
      const next = addDays(wkAnchor, dir * 7);
      setWkAnchor(next);
      setYm(next.slice(0, 7));
      return;
    }
    const m0 = month - 1 + dir;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, '0')}`);
  };


  // Swipes on the grid: up folds to a week, down opens the month back up,
  // a firm sideways one pages. Taking the responder past 10px of travel is
  // also what keeps a swipe from selecting the cell it ends on — a day is
  // selected by a tap and nothing else.
  // ONE config, TWO responders. Sean, 2026-08-11: the up/down swipe should be
  // draggable from the legend as well as the grid — "just the gesture, don't
  // change the behavior", so both are built from this same object and cannot
  // drift into different thresholds.
  //
  // Two responders rather than the same handler object on two views, which
  // was tried first and behaved by POSITION: a drag begun on the legend's
  // empty right-hand margin worked and one begun over the chips did nothing,
  // reproducibly. A responder instance belongs to the view it is attached to;
  // sharing one between siblings leaves them negotiating for it.
  const swipeConfig = {
    // Capture phase: an ancestor can't reliably wrestle the responder off
    // a pressed cell on web, so the view claims the gesture itself once
    // there's real travel — which is also what keeps a swipe from
    // selecting the cell it ends on.
    onMoveShouldSetPanResponderCapture: (_e: unknown, g: { dx: number; dy: number }) =>
      Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
    // No onPanResponderTerminationRequest here, deliberately: the three
    // hooks that need one (rowdrag, sectiondrag, swiperow) live INSIDE a
    // ScrollView, which asks for the responder the moment a gesture travels
    // and silently ends the gesture when it gets it. These sit straight on
    // the page with no scrolling ancestor, so nothing is there to ask.
    onPanResponderRelease: (_e: unknown, g: { dx: number; dy: number }) => {
      const { dx, dy } = g;
      if (Math.abs(dy) > 40 && Math.abs(dy) > 1.5 * Math.abs(dx)) stepViewRef.current(dy < 0);
      else if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) pageRef.current(dx < 0 ? 1 : -1);
    },
  };
  const gridPan = useRef(PanResponder.create(swipeConfig)).current;
  const legendPan = useRef(PanResponder.create(swipeConfig)).current;
  const stepViewRef = useRef(stepView);
  stepViewRef.current = stepView;
  const pageRef = useRef(page);
  pageRef.current = page;

  // Left/right arrows page the calendar, which is the suite's behaviour and
  // was the only one of its four keyboard bindings missing here (the other
  // three are Enter and Escape, which this app already has). It matters more
  // than it looks: the macOS desktop shell is this same web build, and there
  // the keyboard is the obvious way to move.
  //
  // The suite's two guards, kept exactly: not while a modal is open, and not
  // while a field has focus.
  //
  // `aria-modal` is what react-native-web puts on an open Modal; checked in a
  // browser rather than assumed, because the whole guard rests on it.
  //
  // THE FIELD GUARD CANNOT FIRE TODAY and is kept anyway. This screen has no
  // TextInput of its own — everything you can type into is inside a modal, so
  // the check above has already returned by the time focus could matter. It
  // stays because it is the guard that stops arrowing through text from
  // sliding the month behind it, and the day this screen gains an inline add
  // row (Reminders and Notes both have one) it becomes the only thing
  // standing between the two. Deliberately not given a test: nothing on this
  // screen can reach it, and a test that opened a modal to "exercise" it
  // would be pinning the modal guard while claiming to pin this one.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
      ev.preventDefault();
      pageRef.current(ev.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The suite's two-step: a long-press or double-tap only turns edit mode
  // on, revealing each own row's icon cluster; tap away or Escape leaves.
  const [panelEdit, setPanelEdit] = useState(false);
  const lastRowTap = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const rowPress = (id: string) => {
    const now = Date.now();
    if (lastRowTap.current.id === id && now - lastRowTap.current.at < 300) setPanelEdit(true);
    lastRowTap.current = { id, at: now };
  };
  useEffect(() => {
    if (!panelEdit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setPanelEdit(false); };
    document.addEventListener('keydown', onKey, true);
    // The suite's rule, the same one Reminders and Notes use: a tap leaves
    // edit mode unless it lands on the thing you are editing or an edit
    // control.
    //
    // This screen was the worst of the three. Reminders and Notes at least had
    // a Pressable at the bottom of the scroll content; here setPanelEdit(false)
    // appeared exactly ONCE in the whole file, in the Escape handler above. On
    // a phone there was no way out of the day panel's edit mode at all.
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
      '[data-testid^="dp-"]', '[data-testid^="day-"]', '[data-testid="cal-grid"]',
      '[data-testid="cal-completed"]', '[data-testid="cal-edit-done"]',
      '[data-testid="cal-prev"]', '[data-testid="cal-next"]',
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
      setPanelEdit(false);
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [panelEdit]);
  const [rolledId, setRolledId] = useState<string | null>(null);
  const rollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tick = (r: Rec<'reminder'>) => {
    const next = reminderToggle(r.payload, todayStr());
    mutate((e) => e.put({ ...r, payload: next }));
    if (next.done) grace.hold(r.id);
    else grace.release(r.id);
    if (r.payload.repeat && !r.payload.done) {
      setRolledId(r.id);
      clearTimeout(rollTimer.current);
      rollTimer.current = setTimeout(() => setRolledId(null), 2200);
    }
  };

  const cellMark = (d: string) => {
    // The suite's cell rule: a reminder icon only greys out once every one
    // of its colour is ticked — and then it HIDES unless Completed is shown.
    const all = (marks.get(d) ?? []).filter((m) => showDone || m.state !== 'done');
    const shown = all.length > 6 ? all.slice(0, 5) : all;
    return (
      <View testID="cal-mark-well" style={s.markWell}>
        {shown.map((m, i) => {
          if (m.kind === 'event') return <CalGlyph key={i} color={m.color} />;
          if (m.kind === 'note') return <PageGlyph key={i} color={m.color} />;
          // One colour, one source: the folder's, as set in the manage menu.
          // The suite paints every reminder icon in its folder's colour
          // inline — an overdue one included; the `overdue` class it adds
          // changes no colour. Swapping overdue for the theme's orange broke
          // the chain Sean asked for: the manage-menu colour, the legend chip
          // and the date's own mark all have to be the same colour.
          //
          // A FINISHED one used to grey to T.muted — the suite's rule — and
          // Sean replaced it (2026-08-18): "finished items should be a
          // lighter/grayer version of their previous color". Same hue, faded.
          const color = m.state === 'done' ? m.color + '77' : m.color;
          return <TickBoxGlyph key={i} color={color} done={m.state === 'done'} />;
        })}
        {all.length > 6 && <Text style={s.markMore}>+</Text>}
      </View>
    );
  };

  const dueLabel = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  /**
   * "Thursday, Aug 13" — the month ABBREVIATED, on Sean's word (2026-08-13):
   * "use 3 chars for month name in the calendar view like 'Aug' instead of
   * 'August' so the text isn't jumping around when i select days".
   *
   * `month: 'short'` rather than a hand-rolled `slice(0, 3)`, so a locale that
   * abbreviates differently still gets its own abbreviation — the rest of this
   * screen already reads dates through toLocaleDateString and would disagree
   * with a home-made list.
   */
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <View style={s.page}>
      {/* The picker does not come and go with the view. Dropping it in week
          mode took the folder dropdown away AND shifted everything left of it
          — two complaints from one line. */}
      {/* Measured across all four tabs: the bar's geometry is already
          identical everywhere — back at x16, picker at x184, everything
          centred on the same line. The ONLY difference was that Calendar had
          no collapse-all, leaving a 140pt gap where the others have one. Its
          day panel has foldable groups, so it gets the same control in the
          same place rather than the bar having a hole on one tab. */}
      <TopBar
        title="Calendar"
        controls={<CollapseAllBtn open={!allCollapsed} onPress={collapseAllGroups} />}
        copyMarkdown={() => viewMarkdown(dayLabel, [
          { name: 'Events', lines: items.events.map((e) => ({ text: e.payload.text, chip: e.payload.time ? timeRangeLabel(e.payload.time, e.payload.end, clock24) : null })) },
          { name: 'Reminders', lines: myReminders.map(({ rec: r }) => ({ text: r.payload.text, chip: r.payload.time ? timeLabel(r.payload.time, clock24) : null })) },
          { name: sharedPartner ? `Shared — ${sharedPartner}` : 'Shared', lines: theirReminders.map(({ rec: r }) => ({ text: r.payload.text, chip: r.payload.time ? timeLabel(r.payload.time, clock24) : null })) },
        ])}
        completed={<CircleBtn testID="cal-completed" glyph="☑" label="Completed" size={TOPBAR_CTRL} active={showDone} onPress={() => setShowDone(!showDone)} />}
        picker={<CalendarPick />}
      />
      {/* The date centred over the grid; ◉ jumps home to today. */}
      <View style={s.pagerRow}>
        <CircleBtn testID="cal-prev" glyph="‹" label="Previous" size={32} onPress={() => page(-1)} />
        <Pressable onPress={() => { setYm(today.slice(0, 7)); setDay(today); setWkAnchor(today); }} hitSlop={6}>
          {/* Abbreviated too, and this is the one that actually moves: the
              label is CENTRED between the two arrows, so "May 2026" and
              "September 2026" centre at different widths and the whole header
              shifts as you page. The day title below is left-aligned and grows
              rightward instead. Both are shortened so the screen agrees with
              itself about how a month is written. */}
          <Text testID="cal-ym" style={s.ymLabel}>{new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        <CircleBtn testID="cal-next" glyph="›" label="Next" size={32} onPress={() => page(1)} />
      </View>

      {calView === 'list' ? (
        /* THE LIST. It replaces the grid, the legend and the day panel
           together — a swipe down brings them all back. The pan handlers ride
           on the header wrapper so the gesture still works here; the rows
           themselves scroll. */
        <View testID="cal-list" style={s.listWrap} {...gridPan.panHandlers}>
          <Scroll contentContainerStyle={s.listInner}>
            {agenda.length === 0 && (
              <Text testID="cal-list-empty" style={s.listEmpty}>Nothing in the next three months</Text>
            )}
            {agenda.map(({ date: d, items: it }) => (
              <View key={d} testID="cal-list-day" style={s.listDay}>
                {/* The heading selects that day and folds back to the month,
                    so the list is a way IN rather than a dead end. */}
                <Pressable
                  testID="cal-list-head"
                  onPress={() => { setDay(d); setCalView('month'); }}
                  style={s.listHead}
                >
                  <Text style={[s.listHeadText, d === today && s.listHeadToday]}>
                    {dayHeading(d, today)}
                  </Text>
                </Pressable>
                {it.events.map((e) => (
                  <View key={e.id} style={s.listRow}>
                    <View style={[s.dot, s.rowDot, { backgroundColor: calById.get(e.payload.calendarId)?.color ?? T.folderBlue }]} />
                    <Text numberOfLines={1} style={s.rowText}>{e.payload.text}</Text>
                    {e.payload.time && <Text style={s.chip}>{timeRangeLabel(e.payload.time, e.payload.end, clock24)}</Text>}
                  </View>
                ))}
                {it.reminders.map(({ rec: r, overdue }) => (
                  <View key={r.id} style={s.listRow}>
                    <TickBoxGlyph size={14} color={overdue ? T.overdue : T.dim} />
                    <Text numberOfLines={1} style={[s.rowText, r.payload.done && s.rowDone]}>{r.payload.text}</Text>
                    {r.payload.time && <Text style={s.chip}>{timeLabel(r.payload.time, clock24)}</Text>}
                  </View>
                ))}
                {it.notes.map((n) => (
                  <View key={n.id} style={s.listRow}>
                    <Text style={[s.markGlyph, { color: T.dim }]}>▤</Text>
                    <Text numberOfLines={1} style={s.rowText}>{n.payload.title}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Scroll>
        </View>
      ) : (
      <>
      <View testID="cal-grid" style={s.grid} {...gridPan.panHandlers}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={s.weekday}>{w}</Text>
        ))}
        {cells.map((d) => (
          <Pressable key={d} testID="cal-cell" onPress={() => setDay(d)} style={s.cell}>
            <View style={[s.cellInner, d === day && s.cellPicked]}>
              {/* Today's number sits in a real View circle, flex-centred.
                  It used to be the Text drawing its own circle with
                  lineHeight = height, which centres exactly on the web and
                  rides visibly high on iOS — the number was not centred in
                  the circle of the day (Sean, 2026-08-18). Flexbox centres
                  identically on both.

                  BOTH variants sit in one fixed-height slot. A bare Text's
                  box is its font's natural line (~16px) while the circle is
                  18, so today's mark well started 2px lower than every other
                  cell's and the whole column read as pushed down — Sean,
                  2026-08-19: the top-of-square-to-icons space should be the
                  same in every cell. The slot is the circle's height, so the
                  circle defines the rhythm and the plain numbers centre on
                  its midline; e2e/cellrhythm.spec.ts measures the real boxes. */}
              <View style={s.numSlot}>
                {d === today ? (
                  <View style={s.todayWrap}>
                    <Text style={s.cellTodayNum}>{Number(d.slice(8))}</Text>
                  </View>
                ) : (
                  <Text style={[s.cellNum, !d.startsWith(ym) && !weekMode && s.cellNumOther]}>{Number(d.slice(8))}</Text>
                )}
              </View>
              {cellMark(d)}
            </View>
          </Pressable>
        ))}
      </View>
      <Rule />
      {/* The legend was a ScrollView capped at 22vh, mirroring the suite —
          until Sean said a legend should not scroll. It sizes to its content
          now; monthLegend already keeps it to what is visibly on the calendar,
          which is what keeps 'to its content' small. (It was also once gated
          off in week mode — `cells` is already the two-week range, so the
          names were right all along and simply not drawn.) */}
      {(legend.length > 0 || sharedLegend.length > 0) && (
        // The SAME pan responder as the grid, so an up/down swipe can start on
        // the legend as well. Sean, 2026-08-11: "just the gesture, don't
        // change the behavior" — so this is the identical handler object, not
        // a second one with its own thresholds that could drift. The legend
        // sits BESIDE the grid rather than inside it, which is the whole
        // reason a swipe begun down here did nothing.
        //
        // Attaching one PanResponder to two views is safe: only one view can
        // be the responder at a time, and the claim still needs the same 10px
        // of travel, so tapping a legend chip is unaffected.
        // pointerEvents none, because the legend is entirely LABELS — no
        // Pressable, no onPress anywhere in it. Without this a swipe that
        // began on a chip died there: the chips are views like any other and
        // took the touch, so the gesture reached the responder from the
        // legend's empty margins and nowhere else. Measured, not guessed: a
        // drag from the far right worked and one from the middle, where the
        // chips are, did nothing. Passing them through costs nothing that was
        // ever used.
        <View testID="cal-legend" style={[s.legend, s.legendInner]} {...legendPan.panHandlers}>
          {/* One row per owner, the owner named ONCE in small caps — the
              suite's legend, not a soup of @-prefixed items.

              The owner label sits in a GUTTER beside the chips rather than
              inside the balanced row with them. It used to ride along as the
              first item, which meant line one began after the label and every
              wrapped line began under it: chips with no common left edge, and
              a ragged margin Sean could see straight away. The suite has the
              same two parts — `.cleg-who` is `flex: 0 0 auto` and the chips
              live in their own wrapping `.cleg-kind` box beside it
              (calendar/index.php:997-1003) — so this is its shape, not a new
              idea. It also leaves the balancer doing what it was written for:
              balancing chips, none of which is a label. */}
          {legend.length > 0 && (
            <View style={s.legendRow}>
              <Text style={s.legendOwner}>{(session?.username ?? 'me').toUpperCase()}</Text>
              <BalancedRow testID="legend-me" style={s.legendChips} gap={10} rowGap={4} groups={legend.map((l) => (l.kind === 'event' ? 0 : l.kind === 'reminder' ? 1 : 2))}>
              {legend.map((l) => (
                <View key={`${l.kind}:${l.id}`} style={s.legendItem}>
                  {l.kind === 'event' ? <CalGlyph color={l.color} size={14} /> : l.kind === 'reminder' ? <TickBoxGlyph color={l.color} size={14} /> : <PageGlyph color={l.color} size={14} />}
                  <Text style={s.legendText}>{l.name}</Text>
                </View>
              ))}
              </BalancedRow>
            </View>
          )}
          {sharedLegend.length > 0 && (
            <View style={s.legendRow}>
              <Text style={s.legendOwner}>{(sharedPartnerLabel ?? '').toUpperCase()}</Text>
              <BalancedRow testID="legend-partner" style={s.legendChips} gap={10} rowGap={4} groups={sharedLegend.map((l) => (l.kind === 'event' ? 0 : l.kind === 'reminder' ? 1 : 2))}>
              {sharedLegend.map((l) => (
                <View key={`sh:${l.kind}:${l.id}`} style={s.legendItem}>
                  {l.kind === 'event' ? <CalGlyph color={l.color} size={14} /> : l.kind === 'reminder' ? <TickBoxGlyph color={l.color} size={14} /> : <PageGlyph color={l.color} size={14} />}
                  <Text style={s.legendText}>{l.name}</Text>
                </View>
              ))}
              </BalancedRow>
            </View>
          )}
        </View>
      )}
      {/* The legend's closing rule belongs to the legend. A month holding
          nothing shows no key at all, and two hairlines stacked on each
          other is what it looked like when this rule stayed behind. */}
      {/* Follows the legend exactly — ungating one and not the other left the
          legend drawing in week mode with no line under it. */}
      {(legend.length > 0 || sharedLegend.length > 0) && <Rule />}

      <Scroll style={s.panel} contentContainerStyle={s.panelWrap}>
        {/* The phone's tap-to-exit; the web keeps its document listener.
            EditExit carries the panel's layout (s.panelInner) so arming edit
            mode cannot move anything — see EditExit for the story. */}
        {/* Armed while a swipe-delete is parked too — the native half of the
            unpark rule; the web's lives in useSwipeLeft (Sean, 2026-08-20). */}
        <EditExit
          active={panelEdit || swipe.swiped !== null}
          onExit={() => { if (swipe.swiped !== null) swipe.clear(); else setPanelEdit(false); }}
          style={s.panelInner}
        >
        <View style={s.panelHead}>
          {/* Just the day now: the "+ Add" pill that sat beside it was "the
              additional add button" (Sean, 2026-08-20) — the Add tab, which
              defaults to this selected day, is the one way to add. */}
          <Text testID="cal-day-title" style={s.panelTitle}>{dayLabel}</Text>
        </View>
        {items.events.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('events')}>
            <Chevron open={!folded.has('events')} />
            <Text style={s.groupTitle}>Events</Text>
          </Pressable>
        )}
        {!folded.has('events') && items.events.map((e) => (
          <View key={e.id} {...swipe.handlersFor(e.id)} style={[s.row, s.rowNoSelect]}>
            <View style={[s.dot, s.rowDot, { backgroundColor: calById.get(e.payload.calendarId)?.color ?? T.folderBlue }]} />
            <Pressable testID="dp-ev-body" style={s.rowBodyFlex} onPress={() => rowPress(e.id)} onLongPress={() => setPanelEdit(true)} delayLongPress={350}>
              {/* One line, elided — the last row kind still wrapping after
                  reminders (2026-08-20) and note titles took the same rule. */}
              <Text numberOfLines={1} style={s.rowText}>{e.payload.text}</Text>
            </Pressable>
            {e.payload.time && <Text style={s.chip}>{timeRangeLabel(e.payload.time, e.payload.end, clock24)}</Text>}
            {panelEdit ? (
              <View style={s.editCluster}>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'event', rec: e })} />
                {/* Copy, as the reminder rows have (Sean, 2026-08-20). Core's
                    eventLine — the words, the date, and the time RANGE. */}
                <CircleBtn testID="dp-ev-copy" glyph="clipboard" label="Copy" size={24} onPress={() => {
                  Clipboard.setStringAsync(eventLine(e.payload, today))
                    .then(() => toast('Copied'))
                    .catch(() => toast('Could not copy'));
                }} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, e.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
                <ConfirmDelete onDelete={() => { swipe.clear(); mutate((en) => en.del(e.id)); }} />
              </View>
            ) : swipe.swiped === e.id ? (
              <View style={s.swipePark}>
                <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((en) => en.del(e.id)); }} />
              </View>
            ) : null}
          </View>
        ))}
        {sharedItems.events.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('events:@')}>
            <Chevron open={!folded.has('events:@')} />
            <Text style={[s.groupTitle, s.groupTitleShared]}>{sharedPartnerLabel}'s events</Text>
          </Pressable>
        )}
        {!folded.has('events:@') && sharedItems.events.map((e) => (
          <View key={`sh${e.id}`} style={s.row}>
            <View style={[s.dot, s.rowDot, { backgroundColor: sharedCalById.get(e.payload.calendarId)?.color ?? T.folderBlue }]} />
            <Text numberOfLines={1} style={s.rowText}>{e.payload.text}</Text>
            {e.payload.time && <Text style={s.chip}>{timeRangeLabel(e.payload.time, e.payload.end, clock24)}</Text>}
          </View>
        ))}
        {subDay.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('events:sub')}>
            <Chevron open={!folded.has('events:sub')} />
            <Text style={s.groupTitle}>Subscribed</Text>
          </Pressable>
        )}
        {!folded.has('events:sub') && subDay.map((o, i) => (
          <View key={`sub${o.subId}-${o.occ.uid}-${i}`} style={s.row} testID="dp-sub-row">
            <View style={[s.dot, s.rowDot, { backgroundColor: o.color }]} />
            {/* No press, no edit cluster, no swipe: read-only is the DESIGN
                (Sean: "i just want read only access"), not a gap. */}
            <Text numberOfLines={1} style={s.rowText}>{o.occ.title}</Text>
            {o.occ.time && <Text style={s.chip}>{timeRangeLabel(o.occ.time, o.occ.endTime, clock24)}</Text>}
          </View>
        ))}
        {myReminders.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('reminders')}>
            <Chevron open={!folded.has('reminders')} />
            <Text style={s.groupTitle}>Reminders</Text>
          </Pressable>
        )}
        {!folded.has('reminders') && myReminders.map(({ rec: r, overdue, rider }) => (
          <View key={r.id} {...swipe.handlersFor(r.id)} style={[s.row, s.rowNoSelect, rolledId === r.id && s.rowRolled]}>
            <Pressable testID="day-tick" onPress={() => tick(r)} hitSlop={8} style={[s.tickBox, r.payload.done && s.tickDone, overdue && s.tickOverdue]}>
              <WebHitSlop />
              {r.payload.done && <Text style={s.tickMark}>✓</Text>}
            </Pressable>
            {/* testID for the no-shift spec: this is the flex child the edit
                cluster used to squeeze, so its width is the measurement that
                tells the two arrangements apart. */}
            <Pressable testID="dp-rem-body" style={s.rowBodyFlex} onPress={() => rowPress(r.id)} onLongPress={() => setPanelEdit(true)} delayLongPress={350}>
              {/* Done keeps the folder's hue, faded — Sean's word over the
                  suite's grey, 2026-08-18. The strike still says finished.
                  One line, elided (2026-08-20) — same rule as the Reminders
                  list, and this is the narrower row of the two. */}
              <Text numberOfLines={1} style={[s.rowText, r.payload.done && s.rowDone, r.payload.done && { color: (folderColor.get(r.payload.folderId) ?? T.muted) + '77' }]}>{r.payload.text}</Text>
            </Pressable>
            {overdue && <Text style={[s.chip, { color: T.overdue }]}>{dueLabel(r.payload.due!)}</Text>}
            {/* The ride-along folder's reminders sit under TODAY every day
                until they are ticked. The chip used to say "every day", which
                describes the rule rather than the row: the row is here, on
                this day, and "today" is what it is doing. Sean's wording. */}
            {rider && <Text testID="rider-chip" style={s.chip}>today</Text>}
            {r.payload.time && <Text style={s.chip}>{timeLabel(r.payload.time, clock24)}</Text>}
            {panelEdit && (
              <View style={s.editCluster}>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'reminder', rec: r })} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, r.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
                <ConfirmDelete onDelete={() => mutate((en) => en.del(r.id))} />
              </View>
            )}
            {swipe.swiped === r.id && (
              <View style={s.swipePark}>
                <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((en) => en.del(r.id)); }} />
              </View>
            )}
          </View>
        ))}
        {theirReminders.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('reminders:@')}>
            <Chevron open={!folded.has('reminders:@')} />
            <Text style={[s.groupTitle, s.groupTitleShared]}>{sharedPartnerLabel}'s reminders</Text>
          </Pressable>
        )}
        {!folded.has('reminders:@') && theirReminders.map(({ rec: r, overdue }) => (
          <View key={`sh${r.id}`} style={s.row}>
            <Pressable
              testID="shared-day-tick"
              onPress={() => shTick.tick(r)}
              hitSlop={8}
              style={[s.tickBox, overdue && s.tickOverdue, shTick.done(r) && s.tickDone]}
            >
              {shTick.done(r) && <Text style={s.tickMark}>✓</Text>}
            </Pressable>
            <Text numberOfLines={1} style={s.rowText}>{r.payload.text}</Text>
            {overdue && <Text style={[s.chip, { color: T.overdue }]}>{dueLabel(r.payload.due!)}</Text>}
            {r.payload.time && <Text style={s.chip}>{timeLabel(r.payload.time, clock24)}</Text>}
          </View>
        ))}
        {items.notes.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('notes')}>
            <Chevron open={!folded.has('notes')} />
            <Text style={s.groupTitle}>Notes</Text>
          </Pressable>
        )}
        {!folded.has('notes') && items.notes.map((n) => (
          <View key={n.id} {...swipe.handlersFor(n.id)} style={[s.row, s.rowNoSelect]}>
            <Text style={[s.markGlyph, { color: T.dim }]}>▤</Text>
            {/* Sean: tapping a note here goes straight into EDITING it, not
                to a read view and not to the notes list. A note on a day is
                something you opened the calendar to work on. The double-tap
                still arms the panel's edit mode for the row controls. */}
            <Pressable
              testID="dp-note-row"
              style={s.rowBodyFlex}
              onPress={() => { rowPress(n.id); onNoteCreated?.(n.id); }}
              onLongPress={() => setPanelEdit(true)}
              delayLongPress={350}
            >
              {/* One line, elided — Sean, 2026-08-20: "note titles should
                  elide". The Notes list has done this since it was written
                  (rowTitle carries numberOfLines there); the day panel drew
                  the same title in a narrower row and wrapped it. */}
              <Text numberOfLines={1} style={s.rowText}>{n.payload.title}</Text>
            </Pressable>
            {panelEdit && (
              <View style={s.editCluster}>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'note', rec: n })} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, n.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
                <ConfirmDelete onDelete={() => mutate((en) => en.del(n.id))} />
              </View>
            )}
            {swipe.swiped === n.id && (
              <View style={s.swipePark}>
                <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((en) => en.del(n.id)); }} />
              </View>
            )}
          </View>
        ))}
        {sharedItems.notes.length > 0 && (
          <Pressable testID="dp-group-head" style={s.groupHead} onPress={() => toggleFold('notes:@')}>
            <Chevron open={!folded.has('notes:@')} />
            <Text style={[s.groupTitle, s.groupTitleShared]}>{sharedPartnerLabel}'s notes</Text>
          </Pressable>
        )}
        {!folded.has('notes:@') && sharedItems.notes.map((n) => (
          <View key={`sh${n.id}`} style={s.row}>
            <Text style={[s.markGlyph, { color: T.dim }]}>▤</Text>
            <Text numberOfLines={1} style={s.rowText}>{n.payload.title}</Text>
          </View>
        ))}
        {items.events.length + items.reminders.length + items.notes.length +
          sharedItems.events.length + sharedItems.reminders.length + sharedItems.notes.length === 0 && (
          <Text style={s.empty}>Nothing on this day</Text>
        )}
        </EditExit>
      </Scroll>
      </>
      )}
      {modal && <ItemModal mode="edit" kind={modal.kind} rec={modal.rec} onClose={() => setModal(null)} onSaved={(id, kind) => kind === 'note' && onNoteCreated?.(id)} />}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  // The list view, which stands in for the grid, the legend and the day panel
  // at once. flex 1 so it takes the height all three of them had.
  listWrap: { flex: 1 },
  listInner: { paddingHorizontal: 16, paddingBottom: 48, gap: 14 },
  listDay: { gap: 2 },
  // The widget's heading, and its weight: small, spaced and ruled off, so a
  // day reads as a section rather than as the first row in it.
  listHead: { paddingTop: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: T.lineSoft },
  listHeadText: { color: T.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  listHeadToday: { color: T.accent },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3, paddingLeft: 8 },
  listEmpty: { color: T.muted, fontSize: 15, paddingVertical: 24, textAlign: 'center' },
  // 8pt below the divider on every tab. Measured before touching it: 6 on
  // Reminders, 9 on Habits, 11 on Calendar, 16 on Notes. Sean named Habits as
  // closest and a hair tall, so 8 is the target and every screen is tuned to
  // land there rather than to carry the same number in its own style.
  // paddingTop 0 — the gap below the divider is TopBar's now (chrome.tsx).
  // This screen was the tightest of the five, at 1px.
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 0, paddingBottom: 4 },
  ymLabel: { color: T.text, fontSize: 15, fontWeight: '600', minWidth: 150, textAlign: 'center' },
  // userSelect none: a swipe across the cell numbers must never start a
  // text selection — on web a selection TERMINATES the pan mid-gesture.
  grid: { userSelect: 'none', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 6 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  cell: { width: `${100 / 7}%` },
  // paddingTop 2, down from 3 — "the dates themselves along with the circle
  // for the current day needs to be bumped up slightly" (Sean, 2026-08-19).
  cellInner: { margin: 1.5, minHeight: 46, alignItems: 'center', paddingTop: 2, paddingBottom: 2, borderRadius: 8 },
  cellPicked: { backgroundColor: T.surface2 },
  // The one date slot every cell shares: the circle's own height, so the
  // number-to-icons rhythm cannot differ between today and its neighbours.
  numSlot: { height: 18, alignItems: 'center', justifyContent: 'center' },
  cellNumOther: { color: T.muted, opacity: 0.55 },
  cellNum: { color: T.text, fontSize: 13 },
  todayWrap: { backgroundColor: T.accent, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellTodayNum: { color: T.accentInk, fontSize: 13, fontWeight: '700' },
  // The suite's FIXED two-row well: 11px glyphs, three to a row, the height
  // nailed to two rows (11 + 1.5 + 11) so every cell stands the same height
  // however busy its day. alignContent centres one row inside the two.
  // The suite's FIXED two-row well (.cell .dots: height 23px, three to a row,
  // align-content flex-start), so every cell stands the same height however
  // busy its day AND a quiet day's icons sit on the same line as everyone
  // else's first row — centring them would float a single row out of step
  // with the rest of the grid. 11px glyphs at a 1.5 gap make the same 36px
  // row the suite's 10px-at-3 does.
  markWell: { flexDirection: 'row', flexWrap: 'wrap', gap: 1.5, marginTop: 1, alignItems: 'center', alignContent: 'flex-start', justifyContent: 'center', maxWidth: 40, height: 23.5 },
  markMore: { color: T.dim, fontSize: 10, lineHeight: 11 },
  // maxHeight is set inline from the window height — 22vh, as the suite has it.
  // userSelect none: dragging from a legend chip started a browser TEXT
  // SELECTION instead of the swipe, so the gesture worked from the legend's
  // empty margins and died over the words — reproducibly, and identically
  // across three different responder arrangements before the cause was found.
  // The legend is labels nobody selects; the calendar's own cells already
  // avoid this by being pressables rather than loose text.
  legend: {
    userSelect: 'none', flexGrow: 0 },
  legendInner: { paddingHorizontal: 16, paddingVertical: 6 },
  legendRowLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4, paddingVertical: 2 },
  // The label's own line-height is set so it sits on the chips' first line
  // rather than riding high above them; paddingTop nudges it onto the same
  // optical baseline as a 14px glyph.
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  legendOwner: { color: T.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, lineHeight: 20, paddingTop: 1 },
  legendChips: { flex: 1, minWidth: 0 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20 },
  legendShared: { color: T.muted },
  legendText: { color: T.text, fontSize: 13 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  groupTitleShared: { color: T.muted },
  groupTitle: { color: T.gold, fontSize: 13, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
  markGlyph: { fontSize: 10, color: T.dim },
  panel: { flex: 1 },
  // flexGrow: the day panel's EditExit is flexGrow: 1 inside this, and needs
  // height to grow into or the tap-out stops at the last row. Same fix as
  // Habits, same day.
  /**
   * paddingTop 10, not 16 — Sean, 2026-08-13: "there shouldn't be so much
   * space between the legend and the top of the add button".
   *
   * 10 is not a fresh guess. It is the number he chose for the gap BELOW a
   * divider when the top bar's was settled ("habits looks almost correct, i'd
   * go with 10px", chrome.tsx's ruleWrap), and the rule under the legend is the
   * same kind of line doing the same job. The other three sides stay at 16.
   *
   * flexGrow: the day panel's EditExit is flexGrow: 1 inside this, and needs
   * height to grow into or the tap-out stops at the last row. Same fix as
   * Habits, same day.
   *
   * panelInner lives on EDITEXIT now, not the scroll container: the wrapper
   * must render identically in and out of edit mode, and owning the padding
   * is what lets a gutter tap exit on the phone. panelWrap is the container's.
   */
  panelWrap: { flexGrow: 1 },
  panelInner: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 16, gap: 8, flexGrow: 1 },
  /**
   * CENTRE, and it is centre because Sean looked at the alternative.
   *
   * He asked for aligned TOPS on 2026-08-13 — "top of date and add button
   * should be aligned" — and that shipped as `flex-start`, which does exactly
   * what it says: the date's line box starts on the same pixel as the button's
   * box. Seeing it built: "looks terrible.. make the add button the same height
   * and center aligned vertically with the section".
   *
   * Written down rather than quietly reverted, because the aligned-tops version
   * was not a misreading of the ask — it was the ask, and it lost to how it
   * looked. A future reader tempted by flex-start here should know it has been
   * tried and rejected on sight, not merely never considered.
   *
   * The button's HEIGHT is a separate axis and went back and forth once more
   * after this; see Pill's `compact` for that story. Short and centred is where
   * it landed.
   */
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: T.gold, fontSize: 15, fontWeight: '700' },
  // paddingLeft 14: the rows sit slightly INSIDE their group heads ("things
  // under sections in the calendar app should be slightly indented, not the
  // same level" — Sean, 2026-08-20). The heads stay flush with the panel.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingLeft: 14 },
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  rowRolled: { backgroundColor: T.accentSoft, borderRadius: 8 },
  /**
   * The edit controls, pinned to the row's right edge and OUT of the flex flow.
   *
   * Sean, 2026-08-12: "things jump on the calendar entering edit mode". They
   * did, twice over, and as ordinary flex children they could not not:
   *
   *   - SIDEWAYS. Three 24pt controls plus two 10pt gaps entered the row, and
   *     rowBodyFlex is `flex: 1`, so the body gave up 92pt and every chip to
   *     its right — the time, the `today` rider, an overdue date — slid left by
   *     that much.
   *   - DOWNWARD. The tallest thing in a row was the 22pt tick; a 24pt control
   *     made the row 2pt taller, so every row BELOW it moved down, and the
   *     panel with it.
   *
   * This is the same fix as Reminders' cluster and Habits' floating icons, for
   * the same reason each of them gives: an absolutely positioned cluster over
   * an opaque background reflows nothing, and the text it covers is simply not
   * shown. T.bg is what the panel sits on, so the cover is invisible.
   */
  editCluster: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 10, backgroundColor: T.bg,
  },
  // The parked swipe-delete floats over the row's right edge exactly as the
  // edit cluster does, and for the same reason: as a flex child it squeezed
  // the body and every chip slid left the moment the × parked ("things shift
  // with slide to delete" — Sean, 2026-08-20).
  swipePark: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 10, backgroundColor: T.bg,
  },
  // STRETCH for the same reason as Notes' and Reminders' row bodies: this is
  // the Pressable that opens an item and long-presses into edit mode, and as a
  // centred flex child it was only as tall as its one line of text while the
  // row around it looked entirely tappable.
  //
  // The row's own paddingVertical is left where it is, unlike Reminders'. Not
  // every row in this panel has a body — a partner's reminder is a tick and
  // some text — so moving the padding inward would shorten those and leave the
  // day panel with two row heights. What remains dead is the 4pt above and
  // below, shared with the neighbouring row.
  rowBodyFlex: { flex: 1, alignSelf: 'stretch' },
  editBackdropFill: { minHeight: 120 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowDone: { color: T.muted, textDecorationLine: 'line-through' },
  chip: { color: T.dim, fontSize: 12 },
  // 16, down from 22 in two steps — "the circle for the reminder got too
  // big" (2026-08-19 build), then "is now huge" again (Sean, 2026-08-20).
  // The suite's day panel draws its check at 17px OUTER (.dp-check, a native
  // checkbox whose drawn glyph sits inside that box) against the 24px of the
  // main reminders list — the panel's rows are the SMALL scale. 16 drawn is
  // the suite's visual weight; the tap target keeps hitSlop 8 and the web
  // its WebHitSlop. daytick.spec.ts pins the size and the centring.
  tickBox: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: T.accentInk, borderColor: T.accent },
  tickOverdue: { borderColor: T.overdue },
  tickMark: { color: T.accent, fontSize: 9, fontWeight: '700' },
  empty: { color: T.muted, fontSize: 13, marginTop: 8 },
}));
