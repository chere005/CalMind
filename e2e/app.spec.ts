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

test('a note drags between folders and re-files', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  // The fresh account has one notes folder; make a second via the manager.
  await page.getByTestId('pick-notes').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Recipes');
  await page.getByPlaceholder('New folder').press('Enter');
  await page.getByText('Done', { exact: true }).click();
  // One note in each folder's General.
  const adds = page.getByTestId('secadd-General');
  await adds.first().click();
  await page.getByPlaceholder('New note').fill('first note');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByText('← All notes').click(); // the editor auto-opens on create
  await adds.nth(1).click();
  await page.getByPlaceholder('New note').fill('second note');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByText('← All notes').click();
  // Drag the first note down past the second (into the Recipes General).
  const rows = page.getByTestId('note-row');
  await expect(rows).toHaveCount(2);
  const grip = page.getByTestId('note-grip').first();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (i * 90) / 10);
  }
  await page.mouse.up();
  // Both notes now sit under the second folder block; first row is 'second note'.
  await expect(rows.first()).toContainText('second note');
});

test('a reminder drags into an EMPTY section', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // A fresh empty section under the Reminders folder.
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Target');
  await page.getByPlaceholder('New section').press('Enter');
  // One reminder in General.
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('wander');
  await page.getByTestId('rem-add-field').press('Enter');
  const grip = page.getByTestId('row-grip').first();
  const box = (await grip.boundingBox())!;
  // Target sits ABOVE General (new sections prepend): drag the row UP into it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - (i * 46) / 8);
  }
  await page.mouse.up();
  // DOM order proves the re-file: 'wander' now renders inside Target's block,
  // before the General heading.
  const body = await page.locator('body').innerText();
  expect(body.indexOf('Target')).toBeLessThan(body.indexOf('wander'));
  expect(body.indexOf('wander')).toBeLessThan(body.indexOf('General'));
});

test('a SECTION drags between folders; a duplicate name refuses', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Chores');
  await page.getByPlaceholder('New section').press('Enter');

  // Drag Chores down into the Calendar folder's block.
  const grip = page.getByTestId('sec-grip-Chores');
  const box = (await grip.boundingBox())!;
  const calHead = await page.getByText('Calendar', { exact: true }).boundingBox();
  const targetY = calHead!.y + calHead!.height + 60; // inside the Calendar block
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + ((targetY - box.y) * i) / 10);
  }
  await page.mouse.up();
  const body = await page.locator('body').innerText();
  expect(body.indexOf('Calendar')).toBeLessThan(body.indexOf('Chores'));

  // 'General' into the Calendar folder would collide with its General: refused.
  const gGrip = page.getByTestId('sec-grip-General').first();
  const gBox = (await gGrip.boundingBox())!;
  await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + gBox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + ((targetY + 40 - gBox.y) * i) / 10);
  }
  await page.mouse.up();
  const after = await page.locator('body').innerText();
  // Reminders folder still holds its General (it renders before Calendar).
  expect(after.indexOf('General')).toBeLessThan(after.indexOf('Calendar'));
});

test('editing a reminder into a Note converts one-way', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('becomes a note');
  await page.getByTestId('rem-add-field').press('Enter');
  const body = page.getByTestId('rem-body').filter({ hasText: 'becomes a note' });
  // Long-press into inline edit, then the ✎ opens the full window.
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit')).toBeVisible();
  await page.getByTestId('rem-pencil').click();
  await page.getByTestId('kind-note').click();
  await page.getByText('Save', { exact: true }).click();
  // Gone from Reminders, present in Notes.
  await expect(page.getByTestId('rem-row').filter({ hasText: 'becomes a note' })).toBeHidden();
  await page.getByTestId('tab-notes').click();
  await expect(page.getByTestId('note-row').filter({ hasText: 'becomes a note' })).toBeVisible();
});
