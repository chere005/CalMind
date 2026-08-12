/**
 * A folder's only section offers no ×, because deleting it cannot work.
 *
 * `deleteSection` refuses the last section of a folder — "a folder keeps at
 * least one section" — and both screens threw that error away:
 *
 *     const res = deleteSection(recs, sec.id);
 *     if (!('error' in res)) mutate(...)          // and nothing on the else
 *
 * while still drawing the × for every section in edit mode. So the control
 * was offered where it could not work, and a CONFIRMED two-press delete
 * answered with silence.
 *
 * Not an edge case: normalize seeds every folder with exactly one section, so
 * this is the state a fresh account is in on both screens.
 *
 * The suite settles it, and had already written the reason down —
 * reminders/index.php: "No × on a folder's only section — its last section
 * can't be deleted", rendering the button only when the folder holds more
 * than one. Its server-side bounce is defence against a stale page, not the
 * behaviour a person meets. CalMind had the bounce (silently) and not the
 * hiding.
 *
 * Found 2026-08-12 by sweeping the app's testIDs for controls no spec
 * touches: nsecdel/nsecempty/nsec-grip had none, while every reminders
 * equivalent did — and following that asymmetry into the source found this
 * on BOTH screens rather than only the untested one.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ls${Date.now()}${seq++}`;
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

/** Page edit mode — where the section controls live — via a long press. */
async function enterEditMode(page: Page, target: ReturnType<Page['getByTestId']>) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

test('reminders: the × appears only once a second section exists', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // A fresh account has TWO reminders folders — the ordinary one and the
  // rideAlong Calendar — each seeded with a "General". That is what makes the
  // assertions below stronger than a single-folder account could: the rule is
  // about the FOLDER's count, so only the folder that gains a section should
  // start offering the ×.
  await enterEditMode(page, page.getByTestId('sec-name-General').first());
  await expect(page.getByTestId('secdel-General'), "no × on either folder's only section")
    .toHaveCount(0);

  // The folder head's + is how a section is made, outside edit mode.
  await page.keyboard.press('Escape');
  await page.getByTestId('foldadd-Reminders').first().click();
  await page.getByPlaceholder('New section').fill('Errands');
  await page.getByPlaceholder('New section').press('Enter');
  await expect(page.getByTestId('secadd-Errands')).toBeVisible();

  await enterEditMode(page, page.getByTestId('sec-name-General').first());
  await expect(page.getByTestId('secdel-Errands'), 'the new section is deletable').toHaveCount(1);
  // …and exactly ONE General is: the one in the folder that now has two
  // sections. The Calendar folder's General is still alone and still bare.
  await expect(page.getByTestId('secdel-General'), 'the rule is per folder, not per app')
    .toHaveCount(1);
});

test('notes: the same rule, on the screen whose controls nothing was testing', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await enterEditMode(page, page.getByTestId('nsec-name-General'));
  await expect(page.getByTestId('nsecdel-General'), 'no × on a folder\'s only section')
    .toHaveCount(0);
});
