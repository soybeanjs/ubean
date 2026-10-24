/**
 * `i18n.locales[].path`：`code` 保持 BCP-47，只有 URL 段换成短名。
 *
 * `packages/i18n/test/paths.test.ts` 证明的是纯函数会产出什么；这里证明
 * **路由表装配 + i18n 中间件 + 真实请求**合起来给出什么：
 *
 * - 注册的路径用段（`/zh/about`），不存在的 `/zh-CN/about` 必须 404；
 * - `Content-Language` 与 cookie 仍是 **code**（`zh-CN`）；
 * - 默认语言显式前缀的 302 剥除也按段匹配。
 *
 * 与 `i18n-strategies.test.ts` 同构（进程内断言，无需构建）。
 */
import { describe, expect, it } from 'vitest';
import { UbeanApp } from '../src/app';
import type { ScannedPageRoute } from '../src/app';

const ORIGIN = 'http://localhost';
const SSR_MARKER = '<div id="ssr-ran">SSR</div>';

function makePage(route: string, name: string): ScannedPageRoute {
  return {
    fullPath: `${name}.vue`,
    relativePath: `${name}.vue`,
    dirname: '',
    basename: `${name}.vue`,
    name,
    route,
    path: route,
    pageKind: 'component',
    isMarkdown: false
  };
}

type Strategy = 'prefix_except_default' | 'prefix' | 'prefix_and_default' | 'no_prefix';

/** 中文用 `zh` 段，葡语用 `pt`，两份 code 都保持完整 BCP-47。 */
const LOCALES = [{ code: 'en' }, { code: 'zh-CN', path: 'zh' }, { code: 'pt-BR', path: 'pt' }];
const PATHS = { 'zh-CN': 'zh', 'pt-BR': 'pt' };

async function createApp(strategy: Strategy): Promise<UbeanApp> {
  const app = new UbeanApp({
    i18nConfig: { defaultLocale: 'en', locales: LOCALES, paths: PATHS, strategy },
    pages: [makePage('/', 'Root'), makePage('/about', 'About')],
    pageRenderer: { render: async () => SSR_MARKER }
  });
  await app.init();
  return app;
}

/** Deduped GET page paths (a page contributes one route per locale mount). */
function registeredGetPaths(app: UbeanApp): string[] {
  const paths = new Set<string>();
  for (const route of app.hono.routes) {
    if (route.method === 'GET' && route.path !== '/*' && route.path !== '/_health') paths.add(route.path);
  }
  return [...paths].sort();
}

describe('i18n.locales[].path — registered routes use the segment', () => {
  it('prefix_except_default registers /zh and /zh/about, never /zh-CN/*', async () => {
    const app = await createApp('prefix_except_default');
    const paths = registeredGetPaths(app);
    expect(paths).toEqual(['/', '/about', '/pt', '/pt/about', '/zh', '/zh/about']);
    expect(paths).not.toContain('/zh-CN/about');
  });

  it('prefix registers prefixed routes for every locale segment', async () => {
    const app = await createApp('prefix');
    expect(registeredGetPaths(app)).toEqual(['/en', '/en/about', '/pt', '/pt/about', '/zh', '/zh/about']);
  });
});

describe('i18n.locales[].path — request handling', () => {
  it('serves /zh/about with Content-Language and cookie set to the code', async () => {
    const app = await createApp('prefix_except_default');
    const res = await app.hono.fetch(new Request(`${ORIGIN}/zh/about`));
    expect(res.status).toBe(200);
    // The identity stays BCP-47: catalogs, `<html lang>` and cookies all key by it.
    expect(res.headers.get('content-language')).toBe('zh-CN');
    expect(res.headers.get('set-cookie')).toContain('ubean_locale=zh-CN');
    expect(await res.text()).toContain(SSR_MARKER);
  });

  it('does not resolve /zh-CN/about (the code is not a URL segment)', async () => {
    const app = await createApp('prefix_except_default');
    const res = await app.hono.fetch(new Request(`${ORIGIN}/zh-CN/about`));
    expect(res.status).toBe(404);
  });

  it('strips an explicit default-locale prefix using the segment', async () => {
    const app = await createApp('prefix_except_default');
    const res = await app.hono.fetch(new Request(`${ORIGIN}/en/about`));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/about');
  });

  it('honours a cookie holding the code when negotiating the root path', async () => {
    const app = await createApp('prefix_except_default');
    const res = await app.hono.fetch(new Request(`${ORIGIN}/`, { headers: { cookie: 'ubean_locale=zh-CN' } }));
    expect(res.status).toBe(302);
    // Redirect target is the segment, cookie value is the code.
    expect(res.headers.get('location')).toBe('/zh');
    expect(res.headers.get('set-cookie')).toContain('ubean_locale=zh-CN');
  });
});
