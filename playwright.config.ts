import { defineConfig } from '@playwright/test';

/**
 * The gesture harness — the teeth for TESTING.md's by-eye column. Serves the
 * exported web app + real PHP API from one php -S (e2e/router.php) against a
 * scratch data dir, then drives real mouse events at it. `npm run test:e2e`
 * exports first; a stale dist/ is the usual reason a spec disagrees with dev.
 */
export default defineConfig({
  testDir: './e2e',
  // Stop before the first spec if the export is older than the source: these
  // specs drive apps/app/dist, so a stale bundle makes the run a lie in
  // either direction. See e2e/freshness.ts.
  globalSetup: './e2e/freshness.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1, // one scratch server, serialized specs — state stays explicable
  use: {
    baseURL: 'http://127.0.0.1:8790/calmind/',
    viewport: { width: 420, height: 900 },
  },
  webServer: {
    // CALMIND_MEETREQ_USER names whose request page this instance serves, and
    // so who gets the availability editor (Sean, 2026-08-21: "in just the
    // sean account"). The data dir is wiped on the line before, so the fixed
    // name is free every run — and callist/meetavail sign up as it.
    command: 'rm -rf /tmp/calmind-e2e-data && mkdir -p /tmp/calmind-e2e-data && CALMIND_DATA_DIR=/tmp/calmind-e2e-data CALMIND_MEETREQ_USER=owner php -S 127.0.0.1:8790 e2e/router.php',
    url: 'http://127.0.0.1:8790/calmind/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
