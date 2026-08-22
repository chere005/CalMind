/**
 * The availability editor under the Requests menu (Sean, 2026-08-21): "show a
 * calendar where i can tap a day to see my availability that day below… if i
 * tap the time make it red and no longer show it on requests… times where i
 * already have something on the calendar default to red, they aren't omitted
 * in my view so i can override… these settings are the final say on the
 * request screen."
 *
 * Two surfaces have to disagree in exactly the right way, which is why this
 * is an e2e test and not two unit tests: HIS view keeps the hours his
 * calendar has taken, so he can override them, and the STRANGER'S view never
 * shows them at all. A spec that only looked at one side could not tell the
 * difference between "hidden from the public" and "gone".
 *
 * The account is named `owner` on purpose — playwright.config.ts starts the
 * harness with CALMIND_MEETREQ_USER=owner, so this account is the one whose
 * request page the instance serves, and the editor is drawn for it alone.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const API = 'http://127.0.0.1:8790/calmind/api/index.php';
async function api<T>(body: object, token?: string): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next Monday — always 1..7 days ahead, so never today, and always a
 *  10am–8pm day, which is the window every hour below assumes. */
function nextMonday(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 1);
  return iso(d);
}

async function signup(page: Page, user: string) {
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

/** Open the account menu's Requests screen and land on the target day. */
async function openAvailability(page: Page, day: string) {
  await page.getByTestId('topbar-sync').click();   // the account button; it opens the menu
  await page.getByTestId('menu-requests').click();
  await expect(page.getByTestId('avail')).toBeVisible({ timeout: 20_000 });
  const thisMonth = iso(new Date()).slice(0, 7);
  if (day.slice(0, 7) !== thisMonth) await page.getByTestId('av-next').click();
  await page.getByTestId('av-cell').and(page.getByLabel(day, { exact: true })).click();
  await expect(page.getByTestId('av-slot').first()).toBeVisible({ timeout: 10_000 });
}

/** What the public page is offering on one day, straight from the API. */
const publicSlots = (day: string) =>
  api<{ days: Record<string, string[]> }>({ action: 'meetreq_slots', user: 'owner', from: day, days: 1 })
    .then((r) => r.days[day] ?? []);

test('his taps are the final say on what a stranger is offered', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const day = nextMonday();
  await signup(page, 'owner');
  const { token } = await api<{ token: string }>({ action: 'login', username: 'owner', password: 'e2epassword' });

  // An event at 4pm that day, typed the way a hand types it. It is what the
  // rules will call busy, and what he then overrides.
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-event').click();
  await page.getByTestId('add-text').fill(`Standup ${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} 4pm`);
  await page.getByText('Done', { exact: true }).click();
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).not.toContain('16:00');

  await openAvailability(page, day);

  // ── His view keeps the clash. This is the assertion the whole feature
  // turns on: the public list above has already dropped 16:00, and it is
  // still here, red, with the dot that says why.
  const slot = (hm: string, state: 'open' | 'closed') =>
    page.getByLabel(`${day} ${hm} ${state}`, { exact: true });
  await expect(slot('16:00', 'closed'), 'the busy hour is red in his own view').toBeVisible();
  await expect(
    page.getByTestId('av-slot').filter({ has: page.getByTestId('av-busy') }),
    'and only the busy hour carries the dot',
  ).toHaveCount(1);
  await expect(slot('15:00', 'open'), 'a free hour is blue').toBeVisible();

  // ── Tapping a blue hour closes it, and closes it for the stranger too.
  await slot('15:00', 'open').click();
  await expect(slot('15:00', 'closed')).toBeVisible();
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).not.toContain('15:00');
  await expect(await publicSlots(day), 'and nothing else moved').toContain('17:00');

  // ── Tapping the red busy hour OPENS it — the override he asked for, on
  // top of a real clash on his own calendar.
  await slot('16:00', 'closed').click();
  await expect(slot('16:00', 'open')).toBeVisible();
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).toContain('16:00');

  // ── Tapping back leaves nothing behind: the rules resume, and the hour
  // his calendar owns goes red again on its own.
  await slot('16:00', 'open').click();
  await expect(slot('16:00', 'closed')).toBeVisible();
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).not.toContain('16:00');

  // ── All empties the day, and the stranger's calendar says so.
  await page.getByTestId('av-all').click();
  await expect(page.getByLabel(`${day} 17:00 open`)).toHaveCount(0);
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).toEqual([]);

  // The stranger's page, in a context with no session at all: the day is not
  // merely empty, it is not selectable.
  const anon = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const pub = await anon.newPage();
  await pub.goto('request?u=owner');
  await expect(pub.getByText('Request a meeting')).toBeVisible({ timeout: 20_000 });
  const cell = pub.getByLabel(day, { exact: true }).first();
  await expect.poll(async () => cell.getAttribute('aria-disabled'), { timeout: 15_000 }).toBe('true');
  await anon.close();

  // ── And All again offers the whole day, clash included — "enable all"
  // means all, which is the half of the toggle that is easy to get wrong.
  await page.getByTestId('av-all').click();
  await expect(slot('16:00', 'open')).toBeVisible();
  await expect.poll(() => publicSlots(day), { timeout: 25_000 }).toContain('15:00');

  // The record itself: one per day, and only the DIFFERENCES in it. 16:00 is
  // the only hour the rules would have got wrong, so it is the only entry.
  const pull = await api<{ changes: { id: string; type: string; payload: { on: string[] } }[] }>(
    { action: 'sync', cursor: 0, changes: [] }, token);
  const av = pull.changes.filter((c) => c.type === 'meetavail');
  expect(av, 'one record for the day, not one per tap').toHaveLength(1);
  expect(av[0]!.id).toBe(`meetavail_${day}`);
  expect(av[0]!.payload.on).toEqual(['16:00']);
});

test('nobody else gets an editor for a page that is not theirs', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page, `nx${Date.now()}`);
  await page.getByTestId('topbar-sync').click();   // the account button; it opens the menu
  await page.getByTestId('menu-requests').click();
  // The screen itself opens — the requests list is everyone's.
  await expect(page.getByTestId('requests-back')).toBeVisible({ timeout: 20_000 });
  // Give the owner check its round trip before believing the absence.
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId('avail')).toHaveCount(0);
});
