import { defineConfig } from '@playwright/test';

/**
 * The gesture harness — the teeth for TESTING.md's by-eye column. Serves the
 * exported web app + real PHP API from one php -S (e2e/router.php) against a
 * scratch data dir, then drives real mouse events at it. `npm run test:e2e`
 * exports first; a stale dist/ is the usual reason a spec disagrees with dev.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // one scratch server, serialized specs — state stays explicable
  use: {
    baseURL: 'http://127.0.0.1:8790/test/calmind/',
    viewport: { width: 420, height: 900 },
  },
  webServer: {
    command: 'rm -rf /tmp/calmind-e2e-data && mkdir -p /tmp/calmind-e2e-data && CALMIND_DATA_DIR=/tmp/calmind-e2e-data php -S 127.0.0.1:8790 e2e/router.php',
    url: 'http://127.0.0.1:8790/test/calmind/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
