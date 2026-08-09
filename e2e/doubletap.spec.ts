import { expect, test, type Page } from '@playwright/test';

/**
 * The same button, twice, fast.
 *
 * A thumb double-taps constantly — on a slow page, on a bus, by accident.
 * Every spec clicks each control exactly once, so nothing has ever checked
 * that a second press inside a few milliseconds doesn't file a second copy.
 * The guards that would prevent it are incidental (a field clearing itself,
 * a screen navigating away) rather than deliberate, which is exactly the
 * shape of thing that works until it doesn't.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `dt${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a double-tapped Done files one reminder, not two', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByPlaceholder(/Dentist/).fill('call the vet');
  // Two presses as fast as the harness can manage — no awaiting between.
  const done = page.getByText('Done', { exact: true });
  await Promise.all([done.click(), done.click().catch(() => {})]);
  await page.waitForTimeout(1_000);

  await page.getByTestId('tab-reminders').click();
  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'call the vet' }),
    'one press, one reminder',
  ).toHaveCount(1);
});

test('a double-tapped section add makes one section, not two', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').first().click();
  const field = page.getByPlaceholder('New section');
  await field.fill('Chores');
  // Enter AND blur both commit — the pair that already caught Notes out once,
  // which is why addNote carries a committed-flag. This is the same shape.
  await field.press('Enter');
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('secadd-Chores'), 'one section, not two').toHaveCount(1);
});

test('a ticked row leaves at once, so there is nothing left to double-tap', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('buy milk');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'buy milk' });
  const tick = row.getByTestId('tick');
  // A toggle is the classic double-tap casualty: two fast taps put it back
  // where it started and the row sits there apparently ignoring you. It can't
  // happen here, and this says WHY rather than claiming a double-tap was
  // tested — the row hides on the first tick, so the second tap has nothing
  // under it. If completed rows ever stay visible, this is the guard that
  // quietly stops being one.
  await tick.click();
  await expect(row, 'a completed row hides immediately').toBeHidden();
});
