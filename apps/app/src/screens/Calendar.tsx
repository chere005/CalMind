/**
 * The Calendar: month grid over a day panel, the suite's split. Cells carry the
 * day's marks (event dots in calendar colors, the worst reminder state, a note
 * mark); the panel lists events → reminders → notes in the suite's order, ticks
 * roll repeats, and the add row files a reminder or event by kind. A day is
 * selected by a tap and nothing else.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { prefsOf, duplicateItem,
  timeLabel,
  addDays,
  cellMarks,
  dayItems,
  monthGridFilled,
  monthLegend,
  twoWeeksFrom,
  newId,
  ordBetween,
  parseWhenFromText,
  reminderToggle,
  todayStr,
  type Rec,
} from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { CalendarPick, useCalendarView } from '../components/CalendarPick';
import { CalGlyph, PageGlyph, TickBoxGlyph } from '../components/KindIcons';
import { ItemModal, type ItemKind } from '../components/ItemModal';
import { useSwipeLeft } from '../components/swiperow';
import { BalancedRow } from '../components/BalancedRow';
import { Chevron } from '../components/Chevron';
import { CircleBtn, ConfirmDelete, Pill, Rule, WebHitSlop } from '../ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The suite's remembered day (calDay): restored when you come back to the
// tab, reset by a fresh load — deliberate paging never rewrites it.
let calDay: string | null = null;

export function Calendar({ onNoteCreated }: { onNoteCreated?: (id: string) => void }) {
  const { recs, mutate, sharedRecs, sharedPartner, sharedPartnerLabel, sharedPut, session } = useStore();
  const { visible: visibleCals, calendars, visibleShared } = useCalendarView();
  const today = todayStr();
  const [ym, setYm] = useState((calDay ?? today).slice(0, 7));
  const [day, setDayState] = useState(calDay ?? today);
  const setDay = (d: string) => { calDay = d; setDayState(d); };
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.calFold').then((raw) => raw && setFolded(new Set(JSON.parse(raw))));
  }, []);
  const toggleFold = (kind: string) => {
    const next = new Set(folded);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setFolded(next);
    AsyncStorage.setItem('calmind.calFold', JSON.stringify([...next])).catch(() => {});
  };
  const [showDone, setShowDone] = useState(false);
  const swipe = useSwipeLeft();
  // Week mode sticks per device, like the suite's localStorage calWeekMode.
  // The suite caps its legend bar at 22vh and scrolls inside it. A flat 88pt
  // was under half that on a phone, which only shows once someone's folder
  // list is long enough to need the room.
  const { height: winH } = useWindowDimensions();
  const [weekMode, setWeekMode] = useState(false);
  const [wkAnchor, setWkAnchor] = useState(today);
  useEffect(() => {
    AsyncStorage.getItem('calmind.calWeekMode').then((raw) => raw === '1' && setWeekMode(true));
  }, []);
  const setWeek = (on: boolean) => {
    setWeekMode(on);
    // Fold onto the selected day when it's in the shown month, else onto the
    // shown month itself — folding must never yank the view somewhere else.
    if (on) setWkAnchor(day.startsWith(ym) ? day : `${ym}-01`);
    AsyncStorage.setItem('calmind.calWeekMode', on ? '1' : '').catch(() => {});
  };
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; kind: ItemKind; rec: Rec<'event'> | Rec<'reminder'> | Rec<'note'> }>(null);

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
  const sharedItems = useMemo(() => dayItems(sharedDrawn, day, today, folderModes), [sharedDrawn, day, today, folderModes]);
  const sharedCalById = useMemo(() => new Map(sharedRecs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [sharedRecs]);
  // The filled grid: every cell a real date, the neighbours' lightened.
  // Week mode is Sean's TWO-week fold: the anchor's week plus the next.
  const monthCells = useMemo(() => monthGridFilled(year, month), [year, month]);
  const cells = useMemo(() => (weekMode ? twoWeeksFrom(wkAnchor) : monthCells), [weekMode, wkAnchor, monthCells]);
  const marks = useMemo(
    () => new Map(cells.filter(Boolean).map((d) => [d!, [...cellMarks(drawn, d!, today, folderModes), ...cellMarks(sharedDrawn, d!, today, folderModes)]])),
    [drawn, sharedDrawn, cells, today, folderModes],
  );
  // Same modes the grid draws through, so the key can only name things the
  // window actually holds.
  const legend = useMemo(() => monthLegend(drawn, cells, today, folderModes, showDone), [drawn, cells, today, folderModes, showDone]);
  const sharedLegend = useMemo(() => monthLegend(sharedDrawn, cells, today, folderModes, showDone), [sharedDrawn, cells, today, folderModes, showDone]);
  const items = useMemo(() => dayItems(drawn, day, today, folderModes), [drawn, day, today, folderModes]);
  // The suite drops a group whose every item is filtered out, so a day of
  // finished reminders wears no stray heading until Completed is switched on.
  const myReminders = useMemo(() => items.reminders.filter(({ rec: r }) => showDone || !r.payload.done), [items, showDone]);
  const theirReminders = useMemo(() => sharedItems.reminders.filter(({ rec: r }) => !r.payload.done), [sharedItems]);
  const calById = useMemo(() => new Map(recs.filter((r): r is Rec<'calendar'> => r.type === 'calendar').map((c) => [c.id, c.payload])), [recs]);

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
  const gridPan = useRef(
    PanResponder.create({
      // Capture phase: an ancestor can't reliably wrestle the responder off
      // a pressed cell on web, so the grid claims the gesture itself once
      // there's real travel — which is also what keeps a swipe from
      // selecting the cell it ends on.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
      // No onPanResponderTerminationRequest here, deliberately: the three
      // hooks that need one (rowdrag, sectiondrag, swiperow) live INSIDE a
      // ScrollView, which asks for the responder the moment a gesture travels
      // and silently ends the gesture when it gets it. This grid sits straight
      // on the page with no scrolling ancestor, so nothing is there to ask.
      // Move it inside a ScrollView one day and it will need the refusal too.
      onPanResponderRelease: (_e, g) => {
        const { dx, dy } = g;
        if (Math.abs(dy) > 40 && Math.abs(dy) > 1.5 * Math.abs(dx)) setWeekRef.current(dy < 0);
        else if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) pageRef.current(dx < 0 ? 1 : -1);
      },
    }),
  ).current;
  const setWeekRef = useRef(setWeek);
  setWeekRef.current = setWeek;
  const pageRef = useRef(page);
  pageRef.current = page;

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
    return () => document.removeEventListener('keydown', onKey, true);
  }, [panelEdit]);
  const [rolledId, setRolledId] = useState<string | null>(null);
  const rollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tick = (r: Rec<'reminder'>) => {
    mutate((e) => e.put({ ...r, payload: reminderToggle(r.payload, todayStr()) }));
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
          // changes no colour. Only a FINISHED colour greys out, and that is
          // hidden altogether unless Completed is showing. Swapping overdue
          // for the theme's orange broke the chain Sean asked for: the
          // manage-menu colour, the legend chip and the date's own mark all
          // have to be the same colour.
          const color = m.state === 'done' ? T.muted : m.color;
          return <TickBoxGlyph key={i} color={color} done={m.state === 'done'} />;
        })}
        {all.length > 6 && <Text style={s.markMore}>+</Text>}
      </View>
    );
  };

  const dueLabel = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={s.page}>
      {/* The picker does not come and go with the view. Dropping it in week
          mode took the folder dropdown away AND shifted everything left of it
          — two complaints from one line. */}
      <TopBar title="Calendar" picker={<CalendarPick />} />
      {/* The date centred over the grid; ◉ jumps home to today. */}
      <View style={s.pagerRow}>
        <CircleBtn glyph="‹" label="Previous" size={32} onPress={() => page(-1)} />
        <Pressable onPress={() => { setYm(today.slice(0, 7)); setDay(today); setWkAnchor(today); }} hitSlop={6}>
          <Text testID="cal-ym" style={s.ymLabel}>{new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        </Pressable>
        <CircleBtn testID="cal-next" glyph="›" label="Next" size={32} onPress={() => page(1)} />
      </View>

      <View testID="cal-grid" style={s.grid} {...gridPan.panHandlers}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={s.weekday}>{w}</Text>
        ))}
        {cells.map((d) => (
          <Pressable key={d} testID="cal-cell" onPress={() => setDay(d)} style={s.cell}>
            <View style={[s.cellInner, d === day && s.cellPicked]}>
              <Text style={[s.cellNum, !d.startsWith(ym) && !weekMode && s.cellNumOther, d === today && s.cellToday]}>{Number(d.slice(8))}</Text>
              {cellMark(d)}
            </View>
          </Pressable>
        ))}
      </View>
      <Rule />
      {/* The legend follows the window, whatever shape the window is. It was
          gated off in week mode, so a fortnight of coloured marks came with
          nothing to read them by — and `cells` is already the two-week range,
          so the names were right all along and simply not drawn. */}
      {(legend.length > 0 || sharedLegend.length > 0) && (
        <ScrollView style={[s.legend, { maxHeight: Math.round(winH * 0.22) }]} contentContainerStyle={s.legendInner} horizontal={false}>
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
        </ScrollView>
      )}
      {/* The legend's closing rule belongs to the legend. A month holding
          nothing shows no key at all, and two hairlines stacked on each
          other is what it looked like when this rule stayed behind. */}
      {/* Follows the legend exactly — ungating one and not the other left the
          legend drawing in week mode with no line under it. */}
      {(legend.length > 0 || sharedLegend.length > 0) && <Rule />}

      <ScrollView style={s.panel} contentContainerStyle={s.panelInner}>
        <View style={s.panelHead}>
          <Text testID="cal-day-title" style={s.panelTitle}>{dayLabel}</Text>
          <View style={s.panelBtns}>
            <CircleBtn testID="cal-completed" glyph="☑" label="Completed" active={showDone} onPress={() => setShowDone(!showDone)} />
            <Pill label="+ Add" primary onPress={() => setModal({ mode: 'create' })} />
          </View>
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
            <Pressable style={s.rowBodyFlex} onPress={() => rowPress(e.id)} onLongPress={() => setPanelEdit(true)} delayLongPress={350}>
              <Text style={s.rowText}>{e.payload.text}</Text>
            </Pressable>
            {e.payload.time && <Text style={s.chip}>{timeLabel(e.payload.time)}</Text>}
            {panelEdit && (
              <>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'event', rec: e })} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, e.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
              </>
            )}
            {(panelEdit || swipe.swiped === e.id) && (
              <ConfirmDelete forceArmed={swipe.swiped === e.id} onDelete={() => { swipe.clear(); mutate((en) => en.del(e.id)); }} />
            )}
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
            <Text style={s.rowText}>{e.payload.text}</Text>
            {e.payload.time && <Text style={s.chip}>{timeLabel(e.payload.time)}</Text>}
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
            <Pressable style={s.rowBodyFlex} onPress={() => rowPress(r.id)} onLongPress={() => setPanelEdit(true)} delayLongPress={350}>
              <Text style={[s.rowText, r.payload.done && s.rowDone]}>{r.payload.text}</Text>
            </Pressable>
            {overdue && <Text style={[s.chip, { color: T.overdue }]}>{dueLabel(r.payload.due!)}</Text>}
            {rider && <Text style={s.chip}>every day</Text>}
            {r.payload.time && <Text style={s.chip}>{timeLabel(r.payload.time)}</Text>}
            {panelEdit && (
              <>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'reminder', rec: r })} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, r.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
                <ConfirmDelete onDelete={() => mutate((en) => en.del(r.id))} />
              </>
            )}
            {swipe.swiped === r.id && <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((en) => en.del(r.id)); }} />}
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
              onPress={() => void sharedPut({ ...r, payload: reminderToggle(r.payload, todayStr()) })}
              hitSlop={8}
              style={[s.tickBox, overdue && s.tickOverdue]}
            />
            <Text style={s.rowText}>{r.payload.text}</Text>
            {overdue && <Text style={[s.chip, { color: T.overdue }]}>{dueLabel(r.payload.due!)}</Text>}
            {r.payload.time && <Text style={s.chip}>{timeLabel(r.payload.time)}</Text>}
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
            <Pressable style={s.rowBodyFlex} onPress={() => rowPress(n.id)} onLongPress={() => setPanelEdit(true)} delayLongPress={350}>
              <Text style={s.rowText}>{n.payload.title}</Text>
            </Pressable>
            {panelEdit && (
              <>
                <CircleBtn glyph="✎" label="Edit" size={24} onPress={() => setModal({ mode: 'edit', kind: 'note', rec: n })} />
                <CircleBtn glyph="⧉" label="Duplicate" size={24} onPress={() => { const res = duplicateItem(recs, n.id, newId); if (!('error' in res)) mutate((en) => res.put.forEach((p) => en.put(p))); }} />
                <ConfirmDelete onDelete={() => mutate((en) => en.del(n.id))} />
              </>
            )}
            {swipe.swiped === n.id && <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((en) => en.del(n.id)); }} />}
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
            <Text style={s.rowText}>{n.payload.title}</Text>
          </View>
        ))}
        {items.events.length + items.reminders.length + items.notes.length +
          sharedItems.events.length + sharedItems.reminders.length + sharedItems.notes.length === 0 && (
          <Text style={s.empty}>Nothing on this day</Text>
        )}
      </ScrollView>
      {modal?.mode === 'create' && (
        <ItemModal
          mode="create"
          kind="event"
          date={day}
          onClose={() => setModal(null)}
          onSaved={(id, kind) => kind === 'note' && onNoteCreated?.(id)}
        />
      )}
      {modal?.mode === 'edit' && <ItemModal mode="edit" kind={modal.kind} rec={modal.rec} onClose={() => setModal(null)} onSaved={(id, kind) => kind === 'note' && onNoteCreated?.(id)} />}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  ymLabel: { color: T.text, fontSize: 15, fontWeight: '600', minWidth: 150, textAlign: 'center' },
  // userSelect none: a swipe across the cell numbers must never start a
  // text selection — on web a selection TERMINATES the pan mid-gesture.
  grid: { userSelect: 'none', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 6 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  cell: { width: `${100 / 7}%` },
  cellInner: { margin: 1.5, minHeight: 46, alignItems: 'center', paddingTop: 3, paddingBottom: 2, borderRadius: 8 },
  cellPicked: { backgroundColor: T.surface2 },
  panelBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cellNumOther: { color: T.muted, opacity: 0.55 },
  cellNum: { color: T.text, fontSize: 13 },
  cellToday: { color: T.accentInk, backgroundColor: T.accent, borderRadius: 9, minWidth: 18, height: 18, textAlign: 'center', lineHeight: 18, fontWeight: '700', overflow: 'hidden' },
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
  legend: { flexGrow: 0 },
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
  chev: { color: T.muted, fontSize: 12, width: 14, textAlign: 'center' },
  groupTitleShared: { color: T.muted },
  groupTitle: { color: T.gold, fontSize: 13, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
  markGlyph: { fontSize: 10, color: T.dim },
  panel: { flex: 1 },
  panelInner: { padding: 16, gap: 8 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: T.gold, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  rowRolled: { backgroundColor: T.accentSoft, borderRadius: 8 },
  rowBodyFlex: { flex: 1 },
  editBackdropFill: { minHeight: 120 },
  rowText: { color: T.text, fontSize: 15, flex: 1 },
  rowDone: { color: T.muted, textDecorationLine: 'line-through' },
  chip: { color: T.dim, fontSize: 12 },
  tickBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: T.accentInk, borderColor: T.accent },
  tickOverdue: { borderColor: T.overdue },
  tickMark: { color: T.accent, fontSize: 12, fontWeight: '700' },
  empty: { color: T.muted, fontSize: 13, marginTop: 8 },
}));
