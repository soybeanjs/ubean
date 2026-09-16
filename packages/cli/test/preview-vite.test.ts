/**
 * `vite preview` 的端到端验收（RM-V24）。
 *
 * 为什么必须走**真实子进程 + 真实产物**：这条路径的失败面恰好都在「接线」上，而接线只在真实
 * 项目里成立 —— `ubeanPlugin()` 是用户的 `vite.config.ts` 注册的（由 Vite 自己打包加载），
 * `dist/server/entry.mjs` 是构建产物，两者缺一都测不到。进程内 `configFile: false` 的测试
 * 会在 RM-V13 那类「两个模块实例」的问题上给出假绿。
 *
 * 断言面覆盖两种形态：
 * - **生产 handler**（`/api/hello`、未预渲染的页面、404 页）：只可能来自
 *   `dist/server/entry.mjs` 的 `createFetchHandler` —— 静态文件里没有这些路径。
 * - **静态 / 预渲染**（预渲染页、`assets/*`）：由产物内的 `serveStatic` 服务，与生产一致。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
const vpEntry = join(repoRoot, 'node_modules/.bin/vp');
const serverEntry = join(fixtureDir, 'dist/server/entry.mjs');

let child: ChildProcess | null = null;
let baseUrl = '';
let output = '';

async function findFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 20_000 + Math.floor(Math.random() * 20_000);
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

/** 用 CLI 的默认路径（开关关闭）产出 dist —— 与 `analyze:check` 的期望一致。 */
async function ensureDist(): Promise<void> {
  if (existsSync(serverEntry) && existsSync(join(fixtureDir, 'dist/public/index.html'))) return;
  if (!existsSync(cliEntry)) throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const proc = spawn(process.execPath, [cliEntry, 'build'], { cwd: fixtureDir, stdio: 'ignore' });
    proc.once('exit', code => (code === 0 ? resolveBuild() : rejectBuild(new Error(`构建失败（exit ${code}）`))));
  });
}

async function stopPreview(): Promise<void> {
  if (!child || child.exitCode != null) return;
  const proc = child;
  proc.kill('SIGTERM');
  await new Promise<void>(resolveExit => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolveExit();
    }, 5_000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
  child = null;
}

beforeAll(async () => {
  if (!existsSync(vpEntry)) throw new Error(`${vpEntry} 不存在：仓库根未安装依赖`);
  await ensureDist();

  const port = await findFreePort();
  const proc = spawn(vpEntry, ['preview', '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child = proc;
  const collect = (chunk: unknown) => (output += String(chunk));
  proc.stdout?.on('data', collect);
  proc.stderr?.on('data', collect);

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}/_health`, { signal: AbortSignal.timeout(2_000) });
        if (res.status > 0) {
          baseUrl = candidate;
          return;
        }
      } catch {
        /* 换下一个候选 */
      }
    }
    if (proc.exitCode != null) throw new Error(`preview 提前退出（exit ${proc.exitCode}）\n${output}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`preview 在 60s 内不可达\n${output}`);
}, 120_000);

afterAll(stopPreview);

describe('vite preview（RM-V24）', () => {
  it('预渲染页由产物内的静态服务返回', async () => {
    const res = await fetch(`${baseUrl}/about`);
    expect(res.status, output.slice(-500)).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<div id="app"');
  });

  it('API 路由走生产 handler（静态文件里不存在该路径）', async () => {
    const res = await fetch(`${baseUrl}/api/hello`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ message: expect.any(String) });
  });

  it('未预渲染的页面由 SSR 产出', async () => {
    const res = await fetch(`${baseUrl}/dashboard`);
    expect(res.status, output.slice(-500)).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // SSR 产物必须带水合状态与客户端入口，否则预览的就不是真实渲染结果
    expect(html).toContain('<div id="app"');
  });

  it('未命中的路由返回 404 页（而非静态服务器的纯文本 404）', async () => {
    const res = await fetch(`${baseUrl}/definitely-not-a-page`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
  });

  it('客户端资源按 MIME 正确返回', async () => {
    const indexHtml = await (await fetch(`${baseUrl}/about`)).text();
    const match = /src="(\/assets\/[^"]+\.js)"/.exec(indexHtml);
    expect(match, '预渲染 HTML 里应当有客户端入口 script').not.toBeNull();
    const asset = await fetch(`${baseUrl}${match![1]}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('javascript');
  });
});
