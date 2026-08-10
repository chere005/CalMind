import { expect, test, type Page } from '@playwright/test';

/**
 * A remote edit landing while you are typing.
 *
 * The note body is a controlled field bound straight to the record, and the
 * store polls every thirty seconds. So if the other device's version of the
 * same note is NEWER, the poll replaces the record — and the field's value
 * with it — while a cursor is sitting in it. That is the difference between
 * "the other device won" and "the sentence I was halfway through vanished".
 *
 * The order matters and is easy to get wrong: the body writes on EVERY
 * keystroke, so while you are actually typing your copy is always the newest
 * and nothing can land on it. The window is the pause — you type a sentence,
 * you stop to think, the other device saves, and the poll arrives with your
 * cursor still sitting in the field.
 *
 * This waits out a real poll rather than faking one: the clock is the thing
 * being tested.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `clb${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a newer edit from another device does not eat the sentence being typed', async ({ page, context }) => {
  test.setTimeout(150_000);
  const user = await signup(page);
  const url = page.url().split('?')[0]!;

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('shared note');
  await page.getByTestId('note-back').click();
  await page.waitForTimeout(2_000);

  // The other device signs in and opens the same note.
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await p2.getByTestId('tab-notes').click();
  await p2.getByTestId('note-row').filter({ hasText: 'shared note' }).click();
  await expect(p2.getByTestId('note-body-view')).toBeVisible();

  // Here: type a sentence, then STOP — cursor still in the field.
  await page.getByTestId('note-row').filter({ hasText: 'shared note' }).click();
  await page.getByTestId('note-body-view').click();
  const field = page.getByTestId('note-body-edit');
  await field.fill('a sentence I am halfway through');
  await expect(field).toHaveValue('a sentence I am halfway through');

  // Now the other device saves — newer than anything typed here.
  await p2.getByTestId('note-body-view').click();
  await p2.getByTestId('note-body-edit').fill('REPLACED BY THE OTHER DEVICE');
  await p2.getByTestId('note-title').fill('renamed elsewhere');
  await p2.waitForTimeout(2_000);

  // Sit out a real poll with the cursor still in the field.
  await page.waitForTimeout(35_000);

  // The record may well be theirs — that is LWW and fine. The FIELD must not
  // have had the words pulled out from under the cursor.
  const value = await field.inputValue();
  expect(value, 'the half-typed sentence survived the poll').toContain('a sentence I am halfway through');

  // And typing on resumes that sentence rather than appending to their text.
  await field.press('End');
  await field.type(' and still going');
  await expect(field).toHaveValue('a sentence I am halfway through and still going');

  // The shelter is scoped to the field with the cursor in it — the rest of the
  // editor still tracks the other device, which is the point of syncing.
  await expect(page.getByTestId('note-title')).toHaveValue('renamed elsewhere');

  await other.close();
});

test('the same holds for the title, which has no edit mode to hide behind', async ({ page, context }) => {
  test.setTimeout(150_000);
  const user = await signup(page);
  const url = page.url().split('?')[0]!;

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('working title');
  await page.getByTestId('note-back').click();
  await page.waitForTimeout(2_000);

  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await p2.getByTestId('tab-notes').click();
  await p2.getByTestId('note-row').filter({ hasText: 'working title' }).click();
  await expect(p2.getByTestId('note-body-view')).toBeVisible();

  await page.getByTestId('note-row').filter({ hasText: 'working title' }).click();
  const title = page.getByTestId('note-title');
  await title.click();
  await title.fill('the name I am still choosing');

  await p2.getByTestId('note-title').fill('THEIR NAME');
  await p2.waitForTimeout(2_000);

  await page.waitForTimeout(35_000);
  await expect(title, 'the half-typed name survived the poll').toHaveValue('the name I am still choosing');

  await other.close();
});
