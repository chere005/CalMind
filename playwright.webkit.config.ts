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
  testMatch: [
    'app.spec.ts', 'interrupted.spec.ts', 'chrome.spec.ts', 'scale.spec.ts',
    'armeddelete.spec.ts', 'legendwrap.spec.ts', 'toolong.spec.ts',
    'hitarea.spec.ts',
  ],
  // The spine, not the whole suite: gesture specs lean on synthetic mouse
  // behaviour that differs between engines, and a red run full of harness
  // noise teaches nobody anything. Plus the interruption case — whether blur
  // fires when a focused field is torn out from under it is exactly the sort
  // of thing two engines answer differently, and text that survives in
  // Chromium and vanishes in WebKit would vanish on Sean's phone only.
  //
  // There were TWO interruption tests here and there is one. The other drove
  // the Reminders row's inline edit, which Sean removed on 2026-08-12, so the
  // field it was tearing focus away from no longer exists. The note BODY is
  // still a focused multiline input being abandoned mid-word, which is the same
  // engine question and the reason this class of test earns a WebKit run at
  // all — so the class is still covered, by the half that still applies.
  //
  // The header rules joined this list the day Sean said "all the button
  // placement is broken": they are what he actually looks at, and until now
  // they had only ever been checked in an engine he does not use. Recipe
  // scaling came with them — it is the feature he asked to be pushed hardest,
  // and it is read on the phone, in WebKit, with floury hands.
  //
  // The hit-area checks are here for the plainest reason of all: hitSlop is a
  // no-op under react-native-web, which made every icon control smaller in a
  // browser than on the phone apps, and the browser in question is this one.
  // Verifying that fix in Chromium alone would have been checking it
  // everywhere except where it matters.
  grep: /signing up lands on the calendar|a reminder adds into its section|note body renders its markers|the page carries the web-app head|interrupted mid-sentence|back sits left of the title|picker and the username survive|scaling reads the recipe|arming delete on one note|legend with many calendars|over-long note says so|answers a press outside its drawn edge|extra tap area stays near its control|answers a press on its ring|a drag starts from the widened part of a grip/,
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
