import { expect, test } from '@playwright/test';

/**
 * A button is as big as it looks — on the web too.
 *
 * react-native-web does not implement hitSlop. Every icon control in this app
 * asks for `hitSlop={8}` and got it on the native builds and not in a browser,
 * so the same button was 42px wide on the phone app and 26px in Safari. That
 * gap is invisible to a mouse and costs a thumb its press.
 *
 * The fix is a transparent child stretched past its parent's edges. That
 * technique has one way to go wrong, and it is the interesting half of this
 * file: a control's extra area is a real element that can lie ON TOP of its
 * neighbour, stealing presses meant for something else. So the second test
 * walks every screen and checks that each control still owns its own middle.
 */

async function signUp(page: import('@playwright/test').Page, prefix: string) {
  const user = `${prefix}${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

test('an icon button answers a press outside its drawn edge', async ({ page }) => {
  test.setTimeout(60_000);
  await signUp(page, 'hit');
  await page.getByTestId('tab-calendar').click();

  const btn = page.getByTestId('cal-completed');
  await expect(btn).toBeVisible();

  // A toggle whose active state is a background colour, so the DOM says
  // plainly whether a press landed.
  const bg = () => btn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const box = (await btn.boundingBox())!;
  const atRest = await bg();

  await page.mouse.click(box.x + box.width + 5, box.y + box.height / 2);
  await expect
    .poll(bg, { message: 'a press five pixels outside the drawn edge is still on the button' })
    .not.toBe(atRest);

  // How far it reaches is read off the element rather than probed with more
  // clicks: a click landing or missing says as much about what is painted on
  // top as about the slop, and an earlier version of this test passed a
  // deliberately broken 40px slop for exactly that reason.
  const reach = await btn.evaluate((el) => {
    const p = el.getBoundingClientRect();
    const c = (el.firstElementChild as HTMLElement).getBoundingClientRect();
    return { left: p.left - c.left, right: c.right - p.right, top: p.top - c.top, bottom: c.bottom - p.bottom };
  });
  // Seven, not eight: an absolute child is placed from its parent's PADDING
  // box, and these circles carry a 1px border, so -8px lands 7px past the
  // drawn edge. Worth pinning rather than rounding away — a slop that quietly
  // grew would cover the neighbours, which is what the next test is about.
  for (const [side, px] of Object.entries(reach)) {
    expect(Math.round(px), `the extra area reaches ${side} by what hitSlop asks for, no further`).toBe(7);
  }
});

test('extra tap area stays near its control, and off its neighbours', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, 'own');

  // With a reminder on the books, so the row controls this is really about —
  // the tick, the fold chevron, the habits colour dot — are actually drawn.
  // An empty account shows almost none of them, and a sweep across five blank
  // screens would agree with itself and prove nothing.
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('buy bread');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('day-tick').first()).toBeVisible({ timeout: 10_000 });

  for (const tab of ['reminders', 'calendar', 'add', 'notes', 'habits']) {
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(350);

    // Every piece of extra area on the page, found by shape rather than by
    // name: an absolutely positioned child that sticks out past its parent on
    // all four sides is one of these and nothing else is. Each must stay
    // close to its parent. Enumerating the neighbours it might cover does not
    // work — a plain Pressable has no role and no testID, so the row body you
    // tap to open a reminder is invisible to a search for buttons, and an
    // over-extended tick sitting on top of it went unnoticed.
    const overreach = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const p = el.getBoundingClientRect();
        if (p.width === 0 || p.height === 0) continue;
        for (const kid of Array.from(el.children)) {
          if (getComputedStyle(kid).position !== 'absolute') continue;
          const c = kid.getBoundingClientRect();
          const out = [p.left - c.left, c.right - p.right, p.top - c.top, c.bottom - p.bottom];
          if (!out.every((v) => v > 0)) continue; // sticks out on all four sides
          const most = Math.max(...out);
          if (most > 12) {
            const name = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.nodeName;
            bad.push(`${name} reaches ${Math.round(most)}px past its edge`);
          }
        }
      }
      return Array.from(new Set(bad));
    });
    expect(overreach, `${tab}: extra tap area is running well past its control`).toEqual([]);

    // And the narrower question, for the controls that can be named: whatever
    // sits at a button's centre must be that button or something inside it.
    const stolen = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('[role="button"], [data-testid^="pick-"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        if (el.contains(hit) || hit.contains(el)) continue;
        const name = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? '?';
        const thief = (hit as HTMLElement).closest('[data-testid],[aria-label]');
        bad.push(`${name} <- ${thief?.getAttribute('data-testid') ?? thief?.getAttribute('aria-label') ?? hit.nodeName}`);
      }
      return Array.from(new Set(bad));
    });
    expect(stolen, `${tab}: a control's centre is covered by something else`).toEqual([]);
  }
});

/**
 * The picker answers where it LOOKS like a button.
 *
 * The pie is 16px inside a 32px ring, and the gap between them was covered by
 * hitSlop — which does nothing under react-native-web. A press five pixels
 * outside the pie, still plainly on the ring, went nowhere; only dead centre
 * worked. Measuring the box would not have caught that on its own, so this
 * presses the ring rather than the pie.
 */
test('the picker answers a press on its ring, not only dead centre', async ({ page }) => {
  test.setTimeout(60_000);
  await signUp(page, 'ring');
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
