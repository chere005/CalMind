import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One collapse control, drawn one way, everywhere.
 *
 * There were three treatments for the same action: a drawn chevron at 15 for
 * folders and 14 for sections in Reminders and Notes, a 12pt '▸/▾' in the
 * calendar's day panel, and a 14pt '›/⌄' in Habits. Sean saw it immediately —
 * the same control, a different size and shape on each page. Four screens
 * grew their own copy because nothing said they could not.
 *
 * So this reads the SOURCE rather than the DOM. Most of these controls sit
 * behind a folder, a section, a partner or an edit mode, and a spec that
 * drove to each one would be a tour of the app rather than a check. The rule
 * is simple enough to state: collapse is `<Chevron/>`, at the size Chevron
 * itself decides.
 */
const SRC = join(__dirname, '..', 'apps', 'app', 'src');

function screens(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) screens(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (f: string) => f.split('/src/')[1]!;

test('every collapse is the same chevron, at the one size', () => {
  const sized: string[] = [];
  let seen = 0;
  for (const file of screens()) {
    if (rel(file) === 'components/Chevron.tsx') continue; // where the size is decided
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<Chevron\b[^/>]*\/>/g)) {
      seen++;
      if (/\bsize=/.test(m[0])) sized.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
  // The alphabet first: if `<Chevron …/>` stops matching, this passes having
  // looked at nothing. 17 usages when the floor was written.
  expect(seen, 'the scan found chevrons at all — without this it can pass on nothing').toBeGreaterThan(8);
  expect(
    sized,
    'a screen picking its own chevron size is how the four copies drifted apart',
  ).toEqual([]);
});

test('no screen draws a collapse with a text glyph', () => {
  // The glyphs that mean open/closed. '›' alone is excluded: at the end of a
  // note row it means "open this", not "collapse this", and that one is
  // deliberately still a text arrow.
  //
  // '⌃' and '⌄' are here because of a miss: this list ran green while Habits
  // drew its collapse-all as a text '⌃' in a CircleBtn, because the list only
  // knew the glyphs the FIRST four offenders happened to use. A check is only
  // as wide as its alphabet, and Sean found the one it did not know before it
  // did. Anything that points up or down belongs here now.
  const OPEN_CLOSED = /['"](?:▾|▸|⌄|⌃|▼|►|▲|◄|∨|∧|˅|˄)['"]/;
  const offenders: string[] = [];
  for (const file of screens()) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      // COMMENTS are prose, not glyphs on a screen. Naming the banned glyph
      // while explaining why it is banned turned this check red against the
      // very code that fixed it — a check that cannot tell code from the
      // comment above it costs more than it catches.
      const code = line.replace(/^\s*(?:\/\/|\*|\/\*).*$/, '');
      if (OPEN_CLOSED.test(code)) offenders.push(`${rel(file)}:${i + 1} ${line.trim().slice(0, 70)}`);
    });
  }
  expect(
    offenders,
    'collapse is a drawn chevron everywhere; a text glyph renders cramped and at its own size',
  ).toEqual([]);
});

test('the fold-all gesture lives on the caret, not on a button', () => {
  // The collapse-all button is gone (Sean, 2026-09-16): folding a level is a
  // long press on any caret at it. Two things follow, and both are easy to
  // undo by accident.
  const ui = readFileSync(join(SRC, 'ui.tsx'), 'utf8');
  expect(/export function FoldCaret\b/.test(ui), 'the caret is one component, in ui.tsx').toBe(true);
  expect(/onLongPress/.test(ui), 'FoldCaret carries the hold').toBe(true);
  expect(
    /delayLongPress=\{LONG_PRESS_MS\}/.test(ui),
    "the threshold comes from core, so no two holds in the app want different lengths of patience",
  ).toBe(true);
  expect(/CollapseAllBtn/.test(ui), 'the collapse-all button is gone from ui.tsx').toBe(false);

  // Nothing draws the DOUBLE chevron any more. It existed to tell "all of
  // them" from "this one" while both were buttons in the same bar; with the
  // button gone the prop went with it, and a screen reintroducing one would
  // be rebuilding the control the gesture replaced.
  const doubles: string[] = [];
  for (const file of screens()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<Chevron\b[^/>]*\/>/g)) {
      if (/\bdouble\b/.test(m[0])) doubles.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
  expect(doubles, 'the all-at-once control is a gesture now; it has no glyph of its own').toEqual([]);
  expect(
    /double/.test(readFileSync(join(SRC, 'components', 'Chevron.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    'and the prop itself is gone from Chevron, not just unused',
  ).toBe(false);

  // No screen decides the DIRECTION for itself: that is core's foldLevel.
  // A screen computing `every(isFolded)` is the old button's logic growing
  // back, and it is wrong in the half-folded case core's test pins.
  const strays: string[] = [];
  for (const file of screens()) {
    const code = readFileSync(file, 'utf8');
    if (/allCollapsed/.test(code)) strays.push(`${rel(file)}: allCollapsed`);
  }
  expect(strays, 'the hold reads its direction from the caret; a screen recomputing it is the old shape').toEqual([]);
});

test('every caret box is the same target, and only one file declares it', () => {
  // The chevron INSIDE was already shared; the box around it was not. Notes
  // drew 24, Reminders 26 and Habits a 30pt CircleBtn — the same control at
  // three sizes, which is what Sean reported. Nothing compared the boxes, so
  // nothing caught it.
  //
  // hitSlop is a no-op under react-native-web, so the BOX is the tap target:
  // a screen shrinking its own to fit the 7pt glyph shrinks the target with
  // it, on the one platform Sean actually holds in Safari.
  const boxes: string[] = [];
  for (const file of [...screens()]) {
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*chevWrap:\s*\{[^}]*\}/gm)) {
      boxes.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
  expect(boxes.length, 'the caret box is declared somewhere — without this the scan passes on nothing')
    .toBeGreaterThan(0);
  const wrong = boxes.filter((b) => !(/width:\s*20\b/.test(b) && /height:\s*20\b/.test(b)));
  expect(wrong, 'every caret box is 20 square; hitSlop does nothing on the web, so the box IS the target')
    .toEqual([]);
});
