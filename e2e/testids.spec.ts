import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every testID a spec reaches for must exist in the app.
 *
 * A misspelled testID is not a failing test — it is a PASSING one, whenever
 * the assertion is about absence. `expect(getByTestId('recipe-svae'))
 * .toHaveCount(0)` is true forever, and so is every `not.toBeVisible` built on
 * a name nothing renders. There are a dozen such assertions in this suite and
 * they are exactly the ones guarding behaviour that is hard to check any other
 * way, so a typo would quietly retire the guard rather than announce itself.
 *
 * Three checks tonight turned out to be green for the wrong reason — a grep
 * for the empty string, a browser test that could not see signature
 * verification switched off, and a spec reading an encrypted file as JSON.
 * This one closes that door for a whole category instead of one instance.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no spec reaches for a testID the app never renders', () => {
  const root = join(__dirname, '..');
  // The head patch renders one testID of its own — the error reporter, which
  // has to be plain inline HTML so it is listening before the bundle runs and
  // survives whatever the bundle does. It is app-rendered markup like any
  // other, just not written in TSX, so its source belongs in this sweep
  // rather than in an exception list.
  const appSrc = walk(join(root, 'apps', 'app', 'src'))
    .concat([join(root, 'apps', 'app', 'App.tsx'), join(root, 'tools', 'patch-web-html.mjs')])
    .map((f) => {
      try { return readFileSync(f, 'utf8'); } catch { return ''; }
    })
    .join('\n');

  // Names written out in full…
  const literals = new Set<string>();
  for (const m of appSrc.matchAll(/testID=(?:"([^"]+)"|\{\s*['"]([^'"]+)['"]\s*\})/g)) {
    literals.add((m[1] ?? m[2])!);
  }
  for (const m of appSrc.matchAll(/testID=\{?\s*`([^`]*)`/g)) {
    if (!m[1]!.includes('${')) literals.add(m[1]!);
  }
  // …and names chosen by an expression — `testID={off ? 'habit-cell-off' :
  // undefined}`, which is how a cell that only SOMETIMES wants a name says so.
  // Every quoted literal inside the braces is a name the app can render, so
  // they all count. This does not soften the check: a spec asking for a name
  // that appears nowhere in the source is still an orphan, which is the typo
  // this guard exists to catch.
  for (const m of appSrc.matchAll(/testID=\{([^}]*)\}/g)) {
    for (const lit of m[1]!.matchAll(/['"]([^'"]+)['"]/g)) literals.add(lit[1]!);
  }
  // …and the plain-DOM spelling, which the head patch uses because it is
  // inline script rather than TSX. Same thing to a spec, written differently.
  for (const m of appSrc.matchAll(/setAttribute\(\s*['"]data-testid['"]\s*,\s*['"]([^'"]+)['"]/g)) {
    literals.add(m[1]!);
  }
  // …and names built from a template, which contribute a prefix instead.
  const prefixes: string[] = [];
  for (const m of appSrc.matchAll(/testID=\{\s*`([^`$]*)\$\{/g)) {
    if (m[1]) prefixes.push(m[1]);
  }
  // A testID passed down as a prop is named by its caller, so a component that
  // merely forwards `testID={testID}` teaches us nothing — hence the callers
  // above are what count. Anything a spec uses that matches neither is a typo.
  expect(literals.size, 'the app source was actually read').toBeGreaterThan(20);

  // This file's own doc comment names a deliberately misspelled id to explain
  // the failure mode, and the scan is happy to find it — which is a fair
  // demonstration that the check works, and a reason to exclude the file.
  const self = 'testids.spec.ts';
  const specs = readdirSync(__dirname).filter((f) => f.endsWith('.spec.ts') && f !== self);
  const used = new Map<string, string>();
  for (const f of specs) {
    const text = readFileSync(join(__dirname, f), 'utf8');
    for (const m of text.matchAll(/getByTestId\(\s*(?:['"]([^'"]+)['"]|`([^`$]+)`)/g)) {
      used.set((m[1] ?? m[2])!, f);
    }
  }
  expect(used.size, 'the specs were actually read').toBeGreaterThan(20);

  const orphans = [...used]
    .filter(([id]) => !literals.has(id) && !prefixes.some((p) => id.startsWith(p)))
    .map(([id, f]) => `${id}  (${f})`);
  expect(orphans, 'a testID no component renders — an absence assertion on it can never fail').toEqual([]);
});

test('the repeat-unit list is defined once, in core', () => {
  // Same failure mode as an orphaned testID, one layer down: a hand-written
  // ['day','week','month','year'] with `as RepeatUnit[]` after it compiles
  // whatever the type says, because the cast is precisely where the compiler
  // stops checking. Three such copies existed — ItemModal, Reminders' inline
  // editor, and Add — so a unit added to RepeatUnit would have reached none of
  // the three screens that let you pick one.
  //
  // The list lives in core as REPEAT_UNITS. This fails if a copy comes back.
  const root = join(__dirname, '..');
  const files = walk(join(root, 'apps', 'app', 'src'));
  const dupes: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (/\[\s*['"]day['"]\s*,\s*['"]week['"]\s*,\s*['"]month['"]\s*,\s*['"]year['"]\s*\]/.test(text)) {
      dupes.push(f.slice(root.length + 1));
    }
  }
  expect(dupes, 'a copy of core REPEAT_UNITS — import the constant instead').toEqual([]);

  // …and the scan must actually be looking at the screens in question, or the
  // assertion above is an absence check over an empty set.
  expect(files.some((f) => f.endsWith('ItemModal.tsx')), 'the sweep reached ItemModal').toBe(true);
  expect(files.some((f) => f.endsWith('Add.tsx')), 'the sweep reached Add').toBe(true);
  expect(files.some((f) => f.endsWith('Reminders.tsx')), 'the sweep reached Reminders').toBe(true);
});
