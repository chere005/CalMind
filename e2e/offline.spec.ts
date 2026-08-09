import { expect, test, type Page } from '@playwright/test';

/**
 * The promise the whole store design exists for: this is a LOCAL-FIRST app.
 * Edits are supposed to land instantly whether or not the server is reachable,
 * survive a reload while it still isn't, and go up the moment it is again.
 *
 * Every other spec runs online, so none of that had ever been tested end to
 * end — only the sync engine's own unit tests, which never leave the process.
 * A phone loses signal constantly; this is the case Sean lives in, not an
 * edge one.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `off${Date.now()}${seq++}`;
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

async function addReminder(page: Page, text: string) {
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
}

test('an edit made offline survives a reload and syncs when the server comes back', async ({ page, context }) => {
  const user = await signup(page);
  await page.getByTestId('tab-reminders').click();
  await addReminder(page, 'made while online');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'made while online' })).toBeVisible();

  // Pull the plug.
  await context.setOffline(true);
  await addReminder(page, 'made while offline');
  // Local-first: it lands immediately, with nowhere to send it.
  await expect(page.getByTestId('rem-row').filter({ hasText: 'made while offline' })).toBeVisible();

  // NOT reloading here, deliberately, and the reason is worth writing down:
  // there is no service worker, so a browser with no signal cannot fetch
  // index.html or the bundle at all — a reload offline dies before any of our
  // code runs. The local-first snapshot is real, but on the WEB it only saves
  // a session that is already loaded. (Native and the Tauri shell carry their
  // bundle on disk, so they genuinely do open offline.) Making the PWA open
  // offline means a service worker, which collides head-on with the deploy's
  // rule that index.html must always revalidate — that is Sean's call, not a
  // thing to slip into a test run.
  //
  // What IS promised offline in a loaded session: edits keep landing, and the
  // app keeps working as you move around it.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'made while offline' })).toBeVisible();

  // And one more edit while still cut off, to prove the queue keeps taking.
  await addReminder(page, 'and another offline');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'and another offline' })).toBeVisible();

  // Plug it back in and let the app catch up.
  await context.setOffline(false);
  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'made while offline' })).toBeVisible({ timeout: 20_000 });

  // The real proof is on the SERVER, not the screen: a brand-new browser that
  // has never seen this device's storage signs in and finds both rows.
  const fresh = await context.browser()!.newContext();
  const p2 = await fresh.newPage();
  await p2.goto(page.url().split('?')[0]!);
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await p2.getByTestId('tab-reminders').click();
  await expect(p2.getByTestId('rem-row').filter({ hasText: 'made while offline' })).toBeVisible({ timeout: 20_000 });
  await expect(p2.getByTestId('rem-row').filter({ hasText: 'and another offline' })).toBeVisible();
  await fresh.close();
});
