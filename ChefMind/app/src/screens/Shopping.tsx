/**
 * The shopping list (Sean, 2026-08-21).
 *
 * One flat list, which is what a shopping list is: no folders, no sections, no
 * dates. The rows are ordinary `reminder` records living in the folder that
 * wears the `shopping` flag, so ticking, ordering, deleting and syncing are
 * the machinery every other list in this app already uses — see the flag's own
 * comment in core's types.ts for why it is a flag rather than a third app.
 *
 * It fills from the Recipes tab: pick several in edit mode and their
 * ingredients arrive here, combined by core's shoppingLines. Typing straight
 * into the field at the top works too, because the thing you forgot is never
 * in a recipe.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { byRecOrd, newId, ordBetween, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { useRowDrag } from '../components/rowdrag';
import { useSwipeLeft } from '../components/swiperow';
import { EditExit } from '../components/EditExit';
import { useToast } from '../components/Toast';
import { CircleBtn, ConfirmDelete, Field, Scroll, TOPBAR_CTRL, WebHitSlop } from '../ui';

type Row = Rec<'reminder'>;

/** A row lifted from one index and set down at another. */
function moveAt<T>(rows: T[], from: number, to: number): T[] {
  const out = rows.slice();
  const [row] = out.splice(from, 1);
  if (row === undefined) return rows;
  out.splice(to, 0, row);
  return out;
}

export function Shopping() {
  const { recs, mutate } = useStore();
  const toast = useToast();
  const [field, setField] = useState('');
  const [pageEdit, setPageEdit] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const swipe = useSwipeLeft();

  const { folder, section, rows } = useMemo(() => {
    const f = recs.find((r): r is Rec<'folder'> => r.type === 'folder' && !r.deleted && r.payload.shopping === true);
    const sec = f
      ? recs.filter((r): r is Rec<'section'> => r.type === 'section' && !r.deleted && r.payload.folderId === f.id).sort(byRecOrd)[0]
      : undefined;
    const list = sec
      ? recs.filter((r): r is Row => r.type === 'reminder' && !r.deleted && r.payload.sectionId === sec.id).sort(byRecOrd)
      : [];
    return { folder: f, section: sec, rows: list };
  }, [recs]);

  /**
   * Reordering writes a key per row from its new neighbour, walking forward —
   * exactly as the recipes-to-shopping import does, and for the same reason:
   * ordBetween(prev, null) is deterministic, so asking it the same question
   * for every row hands them all one key.
   */
  const drag = useRowDrag(rows.length, (from, to) => {
    swipe.clear();
    const next = moveAt(rows, from, to);
    mutate((e) => {
      let prev: string | null = null;
      for (const r of next) {
        prev = ordBetween(prev, null);
        if (r.payload.ord !== prev) e.put({ ...r, payload: { ...r.payload, ord: prev } });
      }
    });
  });

  const add = () => {
    const text = field.trim();
    setField('');
    if (!text || !folder || !section) return;
    const last = rows[rows.length - 1];
    mutate((e) =>
      e.put({
        id: newId(),
        type: 'reminder',
        updated: 0,
        payload: {
          text, due: null, time: null, done: false, repeat: null,
          folderId: folder.id, sectionId: section.id, indent: 0,
          ord: ordBetween(last?.payload.ord ?? null, null),
        },
      }),
    );
  };

  /**
   * A tick here is a plain flip, not core's reminderToggle.
   *
   * reminderToggle rolls a repeat forward and re-dates the row, which is right
   * for a reminder and meaningless for a thing to buy — these carry no date
   * and no repeat by construction. Flipping `done` is the whole behaviour, and
   * nothing about it can surprise a list that has none of the other fields.
   */
  const tick = (r: Row) => mutate((e) => e.put({ ...r, payload: { ...r.payload, done: !r.payload.done } }));

  const commitEdit = (r: Row) => {
    const text = editText.trim();
    setEditing(null);
    // An emptied line deletes it, the way an empty add adds nothing.
    if (text === '') mutate((e) => e.del(r.id));
    else if (text !== r.payload.text) mutate((e) => e.put({ ...r, payload: { ...r.payload, text } }));
  };

  const ticked = rows.filter((r) => r.payload.done);
  const clearTicked = () => {
    if (ticked.length === 0) return;
    mutate((e) => { for (const r of ticked) e.del(r.id); });
    toast(`${ticked.length} cleared.`);
  };

  return (
    <View style={s.page}>
      <TopBar
        title="Shopping"
        controls={
          <>
            {/* Only offered when there IS something ticked: a control that
                does nothing is a control you learn to distrust. */}
            {ticked.length > 0 && (
              <CircleBtn
                testID="shopping-clear"
                // NOT '␡'. That codepoint has no glyph in the app's font and
                // renders as a literal 'DEL' box — seen in the browser the
                // first time this bar drew.
                glyph="🧹"
                label={`Clear ${ticked.length} ticked`}
                size={TOPBAR_CTRL}
                color={T.dim}
                onPress={clearTicked}
              />
            )}
            <CircleBtn
              testID="shopping-edit"
              glyph="✎"
              label={pageEdit ? 'Leave edit mode' : 'Edit mode — reorder'}
              size={TOPBAR_CTRL}
              color={pageEdit ? T.accent : T.dim}
              onPress={() => setPageEdit(!pageEdit)}
            />
          </>
        }
      />
      <Scroll contentContainerStyle={s.scrollWrap} scrollEnabled={drag.dragIdx === null}>
        <EditExit
          active={pageEdit || swipe.swiped !== null}
          onExit={() => { if (swipe.swiped !== null) swipe.clear(); else setPageEdit(false); }}
          style={s.scroll}
        >
          <View style={s.addRow}>
            <Field
              testID="shopping-add"
              value={field}
              onChangeText={setField}
              placeholder="Add an item"
              onSubmitEditing={add}
              style={s.addField}
            />
            <CircleBtn testID="shopping-add-go" glyph="+" label="Add" color={T.accent} size={26} onPress={add} />
          </View>

          {rows.length === 0 && (
            <Text style={s.empty}>Nothing to buy. Pick recipes in the Recipes tab to fill this in.</Text>
          )}

          {rows.map((r, i) => (
            <View key={r.id}>
              {drag.slot === i && <View style={s.dropLine} />}
              <View
                ref={drag.registerRow(i)}
                {...(pageEdit ? {} : swipe.handlersFor(r.id))}
                style={[s.row, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}
              >
                <View
                  testID="shopping-grip"
                  {...(pageEdit ? drag.handleFor(i) : {})}
                  style={[s.grip, !pageEdit && s.gripHidden]}
                  pointerEvents={pageEdit ? 'auto' : 'none'}
                  hitSlop={6}
                >
                  <WebHitSlop slop={6} />
                  <Text style={s.gripText}>≡</Text>
                </View>
                <Pressable
                  testID="shopping-tick"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: r.payload.done }}
                  accessibilityLabel={r.payload.text}
                  onPress={() => { if (!swipe.justSwiped()) tick(r); }}
                  hitSlop={8}
                  style={s.boxWrap}
                >
                  <WebHitSlop slop={8} />
                  <View style={[s.box, r.payload.done && s.boxOn]}>
                    {r.payload.done && <Text style={s.boxTick}>✓</Text>}
                  </View>
                </Pressable>
                {editing === r.id ? (
                  <Field
                    testID="shopping-edit-field"
                    value={editText}
                    onChangeText={setEditText}
                    autoFocus
                    onBlur={() => commitEdit(r)}
                    onSubmitEditing={() => commitEdit(r)}
                    style={s.editField}
                  />
                ) : (
                  <Pressable
                    testID="shopping-row"
                    style={s.rowBody}
                    onPress={() => {
                      if (swipe.justSwiped()) return;
                      if (swipe.swiped) { swipe.clear(); return; }
                      setEditing(r.id);
                      setEditText(r.payload.text);
                    }}
                  >
                    <Text style={[s.rowText, r.payload.done && s.rowDone]}>{r.payload.text}</Text>
                  </Pressable>
                )}
                {swipe.swiped === r.id && !pageEdit && (
                  <ConfirmDelete testID="shopping-del" onDelete={() => { swipe.clear(); mutate((e) => e.del(r.id)); }} />
                )}
              </View>
            </View>
          ))}
          {drag.slot === rows.length && <View style={s.dropLine} />}
          {pageEdit && <Pressable style={s.editBackdropFill} onPress={() => setPageEdit(false)} />}
        </EditExit>
      </Scroll>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  scrollWrap: { flexGrow: 1 },
  scroll: { paddingHorizontal: 12, paddingBottom: 24, flexGrow: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addField: { flex: 1 },
  empty: { color: T.muted, fontSize: 14, marginTop: 18, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 2 },
  grip: { width: 22, alignItems: 'center' },
  gripHidden: { opacity: 0, width: 0 },
  gripText: { color: T.muted, fontSize: 16 },
  boxWrap: { paddingRight: 10, paddingLeft: 2 },
  box: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: T.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: T.accent, borderColor: T.accent },
  boxTick: { color: T.accentInk, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  rowBody: { flex: 1, paddingVertical: 2 },
  rowText: { color: T.text, fontSize: 16 },
  // Struck through and dimmed, kept in place: a bought item that JUMPS to the
  // bottom takes your eye off the shelf you are standing at.
  rowDone: { color: T.muted, textDecorationLine: 'line-through' },
  editField: { flex: 1 },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 2 },
  editBackdropFill: { flexGrow: 1, minHeight: 160 },
}));
