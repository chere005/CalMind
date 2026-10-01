import { defineConfig } from '@playwright/test';
import { BASE, PORT } from './e2e/port';

/**
 * The gesture harness — the teeth for TESTING.md's by-eye column. Serves the
 * exported web app + real PHP API from one php -S (e2e/router.php) against a
 * scratch data dir, then drives real mouse events at it. `npm run test:e2e`
 * exports first; a stale dist/ is the usual reason a spec disagrees with dev.
 *
 * ONE SERVER PER PORT. The deploy runs this suite as parallel shards (server/
 * deploy.sh), each with CALMIND_E2E_PORT set to its own port — so the port,
 * the data dir it wipes and the output dir Playwright clears at start are all
 * keyed on it. Shared, a second shard would `rm -rf` the first one's data mid
 * run, or wipe its failure artefacts. Unset, the port is 8790 and every path
 * is what it always was. Specs take the port from e2e/port.ts, never a literal.
 */
const DATA = PORT === 8790 ? '/tmp/calmind-e2e-data' : `/tmp/calmind-e2e-data-${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Stop before the first spec if the export is older than the source: these
  // specs drive apps/app/dist, so a stale bundle makes the run a lie in
  // either direction. See e2e/freshness.ts.
  globalSetup: './e2e/freshness.ts',
  outputDir: process.env.CALMIND_E2E_PORT ? `test-results-${PORT}` : 'test-results',
  timeout: 30_000,
  retries: 0,
  workers: 1, // one scratch server, serialized specs — state stays explicable
  use: {
    baseURL: BASE,
    viewport: { width: 420, height: 900 },
  },
  webServer: {
    // CALMIND_MEETREQ_USER names whose request page this instance serves, and
    // so who gets the availability editor (Sean, 2026-08-21: "in just the
    // sean account"). The data dir is wiped on the line before, so the fixed
    // name is free every run — and callist/meetavail sign up as it.
    command: `rm -rf ${DATA} && mkdir -p ${DATA} && CALMIND_DATA_DIR=${DATA} CALMIND_MEETREQ_USER=owner php -S 127.0.0.1:${PORT} e2e/router.php`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
