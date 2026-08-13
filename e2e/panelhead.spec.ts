/**
 * The day panel's head row: the date and the "+ Add" beside it.
 *
 * Three things Sean asked for on 2026-08-13, walking the calendar:
 *
 *   · "top of date and add button should be aligned" — the row was
 *     `alignItems: center`, which centres an 18pt line of text against a taller
 *     button and leaves the date sitting low against it;
 *   · "there shouldn't be so much space between the legend and the top of the
 *     add button" — the panel's paddingTop was 16, on top of the legend's own
 *     rule;
 *   · the add button "shouldn't be quite so tall" — a Pill is 32.
 *
 * The third one is the interesting one to test, because the obvious way to do it
 * is also a silent regression: hitSlop is a NO-OP under react-native-web, so
 * taking 6pt off the drawn box takes 6pt off the real tap target in the one
 * engine Sean reads the app in. So the button is 26 DRAWN and still 32 to a
 * press, and this file measures both numbers rather than one.
 *
 * Everything here is measured off the rendered page. An offset from an
 * element's own edge would not do: CLAUDE.md's rule is that a check three
 * pixels in from an edge lands inside the element whatever size it is, so the
 * clickable extent is probed with elementFromPoint walking outward from the
 * drawn edge, and the alignment is an equality between two independent boxes.
 */
import { expect, test, type Page } from '@playwright/test';

async function signup(page: Page) {
  const user = `ph${Date.now()}${Math.floor(Math.random() * 999)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

/** An event on today, so the legend exists and the gap under it is the real one. */
async function anEvent(page: Page) {
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('dentist');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('cal-legend')).toBeVisible({ timeout: 10_000 });
}

test('the date and the + Add share a top edge', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  const tops = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="cal-day-title"]')!;
    const add = document.querySelector('[data-testid="cal-add"]')!;
    // The TEXT's own line box, via a Range over the text node — not the
    // element box, which can carry padding the glyphs never use.
    const r = document.createRange();
    r.selectNodeContents(title.firstChild!);
    return {
      text: +r.getBoundingClientRect().top.toFixed(1),
      add: +add.getBoundingClientRect().top.toFixed(1),
    };
  });
  // THE ONE THAT FAILED: `alignItems: center` put these 3pt apart, the date
  // low. Exact equality rather than a tolerance, because flex-start makes them
  // the same edge — there is nothing to round.
  expect(tops.text, `the date's text starts level with the button (text ${tops.text}, button ${tops.add})`)
    .toBe(tops.add);
});

test('the + Add sits close under the legend', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  const gap = await page.evaluate(() => {
    const legend = document.querySelector('[data-testid="cal-legend"]')!;
    const add = document.querySelector('[data-testid="cal-add"]')!;
    return +(add.getBoundingClientRect().top - legend.getBoundingClientRect().bottom).toFixed(1);
  });
  // 11 = the legend's closing 1pt rule plus the panel's 10pt paddingTop, which
  // is the gap Sean chose for the top bar's own divider. It was 17.
  expect(gap, 'the legend’s rule and the panel’s padding, and nothing else').toBeLessThanOrEqual(12);
  // …and not zero: a button welded to the rule would be a different complaint.
  expect(gap, 'still a gap, not a collision').toBeGreaterThanOrEqual(8);
});

test('the + Add is drawn shorter WITHOUT losing tap area', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  const m = await page.evaluate(() => {
    const add = document.querySelector('[data-testid="cal-add"]') as HTMLElement;
    const b = add.getBoundingClientRect();
    const x = b.x + b.width / 2;
    // Walk outward from the drawn edge and ask the document what is there.
    // This is what makes the check honest: it measures the button's REACH
    // rather than a point known to be inside it.
    const reach = (dir: -1 | 1) => {
      let n = 0;
      for (let d = 1; d <= 14; d++) {
        const el = document.elementFromPoint(x, (dir < 0 ? b.top - d : b.bottom + d));
        if (el && (el === add || add.contains(el))) n = d;
        else break;
      }
      return n;
    };
    return { drawn: +b.height.toFixed(1), above: reach(-1), below: reach(1) };
  });

  expect(m.drawn, 'drawn shorter than a full-height Pill').toBeLessThan(32);
  expect(m.drawn, 'but still a button, not a sliver').toBeGreaterThanOrEqual(24);
  // The whole point: the target did not shrink with the paint. 32 is what a
  // Pill has always been, and hitSlop alone would have bought nothing here.
  expect(m.drawn + m.above + m.below, `reach ${m.above} above and ${m.below} below a ${m.drawn} box`)
    .toBeGreaterThanOrEqual(32);
});
