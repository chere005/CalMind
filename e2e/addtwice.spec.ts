import { expect, test, type Page } from '@playwright/test';

/**
 * One field, one row.
 *
 * Notes carries an explicit flag for this, with the comment "Enter fires
 * submit AND blur on web — one field, one note" — the tell that it was met for
 * real there. Reminders reaches the same field the same way and has NO such
 * flag, and unlike a section there is nothing about a reminder that has to be
 * unique, so a duplicate would simply appear and stay.
 *
 * It does not. All three of these passed first time: the field unmounts and
 * its text clears before a second call can carry the old value. So this is a
 * negative result, written down as one — the protection is real but
 * incidental, and these specs are what will notice if the shape of that code
 * changes. No guard was added, because there was nothing to fix; the Add
 * screen got one an hour ago because there the race had actually been SEEN.
 *
 * Both sections' add fields are covered by a different accident: a section
 * name has to be unique, so the second commit is refused on the name.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `add${Date.now()}${seq++}`;
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

test('Enter files one reminder, not one per event that fires', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('book the car in');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(500);
  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'book the car in' }),
    'one line typed, one reminder filed',
  ).toHaveCount(1);
});

test('and typing then tapping away files it exactly once too', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('ring the vet');
  // Blur without Enter: the other way into the same function.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'ring the vet' })).toHaveCount(1);
});

test('two reminders that really are meant to be the same are still both filed', async ({ page }) => {
  // The guard must not become a ban on repeating yourself.
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('water the plants');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('water the plants');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('rem-row').filter({ hasText: 'water the plants' })).toHaveCount(2);
});
