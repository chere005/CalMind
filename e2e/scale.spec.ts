import { expect, test } from '@playwright/test';

/**
 * Doubling a recipe is a way of READING it.
 *
 * The whole feature rests on one promise: nothing is written. A cook who
 * doubles a recipe to make two loaves has not edited the card, and finding it
 * permanently doubled next week would be worse than doing the arithmetic by
 * hand. So the load-bearing assertion here is not that 2 cups becomes 4 — it
 * is that the note still says 2 afterwards.
 */
const BODY = `**Ingredients**
- 2 cups flour
- a pinch of salt
- 2 eggs, beaten

**Directions**
1. Bake 20-25 minutes at 425°.`;

test('scaling reads the recipe differently and writes nothing', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `scl${Date.now()}`;
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
  await page.getByTestId('note-title').fill('Loaf');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(BODY);
  await page.getByTestId('note-title').click();

  const body = page.getByTestId('note-body-view');
  await expect(page.getByTestId('scale-row')).toBeVisible();
  await page.getByTestId('scale-double').click();
  // The measures live in the BADGES now (Sean, 2026-08-18), name in the text:
  // asserting the badge list in order is the doubled claim, whole.
  await expect(body.getByTestId('ing-unit')).toHaveText(['4 cups', '4']);
  await expect(body).toContainText('flour');
  await expect(body, 'a pinch has no number to double').toContainText('a pinch of salt');
  await expect(body).toContainText('eggs, beaten');
  await expect(body, '20-25 minutes is a time, not a yield').toContainText('Bake 20-25 minutes at 425°');

  // While scaled, the text on screen is not the text in the note — so tapping
  // must not drop you into an editor showing something else. The corner, not
  // the centre: the centre is an ingredient row now, and tapping THAT opens
  // the tap-to-remind sheet by design (Sean, 2026-08-18).
  await body.click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('note-body-edit')).toHaveCount(0);

  await page.getByTestId('scale-half').click();
  await expect(body.getByTestId('ing-unit')).toHaveText(['1 cup', '1']);
  await expect(body, 'half of two eggs is one egg, not one eggs').toContainText('egg, beaten');

  // Back to 1x: the note is exactly as written — the badges read the stored
  // measures — and editable again, the recipe standing as the un-deletable
  // blob between its two banks (the composite editor, 2026-08-18).
  await page.getByTestId('scale-one').click();
  await expect(body.getByTestId('ing-unit')).toHaveText(['2 cups', '2']);
  await body.click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('recipe-blob')).toBeVisible();
});

test('scaling never reaches the stored recipe, even through the Recipe editor', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `scl${Date.now()}c`;
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
  await page.getByTestId('note-title').fill('Loaf');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(BODY);
  await page.getByTestId('note-title').click();

  // Double it, then open the structured editor and save from there. This is
  // the path where a doubling could be written back permanently: the editor
  // re-parses the note and Save rewrites the whole body.
  await page.getByTestId('scale-double').click();
  await expect(page.getByTestId('note-body-view').getByTestId('ing-unit').first()).toHaveText('4 cups');
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
  // Name in the row, measure in the badge — together they are the claim.
  const flourRow = page.getByTestId('ing-row').filter({ hasText: 'flour' });
  await expect(flourRow, 'the editor shows what the note says, not what the scale was showing').toContainText('flour');
  await expect(flourRow.getByTestId('ing-unit')).toHaveText('2 cups');
  await page.getByTestId('recipe-save').click();

  // Back on the note, and still two cups — through a reload, so this is the
  // stored record and not a stale screen.
  await expect(page.getByTestId('note-body-view')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'Loaf' }).click();
  await expect(page.getByTestId('note-body-view').getByTestId('ing-unit').first()).toHaveText('2 cups');
  await expect(page.getByTestId('note-body-view')).not.toContainText('4 cups');
});

test('a plain note is never offered a scale it cannot honour', async ({ page }) => {
  const user = `scl${Date.now()}b`;
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
  await page.getByTestId('note-title').fill('Shopping');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('- 2 cups flour\n- milk');
  await page.getByTestId('note-title').click();
  // Quantities alone are not a recipe; the markers are.
  await expect(page.getByTestId('scale-row')).toHaveCount(0);
});
