import { expect, test, type Page } from '@playwright/test';

/**
 * The top bar's invariants, on every screen and in every mode.
 *
 * Two regressions today were the same shape: a control that came and went, or
 * sat on the wrong side, and so shoved everything beside it. Sean saw it as
 * "all the button placement is broken", which is what a moving row looks like
 * from outside. Nothing was watching the header, so both landed without a
 * single test going red.
 *
 * These are the rules the suite holds to, and they are cheap to check:
 *   · back is LEFT of the title and VISIBLE — always, on every screen. The
 *     suite emits it unconditionally, straight onto history.back(), with no
 *     test for whether there is anywhere to go;
 *   · a screen that has a picker keeps it in every view mode;
 *   · the username pill is always there, being the way into Settings.
 */
async function signup(page: Page): Promise<string> {
  const user = `chr${String(Date.now()).slice(-6)}`;
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

const TITLES: Record<string, string> = {
  reminders: 'Reminders', calendar: 'Calendar', notes: 'Notes', habits: 'Habits', add: 'Add',
};

/** The screens whose content is scoped by a picker, so the picker is not optional. */
const SCOPED: Record<string, string> = {
  reminders: 'pick-reminders', calendar: 'pick-calendar', notes: 'pick-notes', habits: 'pick-habits',
};

test('back sits left of the title on every screen', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);
  const width = page.viewportSize()!.width;

  for (const [tab, title] of Object.entries(TITLES)) {
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(250);
    await expect(page.getByTestId('nav-back'), `${tab}: back is drawn, not just present`).toBeVisible();
    const back = await page.getByTestId('nav-back').boundingBox();
    const head = await page.getByText(title, { exact: true }).first().boundingBox();
    expect(back, `${tab}: the back slot exists`).not.toBeNull();
    expect(head, `${tab}: the title is drawn`).not.toBeNull();
    expect(back!.x, `${tab}: back is left of "${title}"`).toBeLessThan(head!.x);

    // Left of the title is necessary but weak: a back control adrift in the
    // middle of the row satisfies it. It belongs against the margin, which is
    // 16, so past ~64 it has stopped being the first thing in the row.
    expect(back!.x, `${tab}: back sits against the left margin, not floating inward`).toBeLessThan(64);
    expect(back!.x + back!.width, `${tab}: back finishes before the title starts`).toBeLessThanOrEqual(head!.x + 1);

    // The right-hand cluster: picker then username, both on screen. A control
    // pushed past the edge is unreachable, not merely untidy.
    const who = await page.getByTestId('topbar-sync').first().boundingBox();
    expect(who, `${tab}: the username is in the bar`).not.toBeNull();
    expect(who!.x, `${tab}: the username is past the title`).toBeGreaterThan(head!.x);
    expect(who!.x + who!.width, `${tab}: the username is not pushed off-screen`).toBeLessThanOrEqual(width);

    const pickId = SCOPED[tab];
    if (pickId) {
      const pick = page.getByTestId(pickId);
      await expect(pick, `${tab}: this screen is scoped by a picker, so the picker shows`).toBeVisible();
      const p = (await pick.boundingBox())!;
      expect(p.x, `${tab}: the picker is in the right-hand cluster`).toBeGreaterThan(head!.x);
      expect(p.x, `${tab}: the picker comes before the username`).toBeLessThan(who!.x);
      expect(p.x + p.width, `${tab}: the picker is not pushed off-screen`).toBeLessThanOrEqual(width);
      // It draws a 32px ring; a 16px pie inside one is a button half the size
      // it looks, which is what it was until the ring became the target.
      expect(
        Math.min(p.width, p.height),
        `${tab}: the picker is as big as the ring it draws`,
      ).toBeGreaterThanOrEqual(26);
    }
  }
});

test('the picker and the username survive a change of view mode', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);

  // Month.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('pick-calendar')).toBeVisible();
  await expect(page.getByTestId('topbar-sync').first()).toBeVisible();

  // Week — the mode that was quietly stripping chrome. It is entered by a
  // swipe on the grid, and it persists under this key, which is steadier to
  // set than a gesture is to simulate.
  await page.evaluate(() => window.localStorage.setItem('calmind.calWeekMode', '1'));
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('pick-calendar'), 'the picker does not belong to one view mode').toBeVisible();
  await expect(page.getByTestId('topbar-sync').first()).toBeVisible();
});

test('a fortnight of marks comes with a legend to read them by', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByText('Event', { exact: true }).click();
  await page.getByPlaceholder(/Dentist/).fill('dinner today');
  await page.getByText('Done', { exact: true }).click();
  await page.waitForTimeout(600);

  await page.evaluate(() => window.localStorage.setItem('calmind.calWeekMode', '1'));
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId('legend-me'),
    'week mode had the names all along and simply did not draw them',
  ).toBeVisible();
});

test('the gap under the top divider is the same on every tab', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);

  // Sean, 2026-08-10: "fix the spacing after the top divider on different tabs
  // of the app". Measured off the source at the time, it was four values
  // across five tabs — Calendar 1px (pagerRow), Notes 8 (scroll), Habits 12
  // (controlRow), Reminders and Add 16 — because each screen set its own
  // paddingTop under a divider none of them owned.
  //
  // Notes was worse than its 8 suggested and is the reason this measures what
  // it does: an emptied-out toolbarRow sat as the scroll's first child,
  // contributing its own padding and a whole `gap: 18` before the first
  // folder — 28px, "the notes gap is huge".
  //
  // The number is 10, Sean's, chosen against the built app ("habits looks
  // almost correct, i'd go with 10px"). The suite's own is 8 — lib/chrome.php
  // has `header { …; margin-bottom: 0.5rem }` at a 16px root — so the
  // departure is deliberate and this test, not the suite, is the authority
  // for this one measurement.
  const gapOn = async (tab: string): Promise<number> => {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByText(TITLES[tab]!, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    return page.getByTestId('top-rule').evaluate((el) => {
      // To the first thing you can SEE, not to the next sibling. The first
      // draft measured sibling.top, which is the scroll container — and the
      // scroll container starts right under the divider on every screen, so
      // it read 10 on Notes while Notes was in fact drawing 28. The space was
      // INSIDE the container: an empty toolbarRow child plus the flex gap
      // after it. A measurement that stops at the box misses everything the
      // box holds, and it would have passed with the bug Sean reported.
      const next = el.nextElementSibling;
      if (!next) throw new Error('nothing follows the divider — the measurement below would be meaningless');
      const tops = [...next.querySelectorAll('*')]
        // Absolutely positioned children are the WebHitSlop pads, which reach
        // deliberately OUTSIDE their parent and would read as negative space.
        .filter((n) => getComputedStyle(n).position !== 'absolute')
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.width > 0)
        .map((r) => r.top);
      const first = tops.length > 0 ? Math.min(...tops) : next.getBoundingClientRect().top;
      return Math.round(first - el.getBoundingClientRect().bottom);
    });
  };

  const gaps: Record<string, number> = {};
  for (const tab of ['reminders', 'calendar', 'notes', 'habits', 'add']) gaps[tab] = await gapOn(tab);

  // Both halves matter. "All equal" alone would pass if every tab drifted to
  // the same wrong number, and "== 8" tab by tab would not say they AGREE,
  // which is the thing Sean actually sees when he switches.
  expect(new Set(Object.values(gaps)).size, `every tab draws the same gap — got ${JSON.stringify(gaps)}`).toBe(1);
  expect(gaps.reminders, `and it is the 10 Sean picked — got ${JSON.stringify(gaps)}`).toBe(10);
});

// The Reminders toolbar row is GONE (2026-08-12). Its only control —
// show-completed — moved into the top bar on Sean's word, and the sean-only
// copy button went with the Copy-as-Markdown rework, so the row had nothing
// left in it. The spec that measured its even air is deleted rather than
// rewritten: there is no row to measure, and a spec that asserts the absence
// of a container it can no longer find is the absence-assertion trap.

/**
 * One row, one scale — every control in the top bar is the same height.
 *
 * The suite states it in a single rule over three selectors:
 *   `.backbtn, .titlebtn, .usermenu .who { height: 32px }`
 * with `width: 32px` on the two round ones. Ours had drifted to three heights
 * — back 28, collapse-all 26, the picker ring 32, the username pill 28 — and
 * nothing was watching, so Sean saw a ragged row before any test did. The
 * ring's own comment claimed "ring and pill both 32 high" while the pill next
 * to it was 28: the comment was right and the code was not.
 *
 * Measured off the rendered boxes rather than read back out of a stylesheet,
 * and asserted against the suite's number rather than against each other —
 * "all equal" would go green if every control drifted to 26 together.
 */
test('every control in the top bar is one height', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);

  for (const [tab, title] of Object.entries(TITLES)) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(250);

    // Every control in the bar, found by walking the row itself — a control
    // added later is caught without anyone remembering to list it here. The
    // title is the one child that is text rather than a control, and the
    // absolutely-positioned web hit-slop skirts take no layout space.
    const controls = await page.getByTestId('nav-back').evaluate((back) => {
      const bar = back.parentElement!.parentElement!; // hleft -> topbar
      const out: { name: string; h: number; w: number; round: boolean }[] = [];
      const visit = (el: Element) => {
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute') return;              // hit-slop skirt
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const isControl =
          el.getAttribute('role') === 'button' ||
          el.getAttribute('data-testid')?.startsWith('pick-');
        if (isControl) {
          out.push({
            name: el.getAttribute('aria-label') || el.getAttribute('data-testid') || '?',
            h: Math.round(r.height),
            w: Math.round(r.width),
            // A pill is as wide as its name; the icon buttons are square.
            round: parseFloat(cs.borderTopLeftRadius) >= r.height / 2 - 1 && r.width < 60,
          });
          return;                                            // don't descend into a control
        }
        for (const c of Array.from(el.children)) visit(c);
      };
      for (const c of Array.from(bar.children)) visit(c);
      return out;
    });

    expect(controls.length, `${tab}: the bar has controls to measure`).toBeGreaterThanOrEqual(2);
    for (const c of controls) {
      expect(c.h, `${tab}: "${c.name}" is the bar's one height`).toBe(32);
      // The round ones are circles, not ovals — a 32-high 26-wide "circle"
      // is what a half-applied fix looks like.
      if (c.round) expect(c.w, `${tab}: "${c.name}" is a circle, not an oval`).toBe(32);
    }
    // The username is a control here, not a bare label — it is the way in to
    // Settings, and Sean asked for it to match the icons beside it.
    const who = await page.getByTestId('topbar-sync').first().evaluate(
      (el) => Math.round(el.closest('[role="button"]')!.getBoundingClientRect().height),
    );
    expect(who, `${tab}: the username pill matches the icons beside it`).toBe(32);
  }
});

test('the picker glyph is the same size in every tab bar button', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);

  // Sean, 2026-08-11: "Habits folder icon is too big, match the icon size in
  // the button from other apps".
  //
  // Not the button — the top bar's placement and ring were already measured
  // identical across all four. It is the GLYPH inside: three screens pass
  // PieDot size={16} and Habits passed nothing, taking PieDot's own default
  // of 22. The same drift the chevrons had, and the same fix: one number,
  // asserted here so the next picker cannot quietly invent its own.
  const glyph = async (tab: string, id: string): Promise<number> => {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId(id)).toBeVisible({ timeout: 20_000 });
    return page.getByTestId(id).evaluate((el) => {
      // The drawn mark inside the pressable. WebHitSlop is absolutely
      // positioned and reaches deliberately OUTSIDE its parent, so it would
      // measure larger than anything real.
      const boxes = [...el.querySelectorAll('*')]
        .filter((n) => getComputedStyle(n).position !== 'absolute')
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (boxes.length === 0) throw new Error('no drawn glyph inside the picker — nothing to measure');
      return Math.round(Math.max(...boxes.map((r) => r.width)));
    });
  };

  const sizes: Record<string, number> = {
    reminders: await glyph('reminders', 'pick-reminders'),
    calendar: await glyph('calendar', 'pick-calendar'),
    notes: await glyph('notes', 'pick-notes'),
    habits: await glyph('habits', 'pick-habits'),
  };

  // Both halves, for the same reason as the divider gap: "all equal" alone
  // would pass if every tab drifted together, and a per-tab number would not
  // say they AGREE, which is the thing Sean sees switching between them.
  expect(new Set(Object.values(sizes)).size, `every picker draws the same glyph — got ${JSON.stringify(sizes)}`).toBe(1);
  expect(sizes.habits, `and it is 16, the size the other three already used — got ${JSON.stringify(sizes)}`).toBe(16);
});
