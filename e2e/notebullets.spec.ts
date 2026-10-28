import { expect, test, type Page } from '@playwright/test';

async function openNote(page: Page) {
  const user = `bul${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-notes')).toBeVisible();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Bullet journal');
}

test('daily card bullets continue, exit on an empty item, and persist', async ({ page }) => {
  await openNote(page);
  await page.getByTestId('note-type').click();
  await page.getByText('Daily log', { exact: true }).click();
  for (const name of ['food', 'exercise', 'mood', 'graffirmations']) {
    const field = page.getByTestId(`daily-${name}`);
    await field.click();
    await field.pressSequentially('* ');
    await expect(field).toHaveValue('• ');
    await field.pressSequentially('First');
    await field.press('Enter');
    await expect(field).toHaveValue('• First\n• ');
    await field.pressSequentially('Second');
    await field.press('Enter');
    await field.press('Enter');
    await field.pressSequentially('Plain text');
    await expect(field).toHaveValue('• First\n• Second\nPlain text');
  }
  await page.getByTestId('note-back').click();
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'Bullet journal' }).click();
  for (const name of ['food', 'exercise', 'mood', 'graffirmations']) {
    await expect(page.getByTestId(`daily-${name}`)).toHaveValue('• First\n• Second\nPlain text');
  }
});

test('a bullet inserted in the middle keeps typing before the following text', async ({ page }) => {
  await openNote(page);
  await page.getByTestId('note-body-view').click();
  const body = page.getByTestId('note-body-edit');
  await body.fill('* BeforeAfter\nTail');
  await body.evaluate((node: HTMLTextAreaElement) => {
    node.focus();
    node.setSelectionRange(8, 8);
    node.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await body.press('Enter');
  await body.pressSequentially('New ');
  await expect(body).toHaveValue('* Before\n* New After\nTail');
  await page.getByTestId('note-title').click();
  await expect(page.getByTestId('note-body-view')).toContainText('New After');
});

test('the last section of the bottom card remains editable in a long journal', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 650 });
  await openNote(page);
  await page.getByTestId('note-type').click();
  await page.getByText('Daily log', { exact: true }).click();
  await page.getByTestId('daily-food').fill(Array.from({ length: 18 }, (_, i) => `Food ${i}`).join('\n'));
  await page.getByTestId('daily-log-add').click();
  const bottom = page.getByTestId('daily-graffirmations').last();
  await bottom.scrollIntoViewIfNeeded();
  await bottom.click();
  await bottom.pressSequentially('* Last');
  await bottom.press('Enter');
  await bottom.pressSequentially('END OF CARD');
  await expect(bottom).toHaveValue('• Last\n• END OF CARD');
  const bounds = await bottom.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(650);
});

test('starting a dot bullet before existing card text keeps the caret beside the dot', async ({ page }) => {
  await openNote(page);
  await page.getByTestId('note-type').click();
  await page.getByText('Daily log', { exact: true }).click();
  const field = page.getByTestId('daily-food');
  await field.fill('Before\nAfter');
  await field.evaluate((node: HTMLTextAreaElement) => {
    node.focus();
    node.setSelectionRange(7, 7);
    node.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await field.pressSequentially('* New ');
  await expect(field).toHaveValue('Before\n• New After');
});
