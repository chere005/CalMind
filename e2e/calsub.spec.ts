import { expect, test, type Page } from '@playwright/test';
import { snapshotKey } from './port';

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

/**
 * The LOCAL date, built from local parts — not `toISOString().slice(0, 10)`,
 * which is UTC.
 *
 * The feed below puts its events on "today" and the day panel shows the
 * device's today (core's todayStr, local by design). Those are the same date
 * for most of the day and different after 19:00 in Chicago, when UTC has
 * already rolled over: the events land on tomorrow, the panel shows today,
 * the "Subscribed" heading never appears and all three tests in this file
 * fail together on a timeout.
 *
 * Which is exactly how it was found — a full suite that passed at 18:00 and
 * failed at 19:20, on an idle machine, with nothing between the two runs but
 * a version bump. A spec that is only true before dinner is worse than no
 * spec, because it spends its evenings accusing whatever changed last.
 */
const pad2 = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
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

type MockOptions = {
  fetchError?: string;
  discoverError?: string;
  calendars?: { url: string; name: string; color?: string }[];
};

async function signupAndMock(page: Page, options: MockOptions = {}) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/index.php', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'calsub_fetch') {
      requests.push(body);
      await route.fulfill(options.fetchError
        ? { status: 400, json: { ok: false, error: options.fetchError } }
        : { json: { ok: true, ics: ICS, cached: false } });
      return;
    }
    if (body.action === 'calsub_discover') {
      requests.push(body);
      await route.fulfill(options.discoverError
        ? { status: 400, json: { ok: false, error: options.discoverError } }
        : { json: { ok: true, calendars: options.calendars ?? [] } });
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
  return { user, requests };
}

async function openManager(page: Page) {
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('pick-calendar').click();
  await page.getByTestId('manage-calendars-row').click();
}

async function importedCalendars(page: Page, user: string) {
  return page.evaluate((key) => {
    const snapshot = JSON.parse(localStorage.getItem(key) ?? '{}');
    return (snapshot.recs ?? []).filter((r: { type: string; deleted?: boolean }) => r.type === 'calsub' && !r.deleted);
  }, snapshotKey(user));
}

async function calendarStorageState(page: Page, user: string) {
  return page.evaluate((key) => {
    const snapshot = JSON.parse(localStorage.getItem(key) ?? '{}');
    const records = (snapshot.recs ?? []) as { id: string; type: string; payload: unknown; deleted?: boolean }[];
    return {
      ids: records.map((r) => r.id),
      collections: records.filter((r) => r.type === 'calendar' || r.type === 'folder')
        .map((r) => ({ id: r.id, type: r.type, payload: r.payload })).sort((a, b) => a.id.localeCompare(b.id)),
      eventIds: records.filter((r) => r.type === 'event').map((r) => r.id).sort(),
    };
  }, snapshotKey(user));
}

async function subscribe(page: Page, url: string) {
  await openManager(page);
  await page.getByTestId('calsub-url').fill(url);
  await page.getByTestId('calsub-add').click();
  await expect(page.getByTestId('calsub-url')).toHaveValue('');
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
  await rows.filter({ hasText: 'Team sync' }).click({ delay: 500, timeout: 1_500 }).catch(() => {});
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

const GOOGLE_URL = 'https://calendar.google.com/calendar/ical/person%40example.com/private-fixture/basic.ics';

test('Google iCal import verifies the feed, persists its provider, and avoids duplicates', async ({ page }) => {
  test.setTimeout(90_000);
  const { user, requests } = await signupAndMock(page);
  await openManager(page);
  await page.getByTestId('calsub-source-google').click();
  await expect(page.getByText(/Secret address in iCal format/)).toBeVisible();
  await page.getByTestId('calsub-url').fill(GOOGLE_URL);
  await page.getByTestId('calsub-add').click();
  await expect(page.getByTestId('calsub-url')).toHaveValue('');
  await expect.poll(async () => (await importedCalendars(page, user)).length).toBe(1);
  expect((await importedCalendars(page, user))[0].payload).toMatchObject({ source: 'google', url: GOOGLE_URL });
  expect(requests.some((r) => r.action === 'calsub_fetch' && r.url === GOOGLE_URL)).toBe(true);

  await page.getByTestId('calsub-url').fill(GOOGLE_URL);
  await page.getByTestId('calsub-add').click();
  await expect(page.getByTestId('calsub-error')).toBeVisible();
  expect(await importedCalendars(page, user)).toHaveLength(1);
  await page.getByText('Done', { exact: true }).click();
  const event = page.getByTestId('dp-sub-row').filter({ hasText: 'Team sync' });
  await expect(event).toBeVisible();
  await expect(event.getByLabel('Edit')).toHaveCount(0);
  await expect(event.getByLabel('Delete')).toHaveCount(0);
});

test('a failed Google feed import shows the error and saves no calendar', async ({ page }) => {
  test.setTimeout(90_000);
  const { user } = await signupAndMock(page, { fetchError: 'that link is not a calendar (.ics) feed' });
  await openManager(page);
  await page.getByTestId('calsub-source-google').click();
  await page.getByTestId('calsub-url').fill(GOOGLE_URL);
  await page.getByTestId('calsub-add').click();
  await expect(page.getByTestId('calsub-error')).toContainText('not a calendar');
  await expect(page.getByTestId('calsub-url')).toHaveValue(GOOGLE_URL);
  expect(await importedCalendars(page, user)).toHaveLength(0);
});

test('CalDAV discovery imports only selected calendars and keeps authenticated refresh read-only', async ({ page }) => {
  test.setTimeout(90_000);
  const calendars = [
    { url: 'https://dav.example.com/calendars/person/team/', name: 'Team', color: '#123456' },
    { url: 'https://dav.example.com/calendars/person/private/', name: 'Private' },
  ];
  const { user, requests } = await signupAndMock(page, { calendars });
  await openManager(page);
  await expect.poll(async () => (await calendarStorageState(page, user)).collections.length).toBeGreaterThan(0);
  const before = await calendarStorageState(page, user);
  await page.getByTestId('calsub-source-caldav').click();
  await expect(page.getByTestId('calsub-destination-help')).toContainText('Each imported calendar creates its own new read-only folder.');
  await page.getByTestId('calsub-url').fill('https://dav.example.com/');
  await expect(page.getByTestId('calsub-discover')).toBeDisabled();
  await page.getByTestId('calsub-username').fill('person@example.com');
  await expect(page.getByTestId('calsub-discover')).toBeDisabled();
  await page.getByTestId('calsub-password').fill('fixture-app-password');
  await page.getByTestId('calsub-username').fill('');
  await expect(page.getByTestId('calsub-discover')).toBeDisabled();
  expect(requests.filter((r) => r.action === 'calsub_discover')).toHaveLength(0);
  await page.getByTestId('calsub-username').fill('person@example.com');
  await expect(page.getByTestId('calsub-discover')).toBeEnabled();
  await expect(page.getByTestId('calsub-password')).toHaveAttribute('type', 'password');
  await page.getByTestId('calsub-discover').click();
  await expect(page.getByTestId('calsub-discovered-0')).toContainText('Team');
  await expect(page.getByTestId('calsub-discovered-1')).toContainText('Private');
  await page.getByTestId('calsub-discovered-1').click();
  await page.getByTestId('calsub-import').click();
  await expect.poll(async () => (await importedCalendars(page, user)).length).toBe(1);
  const imported = (await importedCalendars(page, user))[0];
  expect(imported.payload).toMatchObject({
    source: 'caldav', url: calendars[0].url, name: 'Team', username: 'person@example.com', password: 'fixture-app-password',
  });
  expect(before.ids).not.toContain(imported.id);
  const after = await calendarStorageState(page, user);
  expect(after.collections).toEqual(before.collections);
  expect(after.eventIds).toEqual(before.eventIds);
  expect(requests.find((r) => r.action === 'calsub_discover')).toMatchObject({
    url: 'https://dav.example.com/', username: 'person@example.com', password: 'fixture-app-password',
  });
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Team sync' })).toBeVisible();
  await expect.poll(() => requests.filter((r) => r.action === 'calsub_fetch').length).toBeGreaterThan(0);
  for (const request of requests.filter((r) => r.action === 'calsub_fetch')) {
    expect(request).toMatchObject({ source: 'caldav', url: calendars[0].url, username: 'person@example.com', password: 'fixture-app-password' });
  }

  requests.length = 0;
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Team sync' })).toBeVisible();
  await expect.poll(() => requests.some((r) => r.action === 'calsub_fetch' && r.source === 'caldav')).toBe(true);
  expect(await importedCalendars(page, user)).toHaveLength(1);
});

test('CalDAV authentication failure is actionable and creates no subscription', async ({ page }) => {
  test.setTimeout(90_000);
  const { user } = await signupAndMock(page, { discoverError: 'CalDAV sign-in failed. Check your username and app password.' });
  await openManager(page);
  await page.getByTestId('calsub-source-caldav').click();
  await page.getByTestId('calsub-url').fill('https://dav.example.com/');
  await page.getByTestId('calsub-username').fill('person@example.com');
  await page.getByTestId('calsub-password').fill('wrong-fixture-password');
  await page.getByTestId('calsub-discover').click();
  await expect(page.getByTestId('calsub-error')).toContainText('Check your username and app password');
  await expect(page.getByTestId('calsub-discovered-0')).toHaveCount(0);
  expect(await importedCalendars(page, user)).toHaveLength(0);
});

test('deleting the subscription takes its events with it', async ({ page }) => {
  test.setTimeout(90_000);
  await signupAndMock(page);
  await subscribe(page, 'https://feeds.example.com/gone.ics');
  await expect(page.getByText('Subscribed', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('pick-calendar').click();
  await page.getByTestId('manage-calendars-row').click();
  // ConfirmDelete arms on the first press, fires on the second.
  await page.getByLabel('Delete').last().click();
  await page.getByLabel('Delete').last().click();
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByText('Subscribed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Team sync')).toHaveCount(0);
});
