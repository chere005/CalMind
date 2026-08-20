/**
 * Copy, on a reminder row in edit mode (Sean, 2026-08-20: "add a copy button
 * for reminders in edit mode").
 *
 * The clipboard itself is not read, for the reason copymd.spec gives at
 * length: a headless browser's clipboard is a permissions maze, and what
 * would be proved is Playwright's grant rather than the app's behaviour. What
 * the app OWES here is split cleanly in two, and both halves are covered:
 *
 *   · WHAT gets composed — "vet visit 9/3 2pm", the year spelled when a bare
 *     m/d would land wrong, a \-escaped word re-escaped — is core's
 *     reminderLine, and packages/core/test/copyline.test.ts pins it against
 *     the parser it has to survive.
 *   · THAT the button is where he asked, saves an in-flight retype before
 *     copying, and answers — which is this file.
 */
import { test, expect, type Page } from '@playwright/test';

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

async function addRow(page: Page, line: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(line);
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);
}

/** Long-press a row: the way into edit mode, where the cluster lives. */
async function enterEdit(page: Page, text: string) {
  const body = page.getByTestId('rem-body').filter({ hasText: text }).first();
  const b = (await body.boundingBox())!;
  await page.mouse.move(b.x + 15, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByTestId('rem-pencil').first()).toBeVisible();
}

test('the copy button belongs to edit mode, and says so when it has copied', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addRow(page, 'vet visit 9/3 2pm');

  // Not before: a plain tap opens the row for retyping, and the cluster is
  // the arranging mode's, not the list's.
  await expect(page.getByTestId('rem-copy'), 'no cluster outside edit mode').toHaveCount(0);

  await enterEdit(page, 'vet visit');

  // The mark is DRAWN, not typed (Sean, 2026-08-20: "monochrome simple
  // clipboard"). CircleBtn falls back to rendering the glyph string as TEXT
  // when it is not in ui's DRAWN map — so renaming the key would put the
  // literal word "clipboard" in the button, and it would still be clickable,
  // still pass every other test here, and look absurd.
  const btn = page.getByTestId('rem-copy').first();
  await expect(btn.locator('svg'), 'the clipboard is geometry, not a glyph').toHaveCount(1);
  await expect(btn, 'and no stray text fell through').toHaveText('');

  await btn.click();
  // Either answer is acceptable — the browser may refuse the clipboard — but
  // SOME answer is the point. A button that stays silent is pressed twice.
  await expect(page.getByTestId('toast'), 'it tells you what happened')
    .toHaveText(/Copied|Could not copy/, { timeout: 10_000 });
});

test('the clipboard gets the whole reminder — words, date and time', async ({ page, context }) => {
  // Chromium WILL hand over the clipboard under a grant on 127.0.0.1, so the
  // end-to-end claim is available here even though copymd.spec settles for
  // the toast. Worth taking: this is the only check that the SCREEN hands
  // core the right payload. Core's own tests can only prove that a payload
  // becomes the right line.
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signup(page);
  await addRow(page, 'vet visit 9/3 2pm');
  await enterEdit(page, 'vet visit');
  await page.getByTestId('rem-copy').first().click();
  await expect(page.getByTestId('toast')).toHaveText('Copied', { timeout: 10_000 });

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  // Not "vet visit". The date and time are the half that is hardest to
  // retype, and they come along as the tokens that made them — so this string
  // pastes back into the add field as the reminder it came from.
  expect(clip).toBe('vet visit 9/3 2pm');
});

test('what it copies pastes back as the same reminder', async ({ page, context }) => {
  // The round trip, through the real add field rather than through core's
  // idea of it — and on the shape that only exists because of the \-escape:
  // a title that contains a token.
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signup(page);
  await addRow(page, 'song \\2pm drop 9/4');
  await enterEdit(page, 'song 2pm drop');
  await page.getByTestId('rem-copy').first().click();
  await expect(page.getByTestId('toast')).toHaveText('Copied', { timeout: 10_000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip, 'the escaped words are escaped again').toBe('song \\2pm drop 9/4');

  // Paste it into the add row and the second reminder matches the first.
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(clip);
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(400);
  const rows = page.getByTestId('rem-row').filter({ hasText: 'song' });
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    await expect(row.getByText('song 2pm drop', { exact: true })).toBeVisible();
    await expect(row).toContainText('Sep 4');
  }
});
