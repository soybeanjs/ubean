/**
 * `ubean preview` 的端到端验收（RM-V25）。
 *
 * 两条形态各测一次，因为它们在 CLI 侧的路径完全不同：
 * - **fullstack**：CLI 委托 `vite preview`，请求由插件的预览中间件交给产物里的生产 handler。
 *   断言面必须包含「静态文件里不存在」的路径（API / 未预渲染页 / 404 页），否则测不出「是不是
 *   真的走了 handler」——只看 `/` 的话，预渲染 HTML 也能满足。
 * - **spa**：产物没有服务端入口，校验的是静态目录 + SPA 回退。用一个临时项目（含
 *   `ubean.config.ts` 的 `mode: 'spa'`）而不是改造示例项目 —— 示例是 fullstack，改它的 mode
 *   会牵连其它测试。临时项目放在示例目录下，这样 `ubean.config.ts` 里的 `import ... from 'ubean'`
 *   能沿 node_modules 向上解析到仓库工作区（放在系统临时目录里反而解析不到，此前踩过）。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
const spaProjectDir = join(fixtureDir, '.temp-preview-spa');

interface Running {
  child: ChildProcess;
  baseUrl: string;
  output: () => string;
}

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

/**
 * 用 CLI 的默认路径把示例项目构建到 `dist`（与 `analyze:check` 的口径一致）。
 */
async function buildFixture(): Promise<void> {
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const proc = spawn(process.execPath, [cliEntry, 'build'], {
      cwd: fixtureDir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'ignore'
    });
    proc.once('exit', code =>
      code === 0 ? resolveBuild() : rejectBuild(new Error(`fixture 构建失败（exit ${code}）`))
    );
  });
}

async function startPreview(cwd: string, readyPath = '/'): Promise<Running> {
  if (!existsSync(cliEntry)) throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
  const port = await findFreePort();
  const child = spawn(process.execPath, [cliEntry, 'preview', '--port', String(port), '--strictPort'], {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const collect = (chunk: unknown) => (output += String(chunk));
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}${readyPath}`, { signal: AbortSignal.timeout(2_000) });
        if (res.status > 0) return { child, baseUrl: candidate, output: () => output };
      } catch {
        /* 换下一个候选 */
      }
    }
    if (child.exitCode != null) throw new Error(`preview 提前退出（exit ${child.exitCode}）\n${output}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`preview 在 60s 内不可达\n${output}`);
}

async function stopPreview(running: Running | null): Promise<void> {
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

describe('ubean preview（fullstack，委托 vite preview + 生产 handler）', () => {
  let running: Running | null = null;

  beforeAll(async () => {
    // **先重建 fixture 的 dist**：预览服务的是磁盘上的产物，源码改了而产物旧时，断言测的是
    // 上一个版本的页面（实测踩过两次 —— 一次是预览命令忽略了 `--outDir` 而服务旧 dist，
    // 一次是本用例新增页面后未重建）。代价约 2s。
    await buildFixture();
    // 清掉上一次运行留下的 fs 缓存（生产 ISR 落在 `.ubean/cache`）：不清也不影响断言（见
    // ISR 用例里的不变量写法），但留着会让每次的首个请求落在 STALE 上，读数更难解释。
    rmSync(join(fixtureDir, '.ubean', 'cache'), { recursive: true, force: true });
    running = await startPreview(fixtureDir);
  }, 180_000);

  afterAll(async () => {
    await stopPreview(running);
    running = null;
  });

  it('预渲染页与客户端资源可访问，MIME 正确', async () => {
    const page = await fetch(`${running!.baseUrl}/about`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<div id="app"');

    const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html);
    expect(asset, '预渲染 HTML 里应当有客户端入口 script').not.toBeNull();
    const js = await fetch(`${running!.baseUrl}${asset![1]}`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('javascript');
  });

  it('并行路由的默认视图与插槽都在生产 SSR 首屏里', async () => {
    // 与 `dev-topology.test.ts` 的同名断言配对：dev 与产物两侧都要成立（曾出现 dev 首屏渲染插槽页、
    // 客户端渲染默认视图的不一致，根因是 SSR 路由表没有按 route 分组命名视图）。
    const res = await fetch(`${running!.baseUrl}/parallel`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="parallel-default"');
    expect(html).toContain('class="slot-aside"');
  });

  it('Server / Client Components 在生产 SSR 里同形（内容 + 占位符）', async () => {
    const res = await fetch(`${running!.baseUrl}/server-components`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="sc-server"');
    expect(html).toContain('data-client-only');
    expect(html).not.toContain('class="sc-client"');
    expect(html).toContain('class="paired-server"');
    expect(html).not.toContain('class="paired-client"');
  });

  it('ISR 在生产产物里命中缓存（命中后两次拿到同一份渲染）', async () => {
    const probeIsr = async () => {
      const res = await fetch(`${running!.baseUrl}/isr-demo`);
      const body = await res.text();
      return { header: res.headers.get('x-isr') ?? '', token: /class="isr-token">([^<]*)/.exec(body)?.[1] ?? '' };
    };
    // 首个请求**不固定**是 MISS：生产用的是 fs 缓存（`.ubean/cache`），它会跨进程/跨运行留存 ——
    // 手工验证过一次之后再跑，首个请求就是 STALE（这恰好也是「缓存真的落了盘」的证据）。因此这里
    // 断言的是不依赖初始状态的**不变量**：预热一次并等后台重生成落定后，连续两次都必须是 HIT，
    // 且拿到同一份渲染结果。
    await probeIsr();
    await new Promise(r => setTimeout(r, 300));

    const a = await probeIsr();
    const b = await probeIsr();
    expect(a.header).toBe('HIT');
    expect(b.header).toBe('HIT');
    expect(a.token).not.toBe('');
    expect(b.token).toBe(a.token);
  });

  it('API 与 404 走生产 handler（静态目录里没有这两个路径）', async () => {
    const api = await fetch(`${running!.baseUrl}/api/hello`);
    expect(api.status).toBe(200);
    expect(api.headers.get('content-type')).toContain('application/json');

    const missing = await fetch(`${running!.baseUrl}/definitely-not-a-page`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type') ?? '').toContain('text/html');
  });
});

describe('ubean preview（spa，静态 + 客户端回退）', () => {
  let running: Running | null = null;

  beforeAll(async () => {
    rmSync(spaProjectDir, { recursive: true, force: true });
    mkdirSync(join(spaProjectDir, 'dist', 'public', 'assets'), { recursive: true });
    writeFileSync(
      join(spaProjectDir, 'ubean.config.ts'),
      "import { defineConfig } from 'ubean';\nexport default defineConfig({ mode: 'spa' });\n"
    );
    writeFileSync(join(spaProjectDir, 'dist', 'public', 'index.html'), '<div id="app">spa shell</div>');
    writeFileSync(join(spaProjectDir, 'dist', 'public', 'assets', 'app.css'), '.spa{color:red}');
    running = await startPreview(spaProjectDir);
  }, 120_000);

  afterAll(async () => {
    await stopPreview(running);
    running = null;
    rmSync(spaProjectDir, { recursive: true, force: true });
  });

  it('未知路由回退到 index.html（客户端路由接管）', async () => {
    const res = await fetch(`${running!.baseUrl}/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('spa shell');
  });

  it('静态资源的 MIME 正确，缺失资源 404', async () => {
    const css = await fetch(`${running!.baseUrl}/assets/app.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');

    // 注意：spa 模式会把「未知路由」回退到 index.html，因此这里断言的是带扩展名的资源
    const missing = await fetch(`${running!.baseUrl}/assets/nope.css`);
    expect(missing.status).toBe(200);
    expect(await missing.text()).toContain('spa shell');
  });
});
