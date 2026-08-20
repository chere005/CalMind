/**
 * The inline row edit, back on Sean's word (2026-08-20: "tapping on a
 * reminder in the reminders app should go into the edit reminder text mode
 * that it used to and we took away at one point"), with the suite's own
 * merge rule and the new app-wide backslash escape.
 *
 * The three claims, each pinned end-to-end because each has quietly broken
 * once before in some form:
 *   · retyping reads like adding — "Vet 9/3 2pm" MOVES the reminder and the
 *     tokens leave the title;
 *   · a token-less rename keeps the date ("a line with no date in it must
 *     leave the date alone", reminders/index.php);
 *   · \2pm is the literal words 2pm, on the add row and the inline edit
 *     alike, because both go through core's one parseWhenFromText.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ie${Date.now()}${seq++}`;
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

/** Long-press the row's body to arm edit mode, then tap it to open the field. */
async function openInline(page: Page, text: string) {
  const body = page.getByTestId('rem-body').filter({ hasText: text }).first();
  const b = (await body.boundingBox())!;
  await page.mouse.move(b.x + 15, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await body.click();
  await expect(page.getByTestId('rem-edit')).toBeVisible();
}

test('a tap in edit mode opens the row for retyping, and a typed date moves it', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addRow(page, 'vet visit');

  await openInline(page, 'vet visit');
  await expect(page.getByTestId('rem-edit')).toHaveValue('vet visit');
  await page.getByTestId('rem-edit').fill('vet visit 9/3 2pm');
  await page.getByTestId('rem-edit').press('Enter');

  const row = page.getByTestId('rem-row').filter({ hasText: 'vet visit' });
  await expect(row.getByText('vet visit', { exact: true }), 'the tokens left the title').toBeVisible();
  await expect(row, 'the typed date landed').toContainText('Sep 3');
  await expect(row, 'and the typed time').toContainText('2pm');
});

test('a rename with no tokens keeps the date — retyping must not undate', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addRow(page, 'pay rent tomorrow');
  const chip = new Date(Date.now() + 86_400_000)
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  await expect(page.getByTestId('rem-row').filter({ hasText: 'pay rent' })).toContainText(chip);

  await openInline(page, 'pay rent');
  await page.getByTestId('rem-edit').fill('pay the rent');
  await page.getByTestId('rem-edit').press('Enter');

  const row = page.getByTestId('rem-row').filter({ hasText: 'pay the rent' });
  await expect(row).toBeVisible();
  await expect(row, 'the date survived the rename').toContainText(chip);
});

test('a backslash keeps a token literal, on the add row and the inline edit alike', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);

  // The ADD path: \2pm is words, so the row is undated and untimed.
  await addRow(page, 'song \\2pm drop');
  const row = page.getByTestId('rem-row').filter({ hasText: 'song' });
  await expect(row.getByText('song 2pm drop', { exact: true }), 'the literal words survived').toBeVisible();
  await expect(row.locator('text=/·/'), 'no chip — nothing was parsed').toHaveCount(0);

  // The INLINE path: same door, same rule.
  await openInline(page, 'song 2pm drop');
  await page.getByTestId('rem-edit').fill('song \\8pm encore');
  await page.getByTestId('rem-edit').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'song' }).getByText('song 8pm encore', { exact: true }))
    .toBeVisible();
});
