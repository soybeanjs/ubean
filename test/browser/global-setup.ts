import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_PORT = 3998;
const cwd = resolve(fileURLToPath(import.meta.url), '../../..', 'examples/ubean-test');

let devProcess: ChildProcess | null = null;

async function fetchOk(url: string, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      // not ready
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/**
 * Warm up the dev server by hitting representative routes. Vite performs
 * dependency optimization on the first request which can make the server
 * briefly unresponsive — we absorb that here so tests don't see ECONNREFUSED.
 * We also pre-compile all test pages to avoid first-access timeouts.
 */
async function warmup(baseUrl: string): Promise<void> {
  // These cover an SSR page, an API route, and static files so Vite optimizes
  // the relevant dependency graphs before tests begin.
  const targets = [
    '/api/health',
    '/',
    '/about',
    '/api/hello',
    '/features',
    // Pre-compile all test pages to avoid Vite cold-start timeouts during tests
    '/i18n',
    '/cache-demo',
    '/islands-test',
    '/fetch-test',
    '/seo-meta',
    '/view-transitions',
    '/data-fetch',
    '/dashboard',
    '/dashboard/settings',
    '/dashboard/profile',
    '/user/1',
    '/marketing-page',
    '/about-alias',
    '/md-test'
  ];
  for (const path of targets) {
    // Retry each target until it responds (server may be recompiling).
    const ok = await fetchOk(`${baseUrl}${path}`, 60000);
    if (!ok) console.warn(`[e2e global-setup] warmup target did not respond: ${path}`);
  }
}

export async function setup() {
  // Idempotent guard: vitest may invoke globalSetup more than once.
  if (process.env.UBEAN_E2E_BASE_URL) {
    console.log(`[e2e global-setup] Reusing already-started server at ${process.env.UBEAN_E2E_BASE_URL}`);
    return async function teardown() {};
  }

  console.log(`[e2e global-setup] Starting ubean-test dev server on port ${TEST_PORT}...`);

  devProcess = spawn(
    'node',
    ['node_modules/ubean/bin/ubean.mjs', 'dev', '--port', String(TEST_PORT), '--host', '127.0.0.1'],
    {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NO_PROXY: 'localhost,127.0.0.1'
      }
    }
  );

  devProcess.stdout?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.log(`[dev-server] ${msg}`);
  });
  devProcess.stderr?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.error(`[dev-server] ${msg}`);
  });

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const ready = await fetchOk(`${baseUrl}/api/health`, 120000);
  if (!ready) throw new Error(`Dev server did not start within 120s`);

  console.log(`[e2e global-setup] Dev server ready at ${baseUrl}, warming up...`);
  await warmup(baseUrl);
  console.log(`[e2e global-setup] Warmup complete`);

  process.env.UBEAN_E2E_BASE_URL = baseUrl;

  return async function teardown() {
    if (devProcess) {
      console.log('[e2e global-setup] Stopping dev server...');
      devProcess.kill('SIGTERM');
      devProcess = null;
    }
  };
}
