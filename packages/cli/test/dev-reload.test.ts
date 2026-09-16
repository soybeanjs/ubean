/**
 * dev 热重载与「`vite dev` ≡ `ubean dev`」的端到端回归（RM-V13 / RM-V14）。
 *
 * 两个用例都走**公共入口**（子进程 + 纯 HTTP），因为这类缺陷只在真实项目里出现：
 *
 * 1. **协调器订阅必须真的送达**。RM-V13 首版把 dev-scan 协调器的注册表放在模块级 `WeakMap`，
 *    而真实项目的 `vite.config.ts` 由 Vite 自己打包加载 —— 其中的插件实例与 CLI 从
 *    node_modules import 的那份是**两个模块实例**，CLI 注册的「扫描后重建 app」回调静默落进
 *    另一个注册表：服务端改动完全不生效且没有任何报错。所有 `configFile: false` + 进程内
 *    import 插件的测试都照常通过（它们共享同一个模块实例）。
 * 2. **插件自举路径与 CLI 路径等价**（RM-V14）。`experimental.viteBuilder` 打开时由插件接管
 *    请求路由与宿主 app，`vp dev` 应当单独就能服务页面 SSR / API / 内置 `_` 路由 / 404，且改
 *    文件同样生效 —— 这条路径此前连 .vue 都编译不了（`ubeanPlugin()` 当时不含
 *    `@vitejs/plugin-vue`，那一步由 CLI 代劳）。
 *
 * 两个 server 在同一个测试文件里**顺序**启动：它们会改写同一个探针字面量，并行跑必然互相干扰
 * （vitest 默认按文件并行，因此这里不能拆成两个文件）。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
const vpEntry = join(repoRoot, 'node_modules/.bin/vp');
const probeFile = join(fixtureDir, 'src/routes/api/perf-probe.ts');
const probeInitial = "const probeTag = 'initial';";

interface Running {
  child: ChildProcess;
  baseUrl: string;
  output: () => string;
}

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

/** 起一个 dev server 并等到可服务（探测路径有响应即算就绪）。 */
async function startServer(options: {
  command: string;
  args: string[];
  env?: Record<string, string>;
  readyPath?: string;
}): Promise<Running> {
  const port = await findFreePort();
  const child = spawn(options.command, [...options.args, '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const collect = (chunk: unknown) => (output += String(chunk));
  child.stderr?.on('data', collect);
  child.stdout?.on('data', collect);

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}${options.readyPath ?? '/_health'}`, {
          signal: AbortSignal.timeout(2_000)
        });
        if (res.status > 0) return { child, baseUrl: candidate, output: () => output };
      } catch {
        /* 换下一个候选 */
      }
    }
    if (child.exitCode != null) throw new Error(`dev server 提前退出（exit ${child.exitCode}）\n${output}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`dev server 在 180s 内不可达\n${output}`);
}

async function stopServer(running: Running | null): Promise<void> {
  if (!running || running.child.exitCode != null) return;
  const child = running.child;
  child.kill('SIGTERM');
  await new Promise<void>(resolveExit => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveExit();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

function writeProbe(marker: string): void {
  const current = readFileSync(probeFile, 'utf8');
  if (!current.includes(probeInitial)) {
    throw new Error(`${probeFile} 的探针字面量已被改写：${probeInitial}`);
  }
  writeFileSync(probeFile, current.replace(probeInitial, `const probeTag = '${marker}';`));
}

function restoreProbe(): void {
  const current = readFileSync(probeFile, 'utf8');
  if (current.includes(probeInitial)) return;
  writeFileSync(probeFile, current.replace(/const probeTag = '[^']*';/, probeInitial));
}

/** 轮询直到响应出现标记；带上最后一次响应体，失败时能直接看出服务端返回了什么。 */
async function pollMarker(baseUrl: string, marker: string, timeoutMs = 20_000) {
  const started = Date.now();
  let body = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/perf-probe`);
      body = await res.text();
      if (body.includes(marker)) return { ok: true, elapsedMs: Date.now() - started, body };
    } catch {
      /* 重扫期间可能短暂不可用 */
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  return { ok: false, elapsedMs: Date.now() - started, body };
}

async function probe(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
}

let running: Running | null = null;

afterEach(async () => {
  await stopServer(running);
  running = null;
  // 必须还原：本测试会改写示例项目的源码
  restoreProbe();
});

describe('ubean dev 热重载', () => {
  it('改服务端路由文件后响应反映新内容（扫描 → 重建 app 的链路真的通）', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    running = await startServer({ command: process.execPath, args: [cliEntry, 'dev'] });

    const marker = `reload-${Date.now()}`;
    expect(await fetch(`${running.baseUrl}/api/perf-probe`).then(res => res.text())).not.toContain(marker);

    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);

    expect(result.ok, `未观察到新内容；最后响应：${result.body.slice(0, 200)}`).toBe(true);
  }, 240_000);
});

describe('ubean dev + experimental.viteBuilder（开关过渡路径）', () => {
  /**
   * 开关打开时 app 归插件所有，CLI 不能再注册一个带 handler 的请求插件 —— 否则两个 pre
   * 中间件都会认领应用请求，先注册的（用户 config 里的那份）胜出，CLI 的 handler 变成永远
   * 不执行的影子，两侧还会各建一份 app。这条用例守的就是这个组合。
   */
  it('页面/API 正常服务，且改文件仍生效（插件自举的 app 被重建）', async () => {
    running = await startServer({
      command: process.execPath,
      args: [cliEntry, 'dev'],
      env: { UBEAN_VITE_BUILDER: '1' }
    });

    const home = await probe(running.baseUrl, '/');
    expect(home.status, home.body.slice(0, 200)).toBe(200);
    expect(home.contentType).toContain('text/html');
    expect(home.body).toContain('class="home"');

    const api = await probe(running.baseUrl, '/api/hello');
    expect(api.status).toBe(200);
    expect(api.contentType).toContain('application/json');

    const marker = `cli-switch-${Date.now()}`;
    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);
    expect(result.ok, `未观察到新内容；最后响应：${result.body.slice(0, 200)}`).toBe(true);
  }, 240_000);
});

describe('vite dev 等价性（experimental.viteBuilder 打开）', () => {
  const startViteDev = (): Promise<Running> => {
    if (!existsSync(vpEntry)) throw new Error(`${vpEntry} 不存在：仓库根未安装依赖`);
    return startServer({ command: vpEntry, args: ['dev'], env: { UBEAN_VITE_BUILDER: '1' } });
  };

  it('页面 SSR / API / 内置 `_` 路由 / 404 四类请求都由插件服务', async () => {
    running = await startViteDev();

    const home = await probe(running.baseUrl, '/');
    expect(home.status, home.body.slice(0, 200)).toBe(200);
    expect(home.contentType).toContain('text/html');
    expect(home.body).toContain('class="home"');
    // 过了 transformIndexHtml 才会出现客户端入口
    expect(home.body).toContain('/@vite/client');

    const api = await probe(running.baseUrl, '/api/hello');
    expect(api.status).toBe(200);
    expect(api.contentType).toContain('application/json');

    const health = await probe(running.baseUrl, '/_health');
    expect(health.status).toBe(200);

    const missingPage = await probe(running.baseUrl, '/definitely-missing');
    expect(missingPage.status).toBe(404);
    expect(missingPage.contentType).toContain('text/html');

    const missingApi = await probe(running.baseUrl, '/api/definitely-missing');
    expect(missingApi.status).toBe(404);
    expect(missingApi.contentType).toContain('application/json');
  }, 240_000);

  /**
   * 配置敏感信号：`vite dev`（插件自举路径）下语言前缀路由可用。
   *
   * 这条**不是** `loadUbeanConfigSync()` 那个缺陷的守卫 —— 我把它写成守卫后做过证伪：把修复从
   * 构建产物里撤掉，本用例仍然通过。原因是 dev 侧 app 由 `bootstrapDevApp()` 经**异步**加载器
   * （`loadUbeanConfig`）拿配置，同步加载器的缺陷不经过这条路；它的影响面是**构建路径**
   * （config 直接喂给 `prepareBuild` 与 env 配置），已在 `build-paths` 与手工对照里量到。
   *
   * 保留它的价值在于：插件自举的 dev 路径确实按用户配置工作（示例是 `prefix_except_default`
   * + locales en/zh），且前缀路径上的未知页面仍走 404 页面兜底而不是 JSON。
   */
  it('配置真的被读到：语言前缀路由可用（i18n 未启用时 /zh/about 会 404）', async () => {
    running = await startViteDev();

    const prefixed = await probe(running.baseUrl, '/zh/about');
    expect(prefixed.status, prefixed.body.slice(0, 200)).toBe(200);
    expect(prefixed.body).toContain('class="about"');

    const defaultLocale = await probe(running.baseUrl, '/about');
    expect(defaultLocale.status).toBe(200);

    // 前缀路径上的未知页面仍走 404 页面兜底（而不是落到 JSON）
    const missing = await probe(running.baseUrl, '/zh/definitely-missing');
    expect(missing.status).toBe(404);
    expect(missing.contentType).toContain('text/html');
  }, 240_000);

  it('改服务端文件后同样生效（插件自举的 app 会被重建）', async () => {
    running = await startViteDev();

    const marker = `vp-${Date.now()}`;
    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);

    expect(result.ok, `未观察到新内容；最后响应：${result.body.slice(0, 200)}`).toBe(true);
  }, 240_000);
});
