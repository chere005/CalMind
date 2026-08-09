import { expect, test } from '@playwright/test';

/**
 * Where the header controls SIT, not just that they exist.
 *
 * Sean opened the app and found "all the button placement is broken": back
 * had drifted to the right of the row and was drawn only when there was
 * somewhere to go, so every other control slid sideways depending on history;
 * and the folder picker had gone missing from screens that should always
 * carry one. Every existing check passed the whole time. labels.spec.ts asks
 * whether nav-back has a name — it does, wherever it is. testids.spec.ts asks
 * whether it is in the DOM — it is, when it is drawn at all.
 *
 * So the checks were blind to the only thing that was wrong. This one reads
 * bounding boxes: back is the leftmost control on every screen, the title
 * follows it, the picker is present wherever a screen is scoped by one, and
 * the username closes the row on the right. Geometry, at the width Sean
 * actually holds.
 */

/** The screens whose content is scoped by a picker, so the picker is not optional. */
const SCOPED: Record<string, string> = {
  reminders: 'pick-reminders',
  calendar: 'pick-calendar',
  notes: 'pick-notes',
  habits: 'pick-habits',
};
const TABS = ['reminders', 'calendar', 'add', 'notes', 'habits'];

test('back opens every header on the left, and the picker never goes missing', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `hdr${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  const width = page.viewportSize()!.width;

  for (const tab of TABS) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();

    const back = page.getByTestId('nav-back');
    await expect(back, `${tab}: back is drawn whether or not there is anywhere to go`).toBeVisible();

    const b = (await back.boundingBox())!;
    // Left half is far too generous to catch a drift; back belongs against the
    // margin. 16 is the bar's own marginHorizontal, so anything past ~64 has
    // stopped being the first thing in the row.
    expect(b.x, `${tab}: back sits against the left margin, not floating inward`).toBeLessThan(64);

    // ...and before the title, which is the actual complaint: back on the
    // right pushed everything else around.
    const title = page.getByText(
      { reminders: 'Reminders', calendar: 'Calendar', add: 'Add', notes: 'Notes', habits: 'Habits' }[tab]!,
      { exact: true },
    ).first();
    const t = (await title.boundingBox())!;
    expect(b.x + b.width, `${tab}: back comes before the title, not after it`).toBeLessThanOrEqual(t.x + 1);

    // The username closes the row, and the whole bar stays inside the window —
    // a control pushed off the right edge is unreachable, not merely ugly.
    const who = page.getByText(user, { exact: true }).first();
    await expect(who, `${tab}: the username is in the bar`).toBeVisible();
    const w = (await who.boundingBox())!;
    expect(w.x, `${tab}: the username is on the right, past the title`).toBeGreaterThan(t.x);
    expect(w.x + w.width, `${tab}: nothing in the header is pushed off-screen`).toBeLessThanOrEqual(width);

    const pickId = SCOPED[tab];
    if (pickId) {
      const pick = page.getByTestId(pickId);
      await expect(pick, `${tab}: this screen is scoped by a picker, so the picker shows`).toBeVisible();
      const p = (await pick.boundingBox())!;
      expect(p.x, `${tab}: the picker sits in the right-hand cluster`).toBeGreaterThan(t.x);
      expect(p.x + p.width, `${tab}: the picker is not pushed off-screen`).toBeLessThanOrEqual(width);
      // Between the title and the username — the suite's order, and the
      // reason the ring and the pill read as one group.
      expect(p.x, `${tab}: the picker comes before the username`).toBeLessThan(w.x);
    }

    // Every control in the row is big enough to hit. 28 is this app's smallest
    // circle; below that a thumb misses.
    for (const box of [b, ...(pickId ? [(await page.getByTestId(pickId).boundingBox())!] : [])]) {
      expect(Math.min(box.width, box.height), `${tab}: a header control is too small to hit`).toBeGreaterThanOrEqual(26);
    }
  }
});

/**
 * And the picker answers where it LOOKS like a button.
 *
 * The pie is 16px inside a 32px ring, and the gap between them was covered by
 * hitSlop — which does nothing under react-native-web. A press five pixels
 * outside the pie, still plainly on the ring, went nowhere; only dead centre
 * worked. Measuring the box would not have caught that on its own, so this
 * presses the ring rather than the pie.
 */
test('the picker answers a press on its ring, not only dead centre', async ({ page }) => {
  test.setTimeout(60_000);
  const user = `ring${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('tab-reminders').click();
  const box = (await page.getByTestId('pick-reminders').boundingBox())!;

  // Measured from the CENTRE outward by a fixed distance, never from the
  // element's own edge: an offset relative to the box moves with the box, so
  // it would sit inside a 16px pie just as happily as inside a 32px button and
  // pass either way. The ring chrome.tsx draws is 32 wide, so 14 from centre
  // is inside what the user sees and outside a bare pie.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx + 14, cy);
  await expect(
    page.getByTestId('fold-all-box-reminders'),
    'pressing the edge of the picker opens it, as pressing the middle does',
  ).toBeVisible({ timeout: 5_000 });
});
