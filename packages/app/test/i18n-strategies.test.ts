/**
 * TS-15：i18n 四策略 HTTP 层补全。
 *
 * 依据 P1-7：此前 HTTP 层只测过 `prefix_except_default` 一条主链，`no_prefix` / `prefix` /
 * `prefix_and_default` 在**请求路径上的真实行为**（哪些路径 200、哪些 302、重定向到哪、cookie
 * 写不写）没有任何一层守着。`packages/i18n/test/**` 的单测证明的是「`compileLocalePaths()` 会产出
 * 什么」，证明不了「路由表装配 + i18n 中间件 + 请求路径」合起来对一次真实请求给出什么。
 *
 * 全部在进程内断言（无需构建）：`UbeanApp` 直接接收 `i18nConfig` + `pages` + `pageRenderer`，
 * 于是路由表装配与 i18n 中间件都能真实执行。
 *
 * 期望值**全部来自实测**（先探针后定稿），三处与直觉不同的行为也已按实测钉住并注明：
 * 1. `prefix_and_default` **从不重定向** —— 三种形态都可达，于是没有任何路径需要跳转，
 *    连 `Accept-Language: zh` 也不触发（`routing.ts:94-96` 的 `prefix_and_default` 分支只设
 *    `defaultLocale`，没有重定向逻辑）。
 * 2. `prefix_except_default` 的 locale cookie **只在根路径起作用** —— 带 `ubean_locale=zh` 请求
 *    `/` 会 302 到 `/zh`，但请求 `/about` 则直接以 `en` 渲染、不跳 `/zh/about`；而 `prefix` 策略
 *    下同样的 cookie 会跳。差别在于「无前缀路径是否是合法路由」。
 * 3. `no_prefix` 会 404 掉**所有**带语言前缀的路径（`/zh/`、`/en/about`），但 `content-language`
 *    仍会跟随 `Accept-Language` / cookie —— 也就是「无前缀路由 + 按请求选 locale」。
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
    isReuse: false,
    isMarkdown: false
  };
}

type Strategy = 'prefix_except_default' | 'prefix' | 'prefix_and_default' | 'no_prefix';

interface Probe {
  status: number;
  location: string | null;
  contentLanguage: string | null;
  localeCookie: string | null;
  rendered: boolean;
}

async function probe(strategy: Strategy, path: string, headers: Record<string, string> = {}): Promise<Probe> {
  const app = new UbeanApp({
    i18nConfig: { defaultLocale: 'en', locales: ['en', 'zh'], strategy },
    pages: [makePage('/', 'Index'), makePage('/about', 'About')],
    pageLoaders: {
      'Index.vue': async () => ({ loader: async () => ({ page: 'index' }) }),
      'About.vue': async () => ({ loader: async () => ({ page: 'about' }) })
    },
    pageRenderer: { render: async () => SSR_MARKER }
  });
  await app.init();

  const res = await app.hono.fetch(new Request(ORIGIN + path, { headers }));
  const body = await res.text();
  const cookies = (res.headers.get('set-cookie') ?? '')
    .split(',')
    .map(c => c.trim().split(';')[0])
    .filter(c => c.startsWith('ubean_locale='));

  return {
    status: res.status,
    location: res.headers.get('location'),
    contentLanguage: res.headers.get('content-language'),
    // 只取 cookie **值**（调用方写 `'en'` / `'zh'` 更好读）
    localeCookie: cookies.length > 0 ? (cookies[0].split('=')[1] ?? null) : null,
    rendered: body.includes(SSR_MARKER)
  };
}

/** 该策略下**实际注册**的无前缀化的 GET 页面路径（`app.hono.routes` 去重后的集合）。 */
async function registeredPagePaths(strategy: Strategy): Promise<string[]> {
  const app = new UbeanApp({
    i18nConfig: { defaultLocale: 'en', locales: ['en', 'zh'], strategy },
    pages: [makePage('/', 'Index'), makePage('/about', 'About')],
    pageRenderer: { render: async () => SSR_MARKER }
  });
  await app.init();
  const paths = new Set<string>();
  for (const route of app.hono.routes) {
    if (route.method === 'GET' && route.path !== '/*') paths.add(route.path);
  }
  // 不含 `/_health`（那是框架健康检查端点，与 i18n 装配无关）；按字典序返回，
  // 让期望值表与实现顺序解耦。
  return [...paths].filter(p => p !== '/_health').sort();
}

interface Expectation {
  path: string;
  headers?: Record<string, string>;
  status: number;
  /** 重定向目标；`null` 表示不该重定向 */
  location?: string | null;
  contentLanguage?: string;
  /** `ubean_locale` cookie 的值（`null` = 不应写 cookie） */
  localeCookie?: string;
  rendered?: boolean;
}

const STRATEGIES: Array<{ strategy: Strategy; routes: string[]; cases: Expectation[] }> = [
  {
    strategy: 'prefix_except_default',
    // 默认语言不带前缀；非默认语言带前缀 → 注册 `/`、`/about`、`/zh`、`/zh/about`
    routes: ['/', '/about', '/zh', '/zh/about'],
    cases: [
      { path: '/', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/about', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/zh/', status: 200, contentLanguage: 'zh', localeCookie: 'zh', rendered: true },
      { path: '/zh/about', status: 200, contentLanguage: 'zh', localeCookie: 'zh', rendered: true },
      // 默认语言的显式前缀必须被剥掉（`routing.ts:80-83`）
      { path: '/en/', status: 302, location: '/', localeCookie: 'en' },
      { path: '/en/about', status: 302, location: '/about', localeCookie: 'en' },
      // 根路径上的语言协商：Accept-Language 与 cookie 都会把 `/` 跳到 `/zh`
      { path: '/', headers: { 'accept-language': 'zh-CN,zh;q=0.9' }, status: 302, location: '/zh', localeCookie: 'zh' },
      { path: '/', headers: { cookie: 'ubean_locale=zh' }, status: 302, location: '/zh', localeCookie: 'zh' },
      // 实测差异：非根路径**不**做 cookie 协商 —— `/about` 直接以默认语言渲染
      { path: '/about', headers: { cookie: 'ubean_locale=zh' }, status: 200, contentLanguage: 'en', rendered: true }
    ]
  },
  {
    strategy: 'prefix',
    // 所有语言都带前缀，不存在无前缀路径
    routes: ['/en', '/en/about', '/zh', '/zh/about'],
    cases: [
      { path: '/en/', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/zh/', status: 200, contentLanguage: 'zh', localeCookie: 'zh', rendered: true },
      { path: '/en/about', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/zh/about', status: 200, contentLanguage: 'zh', localeCookie: 'zh', rendered: true },
      // 无前缀路径全部补上默认语言前缀（`routing.ts:86-93`），且**非根路径也协商**
      { path: '/', status: 302, location: '/en', localeCookie: 'en' },
      { path: '/about', status: 302, location: '/en/about', localeCookie: 'en' },
      { path: '/', headers: { 'accept-language': 'zh-CN,zh;q=0.9' }, status: 302, location: '/zh', localeCookie: 'zh' },
      {
        path: '/about',
        headers: { cookie: 'ubean_locale=zh' },
        status: 302,
        location: '/zh/about',
        localeCookie: 'zh'
      }
    ]
  },
  {
    strategy: 'prefix_and_default',
    // 默认语言两种形态都注册 → 没有任何路径需要跳转
    routes: ['/', '/about', '/en', '/en/about', '/zh', '/zh/about'],
    cases: [
      { path: '/', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/en/', status: 200, contentLanguage: 'en', localeCookie: 'en', rendered: true },
      { path: '/zh/', status: 200, contentLanguage: 'zh', localeCookie: 'zh', rendered: true },
      { path: '/en/about', status: 200, contentLanguage: 'en', rendered: true },
      { path: '/zh/about', status: 200, contentLanguage: 'zh', rendered: true },
      // 实测差异：**从不重定向** —— 三种形态都可达，语言协商只剩 `content-language` 之外的
      // `routing` payload，HTTP 层没有跳转可言（`routing.ts:94-96` 该分支没有重定向逻辑）
      {
        path: '/',
        headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
        status: 200,
        contentLanguage: 'en',
        rendered: true
      },
      { path: '/about', headers: { cookie: 'ubean_locale=zh' }, status: 200, contentLanguage: 'en', rendered: true }
    ]
  },
  {
    strategy: 'no_prefix',
    // 只有无前缀路径；带前缀的一律 404
    routes: ['/', '/about'],
    cases: [
      { path: '/', status: 200, contentLanguage: 'en', rendered: true },
      { path: '/about', status: 200, contentLanguage: 'en', rendered: true },
      // 路由表里根本没有带前缀的路径
      { path: '/zh/', status: 404 },
      { path: '/en/', status: 404 },
      { path: '/en/about', status: 404 },
      // locale 协商仍然生效，只是体现在**内容语言**而不是路径上
      {
        path: '/',
        headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
        status: 200,
        contentLanguage: 'zh',
        rendered: true
      },
      { path: '/about', headers: { cookie: 'ubean_locale=zh' }, status: 200, contentLanguage: 'zh', rendered: true }
    ]
  }
];

describe.each(STRATEGIES)('TS-15 · i18n 策略 $strategy', ({ strategy, routes, cases }) => {
  it('路由表按策略装配（带前缀的路径恰好是这一组）', async () => {
    expect(await registeredPagePaths(strategy)).toEqual(routes);
  });

  it('各请求路径的状态码 / 重定向 / content-language / locale cookie / SSR 渲染', async () => {
    for (const c of cases) {
      const got = await probe(strategy, c.path, c.headers);
      const label = `${strategy} GET ${c.path}${c.headers ? ` ${JSON.stringify(c.headers)}` : ''}`;

      expect(got.status, `${label} 状态码`).toBe(c.status);
      if (c.location !== undefined) expect(got.location, `${label} Location`).toBe(c.location);
      if (c.contentLanguage !== undefined) {
        expect(got.contentLanguage, `${label} content-language`).toBe(c.contentLanguage);
      }
      if (c.localeCookie !== undefined) expect(got.localeCookie, `${label} ubean_locale cookie`).toBe(c.localeCookie);
      if (c.rendered !== undefined) expect(got.rendered, `${label} SSR 是否渲染`).toBe(c.rendered);
    }
  });
});
