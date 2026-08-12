/**
 * Saving the item sheet must not undo a deletion made somewhere else.
 *
 * The sheet is handed a RECORD — `<ItemModal rec={modalRec} />` — and never
 * looked at it again. The screen behind it is live, so when the 30s pull
 * brought in a tombstone from another device the row vanished, but the sheet
 * kept editing its snapshot. Pressing Save wrote that snapshot back with a
 * fresh `updated`, LWW beat the tombstone, and the record came back on every
 * device. Measured before the fix, deleting on B while A had the sheet up:
 *
 *   A's sheet     still open, field reads "call the vet"
 *   A saves       ["call the vet about the booster"]
 *   B on reload   ["call the vet about the booster"]   <- it came BACK
 *
 * Sean reads this on three clients; deleting a reminder on the phone while
 * the desktop has it open is an ordinary Tuesday, and the desktop silently
 * put it back.
 *
 * The house already had an answer. The note editor holds an ID and looks the
 * record up on every render, so the same event drops it out of the editor and
 * the note stays deleted — `deletedunder.spec.ts` fixes that deliberately.
 * Measured here for the live case too, to be sure it was the sheet that was
 * odd and not the pull: note editor after the same 36s, title-field=0,
 * body-edit=0, note still gone. The sheet now leaves the same way.
 *
 * The 36s wait is the 30s poll plus room. Nothing shorter reaches it: the
 * pull is the only thing that brings another device's delete in, a reload
 * would close the sheet and destroy the very state under test, and no
 * mutation is reachable from behind a modal to schedule an earlier sync.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `zs${Date.now()}${seq++}`;
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

test('a sheet whose record was deleted elsewhere leaves, and cannot put it back', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));

  const user = await signup(a);
  await a.getByTestId('tab-calendar').click();
  await a.getByText('+ Add', { exact: true }).click();
  await a.getByTestId('kind-reminder').click();
  await a.getByPlaceholder(/What\?/).fill('call the vet');
  await a.getByText('Save', { exact: true }).click();
  await expect(a.getByTestId('day-tick').first()).toBeVisible({ timeout: 20_000 });
  // A's push has to land BEFORE B logs in: B pulls once at sign-in and then
  // only every 30s, so a race here shows up as B never seeing the row at all.
  await a.waitForTimeout(3_000);

  await b.goto('.');
  await b.getByPlaceholder('Username').fill(user);
  await b.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await b.getByText('Sign in', { exact: true }).click();
  await expect(b.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await b.getByTestId('tab-reminders').click();
  await expect(b.getByText('call the vet')).toBeVisible({ timeout: 20_000 });

  // A stands inside the sheet: double tap into the day-panel row, then pencil.
  await a.getByText('call the vet').dblclick();
  await a.getByRole('button', { name: 'Edit' }).first().click();
  await expect(a.getByPlaceholder(/What\?/), 'the sheet is open to begin with').toBeVisible();

  // B deletes it — swipe parks a × that deletes on one press — and pushes.
  const body = b.getByTestId('rem-body').filter({ hasText: 'call the vet' });
  const box = (await body.boundingBox())!;
  const y = box.y + box.height / 2;
  await b.mouse.move(box.x + box.width - 20, y);
  await b.mouse.down();
  for (let i = 1; i <= 6; i++) await b.mouse.move(box.x + box.width - 20 - i * 15, y);
  await b.mouse.up();
  await b.getByTestId('swipe-del').click({ timeout: 5_000 });
  await expect(b.getByTestId('rem-row').filter({ hasText: 'call the vet' })).toHaveCount(0, { timeout: 15_000 });
  await b.waitForTimeout(3_000);

  // The tombstone reaches A on its own, with the sheet still up.
  await a.waitForTimeout(36_000);

  // If the sheet is still there, this is the press that used to resurrect it.
  // Speculative, so it gets its own short timeout — a click on a control that
  // has gone waits out the whole budget and reads as a hang.
  //
  // Whether the sheet was still up is read BEFORE that press and asserted
  // after, because Save closes the sheet itself: an "is it gone" check placed
  // after the press passes with the bug present and with it absent, which is
  // what a check that cannot fail looks like. This one was written that way
  // first and had to be caught by breaking the guard and watching which
  // assertion went red.
  const field = a.getByPlaceholder(/What\?/);
  const sheetStillOpen = (await field.count()) > 0;
  if (sheetStillOpen) {
    await field.fill('call the vet about the booster');
    await a.getByText('Save', { exact: true }).click({ timeout: 2_000 }).catch(() => {});
    await a.waitForTimeout(4_000);
  }

  await expect
    .poll(async () => /vet/i.test(await a.locator('body').innerText()),
      { message: 'the deleted reminder is still gone here', timeout: 10_000 })
    .toBe(false);

  await b.reload();
  await b.getByTestId('tab-reminders').click();
  await expect
    .poll(async () => (await b.getByTestId('rem-body').allTextContents()).some((t) => /vet/i.test(t)),
      { message: 'and the device that deleted it does not get it back', timeout: 20_000 })
    .toBe(false);

  expect(sheetStillOpen, 'the sheet left when its record did, as the note editor does').toBe(false);
  expect(errors, 'nothing threw when the record went away').toEqual([]);

  await ctxA.close();
  await ctxB.close();
});
