/**
 * `definePage({ alias })` 的服务端语义。
 *
 * 别名在客户端路由表里是 vue-router 自建的真实路由记录，服务端必须同样注册 ——
 * 否则直链 / 刷新到别名落到 404，只有软导航能用。这里锁三件事：
 * 1. 别名路径走**同一条页面管道**（不是 404，也不是只有 HTML 壳）。
 * 2. 别名与主路径共享同名参数（vue-router 硬约束），参数能正常解析。
 * 3. i18n 下别名也按语言前缀展开（`/zh/u/1` 与 `/u/1` 都可访问）。
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

async function appWith(pages: ScannedPageRoute[], i18nConfig?: RegisterOptions['i18nConfig']) {
  const app = new Hono();
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
    { pages, layouts: [], middleware: [], middlewareLoaders: {}, i18nConfig } as RegisterOptions
  );
  return app;
}

/** `redirect` 是页面管道里最先短路的分支 —— 用它证明别名确实进了管道。 */
const pages = [
  page({ name: 'Old', route: '/old', redirect: '/new', alias: ['/legacy', '/v1/old'] }),
  page({ name: 'User', route: '/user/:id', redirect: '/profile/:id', alias: '/u/:id' }),
  page({ name: 'New', route: '/new' })
];

describe('definePage({ alias }) — 服务端', () => {
  it('别名路径走同一条页面管道（不是 404）', async () => {
    const app = await appWith(pages);

    const legacy = await app.request('/legacy');
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get('location')).toBe('/new');

    const versioned = await app.request('/v1/old');
    expect(versioned.status).toBe(302);
    expect(versioned.headers.get('location')).toBe('/new');
  });

  it('别名共享同名参数，动态段与主路径行为一致', async () => {
    const app = await appWith(pages);
    // 字符串 redirect 不插值参数（vue-router 语义），所以两侧都是字面目标 —— 重点
    // 是别名与主路径**走同一条管道**，而不是别名被当成别的路由。
    const main = await app.request('/user/42');
    const alias = await app.request('/u/42');
    expect(alias.status).toBe(main.status);
    expect(alias.headers.get('location')).toBe(main.headers.get('location'));
  });

  it('未注册的路径仍是 404（别名没有把 catch-all 撑开）', async () => {
    const app = await appWith(pages);
    expect((await app.request('/nope')).status).toBe(404);
    expect((await app.request('/u/42/extra')).status).toBe(404);
  });

  it('i18n prefix_except_default：别名按语言前缀展开', async () => {
    const app = await appWith(pages, {
      strategy: 'prefix_except_default',
      defaultLocale: 'en',
      locales: ['en', 'zh-CN'],
      paths: { 'zh-CN': 'zh' }
    });

    // 默认语言：主路径与别名都不带前缀
    expect((await app.request('/old')).headers.get('location')).toBe('/new');
    expect((await app.request('/legacy')).headers.get('location')).toBe('/new');
    expect((await app.request('/u/42')).headers.get('location')).toBe('/profile/:id');

    // 非默认语言：主路径与别名都带前缀
    expect((await app.request('/zh/old')).headers.get('location')).toBe('/zh/new');
    expect((await app.request('/zh/legacy')).headers.get('location')).toBe('/zh/new');
    // 别名与主路径同形（redirect 目标语言前缀由请求语言决定）
    const mainZh = await app.request('/zh/user/42');
    const aliasZh = await app.request('/zh/u/42');
    expect(aliasZh.status).toBe(mainZh.status);
    expect(aliasZh.headers.get('location')).toBe(mainZh.headers.get('location'));
  });
});
