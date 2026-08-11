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

test('collapse-ALL is the double chevron, and row folds are not', () => {
  // Folded, a single chevron in a 26pt bordered circle read as the nav Back
  // button in its 28pt bordered circle — Sean's report. The double form is
  // what tells "all of them" from "this one", so it has to be exactly on the
  // collapse-alls and nowhere else.
  //
  // The collapse-all now lives in ui.tsx's CollapseAllBtn rather than being
  // rebuilt on each screen, so the double chevron belongs THERE and a screen
  // drawing one is a screen hand-rolling the control again.
  const wrongAll: string[] = [];
  const wrongRow: string[] = [];
  for (const file of screens()) {
    if (rel(file) === 'components/Chevron.tsx') continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/<Chevron\b[^/>]*\/>/g)) {
      const isDouble = /\bdouble\b/.test(m[0]);
      // Only the shared button may draw the double form.
      if (isDouble && rel(file) !== 'ui.tsx') wrongAll.push(`${rel(file)}: ${m[0].trim()}`);
      // A screen still deciding "all of them" for itself is the old shape.
      if (/allCollapsed/.test(m[0])) wrongRow.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
  expect(wrongAll, 'the collapse-all is CollapseAllBtn in ui.tsx; a screen drawing its own is how the four copies started').toEqual([]);
  expect(wrongRow, 'a row fold is one section, not all of them').toEqual([]);

  // The shared button really is the double one — without this, deleting
  // `double` from ui.tsx would satisfy every "nobody else draws it" rule
  // above and quietly turn the collapse-all back into the Back button.
  const ui = readFileSync(join(SRC, 'ui.tsx'), 'utf8');
  const shared = /<Chevron\b[^/>]*\/>/.exec(ui)?.[0] ?? '';
  expect(shared, 'CollapseAllBtn draws a chevron').not.toBe('');
  expect(/\bdouble\b/.test(shared), `the shared collapse-all is the double chevron, got ${shared}`).toBe(true);
});

test('the collapse-all button is one box, not one per screen', () => {
  // The chevron INSIDE it was already shared; the box around it was not.
  // Notes drew 24, Reminders 26 and Habits a 30pt CircleBtn — the same
  // control at three sizes, which is what Sean reported. Nothing above
  // compared the boxes, so nothing caught it; then the box and the rest of
  // the top bar drifted apart too (back 28, collapse-all 26, ring 32, pill
  // 28) and Sean saw a ragged row.
  //
  // Both are now one thing: the button is a component and its box is
  // TOPBAR_CTRL, the height every control in the bar shares. So the check is
  // that no screen has grown a private one back.
  const strays: string[] = [];
  for (const file of screens()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*collapseAllBtn:\s*\{.*$/gm)) {
      strays.push(`${rel(file)}: ${m[0].trim().slice(0, 60)}`);
    }
  }
  expect(strays, 'the collapse-all box lives in ui.tsx as topbarCircle; a screen with its own is the drift starting again').toEqual([]);

  // And it must be a real target on the web, where hitSlop does nothing.
  const ui = readFileSync(join(SRC, 'ui.tsx'), 'utf8');
  const ctrl = Number(/export const TOPBAR_CTRL = (\d+)/.exec(ui)?.[1] ?? 0);
  expect(ctrl, 'the collapse-all circle IS the tap target — the chevron in it is decoration').toBeGreaterThanOrEqual(26);
  const box = /topbarCircle:\s*\{[^}]*\}/.exec(ui)?.[0] ?? '';
  expect(box, 'the shared top-bar circle exists').not.toBe('');
  expect(/width:\s*TOPBAR_CTRL/.test(box) && /height:\s*TOPBAR_CTRL/.test(box),
    `the shared circle is sized by TOPBAR_CTRL, not a literal: ${box}`).toBe(true);
});
