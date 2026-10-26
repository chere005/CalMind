/** Disposable PHP server shared by the Chromium and WebKit harnesses. */
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { createConnection, createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { basename, dirname, join, resolve } = require('node:path');

const channel = (id) => process.platform === 'win32'
  ? `\\\\.\\pipe\\calmind-e2e-${id}` : join(tmpdir(), `cm-e2e-${id}.sock`);

function e2eServer(port) {
  const id = randomBytes(12).toString('hex');
  return {
    metadata: { calmindServerId: id },
    globalTeardown: './e2e/serve.cjs',
    webServer: {
      command: 'node e2e/serve.cjs',
      env: { CALMIND_E2E_PORT: String(port), CALMIND_E2E_SERVER_ID: id },
      url: `http://127.0.0.1:${port}/calmind/`,
      reuseExistingServer: false,
      timeout: 15_000,
    },
  };
}

// Global teardown runs before Playwright kills its shell process. Stop PHP
// ourselves so Windows never depends on taskkill traversing a process tree.
async function stopServer(config) {
  const id = config.metadata.calmindServerId;
  if (!id) return;
  await new Promise((done, fail) => {
    const socket = createConnection(channel(id));
    socket.setTimeout(5_000, () => socket.destroy(new Error('PHP test server did not stop')));
    socket.once('connect', () => socket.end('stop'));
    socket.once('close', done);
    socket.once('error', (error) => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') done();
      else fail(error);
    });
  });
}

function serve() {
  const port = process.env.CALMIND_E2E_PORT;
  const id = process.env.CALMIND_E2E_SERVER_ID;
  if (!/^\d+$/.test(port ?? '') || Number(port) < 1024 || Number(port) > 65535 || !/^[a-f0-9]{24}$/.test(id ?? '')) {
    throw new Error('invalid PHP test server port or run id');
  }
  const root = realpathSync(tmpdir());
  const prefix = `calmind-e2e-${port}-`;
  const data = mkdtempSync(join(root, prefix));
  const env = { ...process.env, CALMIND_DATA_DIR: data, CALMIND_MEETREQ_USER: 'owner' };
  delete env.PHP_CLI_SERVER_WORKERS; // Own one PHP process on every platform.
  const control = createServer({ allowHalfOpen: true });
  const clients = new Set();
  let php;
  let stopping = false;
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    // Only the exact direct child we created under the real OS temp directory
    // may be removed. A replaced symlink/junction must never redirect cleanup.
    const target = resolve(data);
    if (dirname(target) !== root || !basename(target).startsWith(prefix) || realpathSync(target) !== target) {
      throw new Error('refusing to remove an unexpected PHP test data directory');
    }
    rmSync(target, { recursive: true, force: true, maxRetries: 5 });
  };
  const stop = () => {
    stopping = true;
    if (php && php.exitCode === null && php.signalCode === null) php.kill();
  };
  control.on('connection', (socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.once('data', (data) => { if (data.toString() === 'stop') stop(); });
  });
  control.on('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; });
  control.listen(channel(id), () => {
    php = spawn('php', ['-S', `127.0.0.1:${port}`, 'e2e/router.php'], {
      cwd: process.cwd(), env, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    php.stdout.pipe(process.stdout);
    php.stderr.pipe(process.stderr);
    php.once('error', (error) => console.error(`PHP test server: ${error.message}`));
    php.once('close', (code) => {
      control.close();
      for (const socket of clients) socket.end();
      clean();
      process.exitCode = stopping ? (process.exitCode ?? 0) : (code ?? 1);
    });
  });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, stop);
  process.once('exit', () => { stop(); clean(); });
}

module.exports = stopServer;
module.exports.e2eServer = e2eServer;
if (require.main === module) serve();
