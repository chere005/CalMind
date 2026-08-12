/**
 * A parked delete must never end up on a different line.
 *
 * Swiping a recipe line parks a × on it. That swipe is keyed by INDEX —
 * `ing-2`, not an id, because ingredients are plain strings with no identity
 * of their own — while the list underneath can move: a new ingredient lands
 * at the TOP, and a drag reorders everything.
 *
 * So the × stayed where the INDEX was rather than where the ROW went.
 * Measured before the fix:
 *
 *   start           ["flour", "milk", "eggs"]
 *   swipe index 1    milk — its × parks
 *   add "1 tsp salt" ["salt", "flour", "milk", "eggs"]   (adds prepend)
 *   press the ×      ["salt", "milk", "eggs"]            <- FLOUR went
 *
 * You swipe the line you mean to delete, remember one more ingredient, type
 * it in, press the × still sitting there, and lose a different line. In the
 * feature Sean asked to be pushed hardest.
 *
 * Fixed by dropping the swipe whenever the list moves, which is what the
 * delete handlers already did for the same reason. Following the row would be
 * the other option and is worse: the × belongs to a gesture the list has just
 * invalidated.
 *
 * Found by looking for compound states — something true WHILE something else
 * is — after four mutation survivors turned out to share that shape. This one
 * is "swiped, and then the list changed".
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ss${Date.now()}${seq++}`;
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

async function openRecipe(page: Page) {
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk\n3 eggs\n1. Mix it');
  await page.getByTestId('recipe-import').click();
  // The page slides in; measuring a row mid-animation aims the swipe at where
  // it used to be.
  await page.waitForTimeout(400);
}

/** Swipe a row left far enough to park its delete. */
async function swipeOpen(page: Page, row: ReturnType<Page['getByTestId']>) {
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, y);
  await page.mouse.up();
}

const ings = (page: Page) => page.getByTestId('ing-row').allTextContents();

test('adding an ingredient dismisses a parked delete instead of moving it', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await openRecipe(page);
  await expect.poll(() => ings(page)).toEqual(['flour2 cups', 'milk1 cup', 'eggs3']);

  await swipeOpen(page, page.getByTestId('ing-row').nth(1));   // milk
  await expect(page.getByTestId('ing-del')).toHaveCount(1);

  // Adds land at the top, so every index below shifts by one.
  await page.getByTestId('ing-field').fill('1 tsp salt');
  await page.getByTestId('ing-field').press('Enter');

  await expect.poll(() => ings(page)).toEqual(['salt1 tsp', 'flour2 cups', 'milk1 cup', 'eggs3']);
  await expect(page.getByTestId('ing-del'), 'the parked × is gone, not sitting on a new line')
    .toHaveCount(0);

  // …and the line it used to be on is still deletable the ordinary way, so
  // the fix has not simply broken swiping.
  await swipeOpen(page, page.getByTestId('ing-row').nth(2));   // milk again
  await page.getByTestId('ing-del').click();
  await expect.poll(() => ings(page), { message: 'the swiped line is the one that goes' })
    .toEqual(['salt1 tsp', 'flour2 cups', 'eggs3']);
});

test('reordering dismisses it too', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await openRecipe(page);

  await swipeOpen(page, page.getByTestId('ing-row').nth(1));
  await expect(page.getByTestId('ing-del')).toHaveCount(1);

  // A drag moves the list under the parked × exactly as an add does.
  const rows = page.getByTestId('ing-row');
  const r0 = (await rows.nth(0).boundingBox())!;
  const r2 = (await rows.nth(2).boundingBox())!;
  const grip = rows.nth(0).locator('..').getByTestId('ing-grip').first();
  const gb = await grip.boundingBox();
  if (gb) {
    const x = gb.x + gb.width / 2;
    const y = gb.y + gb.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (i * (r2.y - r0.y)) / 8);
    await page.waitForTimeout(120);
    await page.mouse.up();
    await expect(page.getByTestId('ing-del'), 'the × does not survive a reorder').toHaveCount(0);
  }
});
