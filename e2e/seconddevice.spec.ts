/**
 * Signing in on a SECOND device must not duplicate the starters.
 *
 * store.tsx guards this and says why:
 *
 *   // Seeding starters against an EMPTY engine that simply hasn't pulled yet
 *   // would duplicate everything the server already holds — normalize only
 *   // runs once the store is hydrated: a snapshot with a cursor, or one
 *   // completed sync.
 *
 * A device that has never seen the account starts with an empty engine. If
 * normalize runs before the first pull lands, it seeds a fresh set of
 * starters, those get pushed, and the account ends up with two of everything
 * — on the server, so every other device gets them too.
 *
 * Nothing was checking it. Removing `if (hydratedRef.current)` left all 187
 * gesture tests green, because every spec SIGNS UP: a fresh account against
 * an empty server, where seeding early is invisible because there is nothing
 * to duplicate. Signing IN on a clean device is the case the guard is for and
 * the case nobody drove.
 *
 * It is not exotic. It is a new phone, a second browser, or clearing site
 * data — and the damage lands on the server, so it follows you everywhere.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;

async function signup(page: Page): Promise<string> {
  const user = `sd${Date.now()}${seq++}`;
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

/** Every folder head the Reminders screen is drawing, by name. */
const folderHeads = (page: Page) =>
  page.locator('[data-testid^="foldadd-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('foldadd-', '')).sort(),
  );

test('a second device signing in gets ONE set of starters, not two', async ({ browser }) => {
  test.setTimeout(180_000);

  // Device one: a new account, with whatever normalize seeds.
  const first = await browser.newContext();
  const a = await first.newPage();
  const user = await signup(a);
  await a.getByTestId('tab-reminders').click();
  await expect.poll(() => folderHeads(a), { timeout: 20_000 }).not.toEqual([]);
  const before = await folderHeads(a);

  // Device two: a context that has never seen this account, so the engine
  // really is empty rather than hydrated from a snapshot. Logging out on the
  // first device would NOT do — the snapshot survives a sign-out on purpose.
  const second = await browser.newContext();
  const b = await second.newPage();
  await b.goto('.');
  await b.getByPlaceholder('Username').fill(user);
  await b.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await b.getByText('Sign in', { exact: true }).click();
  await expect(b.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await b.getByTestId('tab-reminders').click();

  await expect
    .poll(() => folderHeads(b), { message: 'the second device sees exactly what the first had', timeout: 20_000 })
    .toEqual(before);

  // And the damage would be on the SERVER, so the first device is where it
  // shows up. Reload it and count again — duplicates pushed by device two
  // would arrive here.
  await a.reload();
  await a.getByTestId('tab-reminders').click();
  await expect
    .poll(() => folderHeads(a), { message: 'and nothing new came back to the first device', timeout: 20_000 })
    .toEqual(before);

  await first.close();
  await second.close();
});
