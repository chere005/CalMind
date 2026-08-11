import { expect, test, type Page } from '@playwright/test';

/**
 * Adding and editing a habit on its own small screen, with a Frequency.
 *
 * Sean, 2026-08-11: "adding a habit should go to a small screen with Name and
 * Frequency", and holding one no longer types over its name — it "displays
 * pencil edit icons next to the delete icons which goes to this new edit
 * habit screen".
 *
 * What the RULE does with a frequency is core's, and habit.test.ts covers it
 * against a fixed week rather than against whatever day this runs on. What
 * only a browser can answer is here: that the screen exists, that it saves,
 * that the value comes back when you reopen it, and that holding a habit
 * shows a pencil instead of a text field.
 */
async function signup(page: Page): Promise<string> {
  const user = `hab${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-habits').click();
  await expect(page.getByText('Habits', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  return user;
}

/** The section "+" — named for the seeded section so this does not depend on order. */
async function addHabit(page: Page, name: string, freq: 'always' | 'weekdays' | 'never') {
  await page.getByTestId(/^habit-add-/).first().click();
  await expect(page.getByTestId('habit-name-field')).toBeVisible();
  await page.getByTestId('habit-name-field').fill(name);
  await page.getByTestId(`habit-freq-${freq}`).click();
  await page.getByTestId('habit-save').click();
  await expect(page.getByTestId('habit-name-field')).toHaveCount(0);
}

test('a habit is added on its own screen, with a frequency that sticks', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);

  // The "+" opens the screen rather than an inline field — the inline row had
  // nowhere to put a second question.
  await page.getByTestId(/^habit-add-/).first().click();
  await expect(page.getByText('New habit'), 'the + opens the small screen').toBeVisible();
  await expect(page.getByTestId('habit-freq-always')).toBeVisible();
  await expect(page.getByTestId('habit-freq-weekdays')).toBeVisible();
  await expect(page.getByTestId('habit-freq-never')).toBeVisible();
  await page.getByTestId('habit-name-field').fill('Stretch');
  await page.getByTestId('habit-freq-weekdays').click();
  await page.getByTestId('habit-save').click();

  await expect(page.getByText('Stretch')).toBeVisible();

  // Reopening it must show what was saved, or the field is decorative.
  // Enter edit mode the way Sean does: hold the habit.
  await page.getByText('Stretch').hover();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();

  await expect(
    page.getByTestId('habit-edit').first(),
    'holding a habit shows a pencil, and does NOT start typing over the name',
  ).toBeVisible();
  await expect(
    page.getByTestId('habit-name').first(),
    'the name is still a label — holding it does not turn it into a text field',
  ).toBeVisible();

  await page.getByTestId('habit-edit').first().click();
  await expect(page.getByText('Edit habit')).toBeVisible();
  await expect(
    page.getByTestId('habit-freq-weekdays'),
    'the frequency it was saved with is the one selected',
  ).toHaveAttribute('aria-checked', 'true');
  // …and the others are not, or "selected" would mean nothing.
  await expect(page.getByTestId('habit-freq-always')).toHaveAttribute('aria-checked', 'false');
});

test('a weekdays habit has no tick cell on a weekend column', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await addHabit(page, 'Desk work', 'weekdays');

  // The week grid is a rolling window ending tomorrow, so which columns are
  // weekends depends on the day this runs. Derived here the same way the
  // screen derives it, rather than hardcoded — a literal date would pass
  // today and fail on Thursday for no reason.
  const cols = 5; // the phone width set above
  const weekendCols = await page.evaluate((n) => {
    const now = new Date();
    let count = 0;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 - i);
      if (d.getDay() === 0 || d.getDay() === 6) count++;
    }
    return count;
  }, cols);

  const off = await page.getByTestId('habit-cell-off').count();
  expect(
    off,
    `a weekdays habit is out of the list on every weekend column in view (${weekendCols} of ${cols})`,
  ).toBe(weekendCols);

  // And the check must be capable of failing: an every-day habit has none.
  await addHabit(page, 'Water', 'always');
  const offAfter = await page.getByTestId('habit-cell-off').count();
  expect(offAfter, 'the always habit adds no blank cells').toBe(weekendCols);
});
