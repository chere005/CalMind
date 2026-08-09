import { expect, test } from '@playwright/test';

/**
 * The day panel's + Add, pressed twice.
 *
 * The Add TAB's Done was guarded after a real flake. This is a different save
 * path entirely — ItemModal, reached from the calendar's + Add and from the
 * pencil on a row — and it mints a fresh id every call with nothing to stop a
 * second one. Same shape, busier route.
 */
test('a double-tapped Save on the day panel files one event, not two', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `mt${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('book the table');

  // Two presses with no await between. The spare carries its own short
  // timeout: once the modal closes, a click on a gone control waits out the
  // whole test budget rather than failing fast.
  const save = page.getByText('Save', { exact: true });
  await Promise.all([save.click(), save.click({ timeout: 1_500 }).catch(() => {})]);
  await page.waitForTimeout(1_000);

  await expect(
    page.getByText('book the table', { exact: true }),
    'one press, one event',
  ).toHaveCount(1);
});

test('the guard does not stop you adding the same thing twice on purpose', async ({ page }) => {
  // Two "coffee" events on one day is an ordinary thing to want; a guard that
  // refused would be its own bug.
  test.setTimeout(90_000);
  const user = `mt${String(Date.now()).slice(-6)}b`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-calendar').click();

  for (let i = 0; i < 2; i++) {
    await page.getByText('+ Add', { exact: true }).click();
    await page.getByTestId('kind-event').click();
    await page.getByPlaceholder(/What\?/).fill('coffee');
    await page.getByText('Save', { exact: true }).click();
    await page.waitForTimeout(1_700);
  }
  await expect(page.getByText('coffee', { exact: true })).toHaveCount(2);
});
