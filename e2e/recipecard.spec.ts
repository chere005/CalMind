/**
 * The recipe as a PLACE in the note (Sean, 2026-08-18): rendered, it sits in
 * an inset card with the prose on its banks; editing, it stands as one quiet
 * un-deletable blob between two editable banks; and tapping an ingredient or
 * a step turns it into a reminder defaulting to today.
 */
import { test, expect, type Page } from '@playwright/test';

const RECIPE = '**Ingredients**\n- 2 cups flour\n- a pinch of salt\n\n**Directions**\n1. Whisk it.\n2. Fry it.';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rc${Date.now()}${seq++}`;
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

async function makeRecipeNote(page: Page, title: string, body: string) {
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill(title);
  // The title touch collapsed the body to its view (the title-tap rule) —
  // reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(body);
  await page.getByPlaceholder('Title').click();
  // A recipe is a note the Recipe page SAVED (2026-08-19): the typed marker
  // shape alone no longer dresses a note in the card — Sean's own
  // hand-written notes wear that shape and must stay plain. Convert.
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('recipe-save').click();
  await expect(page.getByTestId('note-body-view')).toBeVisible();
}

test('typed markers alone stay a plain note — the card is opt-in', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  // The same shape makeRecipeNote types, WITHOUT the Recipe page's save.
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('hand-written');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(RECIPE);
  await page.getByPlaceholder('Title').click();
  const view = page.getByTestId('note-body-view');
  await expect(view).toBeVisible();
  // No card, no scale row, no badges — and every word exactly as typed,
  // which is what Sean's 19 hand-written recipe notes turned out to need
  // (2026-08-19: "make the non-recipe set the raw text like it was").
  await expect(page.getByTestId('recipe-card')).toHaveCount(0);
  await expect(page.getByTestId('scale-row')).toHaveCount(0);
  await expect(view.getByTestId('ing-badge')).toHaveCount(0);
  expect(await view.innerText()).toContain('2 cups flour');
  // And the plain editor, not the banks-and-blob one.
  await view.click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('note-body-edit')).toBeVisible();
  await expect(page.getByTestId('recipe-blob')).toHaveCount(0);
});

test('the rendered recipe sits in an inset card, prose on its banks', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await makeRecipeNote(page, 'inset', `Tonight, maybe.\n\n${RECIPE}\n\nGrandma doubled the butter.`);
  const card = page.getByTestId('recipe-card');
  await expect(card).toBeVisible();
  await expect(card.getByText('Recipe', { exact: true })).toBeVisible();
  await expect(card.getByText('flour', { exact: true })).toBeVisible();
  // The banks stay OUTSIDE the card.
  await expect(card.getByText('Tonight, maybe.')).toHaveCount(0);
  await expect(card.getByText('Grandma doubled the butter.')).toHaveCount(0);
  await expect(page.getByText('Tonight, maybe.')).toBeVisible();
  await expect(page.getByText('Grandma doubled the butter.')).toBeVisible();
});

test('editing a recipe note: two banks and one blob nothing can delete', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await makeRecipeNote(page, 'banks', RECIPE);
  // A corner tap (not an ingredient row) opens the composite editor.
  await page.getByTestId('note-body-view').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('recipe-blob')).toBeVisible();
  await expect(page.getByTestId('note-body-before')).toBeVisible();
  await page.getByTestId('note-body-after').fill('Serve with the good plates.');
  // Collapse via the title (the title-tap rule) and the bank landed BELOW
  // the card, with the recipe intact between them.
  await page.getByPlaceholder('Title').click();
  const view = page.getByTestId('note-body-view');
  await expect(view.getByText('Serve with the good plates.')).toBeVisible();
  await expect(view.getByTestId('ing-unit')).toHaveText(['2 cups']);
  await expect(view.getByTestId('recipe-card').getByText('Serve with the good plates.')).toHaveCount(0);
});

test('the blob opens the Recipe page — its content is edited there, not here', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await makeRecipeNote(page, 'blobopen', RECIPE);
  await page.getByTestId('note-body-view').click({ position: { x: 10, y: 10 } });
  await page.getByTestId('recipe-blob').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
});

test('tapping an ingredient makes a reminder, today by default', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await makeRecipeNote(page, 'shop', RECIPE);
  await page.getByTestId('recipe-card').getByText('flour', { exact: true }).click();
  // The sheet arrives prefilled with the LINE and defaulting to today.
  await expect(page.getByPlaceholder(/What\?/)).toHaveValue('2 cups flour');
  await expect(page.getByText('Today', { exact: true })).toBeVisible();
  await page.getByText('Save', { exact: true }).click();
  await page.getByTestId('tab-reminders').click();
  const row = page.getByTestId('rem-row').filter({ hasText: 'flour' });
  await expect(row).toBeVisible();
});

test('a step taps into a reminder too', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await makeRecipeNote(page, 'stepshop', RECIPE);
  await page.getByTestId('recipe-card').getByText('Whisk it.', { exact: true }).click();
  await expect(page.getByPlaceholder(/What\?/)).toHaveValue('Whisk it.');
  await page.getByText('Save', { exact: true }).click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'Whisk it.' })).toBeVisible();
});
