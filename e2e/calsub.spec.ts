import { expect, test, type Page } from '@playwright/test';

/**
 * Subscribe-by-link, read-only — Sean, 2026-08-18: "subscribe-by-link first,
 * i just want read only access to other calendar system."
 *
 * The server's calsub_fetch is mocked at the network edge, the way the OCR
 * specs mock recipe_fetch: its own wiring (auth, SSRF guard, cache) is
 * test.php's business, and no test server can serve a REAL feed anyway — the
 * guard rightly refuses every address a test can bind. What this drives is
 * everything client-side: the subscribe flow makes a record, the record makes
 * a fetch, the ICS becomes chips on the right day, and the picker's box takes
 * them away again.
 */

const today = new Date().toISOString().slice(0, 10);
const ymd = today.replace(/-/g, '');

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:team-sync@feed',
  'SUMMARY:Team sync',
  `DTSTART:${ymd}T140000`,
  `DTEND:${ymd}T150000`,
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday@feed',
  'SUMMARY:Street fair',
  `DTSTART;VALUE=DATE:${ymd}`,
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

async function signupAndMock(page: Page) {
  await page.route('**/api/index.php', async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('calsub_fetch')) {
      await route.fulfill({ json: { ok: true, ics: ICS, cached: false } });
      return;
    }
    await route.fallback();
  });
  const user = `cs${String(Date.now()).slice(-8)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

async function subscribe(page: Page, url: string) {
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('pick-calendar').click();
  await page.getByText('Manage calendars', { exact: true }).click();
  await page.getByTestId('calsub-url').fill(url);
  await page.getByTestId('calsub-add').click();
  await page.getByText('Done', { exact: true }).click();
}

test('a pasted link becomes a read-only calendar on the right day', async ({ page }) => {
  test.setTimeout(90_000);
  await signupAndMock(page);
  await subscribe(page, 'webcal://feeds.example.com/team.ics');

  // The chips arrive on today's panel: the timed event with its range, the
  // all-day one with none.
  await expect(page.getByText('Subscribed', { exact: true })).toBeVisible({ timeout: 10_000 });
  const rows = page.getByTestId('dp-sub-row');
  await expect(rows.filter({ hasText: 'Team sync' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Street fair' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Team sync' }).locator('..').getByText(/2pm–3pm|14:00–15:00/)).toBeVisible();

  // Read-only by construction: a subscribed row offers no tick, no edit, no
  // delete — long-pressing it arms nothing.
  await rows.filter({ hasText: 'Team sync' }).click({ delay: 500 }).catch(() => {});
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Team sync' }).getByLabel('Delete')).toHaveCount(0);
});

test('the picker names the feed and its box hides it', async ({ page }) => {
  test.setTimeout(90_000);
  await signupAndMock(page);
  await subscribe(page, 'https://feeds.example.com/name-me.ics');
  await expect(page.getByText('Subscribed', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('pick-calendar').click();
  // Named from the host — one pasted field, renamable later like any calendar.
  await expect(page.getByTestId('calsub-row-feeds.example.com')).toBeVisible();
  await page.getByTestId('calsub-box-feeds.example.com').click();
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 300); // close the picker via its backdrop
  await expect(page.getByText('Subscribed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Team sync')).toHaveCount(0);
});

test('deleting the subscription takes its events with it', async ({ page }) => {
  test.setTimeout(90_000);
  await signupAndMock(page);
  await subscribe(page, 'https://feeds.example.com/gone.ics');
  await expect(page.getByText('Subscribed', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('pick-calendar').click();
  await page.getByText('Manage calendars', { exact: true }).click();
  // ConfirmDelete arms on the first press, fires on the second.
  const scope = page.locator('div').filter({ hasText: /^Subscribed by link/ }).last();
  await page.getByLabel('Delete').last().click();
  await page.getByLabel('Delete').last().click();
  void scope;
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByText('Subscribed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Team sync')).toHaveCount(0);
});
