import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

const TEST_PORT = 3999;
const cwd = resolve(fileURLToPath(import.meta.url), '../..');

let devProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 120000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

export async function setup() {
  console.log(`[global-setup] Starting ubean dev server on port ${TEST_PORT}...`);

  devProcess = spawn('node', ['node_modules/ubean/bin/ubean.mjs', 'dev', '--port', String(TEST_PORT), '--host', '127.0.0.1'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NO_PROXY: 'localhost,127.0.0.1'
    }
  });

  // Log dev server output for debugging
  devProcess.stdout?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.log(`[dev-server] ${msg}`);
  });
  devProcess.stderr?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.error(`[dev-server] ${msg}`);
  });

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  await waitForServer(`${baseUrl}/_health`);

  console.log(`[global-setup] Dev server ready at ${baseUrl}`);

  // Store base URL in env so test files can access it
  process.env.UBEAN_TEST_BASE_URL = baseUrl;

  return async function teardown() {
    if (devProcess) {
      console.log('[global-setup] Stopping dev server...');
      devProcess.kill('SIGTERM');
      devProcess = null;
    }
  };
}
