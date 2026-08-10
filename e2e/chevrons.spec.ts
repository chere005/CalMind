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
  for (const file of screens()) {
    if (rel(file) === 'components/Chevron.tsx') continue; // where the size is decided
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<Chevron\b[^/>]*\/>/g)) {
      if (/\bsize=/.test(m[0])) sized.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
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
  const wrongAll: string[] = [];
  const wrongRow: string[] = [];
  for (const file of screens()) {
    if (rel(file) === 'components/Chevron.tsx') continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/<Chevron\b[^/>]*\/>/g)) {
      const isAll = /allCollapsed/.test(m[0]);
      const isDouble = /\bdouble\b/.test(m[0]);
      if (isAll && !isDouble) wrongAll.push(`${rel(file)}: ${m[0].trim()}`);
      if (!isAll && isDouble) wrongRow.push(`${rel(file)}: ${m[0].trim()}`);
    }
  }
  expect(wrongAll, 'a collapse-all drawn as a single chevron is the Back button again').toEqual([]);
  expect(wrongRow, 'a row fold is one section, not all of them').toEqual([]);
});

test('the collapse-all button is one box, not one per screen', () => {
  // The chevron INSIDE it was already shared; the box around it was not.
  // Notes drew 24, Reminders 26 and Habits a 30pt CircleBtn — the same
  // control at three sizes, which is what Sean reported. Nothing above
  // compares the boxes, so nothing caught it.
  const boxes = new Map<string, string[]>();
  for (const file of screens()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*collapseAllBtn:\s*(\{.*\}),?\s*$/gm)) {
      const shape = m[1]!.replace(/\s+/g, ' ').trim();
      boxes.set(shape, [...(boxes.get(shape) ?? []), rel(file)]);
    }
  }
  expect(boxes.size, `collapse-all is drawn ${boxes.size} different ways: ${[...boxes.keys()].join(' | ')}`).toBe(1);
  // And it must be a real target on the web, where hitSlop does nothing.
  const size = Number(/width:\s*(\d+)/.exec([...boxes.keys()][0] ?? '')?.[1] ?? 0);
  expect(size, 'the collapse-all circle IS the tap target — the chevron in it is decoration').toBeGreaterThanOrEqual(26);
});
