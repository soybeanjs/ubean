/**
 * 内置 404 捕获页的运行期契约（`packages/routes/src/router.ts`）。
 *
 * 三条语义此前**零运行期覆盖**，只有静态渲染层的 `static-render.test.ts` 间接碰到：
 *
 * 1. **状态码跟 SSR 能力走** —— 服务端渲染了 404 页 = URL 确实未匹配 → 404；
 *    只发 CSR 外壳（显式 `ssr: false` / `ssr.exclude` 命中 / 无 renderer）=
 *    服务端没有渲染，无法断言「不存在」→ 200。客户端路由表是构建期产物，
 *    服务端不可能知道它有哪些路由（对齐 Nuxt `ssr: false` 的 `200.html`）。
 * 2. **`X-SSR-Mode` 必须反映实际渲染方式** —— 兜底分支此前硬编码 404 且不发
 *    这个头，于是 `ssr: false` 的项目看到 `x-ssr-mode: ssr` 配
 *    `data-ubean-ssr="false"` 的自相矛盾响应。
 * 3. **`params.pathMatch` 不带语言段** —— 捕获页在 `pages` 数组里时只注册到无前缀路径
 *    （`/:pathMatch(.*)*`），Hono 给的 `pathMatch` 含语言段
 *    （`/zh/nope-xyz` → `zh/nope-xyz`），而客户端 vue-router 算的是 `nope-xyz`。
 *    只走 `notFoundPage` 兜底（扫描结果里没有 `isGlobalCatchAll` 条目）时不会命中
 *    那条路由，`params` 本来就是空的。
 */
import { describe, it, expect } from 'vitest';
import { UbeanApp } from '../src/app';
import type { ScannedPageRoute } from '../src/app';

const ORIGIN = 'http://localhost';
const SSR_MARKER = '<div id="ssr-ran">SSR</div>';
const CSR_SHELL = 'data-ubean-ssr="false"';

function page(route: string, name: string, extra: Partial<ScannedPageRoute> = {}): ScannedPageRoute {
  return {
    fullPath: `${name}.vue`,
    relativePath: `${name}.vue`,
    dirname: '',
    basename: `${name}.vue`,
    name,
    route,
    path: route,
    pageKind: 'component',
    isMarkdown: false,
    ...extra
  };
}

/** `pages/404.vue` 的扫描结果：真实路由 + `isGlobalCatchAll` 标记。 */
const NOT_FOUND = page('/:pathMatch(.*)*', 'NotFound', { isBuiltin: true, isGlobalCatchAll: true });

const PAGES = [page('/', 'Root'), page('/about', 'About'), NOT_FOUND];

const send = (app: UbeanApp, path: string): Promise<Response> =>
  app.hono.fetch(new Request(ORIGIN + path, { headers: { accept: 'text/html' } }));

async function makeApp(options: { renderer?: { render: () => Promise<string> } | null; i18n?: boolean } = {}) {
  const app = new UbeanApp({
    pages: PAGES,
    notFoundPage: NOT_FOUND,
    pageRenderer: options.renderer === undefined ? { render: async () => SSR_MARKER } : (options.renderer as never),
    ...(options.i18n
      ? {
          i18nConfig: {
            defaultLocale: 'en',
            locales: [{ code: 'en' }, { code: 'zh-CN', path: 'zh' }],
            paths: { 'zh-CN': 'zh' },
            strategy: 'prefix_except_default'
          }
        }
      : {})
  });
  await app.init();
  return app;
}
describe('内置 404 捕获页 · 状态码跟 SSR 能力走', () => {
  it('渲染器在场：未匹配导航 404 + x-ssr-mode: ssr + 渲染了 404 页', async () => {
    const app = await makeApp();

    const res = await send(app, '/nope-xyz');
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(res.headers.get('x-ssr-mode')).toBe('ssr');
    expect(html).toContain(SSR_MARKER);
    expect(html).not.toContain(CSR_SHELL);
  });

  it('无渲染器（ssr:false）：未匹配导航 200 + x-ssr-mode: csr + CSR 外壳', async () => {
    const app = await makeApp({ renderer: null });

    const res = await send(app, '/nope-xyz');
    const html = await res.text();

    // 服务端没渲染 → 无法断言「不存在」→ 200（Nuxt `ssr: false` 的 200.html 语义）
    expect(res.status).toBe(200);
    // 兜底分支必须自报实际模式，不能硬编码 ssr
    expect(res.headers.get('x-ssr-mode')).toBe('csr');
    expect(html).toContain(CSR_SHELL);
    expect(html).not.toContain(SSR_MARKER);
  });

  it('已存在的页面不受影响：/about 恒为 200 + ssr', async () => {
    const app = await makeApp();

    const res = await send(app, '/about');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-ssr-mode')).toBe('ssr');
  });

  it('ssr.exclude 命中 → csr 且 200（与显式 ssr:false 同一状态码语义）', async () => {
    const app = new UbeanApp({
      pages: PAGES,
      notFoundPage: NOT_FOUND,
      pageRenderer: { render: async () => SSR_MARKER } as never,
      ssrExclude: ['/nope/**']
    });
    await app.init();

    const res = await send(app, '/nope/xyz');

    expect(res.headers.get('x-ssr-mode')).toBe('csr');
    expect(res.status).toBe(200);
  });

  it('未命中 exclude 的路径仍 SSR + 404（exclude 是按路径匹配，不是全局开关）', async () => {
    const app = new UbeanApp({
      pages: PAGES,
      notFoundPage: NOT_FOUND,
      pageRenderer: { render: async () => SSR_MARKER } as never,
      ssrExclude: ['/nope/**']
    });
    await app.init();

    const res = await send(app, '/other-xyz');

    expect(res.headers.get('x-ssr-mode')).toBe('ssr');
    expect(res.status).toBe(404);
  });

  it('API 与 `_` 前缀路径仍是 JSON 404，不受状态码规则影响', async () => {
    const app = await makeApp({ renderer: null });

    for (const path of ['/api/nope', '/_nope']) {
      const res = await send(app, path);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
    }
  });
});

describe('内置 404 捕获页 · params 不带语言段', () => {
  it('SSR 下 /zh/nope-xyz 的 pathMatch 是 nope-xyz，不是 zh/nope-xyz', async () => {
    const app = await makeApp({ i18n: true });

    const res = await send(app, '/zh/nope-xyz');
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('"pathMatch":"nope-xyz"');
    expect(html).not.toContain('"pathMatch":"zh/nope-xyz"');
  });

  it('无语言前缀时原样保留', async () => {
    const app = await makeApp({ i18n: true });

    const html = await (await send(app, '/nope-xyz')).text();

    expect(html).toContain('"pathMatch":"nope-xyz"');
  });

  it('多段未匹配路径整体保留（只剥语言段）', async () => {
    const app = await makeApp({ i18n: true });

    const html = await (await send(app, '/zh/a/b/c')).text();

    expect(html).toContain('"pathMatch":"a/b/c"');
  });

  it('未启用 i18n 时不做任何剥离', async () => {
    const app = await makeApp();

    const html = await (await send(app, '/zh/nope-xyz')).text();

    expect(html).toContain('"pathMatch":"zh/nope-xyz"');
  });

  it('客户端数据请求（X-UbeanPages）的 params 同样剥离', async () => {
    const app = await makeApp({ i18n: true });

    const res = await app.hono.fetch(new Request(`${ORIGIN}/zh/nope-xyz`, { headers: { 'X-UbeanPages': 'true' } }));
    const body = (await res.json()) as { params: Record<string, string> };

    expect(body.params.pathMatch).toBe('nope-xyz');
  });
});
