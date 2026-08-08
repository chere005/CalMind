/**
 * The gesture suite — TESTING.md's by-eye column, given teeth. Real mouse
 * events against the exported app + real API on a scratch dir. Every spec
 * signs up its own account, so state never leaks between them.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `e2e${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('signing up lands on the calendar, like the suite', async ({ page }) => {
  await signup(page);
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  await expect(page.getByText(month)).toBeVisible();
});

test('a reminder adds into its section and a tick completes it', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('buy milk');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'buy milk' });
  await expect(row).toBeVisible();
  await row.getByTestId('tick').click();
  // Completed rows hide until the ☑ toggle shows them.
  await expect(row).toBeHidden();
});

test('the folder manager reorders with a REAL drag, and it survives a reload', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  const rows = page.getByTestId('mgr-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Reminders');

  const grip = page.getByTestId('grip').first();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (i * 56) / 8);
  }
  await page.mouse.up();
  await expect(rows.first()).toContainText('Calendar');

  // The order is a synced record, not screen state — a fresh load agrees.
  // (A reload lands on the Calendar, as signing in does.)
  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await expect(page.getByTestId('mgr-row').first()).toContainText('Calendar', { timeout: 10_000 });
});

test('deleting takes two presses, never one', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Doomed');
  await page.getByPlaceholder('New folder').press('Enter');
  const doomed = page.getByTestId('mgr-row').filter({ hasText: 'Doomed' });
  await expect(doomed).toBeVisible();
  await doomed.getByTestId('mgr-del').click();
  await expect(doomed).toBeVisible(); // armed, not deleted
  await doomed.getByTestId('mgr-del').click();
  await expect(doomed).toBeHidden();
});

test('a long-press opens the inline edit', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('hold me');
  await page.getByTestId('rem-add-field').press('Enter');
  const body = page.getByTestId('rem-body').filter({ hasText: 'hold me' });
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit')).toHaveValue('hold me');
});

test('a reminder row drags to a new spot and the order survives a reload', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  for (const name of ['alpha', 'beta']) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('rem-add-field').fill(name);
    await page.getByTestId('rem-add-field').press('Enter');
  }
  // New rows prepend: the list reads beta, alpha. Drag beta below alpha.
  const rows = page.getByTestId('rem-row');
  await expect(rows.first()).toContainText('beta');
  const grip = rows.first().getByTestId('row-grip');
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (i * 46) / 8);
  }
  await page.mouse.up();
  await expect(rows.first()).toContainText('alpha');

  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').first()).toContainText('alpha', { timeout: 10_000 });
});
