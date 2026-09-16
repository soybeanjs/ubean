/**
 * 插件自举宿主 app（RM-V12）——「`vite dev` 没有 CLI 也能服务应用」的验收。
 *
 * 这是 ADR-0012 Phase 1 的目标本身：框架插件自己扫盘、建 app、接 SSR 图并处理请求，
 * CLI 只是其中一条调用路径。因此这里**不使用任何 CLI 设施**：真 Vite server + 真实
 * ubean 插件组合（core + vue + islands）+ 真 HTTP。
 *
 * 与 `dev-request-router.integration.test.ts` 的分工：那个测试用桩 handler 验「路由装配」，
 * 这个测试不给 handler，验「自举」。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { ubeanPlugin, ubeanDevRequestPlugin } from '@ubean/build/vite';
import { ubeanVite } from '@ubean/build/vue';
import { loadUbeanConfig } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  cleanup = [];
});

/**
 * fixture 项目**放在 `packages/builder/test/fixtures/` 下**而不是 tmpdir：
 *
 * fixture 在工作区之外时，Vite 的依赖预构建解析 `vue-i18n` 这类包会算出包内相对路径再去
 * 读（`extractExportsData` → ENOENT），测试根本起不来。放在 builder 之下就走上正常的
 * node_modules 查找链。fixture 里的 `src/**` 因此也不能 typecheck（builder tsconfig 已
 * exclude `test`），路由文件改用 `@ubean/routes`（builder 的直接依赖）而非聚合入口 `ubean/server`。
 */
const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures/dev-bootstrap');

interface Harness {
  baseUrl: string;
  server: ViteDevServer;
}

interface Harness {
  baseUrl: string;
  server: ViteDevServer;
}

/**
 * 起一个**只靠插件**服务的 Vite server：插件组合与用户在 `vite.config.ts` 里写的
 * `ubeanPlugin()` 等价（这里用 builder 子路径拼装，避免测试依赖主包聚合入口）。
 */
async function startPluginOnlyServer(): Promise<Harness> {
  const root = FIXTURE_ROOT;
  // 预构建缓存写到临时目录，避免在仓库里留 node_modules/.vite
  const cacheDir = mkdtempSync(join(tmpdir(), 'ubean-vite-cache-'));
  cleanup.push(async () => rmSync(cacheDir, { recursive: true, force: true }));

  // 与 `ubean/vite` 的聚合入口一致：core + vue + islands
  const config = await loadUbeanConfig(root);
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { cacheDir },
    plugins: [
      // 与 `ubean/vite` 的聚合入口一致：core + vue（含 @vitejs/plugin-vue，RM-V14 起由
      // ubeanVite 自己注册）+ islands
      ubeanPlugin({ config }),
      ubeanVite({ config }),
      ubeanIslandsPlugin(),
      // 不给 handler —— 由插件自举宿主 app（这就是被测能力）
      ubeanDevRequestPlugin({})
    ]
  });
  cleanup.push(() => server.close());
  await server.listen();

  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

async function probe(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
}

describe('插件自举宿主 app（无 CLI）', () => {
  it('页面请求被 SSR 渲染，并由 Vite 注入客户端入口', async () => {
    const { baseUrl } = await startPluginOnlyServer();
    const res = await probe(baseUrl, '/');

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('hello from plugin bootstrap');
    // 过了 transformIndexHtml 才会出现
    expect(res.body).toContain('/@vite/client');
  }, 60_000);

  it('API 路由由自举出的 Hono app 处理', async () => {
    const { baseUrl } = await startPluginOnlyServer();
    const res = await probe(baseUrl, '/api/hello');

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual({ hello: 'world' });
  }, 60_000);

  it('未知页面返回 404 + HTML（走 404 catch-all），未知 API 返回 404 + JSON', async () => {
    const { baseUrl } = await startPluginOnlyServer();

    const page = await probe(baseUrl, '/definitely-missing');
    expect(page.status).toBe(404);
    expect(page.contentType).toContain('text/html');
    // 404 组件自身被 SSR（R8 的回归：缺 catch-all 时这里只会是空壳）
    expect(page.body).toContain('missing');

    const api = await probe(baseUrl, '/api/definitely-missing');
    expect(api.status).toBe(404);
    expect(api.contentType).toContain('application/json');
  }, 60_000);

  it('内置 `_` 路由仍归 ubean，静态资源仍归 Vite', async () => {
    const { baseUrl } = await startPluginOnlyServer();

    const health = await probe(baseUrl, '/_health');
    expect(health.status).toBe(200);

    const viteClient = await probe(baseUrl, '/@vite/client');
    expect(viteClient.status).toBe(200);
    expect(viteClient.contentType).toContain('javascript');
  }, 60_000);
});
