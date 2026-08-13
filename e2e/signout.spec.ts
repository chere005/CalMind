/**
 * Log out has to survive a storage that will not delete.
 *
 * store.tsx treats removing the stored session as allowed to fail, and it is
 * right to: clearing memory is what signs you out, and a refusing store must
 * never take the sign-out with it. A throw there once left you signed in with
 * no error at all.
 *
 * That leaves the token sitting on disk, which is normally harmless because
 * the server revokes it — and that is worth testing rather than believing,
 * so the first test drives exactly that: removeItem throws, the token stays,
 * and the next launch still lands on the login page because the server says
 * no. It passes with and without the fix below; it is here to pin the reason
 * the leftover is usually fine.
 *
 * OFFLINE there is no server to say no. That is the second test, and it is
 * the one that failed: the launch path restored the session and showed the
 * account's cached snapshot on a device where Log out had been pressed.
 *
 * Both need storage to refuse, which is rare — a full quota, a browser wiping
 * site data, a store under pressure. Rare is the point. The failures this
 * project keeps finding are the ones nothing announces.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `so${Date.now()}${seq++}`;
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

/** Storage refuses to delete ONLY the session key: the narrow failure, not a
 *  dead store. Everything else — the snapshot, the fold state — still writes,
 *  which is what makes the account's data still be there to be shown. */
async function refuseToDeleteTheSession(page: Page) {
  await page.evaluate(() => {
    const real = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k: string) {
      if (String(k).includes('calmind.session')) throw new Error('storage refuses');
      return real.call(this, k);
    };
  });
}

async function logOut(page: Page, user: string) {
  await page.getByTestId('topbar-sync').click();
  await page.getByText('Log out', { exact: true }).click();
  // This run is signed out either way — memory is cleared regardless.
  await expect(page.getByText('Sign up', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('online, the server refuses the leftover token', async ({ page }) => {
  const user = await signup(page);
  await refuseToDeleteTheSession(page);
  await logOut(page, user);

  // The token really is still there — otherwise the rest proves nothing.
  const onDisk = await page.evaluate(() => localStorage.getItem('calmind.session'));
  expect(onDisk, 'the session should still be on disk; the removal was refused').not.toBeNull();

  await page.reload();
  await expect(page.getByText('Sign up', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('tab-reminders')).toBeHidden();
});

test('offline, a refused delete must still not sign you back in', async ({ page }) => {
  const user = await signup(page);
  await refuseToDeleteTheSession(page);
  await logOut(page, user);

  // No server to revoke anything. The device is the only authority left.
  await page.route('**/api/**', (r) => r.abort());
  await page.reload();

  // Before the fix this showed the account: tab bar visible, snapshot loaded.
  await expect(page.getByText('Sign up', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('tab-reminders')).toBeHidden();
});
