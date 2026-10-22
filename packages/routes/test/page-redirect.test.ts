/**
 * `definePage({ redirect })` 的服务端语义。
 *
 * 取代旧的路由配置 `routing.rootRedirect`（该字段已删除，连同
 * `generateBuiltinRoutes` / `notFoundRouteComponent` 等死字段一起）。
 * `src/pages/index.vue` 就是根路由，重定向写在页面里。
 *
 * 这里锁两件事：
 * 1. GET 命中带 `redirect` 的页面返回 **302** 且 `Location` 正确 —— 不是渲染源页面的
 *    HTML（那样服务端渲源页、客户端跳目标，水合直接对不上）。
 * 2. 目标按请求语言补前缀。`redirect` 目标由页面作者写成**不带前缀**的路径
 *    （vue-router 的字符串重定向不插值参数，写成 `/:locale(zh)?/home` 会变成字面路径）。
 */
import { describe, it, expect } from 'vitest';
import type { ScannedPageRoute } from '@ubean/scan';
import { Hono } from 'hono';
import { registerPageRoutes } from '../src/router';
import type { RegisterOptions } from '../src/router';

const page = (over: Partial<ScannedPageRoute> & { name: string; route: string }): ScannedPageRoute =>
  ({
    fullPath: `/pages${over.route === '/' ? '/index' : over.route}.vue`,
    path: over.route,
    relativePath: `${over.route}.vue`,
    dirname: '/pages',
    basename: 'index.vue',
    pageKind: 'component',
    isMarkdown: false,
    routable: true,
    ...over
  }) as ScannedPageRoute;

/** 建一个只挂页面路由的 Hono app（不装 pages 渲染器 —— redirect 在渲染之前返回）。 */
async function appWith(pages: ScannedPageRoute[], i18nConfig?: RegisterOptions['i18nConfig']) {
  const app = new Hono();
  // 真实的 locale 由 `createI18nMiddleware` 写入 `c.set('locale', …)`；这里只把这一步
  // 最简化地补上（从 URL 首段取），否则 redirect 目标永远拿到空 locale。
  if (i18nConfig?.locales?.length) {
    app.use('*', async (c, next) => {
      const segment = c.req.path.split('/')[1];
      const hit = i18nConfig.locales.find(code => (i18nConfig.paths?.[code] ?? code) === segment || code === segment);
      c.set('locale', hit ?? i18nConfig.defaultLocale);
      await next();
    });
  }
  await registerPageRoutes(
    app as never,
    {
      pages,
      layouts: [],
      middleware: [],
      middlewareLoaders: {},
      i18nConfig
    } as RegisterOptions
  );
  return app;
}

const pages = [
  page({ name: 'Home', route: '/', redirect: '/home' }),
  page({ name: 'HomeReal', route: '/home' }),
  page({ name: 'About', route: '/about', redirect: '/contact' }),
  page({ name: 'Contact', route: '/contact' })
];

describe('definePage({ redirect }) — 服务端', () => {
  it('无 i18n 时返回 302 与裸目标路径', async () => {
    const app = await appWith(pages);

    const root = await app.request('/');
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/home');

    const about = await app.request('/about');
    expect(about.status).toBe(302);
    expect(about.headers.get('location')).toBe('/contact');
  });

  it('没有 redirect 的页面不受影响（不进 302 分支）', async () => {
    const app = await appWith(pages);
    const res = await app.request('/contact');
    // 无渲染器 → 落到页面 handler 之后；只要不是 302 就说明没被 redirect 截获
    expect(res.status).not.toBe(302);
  });

  it('prefix_except_default：非默认语言带前缀，默认语言不带', async () => {
    const app = await appWith(pages, {
      strategy: 'prefix_except_default',
      defaultLocale: 'en',
      locales: ['en', 'zh-CN'],
      paths: { 'zh-CN': 'zh' }
    });

    expect((await app.request('/')).headers.get('location')).toBe('/home');
    expect((await app.request('/zh')).headers.get('location')).toBe('/zh/home');
    expect((await app.request('/zh/about')).headers.get('location')).toBe('/zh/contact');
  });

  it('prefix：默认语言也带前缀（localizePath 的既有语义）', async () => {
    const app = await appWith(pages, {
      strategy: 'prefix',
      defaultLocale: 'en',
      locales: ['en', 'zh-CN'],
      paths: { 'zh-CN': 'zh' }
    });

    expect((await app.request('/en')).headers.get('location')).toBe('/en/home');
    expect((await app.request('/zh')).headers.get('location')).toBe('/zh/home');
  });
});
