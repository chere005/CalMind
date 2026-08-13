import { expect, test, type Page, type BrowserContext } from '@playwright/test';

/**
 * The app on a DIFFERENT DAY.
 *
 * Every other spec runs on whatever today happens to be, so the calendar has
 * only ever been drawn in the middle of a month, in the middle of a year. The
 * classic failure here is the one nobody sees until it happens to everybody at
 * once: paging December into January, a week that straddles the new year, a
 * leap day that only exists every fourth February.
 *
 * Core has vectors for the arithmetic. This is the other half — the SCREENS
 * on those days, which no vector reaches.
 */
async function freezeClock(context: BrowserContext, iso: string) {
  await context.addInitScript((frozen: string) => {
    const Real = Date;
    const at = new Real(frozen).getTime();
    class Frozen extends Real {
      constructor(...args: unknown[]) {
        // eslint-disable-next-line constructor-super
        if (args.length === 0) super(at);
        else super(...(args as []));
      }
      static now() { return at; }
    }
    // @ts-expect-error swapping the global on purpose
    window.Date = Frozen;
  }, iso);
}

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `clk${Date.now()}${seq++}`;
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

// THE MONTH IS ABBREVIATED, and these assertions are what pin it. Sean asked
// for "3 chars for month name in the calendar view" on 2026-08-13, so the header
// reads "Dec 2026" and the day title "Wednesday, Dec 31". The regexes below
// would go red against the old long form — "December 2026" does not contain the
// substring "Dec 2026" — so they are a real guard rather than a loosening.
test("New Year's Eve: the calendar pages December into January", async ({ page, context }) => {
  await freezeClock(context, '2026-12-31T10:00:00');
  await signup(page);
  await expect(page.getByTestId('cal-ym')).toHaveText(/Dec 2026/);

  // The year boundary, forwards and back — the arithmetic that goes wrong by
  // a whole year if a month index is added without wrapping.
  await page.getByTestId('cal-next').click();
  await expect(page.getByTestId('cal-ym')).toHaveText(/Jan 2027/);
  await page.getByTestId('cal-prev').click();
  await expect(page.getByTestId('cal-ym')).toHaveText(/Dec 2026/);

  // A reminder filed "today" lands on the 31st and reads back as today.
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('see the year out');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toContainText('Dec 31');
  await expect(page.getByText('see the year out')).toBeVisible();

  // And "tomorrow" from here is next year, which is the parser and the screen
  // agreeing about a boundary rather than either one guessing.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('new year lunch tomorrow');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'new year lunch' });
  await expect(row).toBeVisible();
  await expect(row, 'tomorrow crossed into 2027').toContainText('Jan 1');
});

test('a leap day is a day like any other', async ({ page, context }) => {
  await freezeClock(context, '2028-02-29T10:00:00');
  await signup(page);
  await expect(page.getByTestId('cal-ym')).toHaveText(/Feb 2028/);
  await expect(page.getByTestId('cal-day-title')).toContainText('Feb 29');
  // March, and back again — the step that lands on a date February hasn't got.
  await page.getByTestId('cal-next').click();
  await expect(page.getByTestId('cal-ym')).toHaveText(/Mar 2028/);
  await page.getByTestId('cal-prev').click();
  await expect(page.getByTestId('cal-ym')).toHaveText(/Feb 2028/);
});
