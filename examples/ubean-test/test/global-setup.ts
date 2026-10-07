/**
 * TS-33：dev / build 双轨的服务启动器。
 *
 * - `dev` 轨（默认）：`ubean dev --port 3999`，与既有行为一致，跑 `test/**` 全集。
 * - `build` 轨（`UBEAN_TEST_MODE=build`）：先 `ubean build --outDir .temp-build`，
 *   再 `ubean preview --outDir .temp-build --port 3999 --host 127.0.0.1 --strictPort`，
 *   只跑 `test/mode-family/**`（高风险子集）。
 *
 * 两处刻意的选择：
 * 1. **产物目录用 `.temp-build` 而不是 `dist`** —— 仓内 `examples/ubean-test/dist` 是既有产物，
 *    直接构建过去会把它覆盖掉（TS-11 的教训：预览到陈旧 `dist` 会给出误导性的 404）。
 *    `preview` 必须收到同一个 `--outDir`，否则它服务的是 `dist`（`preview.ts:108-113` 注释记录
 *    了「未知参数被 citty 静默忽略」这个坑）。
 * 2. **显式 `--host 127.0.0.1`** —— `preview` 的默认 host 是 `localhost`，在这台机器上只绑
 *    IPv6 `::1`，于是 `fetch('http://127.0.0.1:3999')` 直接连不上。显式给 IPv4 后 `127.0.0.1`
 *    可用；探测阶段仍同时试 `localhost`，避免平台差异把双轨变成假红。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_MODE } from './mode';

const TEST_PORT = 3999;
const BUILD_OUT_DIR = '.temp-build';
const cwd = resolve(fileURLToPath(import.meta.url), '../..');
const CLI_PREFIX = ['node_modules/ubean/bin/ubean.mjs'];

let serverProcess: ChildProcess | null = null;

function pipeOutput(child: ChildProcess, tag: string): void {
  child.stdout?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.log(`[${tag}] ${msg}`);
  });
  child.stderr?.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.error(`[${tag}] ${msg}`);
  });
}

function spawnCli(args: string[], tag: string, env: NodeJS.ProcessEnv = {}): ChildProcess {
  const child = spawn('node', [...CLI_PREFIX, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NO_PROXY: 'localhost,127.0.0.1',
      ...env
    }
  });
  pipeOutput(child, tag);
  return child;
}

/** 等待一次性命令（build）成功退出；失败时把原因带上，避免只看到一句超时。 */
function waitForExit(child: ChildProcess, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} 在 ${timeoutMs}ms 内未结束`));
    }, timeoutMs);
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolveExit();
      else reject(new Error(`${label} 退出码 ${code}`));
    });
  });
}

/**
 * 逐个候选地址探测，返回**第一个真正可用**的地址。
 *
 * 不接受单一硬编码 host：dev/preview 在不同平台的默认绑定族不同（IPv4 vs IPv6），
 * 只试一个会让「服务其实起来了」变成 ECONNREFUSED 假红。
 */
async function waitForServer(candidates: string[], timeoutMs = 180000): Promise<string> {
  const start = Date.now();
  let lastError = 'no attempt';
  while (Date.now() - start < timeoutMs) {
    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate);
        if (res.ok || res.status === 404) return candidate;
        lastError = `${candidate} -> HTTP ${res.status}`;
      } catch (err) {
        lastError = `${candidate} -> ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${TEST_MODE} 轨的服务在 ${timeoutMs}ms 内不可达（最后一次：${lastError}）`);
}

/** 等待指定文件存在(build 轨由 `ubean build` 生成 openapi.d.ts) */
async function waitForFile(filePath: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`File did not appear within ${timeoutMs}ms: ${filePath}`);
}

export async function setup() {
  const healthPath = '/_health';

  if (TEST_MODE === 'build') {
    console.log(`[global-setup] build 轨：构建到 ${BUILD_OUT_DIR} ...`);
    const buildProcess = spawnCli(['build', '--outDir', BUILD_OUT_DIR], 'build', { NODE_ENV: 'production' });
    await waitForExit(buildProcess, 600000, 'ubean build');
    console.log('[global-setup] build 完成，启动 preview ...');
    serverProcess = spawnCli(
      ['preview', '--outDir', BUILD_OUT_DIR, '--port', String(TEST_PORT), '--host', '127.0.0.1', '--strictPort'],
      'preview',
      { NODE_ENV: 'production' }
    );
  } else {
    console.log(`[global-setup] dev 轨：启动 ubean dev server on port ${TEST_PORT} ...`);
    serverProcess = spawnCli(['dev', '--port', String(TEST_PORT), '--host', '127.0.0.1'], 'dev-server');
  }

  const candidates = [`http://127.0.0.1:${TEST_PORT}${healthPath}`, `http://localhost:${TEST_PORT}${healthPath}`];
  const healthUrl = await waitForServer(candidates);
  const baseUrl = healthUrl.slice(0, -healthPath.length);

  console.log(`[global-setup] ${TEST_MODE} 轨服务就绪：${baseUrl}（探测命中：${healthUrl}）`);

  await waitForFile(resolve(cwd, '.ubean/openapi.d.ts'));
  console.log('[global-setup] OpenAPI types ready');

  // Store base URL in env so test files can access it
  process.env.UBEAN_TEST_BASE_URL = baseUrl;
  process.env.UBEAN_TEST_MODE = TEST_MODE;

  return async function teardown() {
    if (serverProcess) {
      console.log(`[global-setup] 停止 ${TEST_MODE} 轨服务 ...`);
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
    if (TEST_MODE === 'build') {
      // 跑完不留痕。这不只是卫生要求：下一次运行若预览到**陈旧**产物会给出误导性的结果
      // （TS-11 踩过「预览到旧 dist 于是全站 404」），所以每次都从干净状态构建。
      rmSync(resolve(cwd, BUILD_OUT_DIR), { recursive: true, force: true });
    }
  };
}
