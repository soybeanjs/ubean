import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_PORT = 3998;
const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const cwd = resolve(repoRoot, 'examples/ubean-test');

/**
 * root `vite.config.ts` 里 `test.browser.trace.tracesDir` 指向的目录。
 * 必须与那边保持一致，否则清理会落空。
 */
const TRACES_DIR = resolve(repoRoot, 'test-results');

/**
 * 清理 Playwright 的 trace 原始暂存产物。
 *
 * Playwright 录制 trace 分两步：先把原始产物（`*.trace` / `*.network` /
 * `screencast/*.jpeg` / `resources/*` / `*.jsonl`）写进 `launchOptions.tracesDir`，
 * 运行结束再打包成 `*.trace.zip`。而 Vitest 只 unlink 最终那个 zip
 * （见 `@vitest/browser-playwright/dist/index.js` 的 `deleteTracing`），**从不清理暂存目录**；
 * 更关键的是：一旦显式传了 `tracesDir`，Playwright 自己的临时目录回收也会失效
 * （同文件 `resolveLaunchOptions` 把 `browser.trace.tracesDir` 直接透传给 `launchOptions`）。
 *
 * 实测后果：一次**全绿**运行会留下 549MB / 3381 个文件、且 0 个 zip（绿跑时 zip 被
 * `retain-on-failure` 删掉，暂存却留着）；一次失败运行留 604MB / 3427 个文件。
 *
 * 因此在这里做确定性回收：只保留 `*.trace.zip`（失败时它会被 retain 下来供 CI
 * `Upload Playwright traces` 上传），其余全部删除。
 *
 * 顺序前提（已实测）：teardown 运行在 zip 打包**之后**，故此时删暂存安全。
 * 绿跑后仍可能残留少量（实测 9 个 `.network` / 36K）在 teardown 之后才落盘的文件，
 * 属有界残渣：下次 `setup()` 开头会再清扫，不会像修复前那样无限增长到 549MB。
 */
export function cleanTraceStaging(tracesDir: string = TRACES_DIR): void {
  if (!existsSync(tracesDir)) return;

  let removed = 0;
  for (const entry of readdirSync(tracesDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.trace.zip')) continue;
    rmSync(resolve(tracesDir, entry.name), { recursive: true, force: true });
    removed += 1;
  }

  if (removed > 0) {
    console.log(`[e2e global-setup] 已清理 Playwright trace 原始暂存产物 ${removed} 项（保留 *.trace.zip）`);
  }
}

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
    // 原先叫 `pages/dashboard.vue`,与 `pages/dashboard/index.vue` 撞同一个路由路径,
    // 扫描器按 fullPath 去重后「字母序靠前的文件静默胜出」——`/dashboard` 实际渲染的是
    // `dashboard/index.vue`,而 `ssr: 'data-only'` 那个页面被完全遮蔽。
    // 已重命名为 `ssr-data-only.vue` 保留该演示,这里同步预热新路径。
    '/ssr-data-only',
    '/user/1',
    '/marketing-page',
    '/about-alias',
    '/md-test',
    // TS-36：`12-special-rendering` 用例涉及的特殊渲染形态
    '/marketing',
    '/parallel',
    '/blog/foo/bar',
    '/server-island-props'
  ];
  for (const path of targets) {
    // Retry each target until it responds (server may be recompiling).
    const ok = await fetchOk(`${baseUrl}${path}`, 60000);
    if (!ok) console.warn(`[e2e global-setup] warmup target did not respond: ${path}`);
  }
}

export async function setup() {
  // 先回收上一次运行遗留的 trace 暂存产物（见 cleanTraceStaging 注释）。
  cleanTraceStaging();

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
    // 回收本次运行的 trace 暂存产物；失败时被 retain 的 *.trace.zip 会保留下来，
    // 供 CI 的 `Upload Playwright traces` 步骤上传。
    cleanTraceStaging();
  };
}
