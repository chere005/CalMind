import { expect, test, type Page } from '@playwright/test';

/**
 * Content that doesn't fit.
 *
 * Every spec types short, tidy strings — "buy milk", "peel garlic" — so no
 * test has ever put a long line into the app. Real use does: a pasted URL, a
 * sentence someone dictated, a recipe step that runs on. What breaks is
 * layout, and it breaks sideways: a row that refuses to wrap pushes the page
 * wider than the screen and everything scrolls horizontally, which on a phone
 * is miserable and permanent.
 */
const LONG =
  'Ring the vet about the prescription refill and also ask whether the dosage changes now that she is over twelve kilos, and whether they can post it rather than making me drive out there on a Saturday morning again';
const NOSPACE = 'https://example.com/a/very/long/path/that/never/breaks/because/it/has/no/spaces/in/it/at/all/whatsoever/ok';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `lng${Date.now()}${seq++}`;
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

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('a long line does not push the page sideways', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  for (const text of [LONG, NOSPACE]) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('rem-add-field').fill(text);
    await page.getByTestId('rem-add-field').press('Enter');
  }
  await expect(page.getByTestId('rem-row')).toHaveCount(2);
  expect(await overflow(page), 'the reminders list stays inside the screen').toBeLessThanOrEqual(0);

  // The calendar's day panel draws the same text in a narrower row, beside a
  // tick, a chip and an edit cluster — the tightest place it has to fit.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill(LONG);
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();
  expect(await overflow(page), 'the day panel stays inside the screen').toBeLessThanOrEqual(0);

  // Notes: a long TITLE in the list, and a long body in the editor.
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill(LONG);
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(`${NOSPACE}\n${LONG}`);
  await page.getByTestId('note-back').click();
  expect(await overflow(page), 'the notes list stays inside the screen').toBeLessThanOrEqual(0);

  // And the row is still a row: it opens, rather than being a wall of text
  // with its controls pushed off the edge.
  await page.getByTestId('note-row').first().click();
  await expect(page.getByTestId('note-body-view')).toBeVisible();
  expect(await overflow(page), 'the note editor stays inside the screen').toBeLessThanOrEqual(0);
});

/**
 * A long line with NOTHING in it the parser wants.
 *
 * `LONG` above ends "on a Saturday morning again", and every field that takes
 * a line reads a weekday as a date — so a reminder added with it is filed on
 * next Saturday and is not on today's day panel at all. The spec above never
 * noticed, because it only ever asked whether the page scrolled sideways.
 * Anything measuring WHERE a long reminder lands needs a line the parser
 * leaves alone.
 */
const LONG_PLAIN =
  'Ring the vet about the prescription refill and also ask whether the dosage changes now that she is over twelve kilos, and whether they can post it rather than making me drive out there again';

/**
 * Sean, 2026-08-20: "elide long reminders, don't wrap."
 *
 * Not staying inside the screen — that was the test above, and a wrapped row
 * passes it. This is the OTHER direction: a long reminder used to make its
 * row as tall as the text needed, so a pasted URL turned one row into a
 * paragraph with a tick floating beside the middle of it, and the rows under
 * it moved down the page.
 *
 * The measurement is the row's HEIGHT against a short row's, which is the
 * thing that was wrong. Asserting `text-overflow: ellipsis` instead would
 * pass on a style that no longer applies — the property is set whether or not
 * anything constrains the box.
 */
test('a long reminder is one line high, in the list and in the day panel', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  for (const text of ['buy milk', LONG_PLAIN, NOSPACE]) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('rem-add-field').fill(text);
    await page.getByTestId('rem-add-field').press('Enter');
  }
  await expect(page.getByTestId('rem-row')).toHaveCount(3);

  const heights = await page.getByTestId('rem-row').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const [short, long, nospace] = heights as [number, number, number];
  expect(long, 'the long row is the short row\'s height, not a paragraph').toBe(short);
  expect(nospace, 'and so is the unbreakable URL').toBe(short);

  // The text really is longer than its box — otherwise the heights above
  // would agree because the viewport is wide, and the claim would be empty.
  const widths = await page
    .getByTestId('rem-body')
    .filter({ hasText: 'Ring the vet' })
    .first()
    .evaluate((el) => {
      const t = el.firstElementChild as HTMLElement;
      return { content: t.scrollWidth, box: t.clientWidth };
    });
  expect(widths.content, 'and it is elided rather than merely short')
    .toBeGreaterThan(widths.box);

  // The day panel draws the same reminder in a narrower row.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('buy milk');
  await page.getByText('Done', { exact: true }).click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill(LONG_PLAIN);
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();

  const panel = await page.getByTestId('dp-rem-body').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(panel.length, 'both reminders are in the panel').toBe(2);
  expect(Math.max(...panel), 'the day panel row stays one line too').toBe(Math.min(...panel));
});
