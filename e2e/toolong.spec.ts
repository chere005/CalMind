import { expect, test } from '@playwright/test';

/**
 * A note too long to save.
 *
 * The server has always refused payloads over 64KB. What it used to do is the
 * problem: it dropped the row, answered ok with a fresh cursor, and the client
 * cleared the record from its dirty set — so the note existed on exactly one
 * device while the app showed "Online — synced". That is the worst shape a
 * sync failure can take, because nothing anywhere is wrong until the device is.
 *
 * 64KB is about ten thousand words. Rare, not impossible.
 */
test('an over-long note says so instead of quietly living on one device', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `big${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('War and Peace');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('x'.repeat(70_000));
  await page.getByText('← All notes').click();
  await page.waitForTimeout(3_000);

  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(
    page.getByText(/too long to save/),
    'the app says which way it failed rather than claiming to be synced',
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Online — synced')).toHaveCount(0);
});
