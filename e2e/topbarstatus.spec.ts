import { expect, test, type Page } from '@playwright/test';

/**
 * The sync status dot, in the top bar, on every screen.
 *
 * chrome.tsx's own header has described this dot since the file was written —
 * "then the sync status dot (green online, yellow offline)" — while nothing
 * drew it: `syncState` was destructured and never used. The one honest signal
 * that a note did NOT save therefore lived only inside Settings, behind the
 * username menu. A warning you have to go looking for is most of the way to
 * no warning at all, and this app's worst historical bug was exactly a silent
 * save failure.
 */
async function signup(page: Page): Promise<string> {
  const user = `tb${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

const TABS = ['reminders', 'calendar', 'notes', 'habits', 'add'];

test('the dot is in the bar on every screen, and says what it means', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);

  for (const tab of TABS) {
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(200);
    const dot = page.getByTestId('topbar-sync');
    await expect(dot, `${tab}: the dot is drawn`).toBeVisible();
    // A bare coloured circle tells a screen reader nothing, so it carries the
    // sentence Settings shows.
    await expect(dot, `${tab}: it says what it means`).toHaveAttribute('aria-label', /synced|Offline|Syncing|too long|cannot save/);
  }
});

test('it goes red where it matters — a note too long to save', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('War and Peace');
  // Past the server's 64KB cap: refused, and the app must stop claiming synced.
  await page.getByTestId('note-body-edit').fill('x'.repeat(70_000));
  await page.getByTestId('note-back').click();

  await expect(
    page.getByTestId('topbar-sync'),
    'the bar itself says the note did not save, without opening Settings',
  ).toHaveAttribute('aria-label', /too long to save/, { timeout: 25_000 });

  // AND IT NAMES THE NOTE. "A note is too long to save" in an app holding
  // hundreds leaves you to go and find it, and it is by definition not the
  // one on screen.
  await expect(
    page.getByTestId('topbar-sync'),
    'it names which note, not just that one exists',
  ).toHaveAttribute('aria-label', /War and Peace/);

  // Settings tells the same story from the same rule — it used to carry its
  // own copy of the sentence beside a dot that read the shared one.
  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(page.getByText(/War and Peace.*too long to save/)).toBeVisible({ timeout: 10_000 });
});
