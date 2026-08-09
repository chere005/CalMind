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
  const OPEN_CLOSED = /['"](?:▾|▸|⌄|▼|►)['"]/;
  const offenders: string[] = [];
  for (const file of screens()) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (OPEN_CLOSED.test(line)) offenders.push(`${rel(file)}:${i + 1} ${line.trim().slice(0, 70)}`);
    });
  }
  expect(
    offenders,
    'collapse is a drawn chevron everywhere; a text glyph renders cramped and at its own size',
  ).toEqual([]);
});
