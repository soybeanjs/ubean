/**
 * `definePage({ props })` 的服务端语义。
 *
 * vue-router 在客户端把 `props: true` / 静态对象当作组件 props 传进去。服务端渲染走的是
 * `pageObj.props`（渲染器 `h(PageComp, pageObj.props)`），**完全不经过 vue-router**，
 * 所以服务端必须自己播同一份 —— 否则首屏无 props、水合后才有值：`props: true` 的详情页
 * 先渲空态，静态 props 的复用页（`/docs/a` 内嵌 iframe）首屏是空 iframe。
 *
 * 这里锁两件事：
 * 1. 静态 props 原样出现在 `pageObj.props` 里。
 * 2. `props: true` 取的是路由参数；loader 返回值覆盖同名静态 prop。
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

/** 捕获 `pageObj` 的渲染器替身：只记录，不真渲染。 */
async function appWith(pages: ScannedPageRoute[], pageLoaders: RegisterOptions['pageLoaders'] = {}) {
  const captured: Record<string, unknown>[] = [];
  const app = new Hono();
  await registerPageRoutes(
    app as never,
    {
      pages,
      layouts: [],
      middleware: [],
      middlewareLoaders: {},
      pageLoaders,
      pageRenderer: ({
        render: async (pageObj: Record<string, unknown>) => {
          captured.push(pageObj);
          return { html: '<html></html>', state: {} };
        }
      }) as never
    } as RegisterOptions
  );
  return { app, captured };
}

describe('definePage({ props }) — 服务端', () => {
  it('静态 props 进 pageObj（复用页内嵌 iframe 的首屏不能是空 src）', async () => {
    const { app, captured } = await appWith([
      page({ name: 'DocsA', route: '/docs/a', props: { url: 'https://example.com/' } })
    ]);

    const res = await app.request('/docs/a');
    expect(res.status).toBe(200);
    expect(captured[0].props).toEqual({ url: 'https://example.com/' });
  });

  it('props: true 取路由参数', async () => {
    const { app, captured } = await appWith([page({ name: 'User', route: '/user/:id', props: true })]);

    await app.request('/user/42');
    expect(captured[0].props).toEqual({ id: '42' });
  });

  it('loader 结果覆盖同名静态 prop，未冲突的静态 prop 保留', async () => {
    const { app, captured } = await appWith(
      [page({ name: 'Mixed', route: '/mixed', props: { from: 'declared', keep: 'yes' } })],
      {
        '/mixed.vue': async () =>
          ({ loader: async () => ({ from: 'loader' }) }) as unknown as { default?: unknown }
      } as RegisterOptions['pageLoaders']
    );

    await app.request('/mixed');
    expect(captured[0].props).toEqual({ from: 'loader', keep: 'yes' });
  });
});
