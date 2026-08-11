import { expect, test, type Page } from '@playwright/test';

/**
 * The sync status, in the note editor's top right.
 *
 * Sean, 2026-08-11. The editor is where it earns its place: a note is the only
 * record the server can REFUSE for being too long, and until now the screen
 * you were typing into said nothing about whether the typing was landing.
 * Settings said it, but you had to go and ask.
 */
async function signup(page: Page): Promise<string> {
  const user = `es${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

test('the editor carries the status, and only the editor', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByTestId('tab-notes').click();

  // Sean asked for it on the edit-notes screen ONLY — the list has the top
  // bar's own chrome and does not want a second one.
  await expect(page.getByTestId('editor-sync'), 'not on the notes list').toHaveCount(0);

  await page.getByTestId('secadd-General').first().click();
  await expect(page.getByTestId('note-title')).toBeVisible();
  await expect(page.getByTestId('editor-sync'), 'but yes in the editor').toBeVisible();

  // Top RIGHT: past the middle of the window, and level with the back button.
  const dot = (await page.getByTestId('editor-sync').boundingBox())!;
  const back = (await page.getByTestId('note-back').boundingBox())!;
  expect(dot.x, 'in the right-hand half of the row').toBeGreaterThan(195);
  expect(Math.abs((dot.y + dot.height / 2) - (back.y + back.height / 2)))
    .toBeLessThan(24);

  await page.getByTestId('note-back').click();
  await expect(page.getByTestId('editor-sync'), 'and it leaves with the editor').toHaveCount(0);
});

test('it goes red and says so when a note is refused', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('War and Peace');
  // Over the server's 64KB cap, so the sync is refused and the store says so.
  await page.getByTestId('note-body-edit').fill('x'.repeat(70_000));

  // The whole point of putting it HERE: you find out without leaving the note.
  await expect(
    page.getByTestId('editor-sync').getByText('Not saved'),
    'the editor says the note is not saved, in the editor',
  ).toBeVisible({ timeout: 25_000 });
});
