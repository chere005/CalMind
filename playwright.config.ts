import { defineConfig } from '@playwright/test';
import { BASE, PORT } from './e2e/port';
import { e2eServer } from './e2e/serve.cjs';

/**
 * The gesture harness — the teeth for TESTING.md's by-eye column. Serves the
 * exported web app + real PHP API from one php -S (e2e/router.php) against a
 * scratch data dir, then drives real mouse events at it. `npm run test:e2e`
 * exports first; a stale dist/ is the usual reason a spec disagrees with dev.
 *
 * ONE SERVER PER PORT. The deploy runs this suite as parallel shards (server/
 * deploy.sh), each with CALMIND_E2E_PORT set to its own port — so the port,
 * each server gets a fresh temp data dir, and the output dir Playwright clears
 * at start is keyed on its port. Unset, the port is 8790. Specs take the port
 * from e2e/port.ts, never a literal.
 */

export default defineConfig({
  ...e2eServer(PORT),
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
    ...(process.env.CALMIND_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.CALMIND_CHROMIUM_EXECUTABLE_PATH } } : {}),
  },
});
