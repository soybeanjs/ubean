/**
 * dev 请求路由的端到端验证（RM-V10）。
 *
 * 判据本身在 `dev-request-classify.test.ts` 里逐条钉住；这里验证的是**装配**：
 * `ubeanDevRequestPlugin` 的 pre/post 两个中间件是否真的落在 Vite 自己那套中间件的两侧 ——
 * 这是 RM-V10 的完成定义（静态资源正常、页面 404 返回 HTML、API 404 返回 JSON）能否成立的前提。
 *
 * 断言刻意只走 HTTP（不碰中间件内部状态），因为 RM-V12 之后 CLI 的 server 层会被删除，
 * 触碰内部结构的测试届时会一起失效。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { ubeanDevRequestPlugin } from '@ubean/build/vite';

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  cleanup = [];
});

interface Harness {
  baseUrl: string;
  /** handler 收到的请求 URL（用来证明某个请求是否进了 ubean）。 */
  handled: string[];
  server: ViteDevServer;
}

/**
 * 起一个真 Vite dev server，挂上请求路由插件，handler 用桩：
 * - `/` → HTML（模拟 SSR 产物）
 * - `/api/*` → JSON
 * - 其他 → 404（`/api/` 前缀给 JSON，其余给 HTML，模拟 ubean 的页面兜底与 API 兜底）
 */
async function startHarness(): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'ubean-router-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'router-fixture', type: 'module' }));
  writeFileSync(join(root, 'src/entry.ts'), 'export const value = 1;\n');
  // publicDir 里的文件必须由 Vite 服务，不能被页面 catch-all 吞掉
  writeFileSync(join(root, 'public/static.txt'), 'from-public-dir\n');

  const handled: string[] = [];
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      ubeanDevRequestPlugin({
        async handler(request, context) {
          handled.push(context.url);
          const { pathname } = new URL(request.url);
          if (pathname === '/') {
            return new Response(
              '<!doctype html><html><head><title>app</title></head><body><div id="app">ssr</div></body></html>',
              {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              }
            );
          }
          if (pathname.startsWith('/api/')) {
            return Response.json({ error: 'Not Found', path: pathname }, { status: 404 });
          }
          return new Response('<!doctype html><html><head></head><body>not found</body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      })
    ]
  });
  cleanup.push(() => server.close());
  await server.listen();
  cleanup.push(async () => rmSync(root, { recursive: true, force: true }));

  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, handled, server };
}

interface Probed {
  status: number;
  contentType: string;
  body: string;
}

async function probe(baseUrl: string, path: string, init?: RequestInit): Promise<Probed> {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...init });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body: await res.text()
  };
}

describe('dev 请求路由装配（RM-V10）', () => {
  it('插件把 appType 设为 custom，从而摘掉 Vite 的 SPA 回退', async () => {
    const { server } = await startHarness();
    expect(server.config.appType).toBe('custom');
  });

  it('页面请求交给 ubean，并在返回前经 transformIndexHtml 注入客户端入口', async () => {
    const { baseUrl, handled } = await startHarness();
    const res = await probe(baseUrl, '/');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('<div id="app">ssr</div>');
    // Vite 注入的客户端入口 —— 证明 HTML 真的过了 transformIndexHtml
    expect(res.body).toContain('/@vite/client');
    expect(handled).toEqual(['/']);
  });

  it('/@vite/client 由 Vite 自己服务，不进 ubean', async () => {
    const { baseUrl, handled } = await startHarness();
    const res = await probe(baseUrl, '/@vite/client');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('javascript');
    expect(handled).toEqual([]);
  });

  it('源码模块请求由 Vite 转译，不进 ubean', async () => {
    const { baseUrl, handled } = await startHarness();
    const res = await probe(baseUrl, '/src/entry.ts');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('javascript');
    expect(res.body).toContain('value');
    expect(handled).toEqual([]);
  });

  it('publicDir 里的静态文件由 Vite 服务，页面 catch-all 不吞它', async () => {
    const { baseUrl, handled } = await startHarness();
    const res = await probe(baseUrl, '/static.txt');
    expect(res.status).toBe(200);
    expect(res.body).toContain('from-public-dir');
    expect(handled).toEqual([]);
  });

  it('未知 API 路径返回 JSON 404（归 ubean）', async () => {
    const { baseUrl } = await startHarness();
    const res = await probe(baseUrl, '/api/definitely-missing');
    expect(res.status).toBe(404);
    expect(res.contentType).toContain('application/json');
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Not Found' });
  });

  it('未知页面路径返回 HTML 404（归 ubean）', async () => {
    const { baseUrl } = await startHarness();
    const res = await probe(baseUrl, '/definitely-missing-page');
    expect(res.status).toBe(404);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('not found');
  });

  it('保留命名空间 `_` 前缀归 ubean（哪怕带静态扩展名）', async () => {
    const { baseUrl, handled } = await startHarness();
    await probe(baseUrl, '/_openapi.json');
    expect(handled).toEqual(['/_openapi.json']);
  });

  it('post 兜底：不存在的静态文件最终仍由 ubean 决定响应', async () => {
    const { baseUrl, handled } = await startHarness();
    // 有扩展名 → pre 判给 Vite；Vite 静态找不到 → post 兜底回 ubean
    const res = await probe(baseUrl, '/missing-image.png');
    expect(res.status).toBe(404);
    expect(res.contentType).toContain('text/html');
    expect(handled).toEqual(['/missing-image.png']);
  });

  it('handler 抛错时返回 500 错误页而不是挂起', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ubean-router-err-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'router-err', type: 'module' }));
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        ubeanDevRequestPlugin({
          handler() {
            throw new Error('boom from app');
          }
        })
      ]
    });
    cleanup.push(() => server.close());
    await server.listen();
    cleanup.push(async () => rmSync(root, { recursive: true, force: true }));

    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await probe(`http://127.0.0.1:${port}`, '/');
    expect(res.status).toBe(500);
    expect(res.body).toContain('boom from app');
  });

  it('POST 请求体被完整转成 Web Request（Node↔Web 适配）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ubean-router-post-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'router-post', type: 'module' }));
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        ubeanDevRequestPlugin({
          async handler(request) {
            const body = await request.text();
            return Response.json({ method: request.method, body });
          }
        })
      ]
    });
    cleanup.push(() => server.close());
    await server.listen();
    cleanup.push(async () => rmSync(root, { recursive: true, force: true }));

    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await probe(`http://127.0.0.1:${port}`, '/api/echo', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'content-type': 'application/json' }
    });
    expect(JSON.parse(res.body)).toEqual({ method: 'POST', body: '{"hello":"world"}' });
  });
});
