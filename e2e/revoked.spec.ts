import { expect, test, type Page } from '@playwright/test';

/**
 * A session that dies underneath you.
 *
 * Changing your password revokes every other device's token — that is a
 * server rule with its own test. What no test had ever exercised is the other
 * end of it: what the app on the OTHER device does when its next sync comes
 * back 401. The store has a branch for exactly this (drop the session, land
 * on the login), and it had never once run.
 *
 * The failure it guards against is the quiet one: a client that treats a dead
 * token as "offline", shows a yellow dot forever, keeps accepting edits and
 * never tells anyone they are going nowhere.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rev${Date.now()}${seq++}`;
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

test('a token revoked elsewhere lands this device back on the login, not in a silent limbo', async ({ page, context }) => {
  test.setTimeout(90_000);
  const user = await signup(page);
  const url = page.url().split('?')[0]!;

  // A second device on the same account.
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // Device one changes the password, which revokes device two's token.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByPlaceholder('Current password').fill('e2epassword');
  await page.getByPlaceholder('New password', { exact: true }).fill('e2epassword2');
  await page.getByPlaceholder('Confirm new password').fill('e2epassword2');
  await page.getByText('Change password', { exact: true }).click();
  await page.waitForTimeout(1_500);

  // Device two now holds a dead token. Its next sync is a 401, and the app
  // must say so by returning to the login rather than pretending to be
  // offline while quietly accepting edits that can never land.
  await p2.reload();
  await expect(p2.getByPlaceholder('Username'), 'the dead session dropped to the login')
    .toBeVisible({ timeout: 30_000 });
  await expect(p2.getByTestId('tab-reminders')).toBeHidden();

  // And the new password is the one that works there now.
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword2');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // Device one, which made the change, is untouched — its own token survives.
  // (no need to dismiss the settings window — the reload discards it, and a
  // click().catch() on a maybe-absent control waits out the whole budget
  // before it ever rejects.)
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await other.close();
});
