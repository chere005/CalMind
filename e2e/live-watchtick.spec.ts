/**
 * The watch tick, round-tripped through the DEPLOYED test server.
 *
 * The wrist's whole loop is: the phone pushes `watchFeed` JSON over
 * WatchConnectivity, the wrist shows rows, a tap sends one id back, the
 * phone applies `reminderToggle` and syncs, and every other device learns of
 * it. The only link a test cannot drive is WatchConnectivity itself (native,
 * and covered by the swift seam checkers); everything else is exercised here
 * with the REAL code at every step — the feed a wrist would receive is built
 * by core's `watchFeed`, the tick is applied exactly as store.tsx's
 * onWatchTick handler applies it, and the sync rides core's own SyncEngine
 * against the live server, not a mock of any of the three.
 *
 * Unblocked by Sean's word (2026-08-19): throwaway accounts on the TEST
 * server are fine. Opt-in like the live passkey spec, and for the same
 * reason — it touches the network and leaves an account behind:
 *
 *   CALMIND_LIVE=1 npx playwright test live-watchtick
 */
import { test, expect, type Page } from '@playwright/test';
import { SyncEngine, reminderToggle, todayStr, watchFeed, type Rec, type Transport } from '@calmind/core';

const BASE = process.env.CALMIND_LIVE_URL ?? 'https://seancheren.com/test/calmind/';

test.skip(!process.env.CALMIND_LIVE, 'set CALMIND_LIVE=1 to run against the deployed test server');

const API = BASE + 'api/index.php';

async function api<T>(body: object, token?: string): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${(body as { action: string }).action} → ${res.status}`);
  return (await res.json()) as T;
}

const transport =
  (token: string): Transport =>
  async (req) =>
    api({ action: 'sync', cursor: req.cursor, changes: req.changes }, token);

async function signup(page: Page): Promise<{ user: string; pass: string }> {
  const user = `livewt${Date.now()}`;
  const pass = 'live-watchtick-pw';
  await page.goto(BASE);
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill(pass);
  await page.getByPlaceholder('Confirm password').fill(pass);
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 30_000 });
  return { user, pass };
}

test('a tick from the wrist reaches the server and the phone hides the done row', async ({ page }) => {
  test.setTimeout(180_000);
  expect(BASE, 'this spec runs against test, never prod').toContain('/test/');

  // Device A, the phone's UI: a real browser against the deployed server.
  const { user, pass } = await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('wrist errand');
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'wrist errand' })).toBeVisible();
  // The row is on screen; give its write the round trip to the server.
  await expect
    .poll(
      async () => {
        const probe = new SyncEngine();
        const { token } = await api<{ token: string }>({ action: 'login', username: user, password: pass });
        await probe.sync(transport(token));
        return probe.all().some((r) => r.type === 'reminder' && (r as Rec<'reminder'>).payload.text === 'wrist errand');
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // The phone's sync side, as core runs it: pull the account, build the very
  // JSON the wrist would be pushed.
  const { token } = await api<{ token: string }>({ action: 'login', username: user, password: pass });
  const phone = new SyncEngine();
  await phone.sync(transport(token));
  const feed = watchFeed(phone.all(), todayStr());
  const row = feed.items.find((i) => i.text === 'wrist errand');
  expect(row, 'the feed the wrist receives lists the new reminder').toBeTruthy();

  // The wrist answers with the id; the phone applies it exactly as
  // store.tsx's onWatchTick does — same lookup, same toggle — and syncs.
  const rec = phone.all().find((r) => r.id === row!.id && r.type === 'reminder' && !r.deleted) as Rec<'reminder'> | undefined;
  expect(rec).toBeTruthy();
  phone.put({ ...rec!, payload: reminderToggle(rec!.payload, todayStr()) });
  await phone.sync(transport(token));

  // The next feed push would drop the row — a done reminder leaves the wrist.
  const after = new SyncEngine();
  await after.sync(transport(token));
  expect(watchFeed(after.all(), todayStr()).items.some((i) => i.id === row!.id)).toBe(false);

  // And the phone's own screen: reload re-syncs from the server, and the
  // done row hides from the list, which is how a person sees the tick land.
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'wrist errand' })).toHaveCount(0, { timeout: 30_000 });
});
