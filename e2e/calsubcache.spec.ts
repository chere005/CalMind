import { expect, test, type Page } from '@playwright/test';
import type { Rec } from '@calmind/core';
import { API, SESSION_KEY, snapshotKey } from './port';

const FEED_URL = 'https://calendar.example/fixture.ics';
const SUB_ID = 'cache-calendar-fixture';
const makeSub = (extra: Partial<Rec<'calsub'>['payload']> = {}): Rec<'calsub'> => ({
  id: SUB_ID, type: 'calsub', updated: 1,
  payload: { url: FEED_URL, name: 'Fixture feed', color: '#123456', ord: 'a', ...extra },
});
const feed = (title: string) => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:cache-fixture\r\nSUMMARY:${title}\r\nDTSTART;VALUE=DATE:${date}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
};

async function boot(page: Page, username: string, subscription: Rec<'calsub'>) {
  await page.evaluate(({ sessionKey, snapKey, api, username, subscription }) => {
    localStorage.setItem(sessionKey, JSON.stringify({ serverUrl: api, username, token: `${username}-fixture-token` }));
    localStorage.setItem(snapKey, JSON.stringify({ cursor: 1, recs: [subscription], dirty: [] }));
  }, { sessionKey: SESSION_KEY, snapKey: snapshotKey(username), api: API, username, subscription });
  await page.reload();
  await page.getByTestId('tab-calendar').click();
}

async function changeSubscription(page: Page, username: string, subscription: Rec<'calsub'>) {
  await page.evaluate(({ key, subscription }) => {
    const snapshot = JSON.parse(localStorage.getItem(key)!);
    snapshot.recs = snapshot.recs.map((record: { id: string }) => record.id === subscription.id ? subscription : record);
    const newValue = JSON.stringify(snapshot);
    localStorage.setItem(key, newValue);
    // A synced edit from another browser tab, the app's real merge seam.
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
  }, { key: snapshotKey(username), subscription: { ...subscription, updated: Date.now() + 10_000 } });
}

async function mockApi(page: Page, response: (body: Record<string, unknown>) => string | null) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/index.php', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'calsub_fetch') {
      requests.push(body);
      const ics = response(body);
      await route.fulfill(ics === null
        ? { status: 503, json: { ok: false, error: 'Fixture calendar is offline.' } }
        : { json: { ok: true, ics } });
    } else if (body.action === 'sync') {
      await route.fulfill({ json: { ok: true, cursor: Number(body.cursor) + 1, changes: [] } });
    } else {
      await route.fulfill({ json: { ok: true, partners: [], partner: null, records: [] } });
    }
  });
  await page.goto('.');
  return requests;
}

test('offline calendar caches belong to one account and remain available on return', async ({ page }) => {
  let offline = false;
  const requests = await mockApi(page, () => offline ? null : feed('Alice private calendar'));
  const subscription = makeSub();
  await boot(page, 'cachealice', subscription);
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Alice private calendar' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('calmind.ics@')).length)).toBe(1);

  offline = true;
  const beforeBob = requests.length;
  await boot(page, 'cachebob', subscription);
  await expect.poll(() => requests.length).toBeGreaterThan(beforeBob);
  await expect(page.getByTestId('dp-sub-row')).toHaveCount(0);

  const beforeAlice = requests.length;
  await boot(page, 'cachealice', subscription);
  await expect.poll(() => requests.length).toBeGreaterThan(beforeAlice);
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Alice private calendar' })).toBeVisible();
});

test('a changed calendar URL never reuses the old feed while offline', async ({ page }) => {
  const requests = await mockApi(page, (body) => body.url === FEED_URL ? feed('Old connection calendar') : null);
  await boot(page, 'cachealice', makeSub());
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Old connection calendar' })).toBeVisible();
  const changed = makeSub({ url: 'https://calendar.example/replacement.ics' });
  await changeSubscription(page, 'cachealice', changed);
  await expect.poll(() => requests.some((body) => body.url === changed.payload.url)).toBe(true);
  await expect(page.getByTestId('dp-sub-row')).toHaveCount(0);

  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('dp-sub-row')).toHaveCount(0);
});

test('CalDAV credential edits refetch and a malformed refresh keeps the good offline feed', async ({ page }) => {
  const initialPassword = 'first-fixture-password';
  const changedPassword = 'replacement-fixture-password';
  const requests = await mockApi(page, (body) => body.password === changedPassword
    ? 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Truncated calendar\r\nEND:VCALENDAR'
    : feed('Last good CalDAV calendar'));
  const subscription = makeSub({ source: 'caldav', url: 'https://calendar.example/dav/', username: 'dav-user', password: initialPassword });
  await boot(page, 'cachealice', subscription);
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Last good CalDAV calendar' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('calmind.ics@')).length)).toBe(1);
  await changeSubscription(page, 'cachealice', { ...subscription, payload: { ...subscription.payload, password: changedPassword } });
  await expect.poll(() => requests.some((body) => body.password === changedPassword)).toBe(true);
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Last good CalDAV calendar' })).toBeVisible();
  await expect(page.getByTestId('dp-sub-row').filter({ hasText: 'Truncated calendar' })).toHaveCount(0);

  const cache = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('calmind.ics@')).map((key) => localStorage.getItem(key)).join(''));
  expect(cache).not.toContain(initialPassword);
  expect(cache).not.toContain(changedPassword);
  expect(cache).toContain('Last good CalDAV calendar');
});
