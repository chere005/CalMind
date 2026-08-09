/**
 * The Recipe page — the akisbookshelf add-quote shape, for notes. Opens from
 * the Notes editor's Recipe button, prefilled by PARSING the note's current
 * body, so an old free-text recipe converts the moment it's opened and
 * saved. Ingredients' + parses units (grams, cups, tsp, tbsp…) and formats
 * them nicely, new ones landing at the TOP; Instructions' + appends the next
 * numbered step at the BOTTOM; the 📷 picks photos and OCR fills the entries
 * themselves. Saving writes the fixed nice-looking recipe block back to the
 * note (any non-recipe text rides along after it, still editable there).
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { parseIngredient, recipeBody, recipeFromPages, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill } from '../ui';
import { ocrImages } from '../components/ocr';
import { useRowDrag } from '../components/rowdrag';
import { useSwipeLeft } from '../components/swiperow';

/** A row lifted from one index and set down at another. `to` is the index in
 *  the list with the dragged row already taken out, which is what the drag
 *  hook reports. */
function moveAt(rows: string[], from: number, to: number): string[] {
  const out = rows.slice();
  const [row] = out.splice(from, 1);
  if (row === undefined) return rows;
  out.splice(to, 0, row);
  return out;
}

export function RecipeEditor({ note, onClose }: { note: Rec<'note'>; onClose: () => void }) {
  const { mutate } = useStore();
  const parsed = recipeFromPages([note.payload.body]);
  // recipeFromPages CONSUMES the line it read as a title. When the note
  // already has a title of its own, that line has no home to go to — and
  // since Save writes this parse back over the note, it would simply be
  // deleted. The Recipe button lives beside B/I/U in the note's toolbar, so
  // this is one mis-tap from any note in the app, not an exotic path.
  const strayTitle = note.payload.title && parsed.title ? [parsed.title] : [];
  const [title, setTitle] = useState(note.payload.title || parsed.title || '');
  const [ingredients, setIngredients] = useState<string[]>(parsed.ingredients);
  const [steps, setSteps] = useState<string[]>(parsed.steps);
  const [extra] = useState<string[]>([...strayTitle, ...parsed.extra]);
  // The free text that isn't recipe: kept by default, dropped on request —
  // the checkbox is the deliberate way to shed it (Sean's ask).
  const [includeNotes, setIncludeNotes] = useState(true);
  const [ingField, setIngField] = useState('');
  const [stepField, setStepField] = useState('');
  const [busy, setBusy] = useState('');
  // Tap a line to fix it. Before this the only way to mend a typo — and OCR
  // hands you plenty — was to delete the row and type the whole thing again,
  // which on a phone is the difference between correcting a recipe and
  // giving up on it. Emptying a line deletes it, the way an empty add does.
  const [editing, setEditing] = useState<{ list: 'ing' | 'step'; at: number } | null>(null);
  const [editText, setEditText] = useState('');
  const startEdit = (list: 'ing' | 'step', at: number, value: string) => {
    setEditing({ list, at });
    setEditText(value);
  };
  const commitEdit = () => {
    if (!editing) return;
    const { list, at } = editing;
    setEditing(null);
    const raw = editText.trim();
    const apply = (rows: string[]) =>
      raw === '' ? rows.filter((_x, j) => j !== at) : rows.map((x, j) => (j === at ? (list === 'ing' ? parseIngredient(raw) : raw) : x));
    if (list === 'ing') setIngredients(apply);
    else setSteps(apply);
  };

  // Reordering, by the marker each row already wears — the bullet and the
  // step number ARE the handles, so the rows gain no furniture for it. OCR
  // hands ingredients over in whatever order the camera found them, and a
  // method read off a photo often arrives out of sequence.
  // Delete lives behind a swipe here, as it does on every other list in the
  // app. A × on every row put a destructive control under the thumb of a
  // page whose rows are now also tappable to edit and draggable to reorder —
  // three things competing for one line. The swipe reveals it already armed.
  const swipe = useSwipeLeft();
  const ingDrag = useRowDrag(ingredients.length, (from, to) => setIngredients((rows) => moveAt(rows, from, to)));
  const stepDrag = useRowDrag(steps.length, (from, to) => setSteps((rows) => moveAt(rows, from, to)));

  const addIngredient = () => {
    const t = parseIngredient(ingField);
    if (t) setIngredients([t, ...ingredients]); // new ones land at the TOP
    setIngField('');
  };
  const addStep = () => {
    const t = stepField.trim();
    if (t) setSteps([...steps, t]); // steps number down the BOTTOM
    setStepField('');
  };

  const importPhotos = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
      if (picked.canceled || picked.assets.length === 0) return;
      setBusy(`Reading 0/${picked.assets.length}…`);
      const pages = await ocrImages(picked.assets.map((a) => a.uri), (d, t) => setBusy(`Reading ${d}/${t}…`));
      const r = recipeFromPages(pages);
      if (r.title && !title) setTitle(r.title);
      if (r.ingredients.length) setIngredients((cur) => [...r.ingredients, ...cur]);
      if (r.steps.length) setSteps((cur) => [...cur, ...r.steps]);
      setBusy('');
    } catch (err) {
      setBusy(err instanceof Error ? err.message : 'could not read the photos');
      setTimeout(() => setBusy(''), 4000);
    }
  };

  const save = () => {
    const body = [recipeBody(ingredients, steps), includeNotes ? extra.join('\n') : ''].filter(Boolean).join('\n\n');
    mutate((e) => e.put({ ...note, payload: { ...note.payload, title: title || note.payload.title, body } }));
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <ScrollView style={s.page} contentContainerStyle={s.inner} scrollEnabled={ingDrag.dragIdx === null && stepDrag.dragIdx === null}>
        <View style={s.headRow}>
          <Pressable onPress={onClose} hitSlop={8}><Text style={s.back}>← Note</Text></Pressable>
          <CircleBtn testID="recipe-photos" glyph="📷" size={32} onPress={() => void importPhotos()} />
        </View>
        <Text style={s.h1}>Recipe</Text>
        {busy !== '' && <Text style={s.busy}>{busy}</Text>}
        <Field testID="recipe-title" value={title} onChangeText={setTitle} placeholder="Title" style={s.title} />

        <View style={s.secHead}>
          <Text style={s.secName}>Ingredients</Text>
          <CircleBtn testID="ing-add" glyph="+" color={T.accent} size={24} onPress={addIngredient} />
        </View>
        <Field
          testID="ing-field"
          value={ingField}
          onChangeText={setIngField}
          placeholder="2 tbsp olive oil…"
          onSubmitEditing={addIngredient}
        />
        {ingredients.map((ing, i) => (
          <View key={`${ing}-${i}`}>
            {ingDrag.slot === i && <View style={s.dropLine} />}
            <View
              ref={ingDrag.registerRow(i)}
              {...(editing?.list === 'ing' && editing.at === i ? {} : swipe.handlersFor(`ing-${i}`))}
              style={[s.row, ingDrag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: ingDrag.dragDy }] }]}
            >
            <View testID="ing-grip" {...ingDrag.handleFor(i)} style={s.handle} hitSlop={8}>
              <Text style={s.dot}>•</Text>
            </View>
            {editing?.list === 'ing' && editing.at === i ? (
              <Field
                testID="ing-edit"
                value={editText}
                onChangeText={setEditText}
                autoFocus
                style={s.rowField}
                onBlur={commitEdit}
                onSubmitEditing={commitEdit}
              />
            ) : (
              <Pressable testID="ing-row" style={s.rowPress} onPress={() => { if (!swipe.justSwiped()) startEdit('ing', i, ing); }}>
                <Text style={s.rowText}>{ing}</Text>
              </Pressable>
            )}
            {swipe.swiped === `ing-${i}` && (
              <ConfirmDelete testID="ing-del" size={22} forceArmed onDelete={() => { swipe.clear(); setIngredients(ingredients.filter((_x, j) => j !== i)); }} />
            )}
            </View>
          </View>
        ))}
        {ingDrag.slot === ingredients.length && <View style={s.dropLine} />}

        <View style={s.secHead}>
          <Text style={s.secName}>Instructions</Text>
          <CircleBtn testID="step-add" glyph="+" color={T.accent} size={24} onPress={addStep} />
        </View>
        <Field
          testID="step-field"
          value={stepField}
          onChangeText={setStepField}
          placeholder="Whisk everything together…"
          onSubmitEditing={addStep}
        />
        {steps.map((st, i) => (
          <View key={`${st}-${i}`}>
            {stepDrag.slot === i && <View style={s.dropLine} />}
            <View
              ref={stepDrag.registerRow(i)}
              {...(editing?.list === 'step' && editing.at === i ? {} : swipe.handlersFor(`step-${i}`))}
              style={[s.row, stepDrag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: stepDrag.dragDy }] }]}
            >
            <View testID="step-grip" {...stepDrag.handleFor(i)} style={s.handle} hitSlop={8}>
              <Text style={s.stepNum}>{i + 1}.</Text>
            </View>
            {editing?.list === 'step' && editing.at === i ? (
              <Field
                testID="step-edit"
                value={editText}
                onChangeText={setEditText}
                autoFocus
                style={s.rowField}
                onBlur={commitEdit}
                onSubmitEditing={commitEdit}
              />
            ) : (
              <Pressable testID="step-row" style={s.rowPress} onPress={() => { if (!swipe.justSwiped()) startEdit('step', i, st); }}>
                <Text style={s.rowText}>{st}</Text>
              </Pressable>
            )}
            {swipe.swiped === `step-${i}` && (
              <ConfirmDelete testID="step-del" size={22} forceArmed onDelete={() => { swipe.clear(); setSteps(steps.filter((_x, j) => j !== i)); }} />
            )}
            </View>
          </View>
        ))}
        {stepDrag.slot === steps.length && <View style={s.dropLine} />}

        {extra.length > 0 && (
          <>
            <Pressable testID="recipe-incnotes" style={s.incRow} onPress={() => setIncludeNotes(!includeNotes)} hitSlop={6}>
              <View style={[s.incBox, includeNotes && s.incBoxOn]}>{includeNotes && <Text style={s.incTick}>✓</Text>}</View>
              <Text style={s.incLabel}>Include notes</Text>
            </Pressable>
            {includeNotes && extra.map((x, i) => (
              <Text key={i} style={s.extraLine}>{x}</Text>
            ))}
          </>
        )}

        {/* The suite puts a hint under a draggable list (its section manager
            says "Drag a row to reorder…"), and this page needs one more than
            most: the handles ARE the bullet and the step number, which is
            tidy and completely invisible. Three gestures on one line is
            plenty to guess at without being told. */}
        {(ingredients.length > 1 || steps.length > 1) && (
          <Text testID="recipe-hint" style={s.hint}>
            Drag a bullet or a step number to reorder · tap a line to fix it · swipe it left to delete
          </Text>
        )}

        <View style={s.footRow}>
          <Pill label="Cancel" onPress={onClose} />
          <Pill testID="recipe-save" label="Save" primary onPress={save} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  inner: { padding: 20, paddingBottom: 60, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: T.dim, fontSize: 15 },
  h1: { color: T.text, fontSize: 26, fontWeight: '800' },
  busy: { color: T.dim, fontSize: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.lineSoft },
  dot: { color: T.dim, fontSize: 15 },
  stepNum: { color: T.gold, fontSize: 14, fontWeight: '700', width: 22, textAlign: 'right' },
  rowText: { color: T.text, fontSize: 15 },
  // The tap target is the whole line, not just the glyphs in it — a phone
  // gives you a thumb, not a cursor.
  rowPress: { flex: 1, paddingVertical: 2 },
  // The marker doubles as the drag handle, so it carries the tap target.
  handle: { minWidth: 22, alignItems: 'center', justifyContent: 'center' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  rowField: { flex: 1, paddingVertical: 4 },
  incRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  incBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  incBoxOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  incTick: { color: T.accent, fontSize: 14, fontWeight: '800', lineHeight: 16 },
  incLabel: { color: T.text, fontSize: 15 },
  extraLine: { color: T.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: T.muted, fontSize: 12, lineHeight: 17, marginTop: 14 },
  footRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
}));
