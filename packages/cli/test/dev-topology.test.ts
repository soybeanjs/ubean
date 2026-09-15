/**
 * dev 请求拓扑回归网（RM-V05，docs/vite-plugin-migration.md Phase 0 硬前置）。
 *
 * 目的：在 **旧实现** 上把 `ubean dev` 的 HTTP 拓扑钉住，供 Vite 插件化（ADR-0012）
 * 整改前后对照。因此断言必须走**公共入口**（子进程 `ubean dev` + HTTP），不碰任何内部
 * API —— 内部 HTTP server 在 RM-V12 会被删除，走内部 API 的测试届时会一起失效。
 *
 * 覆盖（对应 RM-V05 的清单）：
 * - SSR HTML 注入：页面 200 返回 SSR 产物 + Vite client 注入
 * - 页面 404 与 API 404 的分野（fixture 带 `pages/404.vue`）
 * - 静态资源不被页面 catch-all 吞掉
 * - `/_devtools` 302、`/_openapi.json` 200、`_` 前缀走 JSON 404
 * - 中间件顺序的可观测证据：安全头/请求 ID 覆盖全部响应类别、i18n 与 CSRF 在处理前生效
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

let child: ChildProcess | undefined;
let baseUrl: string;
let stderrOutput = '';

/**
 * dev 端口除自身外还会占用 `port + 1000`（HMR 独立端口），因此只在 10000–30000 取样，
 * 并保证两个端口都空闲；否则 `port + 1000` 可能越过 65535 触发 ERR_SOCKET_BAD_PORT。
 */
async function findFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 10_000 + Math.floor(Math.random() * 20_000);
    if (port + 1000 > 65_535) continue;
    const free = await Promise.all([port, port + 1000].map(isPortFree));
    if (free.every(Boolean)) return port;
  }
  throw new Error('找不到可用端口');
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolveFree => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolveFree(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)));
  });
}

/** dev 默认只绑 IPv6 `[::1]`（dev.host: 'localhost'），先试 IPv6 再回退 IPv4。 */
async function resolveBaseUrl(port: number, timeoutMs = 120_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}/`, { signal: AbortSignal.timeout(1_000) });
        if (res.status > 0) return candidate;
      } catch {
        /* 换下一个候选 */
      }
    }
    if (child?.exitCode != null) throw new Error(`dev server 提前退出（exit ${child.exitCode}）\n${stderrOutput}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`dev server 在 ${timeoutMs}ms 内不可达\n${stderrOutput}`);
}

beforeAll(async () => {
  if (!existsSync(cliEntry)) {
    throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
  }
  const port = await findFreePort();
  child = spawn(process.execPath, [cliEntry, 'dev', '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr?.on('data', chunk => (stderrOutput += chunk));
  baseUrl = await resolveBaseUrl(port);
}, 180_000);

afterAll(async () => {
  if (!child || child.exitCode != null) return;
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
});

interface Probed {
  status: number;
  contentType: string;
  headers: Headers;
  body: string;
}

async function probe(path: string): Promise<Probed> {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    headers: res.headers,
    body: await res.text()
  };
}

describe('dev 请求拓扑（RM-V05 基线）', () => {
  describe('SSR HTML 注入', () => {
    it('页面返回 SSR 产物并注入 Vite client', async () => {
      const res = await probe('/');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('text/html');
      expect(res.body.startsWith('<!doctype html>')).toBe(true);
      // page 组件真的被 SSR 渲染出来了（不只是空壳 HTML）
      expect(res.body).toContain('class="home"');
      // 客户端入口由 HTML transform 注入
      expect(res.body).toContain('/@vite/client');
    });

    it('SPA 路由页同样 SSR', async () => {
      const res = await probe('/about');
      expect(res.status).toBe(200);
      expect(res.body).toContain('class="about"');
    });
  });

  describe('页面 404 与 API 404 的分野', () => {
    it('未知页面路径返回 404 + HTML（走页面兜底而非 JSON）', async () => {
      const res = await probe('/definitely-missing-page');
      expect(res.status).toBe(404);
      expect(res.contentType).toContain('text/html');
      expect(res.body.startsWith('<!doctype html>')).toBe(true);
      // 已知未修：dev 下 404 组件自身的 DOM 没有 SSR 出来（Vue Router 报无匹配，
      // 日志出现 VUE_ROUTER_R0004），因此这里只锁状态码与内容类型契约。
      // 内容断言待该缺陷修复后补上，避免把这个行为固化成"基线"。
    });

    it('未知 API 路径返回 404 + JSON', async () => {
      const res = await probe('/api/definitely-missing');
      expect(res.status).toBe(404);
      expect(res.contentType).toContain('application/json');
      expect(JSON.parse(res.body)).toMatchObject({ error: 'Not Found' });
    });

    it('保留命名空间 `_` 前缀返回 JSON 404，不落到页面 catch-all', async () => {
      const res = await probe('/_definitely-missing');
      expect(res.status).toBe(404);
      expect(res.contentType).toContain('application/json');
    });
  });

  describe('静态与开发资源不被页面 catch-all 吞掉', () => {
    it('/@vite/client 返回 JS', async () => {
      const res = await probe('/@vite/client');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('javascript');
    });

    it('源码模块按转译结果返回', async () => {
      const res = await probe('/src/pages/index.vue');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('javascript');
    });
  });

  describe('内置 `_` 路由不被页面兜底吞掉', () => {
    // 回归（2026-09-15 实测并修复）：`pages/404.vue` 存在时，页面兜底 `*` 会按注册顺序
    // 抢先匹配晚注册的内置路由 —— `/_openapi.json` 与 `/_scalar` 曾直接变成 404。
    // 修复是把 OpenAPI 注册提前到 `registerRoutes` 之前。
    it.each(['/_health', '/_openapi.json', '/_scalar'])('%s 返回 200', async path => {
      const res = await probe(path);
      expect(res.status).toBe(200);
    });
  });

  describe('内置保留路由', () => {
    it('/_devtools 302 到 DevTools UI', async () => {
      const res = await probe('/_devtools');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBeTruthy();
    });

    it('/_openapi.json 返回 OpenAPI 文档', async () => {
      const res = await probe('/_openapi.json');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('application/json');
      const doc = JSON.parse(res.body) as { openapi?: string; paths?: Record<string, unknown> };
      expect(doc.openapi).toBeTruthy();
      expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(0);
    });
  });

  describe('中间件顺序的可观测证据', () => {
    // 安全头出现在「页面 200 / API 200 / 页面 404 / API 404」四类响应上，说明安全头中间件
    // 位于路由与 404 兜底之外（最外层）；请求 ID 同理。
    it.each([
      ['/', 200],
      ['/api/hello', 200],
      ['/definitely-missing-page', 404],
      ['/api/definitely-missing', 404]
    ])('%s（%i）带上安全头与请求 ID', async (path, status) => {
      const res = await probe(path);
      expect(res.status).toBe(status);
      expect(res.headers.get('x-request-id')).toBeTruthy();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBeTruthy();
    });

    it('i18n 中间件在页面处理前生效（写入 locale cookie）', async () => {
      const res = await probe('/');
      expect(res.headers.get('set-cookie') ?? '').toContain('ubean_locale=');
    });

    it('CSRF 中间件在路由处理前生效（写入 csrf cookie）', async () => {
      const res = await probe('/api/hello');
      expect(res.headers.get('set-cookie') ?? '').toContain('ubean_csrf=');
    });
  });
});
