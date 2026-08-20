import { expect, test, type Page } from '@playwright/test';

/**
 * ItemModal's create path, saved twice.
 *
 * The Add TAB's Done was guarded after a real flake. This is a different save
 * path entirely — ItemModal's create mode, which mints a fresh id every call
 * with nothing else to stop a second one. Its one remaining doorway is the
 * recipe card: tap an ingredient or a step and it arrives as a reminder-to-be
 * (Sean, 2026-08-18). The calendar's "+ Add" used to be the easier way in,
 * and was removed on his word (2026-08-20) — the guard still matters exactly
 * as much where the sheet still opens.
 */

async function signup(page: Page) {
  const user = `mt${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 99)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

/** A recipe note whose card offers tappable lines — the route recipehand.spec
 *  and the other recipe specs use. */
async function aRecipeCard(page: Page) {
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1. Mix it');
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('recipe-save').click();
  await expect(page.getByTestId('recipe-line').first()).toBeVisible({ timeout: 10_000 });
}

test('a double-tapped Save on the recipe-line sheet files one reminder, not two', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await aRecipeCard(page);

  await page.getByTestId('recipe-line').first().click();
  await expect(page.getByPlaceholder(/What\?/)).toBeVisible();

  // Two presses with no await between. The spare carries its own short
  // timeout: once the modal closes, a click on a gone control waits out the
  // whole test budget rather than failing fast.
  const save = page.getByText('Save', { exact: true });
  await Promise.all([save.click(), save.click({ timeout: 1_500 }).catch(() => {})]);
  await page.waitForTimeout(1_000);

  await page.getByTestId('note-back').click();
  await page.getByTestId('tab-reminders').click();
  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'flour' }),
    'one press, one reminder',
  ).toHaveCount(1);
});

test('the guard does not stop you adding the same thing twice on purpose', async ({ page }) => {
  // The same ingredient filed twice on purpose is an ordinary thing to want;
  // a guard that refused would be its own bug.
  test.setTimeout(120_000);
  await signup(page);
  await aRecipeCard(page);

  for (let i = 0; i < 2; i++) {
    await page.getByTestId('recipe-line').first().click();
    await expect(page.getByPlaceholder(/What\?/)).toBeVisible();
    await page.getByText('Save', { exact: true }).click();
    await page.waitForTimeout(1_700);
  }
  await page.getByTestId('note-back').click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'flour' })).toHaveCount(2);
});
