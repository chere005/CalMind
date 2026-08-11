import { expect, test, type Page } from '@playwright/test';

/**
 * Getting into habits' edit mode, and back out of it.
 *
 * Two things Sean reported on macOS, 2026-08-11, both of which only bite with
 * a mouse on a wide window — which is why the phone-width suite never saw
 * either:
 *
 *   · "doubleclick doesn't enter edit mode on habit" — replacing the inline
 *     rename with the editor screen took the double-tap handler with it, and
 *     nobody holds a mouse button down for 350ms;
 *   · "tap to exit editing on habits doesn't work" — the document listener
 *     that leaves edit mode was on the BUBBLE phase, and react-native-web
 *     stops a click at any Pressable. Every tick cell in the grid is one, so
 *     tapping anywhere in the grid did nothing at all.
 *
 * Run at the desktop shell's window size, because that is where he found them.
 */
async function habitsScreen(page: Page) {
  const user = `he${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-habits').click();
  await page.getByTestId(/^habit-add-/).first().click();
  await page.getByTestId('habit-name-field').fill('stretch');
  await page.getByTestId('habit-save').click();
  await expect(page.getByTestId('habit-name')).toHaveText('stretch');
}

test('double-click enters edit mode, and a tap in the GRID leaves it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await habitsScreen(page);

  await expect(page.getByTestId('habit-edit'), 'no pencil before editing').toHaveCount(0);
  await page.getByTestId('habit-name').first().dblclick();
  await expect(page.getByTestId('habit-edit').first(), 'double-click is a way in with a mouse').toBeVisible();

  // The tick cell — a Pressable, and therefore the case that was broken: a
  // bubble-phase listener never sees this click at all.
  const cell = (await page.getByTestId('habit-daycol').first().boundingBox())!;
  const row = (await page.getByTestId('habit-name').first().boundingBox())!;
  await page.mouse.click(cell.x + cell.width / 2, row.y + row.height / 2);
  await expect(
    page.getByTestId('habit-edit'),
    'a tap on the grid leaves edit mode — this is the one that did nothing',
  ).toHaveCount(0, { timeout: 5_000 });
});

test('a tap on the habit itself opens its editor rather than leaving', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await habitsScreen(page);

  await page.getByTestId('habit-name').first().dblclick();
  await expect(page.getByTestId('habit-edit').first()).toBeVisible();

  // The keep-list's whole job: the thing you are editing must not be "elsewhere".
  await page.getByTestId('habit-name').first().click();
  await expect(page.getByText('Edit habit'), 'the row opens its editor').toBeVisible();
});

test('editing a habit from the pencil does not turn edit mode off behind the sheet', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await habitsScreen(page);

  await page.getByTestId('habit-name').first().dblclick();
  await expect(page.getByTestId('habit-edit').first()).toBeVisible();

  // Open the editor from the pencil, change something, save.
  await page.getByTestId('habit-edit').first().click();
  await expect(page.getByText('Edit habit')).toBeVisible();
  await page.getByTestId('habit-freq-weekdays').click();
  await page.getByTestId('habit-save').click();
  await expect(page.getByText('Edit habit')).toHaveCount(0);

  // Sean, 2026-08-11: "clicking on the menu editing a habit shouldn't exit
  // edit mode". The sheet is its own layer; a click in it is not a tap
  // elsewhere on the page.
  await expect(
    page.getByTestId('habit-edit').first(),
    'still editing after coming back from the sheet',
  ).toBeVisible();

  // And Cancel behaves the same way.
  await page.getByTestId('habit-edit').first().click();
  await expect(page.getByText('Edit habit')).toBeVisible();
  await page.getByText('Cancel', { exact: true }).click();
  await expect(page.getByTestId('habit-edit').first(), 'Cancel too').toBeVisible();
});
