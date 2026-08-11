import { expect, test } from '@playwright/test';

/**
 * Icon-only controls say what they are.
 *
 * The suite gives every one of them an aria-label — "Back", "Completed",
 * "Add subtask", "Make it a task again". This app had none at all, so the
 * whole bottom bar and the top-left back read to a screen reader as unlabelled
 * buttons, and a glyph like "‹" read aloud is no use to anybody.
 *
 * accessibilityLabel becomes aria-label under react-native-web, so this is
 * checkable in the same run as everything else.
 */
test('the tab bar and the back control are named, not just drawn', async ({ page }) => {
  test.setTimeout(60_000);
  const user = `lbl${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  for (const [tab, name] of Object.entries({
    reminders: 'Reminders', calendar: 'Calendar', add: 'Add', notes: 'Notes', habits: 'Habits',
  })) {
    await expect(
      page.getByTestId(`tab-${tab}`),
      `the ${tab} tab says its name`,
    ).toHaveAttribute('aria-label', name);
  }

  await expect(page.getByTestId('nav-back')).toHaveAttribute('aria-label', 'Back');
});

test('every icon-only button on a screen carries a name', () => {
  // Read from source rather than the DOM: most of these live behind edit mode,
  // a modal or a partner, and a spec that drove to each one would be a tour of
  // the app rather than a check. CircleBtn is THE icon button — if one is
  // built without a label, a screen reader gets a glyph or nothing.
  const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.tsx')) out.push(p);
    }
    return out;
  };
  const bare: string[] = [];
  let seen = 0;
  for (const file of walk(join(__dirname, '..', 'apps', 'app', 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<CircleBtn\b[\s\S]*?\/>/g)) {
      seen++;
      if (!m[0].includes('label=')) {
        bare.push(`${file.split('/src/')[1]}: ${/glyph="([^"]*)"/.exec(m[0])?.[1] ?? '?'}`);
      }
    }
  }
  // THE ALPHABET, checked before the answer. This walks the source for
  // `<CircleBtn …/>` and collects the ones with no label; if that pattern ever
  // stops matching — the component renamed, or wrapped in something else —
  // the loop finds nothing, `bare` is empty, and this passes having examined
  // no buttons at all. There were 53 usages when this floor was written, so
  // half of that is a wide margin for ordinary churn and still catches the
  // pattern going dead.
  expect(seen, 'the scan actually found icon buttons — without this it can pass on nothing').toBeGreaterThan(25);
  expect(bare, 'an icon button with no name reads as nothing at all').toEqual([]);
});
