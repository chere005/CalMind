/**
 * The day panel's head row: the date and the "+ Add" beside it.
 *
 * THIS FILE HAS ARGUED BOTH WAYS, and the history is the useful part.
 *
 * Sean, 2026-08-13, walking the calendar, asked for three things: "top of date
 * and add button should be aligned", "there shouldn't be so much space between
 * the legend and the top of the add button", and the button "shouldn't be quite
 * so tall". All three shipped — aligned tops via `flex-start`, a 10pt panel
 * padding, and a 26pt-drawn pill that kept its 32pt tap target.
 *
 * Then he saw it: "looks terrible.. make the add button the same height and
 * center aligned vertically with the section". So two of the three are reverted
 * and this file now pins the opposite of what it pinned an hour earlier.
 *
 * Both of those are still real claims worth holding, which is why the tests
 * remain rather than being deleted with the change:
 *
 *   · centred is a CHOICE now, made against the alternative, not a default
 *     nobody examined — a future `flex-start` here would be re-treading ground;
 *   · "the same height" means the shared Pill's height, so a second pill height
 *     appearing on this screen is a regression, and that is the drift Pill was
 *     extracted to prevent.
 *
 * The gap under the legend SURVIVED the reversal — he objected to the button's
 * height and its alignment, not to the tighter spacing — so that one stands as
 * originally asked.
 *
 * Everything is measured off the rendered page, and the alignment checks are
 * equalities between two independent boxes rather than offsets from one box's
 * own edge: CLAUDE.md's rule is that an offset from an element's own edge lands
 * inside it whatever its size, so it passes with the bug present and absent.
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

test('the + Add is centred against the date, not hung from its top', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  const m = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="cal-day-title"]')!;
    const add = document.querySelector('[data-testid="cal-add"]')!;
    // The TEXT's own line box, via a Range over the text node — not the element
    // box, which can carry padding the glyphs never use. That distinction cost
    // a round when this file was asserting aligned tops.
    const r = document.createRange();
    r.selectNodeContents(title.firstChild!);
    const t = r.getBoundingClientRect();
    const a = add.getBoundingClientRect();
    return {
      textMid: +(t.top + t.height / 2).toFixed(1),
      addMid: +(a.top + a.height / 2).toFixed(1),
      textTop: +t.top.toFixed(1),
      addTop: +a.top.toFixed(1),
    };
  });
  // Centres, within a pixel of rounding.
  expect(Math.abs(m.textMid - m.addMid), `text mid ${m.textMid} vs button mid ${m.addMid}`)
    .toBeLessThanOrEqual(1);
  // And NOT top-aligned, which is what this asserted before he saw it. Without
  // this the test would pass under `flex-start` too — the centres of a short
  // text and a tall button only coincide when something centres them, but a
  // tolerance of 1 is loose enough to want the negative stated outright.
  expect(m.textTop, 'the date does not start on the button’s top edge')
    .toBeGreaterThan(m.addTop + 1);
});

test('the + Add is drawn shorter than a Pill, WITHOUT losing tap area', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  // Measured against a REAL Pill rather than the number 32, so "shorter" is
  // relative to the thing it is shorter than. The item sheet's Cancel is an
  // ordinary Pill; open it, measure, close it.
  //
  // getByROLE, not getByText: a Pill renders its label in a Text INSIDE the
  // pressable, so `getByText('Cancel')` measures the 17pt line of type rather
  // than the 32pt button around it — which is how an earlier version of this
  // test failed, comparing a button against a word.
  const addH = (await page.getByTestId('cal-add').boundingBox())!.height;
  await page.getByTestId('cal-add').click();
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeVisible();
  const pillH = (await cancel.boundingBox())!.height;
  await cancel.click();

  expect(addH, `+ Add ${addH} is shorter than an ordinary Pill ${pillH}`).toBeLessThan(pillH);
  expect(addH, 'but still a button, not a sliver').toBeGreaterThanOrEqual(24);

  // AND THE TARGET DID NOT SHRINK WITH THE PAINT. This is the half that would
  // rot silently: hitSlop is a no-op under react-native-web, so 6pt off the box
  // is 6pt off the real target in the engine Sean reads the app in. The reach is
  // PROBED outward from the drawn edge — an offset from the element's own edge
  // would land inside it whatever its size and could never fail.
  const reach = await page.evaluate(() => {
    const add = document.querySelector('[data-testid="cal-add"]') as HTMLElement;
    const b = add.getBoundingClientRect();
    const x = b.x + b.width / 2;
    const walk = (dir: -1 | 1) => {
      let n = 0;
      for (let d = 1; d <= 14; d++) {
        const el = document.elementFromPoint(x, dir < 0 ? b.top - d : b.bottom + d);
        if (el && (el === add || add.contains(el))) n = d;
        else break;
      }
      return n;
    };
    return { above: walk(-1), below: walk(1) };
  });
  expect(addH + reach.above + reach.below, `reach ${reach.above} above and ${reach.below} below a ${addH} box`)
    .toBeGreaterThanOrEqual(pillH);
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
  // 5 = the legend's closing 1pt rule, the panel's 10pt paddingTop, and the 3pt
  // the taller button reclaims by being centred in a row it now defines. It was
  // 17 before the padding came down. The bound is on the PADDING's contribution,
  // so it holds whatever height the button is.
  expect(gap, 'the legend’s rule and the panel’s padding, and nothing else').toBeLessThanOrEqual(12);
  expect(gap, 'still a gap, not a collision').toBeGreaterThanOrEqual(3);
});
