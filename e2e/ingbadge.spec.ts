/**
 * The measure as an iconized badge in the RENDERED note body (Sean,
 * 2026-08-18): an ingredient bullet's line shows only the NAME, with the
 * quantity and unit lifted into the badge beside it — the same UnitBadge the
 * recipe editor's rows wear, so the two cannot drift. A line with no
 * quantity stays plain text: 'a pinch of salt' has nothing to lift out. And
 * the rule is scoped to the **Ingredients** block — a bullet elsewhere in a
 * note keeps its words exactly as typed.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ib${Date.now()}${seq++}`;
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

test('an ingredient bullet wears the measure as a badge, name-only text', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('badge recipe');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page
    .getByTestId('note-body-edit')
    .fill('**Ingredients**\n- 2 cups flour\n- a pinch of salt\n\n**Directions**\n1. Mix 2 cups of patience.');
  await page.getByPlaceholder('Title').click();
  // The badge is the recipe card's dress, and a recipe is a note the Recipe
  // page SAVED (2026-08-19) — typed markers alone stay plain text.
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('recipe-save').click();
  const view = page.getByTestId('note-body-view');
  await expect(view).toBeVisible();

  // The measure moved into the badge…
  await expect(view.getByTestId('ing-badge')).toHaveCount(1);
  await expect(view.getByTestId('ing-unit')).toHaveText('2 cups');
  // …and left the line's text, which now reads the name alone.
  await expect(view.getByText('flour', { exact: true })).toBeVisible();
  expect(await view.innerText()).not.toContain('2 cups flour');

  // No quantity, no badge — the line is exactly as written.
  await expect(view.getByText('a pinch of salt', { exact: true })).toBeVisible();

  // A step's own numbers are prose, not a measure to lift.
  await expect(view.getByText('Mix 2 cups of patience.', { exact: true })).toBeVisible();
});

test('a bullet outside the Ingredients block keeps its words', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('shopping');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('- 2 cups flour\n- lightbulbs');
  await page.getByPlaceholder('Title').click();
  const view = page.getByTestId('note-body-view');
  await expect(view).toBeVisible();
  await expect(view.getByTestId('ing-badge')).toHaveCount(0);
  expect(await view.innerText()).toContain('2 cups flour');
});
