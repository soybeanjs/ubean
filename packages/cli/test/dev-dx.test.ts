/**
 * dev DX 走查（RM-V15）：在**真实浏览器**里走一遍交互型能力。
 *
 * 与其余集成测试的分工：`dev-topology` / `dev-reload` 用纯 HTTP 覆盖请求拓扑与热重载链路，
 * 这里补的是「只有浏览器 + 交互才成立」的三件事，避免把「自动化测试过了」当成「DX 走查过了」：
 * 1. 页面内切换语言（`setLocale` → load + cookie + 路由跳转，全程不整页刷新）；
 * 2. DevTools 外壳能从 CLI banner 给的地址进去；
 * 3. 改客户端文件后浏览器**整页重载** —— 这是 R3 修正后确认的语义（旧实现也是整页刷新，
 *    「保留状态」指的是服务端模块实例，由基准脚本的 reload 对照覆盖）。
 *
 * 刻意不在断言里依赖 DevTools 面板的内部结构：那是 UI 细节，改动频繁且不属于框架契约。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 客户端文件：改动它既要触发 rescan，也要让浏览器整页重载。 */
const clientFile = join(fixtureDir, 'src/app.ts');

let child: ChildProcess | undefined;
let baseUrl: string;
let browser: Browser | undefined;
let output = '';
let clientOriginal: string | null = null;

async function findFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 10_000 + Math.floor(Math.random() * 20_000);
    const free = await new Promise<boolean>(resolveFree => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolveFree(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)));
    });
    if (free) return port;
  }
  throw new Error('找不到可用端口');
}

beforeAll(async () => {
  if (!existsSync(cliEntry)) {
    throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 DX 走查`);
  }
  clientOriginal = readFileSync(clientFile, 'utf8');

  const port = await findFreePort();
  child = spawn(process.execPath, [cliEntry, 'dev', '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', chunk => (output += chunk));
  child.stderr?.on('data', chunk => (output += chunk));

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}/_health`, { signal: AbortSignal.timeout(2_000) });
        if (res.status > 0) {
          baseUrl = candidate;
          break;
        }
      } catch {
        /* 换下一个候选 */
      }
    }
    if (baseUrl) break;
    if (child.exitCode != null) throw new Error(`dev server 提前退出（exit ${child.exitCode}）\n${output}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  if (!baseUrl) throw new Error(`dev server 在 180s 内不可达\n${output}`);

  browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  if (child && child.exitCode == null) {
    child.kill('SIGTERM');
    await new Promise<void>(resolveExit => {
      const timer = setTimeout(() => {
        child?.kill('SIGKILL');
        resolveExit();
      }, 5_000);
      child?.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  // 改过示例项目源码，必须还原
  if (clientOriginal !== null) {
    const current = readFileSync(clientFile, 'utf8');
    if (current !== clientOriginal) writeFileSync(clientFile, clientOriginal);
    clientOriginal = null;
  }
});

async function openPage(timeout = 20_000): Promise<Page> {
  const page = await browser!.newPage();
  page.setDefaultTimeout(timeout);
  return page;
}

describe('dev DX 走查（浏览器内真实交互）', () => {
  it('页面内切换语言：URL 与文案都切到中文，且没有整页刷新', async () => {
    const page = await openPage();
    // 整页重载计数器：SPA 的 history 跳转不触发 `load`，整页刷新会
    let loads = 0;
    page.on('load', () => (loads += 1));
    try {
      await page.goto(`${baseUrl}/i18n`, { waitUntil: 'domcontentloaded' });
      // 等应用水合完成再交互：SSR 首屏的按钮此时还没有监听器，早点击会被丢掉。
      // 同时把「首个整页重载」等掉 —— dev server 首次请求后依赖预构建完成会触发一次，
      // 它会在随机时刻打断 page.evaluate（实测报 Execution context was destroyed）。
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_500);
      const loadsBefore = loads;

      await page.getByRole('button', { name: 'zh', exact: true }).click();

      // setLocale 走 router.replace(switchLocalePath)：URL 变为语言前缀路径。
      // 用轮询 page.url() 而不是 `waitForURL` —— 后者默认等 `load` 事件，而 SPA 的
      // history 跳转根本不触发 load，会一直等到超时（实测踩过）。
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toContain('/zh');
      await expect.poll(() => page.locator('h1').first().textContent(), { timeout: 15_000 }).toContain('Ubean 测试');

      // 期间没有整页重载 ⇒ 是客户端路由跳转（而不是刷新后落到 /zh）
      expect(loads).toBe(loadsBefore);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('DevTools 外壳可以从 /_devtools 进入', async () => {
    const response = await fetch(`${baseUrl}/_devtools`, { redirect: 'follow' });
    expect(response.status).toBe(200);
    const html = await response.text();
    // 外壳是预构建 SPA：能返回 HTML 且引用了脚本即算可进入（不锁 UI 结构）
    expect(html).toContain('<script');
    expect(response.url).toContain('/__devtools');
  }, 60_000);

  it('改客户端文件后浏览器整页重载（文档化语义）', async () => {
    const page = await openPage(30_000);
    let loads = 0;
    page.on('load', () => (loads += 1));
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      // 先把 dev server 自己的首次重载等掉，之后观察到的 load 才算「本次改动触发」
      await page.waitForTimeout(1_500);
      const loadsBefore = loads;

      // 追加一行注释：既触发 rescan（app.ts 是入口文件），也让协调器发 full-reload
      const current = readFileSync(clientFile, 'utf8');
      writeFileSync(clientFile, `${current}\n// dx-probe-${Date.now()}\n`);

      await expect.poll(() => loads, { timeout: 30_000, interval: 200 }).toBeGreaterThan(loadsBefore);
    } finally {
      await page.close();
      writeFileSync(clientFile, clientOriginal!);
    }
  }, 120_000);
});
