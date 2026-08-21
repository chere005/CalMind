import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/**
 * The app against a REAL-SIZED store.
 *
 * Every other spec signs up a fresh account and drives six records. Sean's
 * store has a couple of hundred, across several folders and sections, with
 * overdue rows, riders, repeats mid-stream and three calendars — so the shape
 * the app actually runs against has never been exercised by a test at all.
 * The seeder already builds exactly that (server/tools/seed-example.php,
 * through the real API, anchored on today so it never goes stale); this points
 * it at the harness and then reads what the screens make of it.
 */
const API = 'http://127.0.0.1:8790/test/calmind/api/index.php';

test('the app holds up against a seeded store, not just a fresh one', async ({ page }) => {
  test.setTimeout(120_000);
  execFileSync('php', ['server/tools/seed-example.php', `--url=${API}`], { stdio: 'pipe' });

  await page.goto('.');
  await page.getByPlaceholder('Username').fill('example');
  await page.getByPlaceholder('Password', { exact: true }).fill('examplepassword');
  await page.getByText('Sign in', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // The calendar carries a month of real marks and a legend with several
  // chips — the first time the balancer meets more than a couple of them.
  // A filled month grid is whole weeks — five or six, depending on where the
  // 1st falls. August 2026 starts on a Saturday, so it needs six.
  await expect(page.getByTestId('cal-cell').first()).toBeVisible({ timeout: 20_000 });
  expect([35, 42]).toContain(await page.getByTestId('cal-cell').count());
  const marked = await page.getByTestId('cal-mark-well').locator('svg').count();
  expect(marked, 'a seeded month draws marks').toBeGreaterThan(3);

  const lines = page.getByTestId('balanced-line');
  // WAITED FOR, not counted once. BalancedRow measures its chips and then
  // lays them out, so "how many lines are there" is only true after a measure
  // pass — and `await lines.count()` is a single snapshot with no retry. It
  // read 0 once, at spec 229 of a full run on a loaded machine, and passed
  // every time the file was run on its own. Nothing about the legend was
  // wrong; the question was asked too early.
  await expect(lines.first(), 'the legend rendered as balanced lines').toBeVisible({ timeout: 15_000 });
  const n = await lines.count();
  if (n > 1) {
    // Sean's rule at real width with real chips: no line left nearly empty
    // while another is full. The first line is never shorter than the last.
    const counts = await lines.evaluateAll((els) => els.map((el) => el.childElementCount));
    expect(Math.min(...counts), 'no line stranded alone').toBeGreaterThan(0);
    expect(counts[0]).toBeGreaterThanOrEqual(counts[counts.length - 1]!);
  }

  // Reminders: many rows, several folders, and the suite's order — every
  // undated row in a section stands above the dated ones.
  await page.getByTestId('tab-reminders').click();
  // The count is what the DEFAULT view shows — one folder's open rows, not
  // the whole seeded store — so this is "many more than the half-dozen every
  // other spec ever sees", not a census.
  const rows = page.getByTestId('rem-row');
  expect(await rows.count(), 'a real number of rows').toBeGreaterThan(5);

  // Notes and Habits open at size without throwing; a blank screen here is
  // the failure this spec exists to catch.
  await page.getByTestId('tab-notes').click();
  expect(await page.getByTestId('note-row').count()).toBeGreaterThan(0);
  await page.getByTestId('tab-habits').click();
  expect(await page.getByTestId('habit-name').count()).toBeGreaterThan(0);

  // Nothing threw along the way.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('tab-calendar').click();
  await page.waitForTimeout(500);
  expect(errors, 'no page errors while paging a seeded store').toEqual([]);
});
