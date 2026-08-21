/**
 * The public request page and the owner's Requests screen, end to end.
 *
 * A SECOND, ANONYMOUS browser context is the whole point: the /request URL
 * is a link to hand out ("it's a separate URL to give to people"), so it has
 * to work with no session at all, against the same served bundle at a second
 * path. The owner's side then answers through the account menu: Accept
 * becomes the one-hour event, Decline deletes, New time proposes.
 *
 * The slot ARITHMETIC is pinned server-side (server/tools/test.php); what
 * this proves is the surface: the busy hour missing from the page, the
 * request round-tripping into the owner's store, and the three answers.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `mq${Date.now()}${seq++}`;
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

const API = 'http://127.0.0.1:8790/calmind/api/index.php';
async function api<T>(body: object, token?: string): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

function tomorrowISO(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('a stranger requests, the busy hour is not offered, and the owner answers all three ways', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const user = await signup(page);
  const tomorrow = tomorrowISO();

  // The owner is busy at 2pm tomorrow — typed the way a hand types it.
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-text').fill('Standup tomorrow 2pm');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('tab-calendar')).toBeVisible();

  // The owner's sync is debounced; the busy hour only blocks the public
  // page once the SERVER holds the event. Wait for the push, not the click.
  const { token: ownerTok } = await api<{ token: string }>({ action: 'login', username: user, password: 'e2epassword' });
  await expect
    .poll(async () => {
      const pull = await api<{ changes: { type: string; deleted?: boolean; payload: { time?: string } }[] }>(
        { action: 'sync', cursor: 0, changes: [] }, ownerTok);
      return pull.changes.some((c) => c.type === 'event' && !c.deleted && c.payload.time === '14:00');
    }, { timeout: 20_000 })
    .toBe(true);

  // ── The stranger, in a context with no session at all.
  const anon = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const pub = await anon.newPage();
  await pub.goto(`request?u=${user}`);
  await expect(pub.getByText('Request a meeting')).toBeVisible({ timeout: 20_000 });
  // No login gate, no tab bar — this is the public page, not the app.
  await expect(pub.getByTestId('tab-reminders')).toHaveCount(0);

  // Tomorrow is open; its 2pm is not on offer, its neighbours are. Every
  // hour this spec touches sits in 15:00–19:00 — the one stretch open on
  // EVERY weekday (Tuesday opens at 2pm; the busy event takes 14:00), so
  // the test cannot care which day it runs on. The weekday windows
  // themselves are pinned server-side (server/tools/test.php).
  const cell = pub.getByLabel(tomorrow, { exact: true }).first();
  await expect
    .poll(async () => (await cell.getAttribute('aria-disabled')) !== 'true', { timeout: 15_000 })
    .toBe(true);
  await cell.click();
  await expect(pub.getByLabel(`${tomorrow} 15:00`)).toBeVisible();
  await expect(pub.getByLabel(`${tomorrow} 16:00`)).toBeVisible();
  await expect(pub.getByLabel(`${tomorrow} 14:00`)).toHaveCount(0);

  // Three requests: Aki at 3pm, Bob at 4pm, Cee at 5pm.
  const request = async (name: string, hm: string) => {
    await cell.click();
    await pub.getByLabel(`${tomorrow} ${hm}`).click();
    await pub.getByTestId('req-name').fill(name);
    await pub.getByTestId('req-email').fill(`${name.toLowerCase()}@example.com`);
    await pub.getByTestId('req-send').click();
    await expect(pub.getByText('Request sent')).toBeVisible();
    await pub.getByText('Request another time', { exact: true }).click();
  };
  await request('Aki', '15:00');
  await request('Bob', '16:00');
  await request('Cee', '17:00');
  await anon.close();

  // ── The owner. A reload re-syncs; the menu's Requests row opens the list,
  // soonest first.
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('topbar-sync').click();
  await page.getByTestId('menu-requests').click();
  const rows = page.getByTestId('request-row');
  await expect(rows).toHaveCount(3, { timeout: 20_000 });
  await expect(rows.nth(0)).toContainText('Aki');
  await expect(rows.nth(1)).toContainText('Bob');
  await expect(rows.nth(2)).toContainText('Cee');
  await expect(rows.nth(0)).toContainText('about an hour');

  // Accept Aki, decline Bob, propose Cee a new hour on the same day.
  await rows.filter({ hasText: 'Aki' }).getByTestId('request-accept').click();
  await expect(page.getByTestId('requests-msg')).toContainText('Accepted');
  await rows.filter({ hasText: 'Bob' }).getByTestId('request-decline').click();
  await expect(rows).toHaveCount(1);
  await rows.filter({ hasText: 'Cee' }).getByTestId('request-newtime').click();
  await page.getByTestId('request-time').fill('11am');
  await page.getByTestId('request-savetime').click();
  await expect(rows.filter({ hasText: 'Cee' })).toContainText('new time proposed');
  await expect(rows.filter({ hasText: 'Cee' })).toContainText('11am');

  // The store agrees, through the same API everything else uses: Aki became
  // the one-hour event, Bob is gone, Cee is 'proposed' at 11:00 — and the
  // stubbed emails landed in the log-only channel (the server suite pins the
  // log itself; here the calls must simply have been accepted).
  type Pull = { changes: { type: string; deleted?: boolean; payload: Record<string, unknown> }[] };
  let pull!: Pull;
  // The owner's client syncs on a debounce — wait for the answers to LAND,
  // not for the buttons to have been pressed.
  await expect
    .poll(async () => {
      pull = await api<Pull>({ action: 'sync', cursor: 0, changes: [] }, ownerTok);
      return pull.changes.some((c) => c.type === 'event' && !c.deleted && c.payload.text === 'Meeting: Aki')
        && pull.changes.filter((c) => c.type === 'meetreq' && !c.deleted).length === 1;
    }, { timeout: 20_000 })
    .toBe(true);
  const events = pull.changes.filter((c) => c.type === 'event' && !c.deleted);
  const meeting = events.find((c) => c.payload.text === 'Meeting: Aki');
  expect(meeting?.payload.date).toBe(tomorrow);
  expect(meeting?.payload.time).toBe('15:00');
  expect(meeting?.payload.end).toBe('16:00');
  const reqs = pull.changes.filter((c) => c.type === 'meetreq' && !c.deleted);
  expect(reqs).toHaveLength(1);
  expect(reqs[0]!.payload.name).toBe('Cee');
  expect(reqs[0]!.payload.time).toBe('11:00');
  expect(reqs[0]!.payload.status).toBe('proposed');
});

test('the account button wears the number of new requests', async ({ page, browser }) => {
  // Sean, 2026-08-20: "add a badge to the username when there are meeting
  // requests". core's meetreqBadgeCount has carried the number since the stub
  // went in on 08-19 with nothing rendering it; this is the surface.
  test.setTimeout(180_000);
  const user = await signup(page);
  const tomorrow = tomorrowISO();

  // Nothing waiting, nothing shown — the half that makes the next assertion
  // mean something.
  await expect(page.getByTestId('who-badge'), 'no badge on a quiet account').toHaveCount(0);

  const anon = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const pub = await anon.newPage();
  await pub.goto(`request?u=${user}`);
  await expect(pub.getByText('Request a meeting')).toBeVisible({ timeout: 20_000 });
  const cell = pub.getByLabel(tomorrow, { exact: true }).first();
  await expect
    .poll(async () => (await cell.getAttribute('aria-disabled')) !== 'true', { timeout: 15_000 })
    .toBe(true);
  const request = async (name: string, hm: string) => {
    await cell.click();
    await pub.getByLabel(`${tomorrow} ${hm}`).click();
    await pub.getByTestId('req-name').fill(name);
    await pub.getByTestId('req-email').fill(`${name.toLowerCase()}@example.com`);
    await pub.getByTestId('req-send').click();
    await expect(pub.getByText('Request sent')).toBeVisible();
    await pub.getByText('Request another time', { exact: true }).click();
  };
  await request('Aki', '15:00');
  await request('Bob', '16:00');
  await anon.close();

  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('who-badge'), 'two waiting').toHaveText('2', { timeout: 25_000 });

  // The button is the same size with the badge on it: a request arriving
  // mid-session must not nudge the top bar (absolute positioning, as the
  // edit cluster and the swipe park both had to learn).
  const withBadge = (await page.getByTestId('topbar-sync').boundingBox())!;

  // The menu row behind it carries the count too — the account button is shut
  // while you are reading the menu, so the number has to be here as well.
  await page.getByTestId('topbar-sync').click();
  await expect(page.getByTestId('menu-requests-badge')).toHaveText('2');

  // Answering one takes the count down: the badge is the LIVE number, not a
  // flag that something once arrived.
  await page.getByTestId('menu-requests').click();
  await page.getByTestId('request-row').filter({ hasText: 'Aki' }).getByTestId('request-accept').click();
  await expect(page.getByTestId('requests-msg')).toContainText('Accepted');
  await page.getByTestId('requests-back').click({ timeout: 3_000 }).catch(() => {});
  await expect(page.getByTestId('who-badge'), 'one left').toHaveText('1', { timeout: 20_000 });

  const noBadge = (await page.getByTestId('topbar-sync').boundingBox())!;
  expect(Math.round(noBadge.width), 'the button never changes size').toBe(Math.round(withBadge.width));
  expect(Math.round(noBadge.height), 'nor its height').toBe(Math.round(withBadge.height));
});
