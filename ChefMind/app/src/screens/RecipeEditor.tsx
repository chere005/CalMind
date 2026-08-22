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
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
// A Modal renders in its own window, OUTSIDE the app root's SafeAreaView — so
// its content starts at y=0, under the clock and the Dynamic Island. On the
// phone that put "← Note" beneath the time and left the 📷 unreachable behind
// the status bar: not cosmetic, the photo import could not be tapped at all.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { importedRecipeTitle, ingredientParts, isSubheader, orderIngredients, parseIngredient, recipeBody, recipeFromHtml, recipeFromPages, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { CircleBtn, ConfirmDelete, Field, Pill, Scroll, WebHitSlop } from '../ui';
import { OCR_UNSUPPORTED, ocrImages, ocrSupported } from '../components/ocr';
import { UnitBadge } from '../components/IngredientBadge';
import { RichText } from '../components/RichText';
import { apiPost } from '../api';
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
  const insets = useSafeAreaInsets();
  const { mutate, session } = useStore();
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
  // Extra grows when a photo brings prose with it — a source line, a method
  // with no heading — so it can no longer be read-only.
  const [extra, setExtra] = useState<string[]>([...strayTitle, ...parsed.extra]);
  // The free text that isn't recipe: kept by default, dropped on request —
  // the checkbox is the deliberate way to shed it (Sean's ask).
  const [includeNotes, setIncludeNotes] = useState(true);
  const [ingField, setIngField] = useState('');
  const [stepField, setStepField] = useState('');
  const [busy, setBusy] = useState('');
  // The URL field is folded away until asked for: pasting a link is the
  // occasional path, and a permanent text box above every recipe is clutter.
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlField, setUrlField] = useState('');
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

  // A subheader row ("For the béchamel:") wears no number; the steps count
  // past it, exactly as the saved body will number them.
  const stepNums: (number | null)[] = [];
  {
    let n = 0;
    for (const st of steps) stepNums.push(isSubheader(st) ? null : ++n);
  }

  // Reordering, by the marker each row already wears — the bullet and the
  // step number ARE the handles, so the rows gain no furniture for it. OCR
  // hands ingredients over in whatever order the camera found them, and a
  // method read off a photo often arrives out of sequence.
  // Delete lives behind a swipe here, as it does on every other list in the
  // app. A × on every row put a destructive control under the thumb of a
  // page whose rows are now also tappable to edit and draggable to reorder —
  // three things competing for one line. The swipe reveals it already armed.
  const swipe = useSwipeLeft();
  // Reordering moves the list under a parked × exactly as adding does.
  const ingDrag = useRowDrag(ingredients.length, (from, to) => { swipe.clear(); setIngredients((rows) => moveAt(rows, from, to)); });
  const stepDrag = useRowDrag(steps.length, (from, to) => { swipe.clear(); setSteps((rows) => moveAt(rows, from, to)); });

  // A parked delete belongs to the ROW that was swiped, but the swipe is
  // keyed by INDEX — `ing-2`, not an id, because these lines are plain
  // strings with no identity of their own. So anything that moves the list
  // under a parked × leaves it sitting on somebody else: swipe milk, add an
  // ingredient (they land at the TOP), press the × and FLOUR goes. Proven
  // 2026-08-12 before this was here.
  //
  // Dropping the swipe is the honest answer rather than trying to follow the
  // row: the × belongs to a gesture the list has just invalidated, and the
  // delete handlers already clear it for the same reason.
  const addIngredient = () => {
    swipe.clear();
    const t = parseIngredient(ingField);
    if (t) setIngredients([t, ...ingredients]); // new ones land at the TOP
    setIngField('');
  };
  const addStep = () => {
    swipe.clear();
    const t = stepField.trim();
    if (t) setSteps([...steps, t]); // steps number down the BOTTOM
    setStepField('');
  };

  /**
   * Import from a URL: the server fetches (a recipe site sends no CORS
   * headers, and a phone fetching arbitrary pages has the same SSRF problem
   * the server already solved), core parses the page's own schema.org data.
   *
   * Structured data beats OCR outright when a site publishes it — exact
   * ingredients, exact steps, no chatter to strip. Sean's rule holds for both
   * paths: ingredients and steps ONLY.
   */
  const importUrl = async () => {
    const url = urlField.trim();
    if (!url) return;
    setBusy('Reading that page…');
    try {
      if (!session) {
        setBusy('Sign in to import from a link.');
        setTimeout(() => setBusy(''), 4000);
        return;
      }
      const res = await apiPost<{ html?: string }>(session.serverUrl, { action: 'recipe_fetch', url }, session.token);
      const r = res.html ? recipeFromHtml(res.html) : null;
      if (!r) {
        // A page with no recipe in it is the common case for a wrong paste,
        // and saying so beats appearing to work and adding nothing.
        setBusy('No recipe found on that page.');
        setTimeout(() => setBusy(''), 5000);
        return;
      }
      setTitle((cur) => importedRecipeTitle(cur, r.title));
      if (r.ingredients.length) {
        // The BATCH is first-ordered (dry, wet, rest, unitless last — Sean's
        // rule for what an import creates); rows already on the page are a
        // person's order and stay exactly where they are.
        setIngredients((cur) => [...orderIngredients(r.ingredients), ...cur]);
        // An import can land while a LINE IS BEING EDITED, and `editing.at` is
        // an index into a list that has just grown at the front. Left alone,
        // the commit writes the correction into whichever row now sits at that
        // index — proven 2026-08-12: editing 'milk' while an import prepended
        // eggs and salt saved the correction OVER the salt and left the milk
        // untouched. Shifting the index keeps the edit on its own row and
        // keeps the typing, which cancelling it would throw away.
        //
        // Ingredients prepend, so every index moves; steps append, so theirs
        // do not.
        setEditing((e) => (e && e.list === 'ing' ? { ...e, at: e.at + r.ingredients.length } : e));
      }
      if (r.steps.length) setSteps((cur) => [...cur, ...r.steps]);
      setUrlField('');
      setUrlOpen(false);
      setBusy('');
    } catch (err) {
      setBusy(err instanceof Error ? err.message : 'could not read that page');
      setTimeout(() => setBusy(''), 5000);
    }
  };

  const importPhotos = async () => {
    // Asked before the picker opens. Offering the library, taking a selection
    // and only then admitting it cannot read any of it is the wrong order to
    // find out in.
    if (!ocrSupported()) {
      setBusy(OCR_UNSUPPORTED);
      setTimeout(() => setBusy(''), 5000);
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
      if (picked.canceled || picked.assets.length === 0) return;
      setBusy(`Reading 0/${picked.assets.length}…`);
      // A partial failure still carries the pages that DID read — take them
      // and say what was lost, rather than throwing the good ones away.
      let partial = '';
      const pages = await ocrImages(picked.assets.map((a) => a.uri), (d, t) => setBusy(`Reading ${d}/${t}…`))
        .catch((err: unknown) => {
          const carried = (err as { pages?: string[] })?.pages;
          if (carried?.length) {
            partial = err instanceof Error ? err.message : 'some photos could not be read';
            return carried;
          }
          throw err;
        });
      const r = recipeFromPages(pages);
      setTitle((cur) => importedRecipeTitle(cur, r.title));
      if (r.ingredients.length) {
        // Same first-ordering as the link import: the batch, never the page.
        setIngredients((cur) => [...orderIngredients(r.ingredients), ...cur]);
        // An import can land while a LINE IS BEING EDITED, and `editing.at` is
        // an index into a list that has just grown at the front. Left alone,
        // the commit writes the correction into whichever row now sits at that
        // index — proven 2026-08-12: editing 'milk' while an import prepended
        // eggs and salt saved the correction OVER the salt and left the milk
        // untouched. Shifting the index keeps the edit on its own row and
        // keeps the typing, which cancelling it would throw away.
        //
        // Ingredients prepend, so every index moves; steps append, so theirs
        // do not.
        setEditing((e) => (e && e.list === 'ing' ? { ...e, at: e.at + r.ingredients.length } : e));
      }
      if (r.steps.length) setSteps((cur) => [...cur, ...r.steps]);
      if (r.extra.length) setExtra((cur) => [...cur, ...r.extra]);
      // A photo it could not read used to end in silence: the spinner cleared,
      // nothing appeared, and there was no way to tell a blank result from a
      // slow one. Say so, and say what usually fixes it.
      if (!r.title && !r.ingredients.length && !r.steps.length && !r.extra.length) {
        setBusy('No text found in that photo — try a straighter, brighter shot.');
        setTimeout(() => setBusy(''), 5000);
        return;
      }
      if (partial) {
        // What DID read is already in the fields above; this says what did not.
        setBusy(partial);
        setTimeout(() => setBusy(''), 5000);
        return;
      }
      setBusy('');
    } catch (err) {
      setBusy(err instanceof Error ? err.message : 'could not read the photos');
      setTimeout(() => setBusy(''), 4000);
    }
  };

  const save = () => {
    const body = [recipeBody(ingredients, steps), includeNotes ? extra.join('\n') : ''].filter(Boolean).join('\n\n');
    // Save is the ONE place a note becomes a recipe. The marker shape alone
    // is not the test — Sean's hand-written notes carry it and stay plain
    // (isRecipeNote, 2026-08-19).
    mutate((e) => e.put({ ...note, payload: { ...note.payload, title: title || note.payload.title, body, recipe: true } }));
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <Scroll style={[s.page, { paddingTop: insets.top }]} contentContainerStyle={s.inner} scrollEnabled={ingDrag.dragIdx === null && stepDrag.dragIdx === null}>
        <View style={s.headRow}>
          {/* The one circle-chevron every back in the app wears now
              (2026-08-18) — this was a "← Note" text link, formatted like
              nothing else that goes back. */}
          <CircleBtn testID="recipe-back" glyph="‹" size={32} label="Back to the note" onPress={onClose} />
          <CircleBtn testID="recipe-link" glyph="🔗" label="Import from a link" size={32} onPress={() => setUrlOpen((v) => !v)} />
          <CircleBtn testID="recipe-photos" glyph="📷" label="Read a photo" size={32} onPress={() => void importPhotos()} />
        </View>
        <Text style={s.h1}>Recipe</Text>
        {urlOpen && (
          <View style={s.urlRow}>
            <Field
              testID="recipe-url"
              value={urlField}
              onChangeText={setUrlField}
              placeholder="Paste a recipe link"
              autoFocus
              style={s.urlField}
              onSubmitEditing={() => void importUrl()}
            />
            <Pressable testID="recipe-url-go" onPress={() => void importUrl()} style={s.urlGo}>
              <Text style={s.urlGoText}>Get</Text>
            </Pressable>
          </View>
        )}
        {busy !== '' && <Text style={s.busy}>{busy}</Text>}
        <Field testID="recipe-title" value={title} onChangeText={setTitle} placeholder="Title" style={s.title} />

        <View style={s.secHead}>
          <Text style={s.secName}>Ingredients</Text>
          <CircleBtn testID="ing-add" glyph="+" label="Add" color={T.accent} size={24} onPress={addIngredient} />
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
                    <WebHitSlop slop={6} />
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
                {(() => {
                  // A subheader is its own kind of row: bold, no badge —
                  // ending a typed line with ':' is what makes one.
                  if (isSubheader(ing)) return <RichText text={ing} style={[s.rowText, s.subhead]} />;
                  // The measure as a right-justified iconized badge — the
                  // treatment a parsed date gets on a reminder row, shared
                  // with the note's rendered body via UnitBadge so the two
                  // cannot drift apart. No quantity, no badge: 'a pinch of
                  // salt' has nothing to lift out.
                  const p = ingredientParts(ing);
                  return (
                    <View style={s.ingLine}>
                      <RichText text={p.name || ing} style={s.rowText} />
                      {p.qty && <UnitBadge qty={p.qty} unit={p.unit} />}
                    </View>
                  );
                })()}
              </Pressable>
            )}
            {swipe.swiped === `ing-${i}` && (
              <View style={s.swipePark}>
                <ConfirmDelete testID="ing-del" size={22} forceArmed onDelete={() => { swipe.clear(); setIngredients(ingredients.filter((_x, j) => j !== i)); }} />
              </View>
            )}
            </View>
          </View>
        ))}
        {ingDrag.slot === ingredients.length && <View style={s.dropLine} />}

        <View style={s.secHead}>
          <Text style={s.secName}>Instructions</Text>
          <CircleBtn testID="step-add" glyph="+" label="Add" color={T.accent} size={24} onPress={addStep} />
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
                    <WebHitSlop slop={6} />
              <Text style={s.stepNum}>{stepNums[i] === null ? '•' : `${stepNums[i]}.`}</Text>
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
                <RichText text={st} style={[s.rowText, isSubheader(st) && s.subhead]} />
              </Pressable>
            )}
            {swipe.swiped === `step-${i}` && (
              <View style={s.swipePark}>
                <ConfirmDelete testID="step-del" size={22} forceArmed onDelete={() => { swipe.clear(); setSteps(steps.filter((_x, j) => j !== i)); }} />
              </View>
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
            {/* Shown either way. Unticking used to HIDE these lines, which is
                the one moment you most need to see them: Save drops them, and
                on most of Sean's recipes the leftovers are the entire method —
                the cards write it as prose with no heading, so it lands here
                rather than in the steps. Hiding what you are about to lose
                makes the cost unjudgeable. */}
            {!includeNotes && (
              <Text testID="recipe-dropping" style={s.dropWarn}>
                {extra.length === 1 ? 'This line will not be saved:' : `These ${extra.length} lines will not be saved:`}
              </Text>
            )}
            {extra.map((x, i) => (
              <Text key={i} style={[s.extraLine, !includeNotes && s.extraDropped]}>{x}</Text>
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
            Drag a bullet or a step number to reorder · tap a line to fix it · swipe it left to delete ·
            end a line with &quot;:&quot; for a heading like &quot;For the sauce:&quot;
          </Text>
        )}

        <View style={s.footRow}>
          <Pill label="Cancel" onPress={onClose} />
          <Pill testID="recipe-save" label="Save" primary onPress={save} />
        </View>
      </Scroll>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  inner: { padding: 20, paddingBottom: 60, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urlField: { flex: 1 },
  urlGo: { backgroundColor: T.surface2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  urlGoText: { color: T.text, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: T.text, fontSize: 26, fontWeight: '800' },
  busy: { color: T.dim, fontSize: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.lineSoft },
  // The parked swipe-delete floats over the row's right edge, out of the
  // flex flow — as a flex child it squeezed the line sideways the moment the
  // × parked ("things shift with slide to delete" — Sean, 2026-08-20).
  swipePark: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 10, backgroundColor: T.bg,
  },
  dot: { color: T.dim, fontSize: 15 },
  stepNum: { color: T.gold, fontSize: 14, fontWeight: '700', width: 22, textAlign: 'right' },
  rowText: { color: T.text, fontSize: 15, flexShrink: 1 },
  subhead: { fontWeight: '700', marginTop: 2 },
  // No gap: the badge carries its own 8pt marginLeft so the spacing is the
  // same here as in the note's rendered body, which has no gap to give it.
  ingLine: { flexDirection: 'row', alignItems: 'center' },
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
  dropWarn: { color: T.gold, fontSize: 12, marginTop: 4 },
  extraDropped: { textDecorationLine: 'line-through', opacity: 0.55 },
  extraLine: { color: T.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: T.muted, fontSize: 12, lineHeight: 17, marginTop: 14 },
  footRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
}));
