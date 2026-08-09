import { expect, test, type Page } from '@playwright/test';

/**
 * A passkey, driven through a real ceremony.
 *
 * It runs against http://localhost rather than the harness's usual 127.0.0.1,
 * because WebAuthn forbids an IP address as a relying-party id — a rule worth
 * knowing before it is met on a staging box that is reached by address.
 * localhost is both a legal RP id and a secure context, so the ceremony is the
 * real one.
 *
 * What this proves, and what it does not. Chromium's virtual authenticator
 * does the real cryptography, so the whole path is exercised: button, CBOR,
 * COSE key, signature, session. But the authenticator always signs CORRECTLY,
 * so nothing here notices if the server stops checking. That was measured,
 * not assumed — with openssl_verify() short-circuited to success these two
 * specs still passed, and only server/tools/test.php went red.
 *
 * So: this file is the wiring, and the PHP suite is the verification. Neither
 * one alone is worth much, and it would be easy to believe otherwise.
 */
const BASE = 'http://localhost:8790/test/calmind/';

async function virtualAuthenticator(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,       // discoverable: login asks for no username
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test('a passkey is added, signs in with no username, and the password still works', async ({ page }) => {
  test.setTimeout(90_000);
  await virtualAuthenticator(page);

  const user = `pk${Date.now()}`;
  await page.goto(BASE);
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // Add one from Settings.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(page.getByTestId('passkey-section')).toBeVisible();
  await page.getByTestId('passkey-add').click();
  await expect(page.getByText('Passkey added')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('passkey-remove')).toHaveCount(1);

  // Sign out, then back in with no username and no password typed anywhere.
  await page.getByText('Log out', { exact: true }).click();
  await expect(page.getByTestId('passkey-signin')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('passkey-signin').click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(user, { exact: true }).first()).toBeVisible();

  // The password is still a way in — a passkey is an addition, and a device
  // left at home must not lock anyone out of their own account.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText('Log out', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByText('Sign in', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
});

test('a browser with no authenticator is not offered one', async ({ page }) => {
  // No virtual authenticator here on purpose: the button must not appear at
  // all rather than appear and then explain it cannot help.
  await page.goto(BASE);
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('passkey-signin')).toHaveCount(0);
});

test('an unreachable server does not report "no passkeys"', async ({ page }) => {
  // An empty list and an unknown list look identical on screen, and the second
  // one invites you to add a key you may already have. This account has none
  // either way — what is being tested is that the app admits it does not know.
  test.setTimeout(90_000);
  await virtualAuthenticator(page);
  const user = `pku${String(Date.now()).slice(-6)}`;
  await page.goto(BASE);
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.route('**/api/index.php', (route, req) => {
    const body = req.postData() ?? '';
    if (body.includes('passkey_list')) return route.abort();
    return route.continue();
  });

  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(page.getByTestId('passkey-section')).toBeVisible();
  await expect(
    page.getByTestId('passkey-unknown'),
    'it says it could not check, rather than showing an empty list',
  ).toBeVisible({ timeout: 15_000 });
});
