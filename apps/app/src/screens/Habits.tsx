/**
 * Habits, prod's page: the Week|Month segmented toggle at the left with the
 * labelled ‹ › pager at the right; a collapse-all above the grid; each
 * section a colour-wash pill with its +; habit names in tinted boxes; big
 * tinted tick circles, today's column ringed. MONTH draws one pie per day —
 * the day's ticks as CONTIGUOUS arcs per section, sliced out of the whole
 * counted set — with the key underneath. The section dropdown (the pie by
 * the username) filters sections and opens Manage sections.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Path } from 'react-native-svg';
import { byOrd, monthGrid, moveHabit, moveHabitSection, newId, ordBetween, prefsOf, prefsPut, tickId, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { APP_PALETTES, themed, T } from '../theme';
import { TopBar } from '../chrome';
import { Chevron } from '../components/Chevron';
import { SectionPick, useHabitSections } from '../components/SectionPick';
import { useRowDrag } from '../components/rowdrag';
import { useSectionDrag } from '../components/sectiondrag';
import { CircleBtn, ConfirmDelete, Field, WebHitSlop } from '../ui';

// Habit sections sit in one flat list with no folder above them, so the
// section drag — which is built around folders — is handed a single
// synthetic one. Every slot it offers then belongs to the same list.
const HFOLDER = 'habits';

const pad = (n: number) => String(n).padStart(2, '0');
const FOLD_KEY = 'calmind.folded.habits';

// Seven columns need room the narrow screens haven't got, so a phone shows
// five. It's the WIDTH that decides, not the platform: a tablet or a native
// app on a big screen gets all seven, a narrow desktop window gets five.
const WIDE_AT = 700;

function weekDates(offset: number, count: number): string[] {
  // The suite's rolling window ENDS on tomorrow, so today is always in view
  // with a day of headroom in front of it. Paging steps by exactly the number
  // of columns SHOWN — stepping a fixed seven while showing five would leave
  // two days unreachable between one page and the previous one.
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * count + 1 - i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

/** One day's pie: contiguous arcs — each section's ticked share in its colour,
 *  packed from 12 o'clock, the rest an outline. Solid when everything's done. */
function DayPie({ shares, future, size = 30 }: { shares: { color: string; frac: number }[]; future: boolean; size?: number }) {
  const r = size / 2 - 1.5;
  const c = size / 2;
  let a0 = -Math.PI / 2;
  const arcs: { d: string; color: string }[] = [];
  for (const sh of shares) {
    if (sh.frac <= 0) continue;
    const a1 = a0 + sh.frac * 2 * Math.PI;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const full = sh.frac >= 0.9999;
    arcs.push({
      color: sh.color,
      d: full
        ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`
        : `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`,
    });
    a0 = a1;
  }
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={future ? T.lineSoft : T.line} strokeWidth={1.5} />
      {!future && arcs.map((a, i) => <Path key={i} d={a.d} fill={a.color} />)}
    </Svg>
  );
}

/** section colour helpers: wash pill bg, tinted borders and fills. */
const tint = (hex: string, alpha: string) => hex + alpha;

export function Habits() {
  const { recs, mutate } = useStore();
  const { visible: sections } = useHabitSections();
  const today = todayStr();
  const { width: winWidth } = useWindowDimensions();
  const [w, setW] = useState(0);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const lastTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });

  useEffect(() => {
    AsyncStorage.getItem(FOLD_KEY)
      .then((raw) => raw && setFolded(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const saveFold = (next: Set<string>) => {
    setFolded(next);
    // Swallowed deliberately, and this is the triage: what is lost when a
    // fold write fails is which sections were collapsed, next launch. No
    // user content, nothing unrecoverable, and an alert about a collapsed
    // folder would be worse than the loss. The failures worth surfacing in
    // this app are the ones that lose DATA or lie about state — see
    // store.tsx's persistFailed and the shared-write reconcile.
    AsyncStorage.setItem(FOLD_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const toggleFold = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveFold(next);
  };
  const collapseAll = () => {
    const all = sections.map((x) => x.id);
    saveFold(all.every((id) => folded.has(id)) ? new Set() : new Set(all));
  };
  // Sean's rule for the collapse-all, already true in Reminders and Notes:
  // it points sideways once everything is folded, exactly like the row
  // chevrons it commands. An empty list is not "all collapsed" — with no
  // sections, every() is vacuously true and the arrow would lie.
  const allCollapsed = sections.length > 0 && sections.every((x) => folded.has(x.id));

  const view = prefsOf(recs, 'habits').view ?? 'week';
  const setView = (v: 'week' | 'month') => mutate((e) => e.put(prefsPut(recs, 'habits', { view: v })));

  // Sean's rule: five day columns on a phone, seven where there's room.
  const cols = winWidth >= WIDE_AT ? 7 : 5;
  const days = useMemo(() => weekDates(w, cols), [w, cols]);
  const [year, month] = ym.split('-').map(Number) as [number, number];
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const { habitsOf, allHabits, ticked } = useMemo(() => {
    const habits = recs.filter((r): r is Rec<'habit'> => r.type === 'habit').sort((a, b) => byOrd(a.payload, b.payload));
    const visIds = new Set(sections.map((s) => s.id));
    const secOrd = new Map(sections.map((s, i) => [s.id, i]));
    const counted = habits.filter((h) => visIds.has(h.payload.sectionId));
    const allHabits = [...counted].sort(
      (a, b) => (secOrd.get(a.payload.sectionId) ?? 99) - (secOrd.get(b.payload.sectionId) ?? 99) || byOrd(a.payload, b.payload),
    );
    const ticks = new Set(recs.filter((r) => r.type === 'tick').map((r) => r.id));
    return {
      allHabits,
      habitsOf: (sid: string) => counted.filter((h) => h.payload.sectionId === sid),
      ticked: (habitId: string, date: string) => ticks.has(tickId(habitId, date)),
    };
  }, [recs, sections]);

  const secColor = useMemo(() => new Map(sections.map((s) => [s.id, s.payload.color])), [sections]);

  // The suite's edit mode (body.editing): the grips and the row delete exist
  // only inside it, revealed by the top bar's pencil, left by Escape. Nothing
  // else on the grid moves when it turns on.
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    if (!edit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setEdit(false); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [edit]);

  // One flat list of every draggable entry, in drawn order — an empty section
  // contributes a placeholder so a habit can be dropped into it.
  type FlatEntry = { kind: 'row'; rec: Rec<'habit'>; sectionId: string } | { kind: 'empty'; sectionId: string };
  const flatRows = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const sec of sections) {
      const rows = habitsOf(sec.id);
      if (rows.length === 0) out.push({ kind: 'empty', sectionId: sec.id });
      for (const h of rows) out.push({ kind: 'row', rec: h, sectionId: sec.id });
    }
    return out;
  }, [sections, habitsOf]);
  const drag = useRowDrag(flatRows.length, (from, to) => {
    const src = flatRows[from];
    if (src?.kind !== 'row') return;
    const slotIdx = to > from ? to + 1 : to;
    const before = flatRows[slotIdx];
    const destSectionId = before?.sectionId ?? flatRows[flatRows.length - 1]?.sectionId ?? src.sectionId;
    const beforeId = before?.kind === 'row' ? before.rec.id : null;
    const res = moveHabit(recs, src.rec.id, destSectionId, beforeId);
    if ('error' in res) return;
    mutate((e) => res.put.forEach((r) => e.put(r)));
  });
  const flatIdxOf = (id: string) => flatRows.findIndex((x) => x.kind === 'row' && x.rec.id === id);
  const emptyIdxOf = (sectionId: string) => flatRows.findIndex((x) => x.kind === 'empty' && x.sectionId === sectionId);
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveHabitSection(recs, sectionId, slot.beforeSectionId);
    if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
  });

  /** The day's contiguous shares: per section, ticked count over all counted. */
  const sharesFor = (date: string) => {
    const total = Math.max(1, allHabits.length);
    return sections.map((sec) => ({
      color: sec.payload.color,
      frac: habitsOf(sec.id).filter((h) => ticked(h.id, date)).length / total,
    }));
  };

  const toggle = (habitId: string, date: string) => {
    const id = tickId(habitId, date);
    mutate((e) => {
      if (ticked(habitId, date)) e.del(id);
      else e.put({ id, type: 'tick', updated: 0, payload: { habitId, date } });
    });
  };

  const addHabit = (section: Rec<'habitsection'>) => {
    const name = addText.trim();
    setAddingIn(null);
    setAddText('');
    if (!name) return;
    mutate((e) => {
      const last = habitsOf(section.id).slice(-1)[0];
      e.put({ id: newId(), type: 'habit', updated: 0, payload: { name, sectionId: section.id, ord: ordBetween(last?.payload.ord ?? null, null) } });
    });
  };

  const commitRename = (h: Rec<'habit'>) => {
    setRenaming(null);
    const name = renameText.trim();
    if (name === '' || name === h.payload.name) return;
    mutate((e) => e.put({ ...h, payload: { ...h.payload, name } }));
  };

  const page = (dir: -1 | 1) => {
    if (view === 'week') {
      setW(w + dir);
      return;
    }
    const m0 = month - 1 + dir;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, '0')}`);
  };

  const pagerLabel =
    view === 'month'
      ? new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : w === 0 && cols === 7
        ? 'This week'
        : new Date(`${days[0]}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
          ' – ' +
          new Date(`${days[days.length - 1]}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View style={s.page}>
      <TopBar
        title="Habits"
        controls={<CircleBtn testID="habits-edit" glyph="✎" label="Edit" size={30} active={edit} onPress={() => setEdit(!edit)} />}
        picker={<SectionPick />}
      />

      {/* Week|Month segmented at the left; the labelled pager at the right. */}
      <View style={s.controlRow}>
        <View style={s.segmented}>
          <Pressable style={[s.segBtn, view === 'week' && s.segOn]} onPress={() => setView('week')}>
            <Text style={[s.segText, view === 'week' && s.segTextOn]}>Week</Text>
          </Pressable>
          <Pressable style={[s.segBtn, view === 'month' && s.segOn]} onPress={() => setView('month')}>
            <Text style={[s.segText, view === 'month' && s.segTextOn]}>Month</Text>
          </Pressable>
        </View>
        <View style={s.pager}>
          <CircleBtn testID="habits-prev" glyph="‹" label="Previous" size={30} onPress={() => page(-1)} />
          <Text style={s.pagerLabel}>{pagerLabel}</Text>
          <CircleBtn glyph="›" label="Next" size={30} onPress={() => page(1)} />
        </View>
      </View>

      {/* A live drag holds the scroll still. Refusing the responder hand-over
          is what keeps the gesture, but on a touch device a list that also
          scrolls under the finger fights the drop line for the same pixels. */}
      <ScrollView contentContainerStyle={s.scroll} scrollEnabled={drag.dragIdx === null && secDrag.dragging === null}>
        {view === 'week' && (
          <>
            <View style={s.headRow}>
              <View style={s.nameCol}>
                <Pressable
                  onPress={collapseAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={allCollapsed ? 'Expand all' : 'Collapse all'}
                  style={s.collapseAllBtn}
                >
                  <WebHitSlop />
                  <Chevron open={!allCollapsed} />
                </Pressable>
              </View>
              {days.map((d) => (
                <View key={d} testID="habit-daycol" style={s.dayCol}>
                  <View testID="habit-dayhead" style={[s.dayHead, d === today && s.dayHeadToday]}>
                    <Text style={[s.dayHeadText, d === today && s.dayHeadTextToday]}>
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${d}T12:00:00`).getDay()]}
                    </Text>
                    <Text style={[s.dayHeadNum, d === today && s.dayHeadTextToday]}>{Number(d.slice(8))}</Text>
                  </View>
                </View>
              ))}
            </View>

            {sections.map((sec) => (
              <View key={sec.id} style={s.section}>
                {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                <View
                  ref={secDrag.registerHeader(sec.id, HFOLDER)}
                  style={[s.secHead, secDrag.dragging === sec.id && s.dragging]}
                >
                  <View
                    testID={`hsec-grip-${sec.payload.name}`}
                    {...(edit ? secDrag.gripFor(sec.id, HFOLDER) : {})}
                    style={[s.rowGrip, !edit && s.gripGone]}
                    pointerEvents={edit ? 'auto' : 'none'}
                    hitSlop={6}
                  >
                    <Text style={s.rowGripText}>≡</Text>
                  </View>
                  <Pressable onPress={() => toggleFold(sec.id)} hitSlop={8} style={s.chevWrap}>
                    <WebHitSlop />
                    <Chevron open={!folded.has(sec.id)} />
                  </Pressable>
                  <Pressable
                    testID={`hsec-dot-${sec.payload.name}`}
                    hitSlop={10}
                    style={[s.secDot, { backgroundColor: sec.payload.color }]}
                    onPress={() => {
                      const pal = APP_PALETTES.habits;
                      const at = pal.indexOf(sec.payload.color);
                      mutate((e) => e.put({ ...sec, payload: { ...sec.payload, color: pal[(at + 1) % pal.length]! } }));
                    }}
                  >
                    {/* Eleven pixels drawn, and the only control in the app
                        that small. The slop is what makes it tappable. */}
                    <WebHitSlop slop={10} />
                  </Pressable>
                  <View style={[s.secPill, { backgroundColor: tint(sec.payload.color, '2e') }]}>
                    <Text style={s.secPillText}>{sec.payload.name}</Text>
                  </View>
                  <CircleBtn glyph="+" label="Add" color={sec.payload.color} size={26} onPress={() => { setAddingIn(sec.id); setAddText(''); }} />
                  <View style={s.secRule} />
                </View>
                {addingIn === sec.id && (
                  <Field value={addText} onChangeText={setAddText} placeholder="New habit" autoFocus onBlur={() => addHabit(sec)} onSubmitEditing={() => addHabit(sec)} />
                )}
                {!folded.has(sec.id) && habitsOf(sec.id).length === 0 && (
                  <View>
                    {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                    <View ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot} />
                  </View>
                )}
                {!folded.has(sec.id) &&
                  habitsOf(sec.id).map((h) => (
                    <View key={h.id}>
                      {drag.slot !== null && flatIdxOf(h.id) === drag.slot && <View style={s.dropLine} />}
                      <View
                        ref={drag.registerRow(flatIdxOf(h.id))}
                        style={[
                          s.habitRow,
                          drag.dragIdx !== null && flatIdxOf(h.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] },
                        ]}
                      >
                      <View style={s.nameCol}>
                        <View
                          testID="habit-grip"
                          {...(edit ? drag.handleFor(flatIdxOf(h.id)) : {})}
                          style={[s.rowGrip, !edit && s.gripGone]}
                          pointerEvents={edit ? 'auto' : 'none'}
                          hitSlop={6}
                        >
                          <Text style={s.rowGripText}>≡</Text>
                        </View>
                        {renaming === h.id ? (
                          <Field
                            testID="habit-rename"
                            value={renameText}
                            onChangeText={setRenameText}
                            autoFocus
                            style={s.renameField}
                            onBlur={() => commitRename(h)}
                            onSubmitEditing={() => commitRename(h)}
                          />
                        ) : (
                          <Pressable
                            style={[s.nameBox, { borderColor: tint(sec.payload.color, '55'), backgroundColor: tint(sec.payload.color, '14') }]}
                            onPress={() => {
                              // The suite's three ways in: a double-click, a
                              // long-press, or a SINGLE tap while the Edit
                              // pencil is on — once you're editing, asking for
                              // a double-tap as well is a toll for no reason.
                              if (edit) {
                                setRenaming(h.id);
                                setRenameText(h.payload.name);
                                return;
                              }
                              const now = Date.now();
                              if (lastTap.current.id === h.id && now - lastTap.current.at < 300) {
                                setRenaming(h.id);
                                setRenameText(h.payload.name);
                              }
                              lastTap.current = { id: h.id, at: now };
                            }}
                            onLongPress={() => { setRenaming(h.id); setRenameText(h.payload.name); }}
                            delayLongPress={350}
                          >
                            <Text testID="habit-name" style={[s.habitName, { color: tint(sec.payload.color, 'ee') }]} numberOfLines={1}>{h.payload.name}</Text>
                          </Pressable>
                        )}
                        {(renaming === h.id || edit) && <ConfirmDelete size={24} onDelete={() => mutate((e) => e.del(h.id))} />}
                      </View>
                      {days.map((d) => {
                        const on = ticked(h.id, d);
                        const future = d > today;
                        return (
                          <View key={d} style={s.dayCol}>
                            <Pressable
                              disabled={future}
                              onPress={() => toggle(h.id, d)}
                              style={[
                                s.tickCell,
                                { borderColor: tint(sec.payload.color, '44'), backgroundColor: tint(sec.payload.color, '10') },
                                on && { backgroundColor: sec.payload.color, borderColor: sec.payload.color },
                                d === today && s.tickCellToday,
                                future && s.tickCellFuture,
                              ]}
                            />
                          </View>
                        );
                      })}
                      </View>
                    </View>
                  ))}
              </View>
            ))}
            {secDrag.lineKey === `end:${HFOLDER}` && <View style={s.dropLine} />}
          </>
        )}

        {view === 'month' && (
          <>
            <View style={s.monthGridRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
                <Text key={i} style={s.monthHead}>{wd}</Text>
              ))}
              {cells.map((d, i) =>
                d === null ? (
                  <View key={`b${i}`} style={s.monthCell} />
                ) : (
                  <View key={d} style={s.monthCell}>
                    <Text style={[s.monthNum, d === today && s.monthNumToday]}>{Number(d.slice(8))}</Text>
                    <View style={d === today ? s.pieToday : null}>
                      <DayPie future={d > today} shares={sharesFor(d)} />
                    </View>
                  </View>
                ),
              )}
            </View>
            <View style={s.keyRow}>
              {sections.filter((sec) => habitsOf(sec.id).length > 0).map((sec) => (
                <View key={sec.id} style={s.keyItem}>
                  <View style={[s.keyDot, { backgroundColor: sec.payload.color }]} />
                  <Text style={s.keyText}>{sec.payload.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  segmented: { flexDirection: 'row', backgroundColor: T.surface, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: T.lineSoft },
  segBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  segOn: { backgroundColor: T.accentInk },
  segText: { color: T.dim, fontSize: 15, fontWeight: '600' },
  segTextOn: { color: T.accent },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pagerLabel: { color: T.text, fontSize: 16, fontWeight: '600', minWidth: 96, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end' },
  nameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  // The same box Reminders and Notes draw. Habits had a text '⌃' in a
  // 30pt CircleBtn — the one collapse-all in the app that was neither
  // the drawn chevron nor the right size, and the only one that never
  // turned sideways when everything was folded.
  collapseAllBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  renameField: { flex: 1, paddingVertical: 6 },
  dayCol: { width: 44, alignItems: 'center' },
  dayHead: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, minWidth: 34 },
  dayHeadToday: { backgroundColor: T.accent },
  dayHeadText: { color: T.muted, fontSize: 13, fontWeight: '600' },
  dayHeadNum: { color: T.dim, fontSize: 14, fontWeight: '700' },
  dayHeadTextToday: { color: T.accentInk },
  section: { gap: 8 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  // The same 20x20 box Reminders and Notes give their fold chevrons.
  // This Pressable had NO style, so its box was exactly the glyph and
  // the slop was the whole target — measured at 7x7 drawn against the
  // others' 20x20, which is the inconsistency Sean was pointing at.
  chevWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  secDot: { width: 11, height: 11, borderRadius: 6 },
  secPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  secPillText: { color: T.text, fontSize: 16, fontWeight: '700' },
  secRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  // Out of edit mode the grip leaves the flow entirely rather than hiding, so
  // the name box hugs its label instead of sitting pushed off by an invisible
  // handle — the suite's rule, and the reason it uses display over visibility.
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  gripGone: { display: 'none' },
  rowGripText: { color: T.muted, fontSize: 14 },
  dragging: { opacity: 0.55 },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 18 },
  nameBox: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  habitName: { fontSize: 16, fontWeight: '600' },
  tickCell: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5 },
  tickCellToday: { borderColor: T.accent, borderWidth: 2 },
  tickCellFuture: { opacity: 0.35 },
  monthGridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  monthHead: { width: `${100 / 7}%`, textAlign: 'center', color: T.muted, fontSize: 11, paddingVertical: 2 },
  monthCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6, gap: 3 },
  monthNum: { color: T.dim, fontSize: 11, minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden' },
  monthNumToday: { color: T.accentInk, backgroundColor: T.accent, fontWeight: '700' },
  pieToday: { borderWidth: 2, borderColor: T.accent, borderRadius: 19, padding: 1 },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 11, height: 11, borderRadius: 6 },
  keyText: { color: T.dim, fontSize: 12 },
}));
