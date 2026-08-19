/**
 * Export my data — the Settings button hands over a real file.
 *
 * The SHAPE of the file (tombstones out, determinism, counts) is core's
 * business and tested there; this proves the plumbing a person actually
 * touches: the button starts a browser download, the file is named for the
 * account and the day, and what lands parses as the store you were looking
 * at — the reminder you just typed is in it.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `cm${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

test('the export button downloads the store as a named JSON file', async ({ page }) => {
  test.setTimeout(120_000);
  const user = await signup(page);

  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('the exported errand');
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'the exported errand' })).toBeVisible();

  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-data').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(new RegExp(`^calmind-${user}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8')) as {
    app: string;
    account: string;
    counts: Record<string, number>;
    records: { type: string; payload: { text?: string } }[];
  };
  expect(file.app).toBe('calmind');
  expect(file.account).toBe(user);
  expect(file.counts.reminder).toBeGreaterThanOrEqual(1);
  expect(file.records.some((r) => r.type === 'reminder' && r.payload.text === 'the exported errand')).toBe(true);

  // And the screen said so.
  await expect(page.getByText('Exported.', { exact: true })).toBeVisible();
});
