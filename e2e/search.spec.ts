/**
 * Search (Sean, 2026-08-19): the 🔍 between the folder picker and the
 * username opens a screen that always searches Reminders, Notes and Events,
 * best first; a check-filter under the bar is REMEMBERED; sort offers
 * relevance, date, alphabetical, each with a direction. The ranking itself
 * is core's and tested there — this proves the screen: the button, the
 * three kinds arriving, the filter cutting and persisting, a tap opening
 * the thing it names.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `se${Date.now()}${seq++}`;
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

async function seed(page: Page) {
  // One of each kind, all carrying 'harvest' somewhere.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('harvest the tomatoes');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Harvest');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('what came in from the garden');
  await page.getByPlaceholder('Title').click();
  await page.getByTestId('note-back').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-text').fill('harvest festival');
  await page.getByText('Done', { exact: true }).click();
}

test('the button sits in the bar, and one query finds all three kinds', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await seed(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('topbar-search').click();
  await page.getByTestId('search-field').fill('harvest');
  const rows = page.getByTestId('search-row');
  await expect(rows).toHaveCount(3);
  // Exact title beats the scattered rest: the note leads.
  await expect(rows.first()).toContainText('Harvest');
});

test('the kind filter cuts, and is REMEMBERED across a close and a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await seed(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('topbar-search').click();
  await page.getByTestId('search-field').fill('harvest');
  await expect(page.getByTestId('search-row')).toHaveCount(3);
  await page.getByTestId('search-kinds').click();
  await page.getByTestId('search-kind-reminder').click();
  await page.getByTestId('search-kind-event').click();
  await page.mouse.click(8, 400); // close the checks
  await expect(page.getByTestId('search-row')).toHaveCount(1);
  await expect(page.getByTestId('search-row').first()).toContainText('Harvest');
  // Close search entirely, reload the app: the pref survives both.
  await page.getByTestId('search-back').click();
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('topbar-search').click();
  await expect(page.getByTestId('search-kinds')).toContainText('Notes');
  await page.getByTestId('search-field').fill('harvest');
  await expect(page.getByTestId('search-row')).toHaveCount(1);
});

test('alphabetical sorts by the whole text, and the arrow flips it', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await seed(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('topbar-search').click();
  await page.getByTestId('search-field').fill('harvest');
  await page.getByTestId('search-sort').click();
  await page.getByText('Alphabetical', { exact: true }).click();
  const texts = () => page.getByTestId('search-row').allInnerTexts();
  await expect(page.getByTestId('search-row')).toHaveCount(3);
  const az = await texts();
  expect(az[0]).toContain('Harvest'); // 'Harvest' < 'harvest festival' < 'harvest the…'
  expect(az[2]).toContain('harvest the tomatoes');
  await page.getByTestId('search-dir').click();
  await expect(page.getByTestId('search-row').first()).toContainText('harvest the tomatoes');
});

test('tapping a note result opens that note', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await seed(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('topbar-search').click();
  await page.getByTestId('search-field').fill('garden');
  await expect(page.getByTestId('search-row')).toHaveCount(1);
  await page.getByTestId('search-row').first().click();
  // The Notes tab, with the note open in its editor.
  await expect(page.getByPlaceholder('Title')).toHaveValue('Harvest', { timeout: 10_000 });
});
