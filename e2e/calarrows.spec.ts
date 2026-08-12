/**
 * Left and right arrows page the calendar — the suite's fourth key binding,
 * and the only one that was missing.
 *
 * The reference has exactly four: Enter and Escape everywhere, plus
 * ArrowLeft/ArrowRight on the calendar to cycle months. CalMind had the first
 * three and no arrow handling anywhere in the app. Found 2026-08-12 by
 * enumerating the suite's key handlers rather than by reading either
 * codebase, which is the same sweep that turned up `clear_done` and the
 * habits picker's missing gestures.
 *
 * It matters more than a convenience: the macOS desktop shell is this same
 * web build, and there a keyboard is the obvious way to move.
 *
 * The suite guards it two ways and both are copied, because both are the
 * difference between a shortcut and a nuisance:
 *
 *   · not while a modal is open,
 *   · not while a field has focus.
 *
 * Only the FIRST is tested here, and the reason is worth stating rather than
 * leaving as a gap someone later reads as an oversight. This screen has no
 * TextInput of its own — everything you can type into on the calendar lives
 * inside a modal — so the field guard cannot fire: the modal check has
 * already returned. A test that opened the add sheet to "exercise" it would
 * be pinning the modal guard while claiming to pin the other one. The guard
 * stays in the source, and Calendar.tsx says the same thing beside it.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ca${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

/** The month the header is showing, e.g. "August 2026". */
const heading = (page: Page) =>
  page.getByTestId('cal-ym').textContent().then((t) => (t ?? '').trim());

test('arrows page the month, both ways, and land back where they started', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  const start = await heading(page);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => heading(page), { message: 'right goes forward a month' }).not.toBe(start);
  const forward = await heading(page);

  // Back twice: one to return, one to go behind the start. Two different
  // months prove direction rather than "any arrow redraws something".
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => heading(page), { message: 'left comes back' }).toBe(start);
  await page.keyboard.press('ArrowLeft');
  const backward = await heading(page);
  expect(backward, 'left again goes behind the starting month').not.toBe(start);
  expect(backward, 'and is not simply the forward month again').not.toBe(forward);
});

test('an open modal keeps the arrows — the month must not move behind it', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  const start = await heading(page);

  await page.getByTestId('pick-calendar').click();
  await expect(page.getByText('Manage calendars', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => heading(page), {
    message: 'the month behind an open picker stays put',
  }).toBe(start);
});
