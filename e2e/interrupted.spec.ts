import { expect, test, type Page } from '@playwright/test';

/**
 * Being interrupted mid-edit.
 *
 * Every spec finishes what it starts — types, presses Enter, moves on. A
 * phone doesn't work like that: you rename something, a message arrives, you
 * switch away, you come back. The inline edit holds its text in local state
 * and writes it on blur, so whether the change survives depends on whether
 * blur fires when the screen is torn out from under it — which is exactly the
 * kind of thing nobody can answer by reading.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `int${Date.now()}${seq++}`;
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

test('an edit interrupted by switching tabs is not thrown away', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('call the vet');
  await page.getByTestId('rem-add-field').press('Enter');

  // Open the inline edit the way a finger does, and change the words.
  const body = page.getByTestId('rem-body').filter({ hasText: 'call the vet' });
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  const field = page.getByTestId('rem-edit');
  await expect(field).toHaveValue('call the vet');
  await field.fill('call the vet about the refill');

  // …and get interrupted, without pressing Enter.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await page.getByTestId('tab-reminders').click();

  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'call the vet about the refill' }),
    'the interrupted edit survived the trip',
  ).toBeVisible();
});

test('a note body survives being interrupted mid-sentence, even across a reload', async ({ page }) => {
  // The body writes on every keystroke and the snapshot is written on every
  // write, so this one should be safe by construction — worth holding, since
  // a later "optimisation" to debounce it would quietly break exactly this.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('shopping');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-edit').fill('half a sentence that stops mid');

  await page.getByTestId('tab-habits').click();
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'shopping' }).click();
  await expect(page.getByTestId('note-body-view'), 'the half sentence is still there')
    .toContainText('half a sentence that stops mid', { timeout: 10_000 });
});
