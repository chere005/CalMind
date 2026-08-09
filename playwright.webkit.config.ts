import { defineConfig, devices } from '@playwright/test';

/**
 * The WebKit smoke — SEPARATE from the main config on purpose.
 *
 * Everything else in the suite runs in Chromium, and Sean's daily use is an
 * iOS home-screen web app, which is WebKit. So the engine he actually reads
 * the app in has never run a single test. This covers the spine of it — sign
 * up, add, tick, the note's rendered markers, the head an install needs — in
 * that engine.
 *
 * It lives in its own config so `npx playwright test` is unchanged and does
 * not require the WebKit download: a second project inside the main config
 * would make the ordinary run fail on any machine that hasn't fetched it.
 *
 *   npx playwright install webkit                       # once
 *   npx playwright test -c playwright.webkit.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'app.spec.ts',
  // The spine, not the whole suite: gesture specs lean on synthetic mouse
  // behaviour that differs between engines, and a red run full of harness
  // noise teaches nobody anything.
  grep: /signing up lands on the calendar|a reminder adds into its section|note body renders its markers|the page carries the web-app head/,
  timeout: 30_000,
  retries: 0,
  workers: 1,
  globalSetup: './e2e/freshness.ts',
  use: {
    ...devices['Desktop Safari'],
    baseURL: 'http://127.0.0.1:8791/test/calmind/',
    viewport: { width: 420, height: 900 },
  },
  webServer: {
    command:
      'rm -rf /tmp/calmind-e2e-webkit && mkdir -p /tmp/calmind-e2e-webkit && CALMIND_DATA_DIR=/tmp/calmind-e2e-webkit php -S 127.0.0.1:8791 e2e/router.php',
    url: 'http://127.0.0.1:8791/test/calmind/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
