/**
 * The habits picker is the folder picker's twin, and two of its gestures were
 * missing.
 *
 * `SectionPick`'s own header calls it "the folder picker's shape over habit
 * sections… exactly the suite's filter dropdown". It was not. The reference
 * suite carries three actions for this menu — `msec_vis`, `msec_only`,
 * `msec_all` — and CalMind's folder picker implements all three shapes for
 * folders. The habits one had only the first:
 *
 *   · pressing a section's NAME should show only that section (`msec_only`).
 *     The name was a plain Text, so nothing happened.
 *   · the All box should TOGGLE — "'All' turns everything on, or when it
 *     already is, off" (`msec_all`, `$hidden = $show ? [] : $all`). CalMind
 *     cleared `hidden` unconditionally, so there was no way to turn the whole
 *     board off, and no box to show the state either way.
 *
 * Found 2026-08-12 by listing the suite's POST actions and checking each
 * against CalMind rather than by reading either — the same sweep that turned
 * up `clear_done`. The docstring claiming parity is exactly why reading would
 * not have found it.
 *
 * Both are checked against the SECTION LIST rather than against the menu's own
 * ticks: a box can be drawn ticked while the pref behind it says otherwise,
 * and the grid is what Sean actually looks at.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `hp${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

/** A second section, so "only" and "all" can differ at all. With one section
 *  every one of these assertions passes whatever the code does. */
async function addSection(page: Page, name: string) {
  // The route habitsections.spec.ts already uses: Enter in the field, and
  // Done to close. The Add control is a CircleBtn carrying an accessibility
  // label rather than text, so getByText('Add') waits out the whole budget.
  await page.getByTestId('pick-habits').click();
  await page.getByText('Manage sections…').click();
  await page.getByPlaceholder('New section').fill(name);
  await page.getByPlaceholder('New section').press('Enter');
  await page.getByText('Done', { exact: true }).click();
}

const sectionHeads = (page: Page) =>
  page.locator('[data-testid^="hsec-name-"]').evaluateAll((els) =>
    els.map((e) => (e.textContent ?? '').trim()).filter(Boolean),
  );

test('pressing a section name shows only that section', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await addSection(page, 'Evening');

  expect(await sectionHeads(page), 'both sections are on the grid to begin with')
    .toEqual(expect.arrayContaining(['Habits', 'Evening']));

  await page.getByTestId('pick-habits').click();
  await page.getByTestId('msec-only-Evening').click();

  await expect.poll(() => sectionHeads(page), {
    message: 'pressing the name leaves only that section on the grid',
  }).toEqual(['Evening']);
});

test('the All box turns everything off, then on again', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await addSection(page, 'Evening');

  // Everything is on, so the box is ticked and pressing it clears the board.
  await page.getByTestId('pick-habits').click();
  await page.getByTestId('msec-all-box').click();
  await expect.poll(() => sectionHeads(page), {
    message: 'All, pressed while already on, turns every section off',
  }).toEqual([]);

  // …and pressing it again brings them back. Without this the test would pass
  // just as well if the box only ever hid things.
  await page.getByTestId('msec-all-box').click();
  await expect.poll(() => sectionHeads(page), {
    message: 'pressing it again turns them all back on',
  }).toEqual(expect.arrayContaining(['Habits', 'Evening']));
});
