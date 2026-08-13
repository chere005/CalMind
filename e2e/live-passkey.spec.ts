import { expect, test, type Page } from '@playwright/test';

/**
 * The passkey ceremony against the DEPLOYED test server.
 *
 * The local run proves the logic; it cannot prove the things that only exist
 * once this is served from a real domain over real TLS — the relying-party id
 * derived from a host that is not localhost, an origin with no port, and a
 * secure context that is genuine rather than granted by exception. Those are
 * exactly the parts that fail invisibly: every passkey simply stops working,
 * with no error until someone tries to sign in.
 *
 * Opt-in, because it touches the network and leaves a real account behind:
 *
 *   CALMIND_LIVE=1 npx playwright test live-passkey
 *
 * TEST only. The deploy script refuses non-test destinations and so does this:
 * the URL is asserted below before anything is created.
 */
const BASE = process.env.CALMIND_LIVE_URL ?? 'https://seancheren.com/test/calmind/';

test.skip(!process.env.CALMIND_LIVE, 'set CALMIND_LIVE=1 to run against the deployed test server');

async function virtualAuthenticator(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
}

test('a passkey works against the deployed test server, end to end', async ({ page }) => {
  test.setTimeout(180_000);
  expect(BASE, 'this spec runs against test, never prod').toContain('/test/');

  await virtualAuthenticator(page);
  const user = `livepk${Date.now()}`;
  await page.goto(BASE);
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('live-passkey-pw');
  await page.getByPlaceholder('Confirm password').fill('live-passkey-pw');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(
    page.getByTestId('passkey-section'),
    'the real domain offers passkeys — an IP or a bad RP id would not',
  ).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('passkey-add').click();
  await expect(page.getByText('Passkey added')).toBeVisible({ timeout: 30_000 });

  await page.getByText('Log out', { exact: true }).click();
  await expect(page.getByTestId('passkey-signin')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('passkey-signin').click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('topbar-sync').first()).toBeVisible();

  // Residue, said out loud rather than left to be discovered: this account and
  // its passkey stay on the test server. There is no delete-account endpoint.
  console.log(`\n  residue: account "${user}" + one passkey remain on ${BASE}\n`);
});
