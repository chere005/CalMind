/**
 * An import landing while a line is being edited must not redirect the edit.
 *
 * `commitEdit` writes by INDEX — `editing.at` — and an import PREPENDS its
 * ingredients. Nothing blocks the rows while "Reading that page…" is up, so
 * the two overlap: start a URL import, fix a typo on an existing line, and
 * the import lands underneath the open field.
 *
 * Measured before the fix, editing "1 cup milk" while an import brought in
 * eggs and salt:
 *
 *   start       ["flour", "milk"]
 *   after save  ["eggs", "whole milk", "flour", "milk"]
 *
 * The correction was written OVER the salt — a freshly imported line silently
 * replaced — and the milk it was meant to fix is untouched. Two wrongs from
 * one race.
 *
 * Fixed by shifting `editing.at` by however many ingredients arrived, which
 * keeps the edit on its own row AND keeps the typing. Cancelling the edit was
 * the other option and throws the correction away.
 *
 * Steps do not need it: they append, so their indices do not move.
 *
 * THREE ATTEMPTS AT THIS TEST FAILED FIRST, all for the same reason and none
 * of them the app's fault: the mocked recipe_fetch response was missing
 * `ok: true`, which `apiPost` requires, so the import threw before it could
 * land and the race was never exercised. The runs looked like clean passes.
 * That is what a check that cannot fail looks like from the inside — the
 * screen said "no bug" three times while testing nothing.
 */
import { test, expect, type Page } from '@playwright/test';

const LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Imported',
  recipeIngredient: ['3 eggs', '1 tsp salt'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Whisk' }],
});
const PAGE = `<html><head><script type="application/ld+json">${LD}</script></head><body>x</body></html>`;

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ir${Date.now()}${seq++}`;
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

test('a correction typed during an import lands on the line it was typed into', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk\n1. Mix it');
  await page.getByTestId('recipe-import').click();
  await page.waitForTimeout(400);
  const ings = () => page.getByTestId('ing-row').allTextContents();
  await expect.poll(ings).toEqual(['flour2 cups', 'milk1 cup']);

  // A slow fetch, so the import is guaranteed to land mid-edit rather than
  // by luck. `ok: true` is what apiPost requires — without it the import
  // throws and this test silently proves nothing.
  await page.route('**/api/**', async (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('recipe_fetch')) return route.fallback();
    await new Promise((r) => setTimeout(r, 3000));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, html: PAGE }),
    });
  });

  await page.getByTestId('recipe-link').click();
  await page.getByTestId('recipe-url').fill('https://example.com/r');
  await page.getByTestId('recipe-url-go').click();

  // Fix a typo on an existing line while the page is being fetched.
  await page.waitForTimeout(300);
  await page.getByTestId('ing-row').nth(1).click();
  await page.getByTestId('ing-edit').fill('2 cups whole milk');

  // The import lands here, prepending two ingredients under the open field.
  await expect
    .poll(async () => (await ings()).length, { message: 'the import landed while the field was open', timeout: 15_000 })
    .toBeGreaterThan(2);

  await page.getByTestId('ing-edit').press('Enter');

  // The correction belongs to the milk line and nothing else moved: both
  // imported lines survive, flour survives, and there is no second milk.
  await expect
    .poll(ings, { message: 'the edit landed on its own row, not on an imported one', timeout: 10_000 })
    .toEqual(['eggs3', 'salt1 tsp', 'flour2 cups', 'whole milk2 cups']);
});
