/**
 * 宿主 dev app 装配（RM-V11）。
 *
 * 用假 app + 假 `loadModule` 钉住接线契约：哪些 options 字段被写入、加载器指向哪个文件、
 * 渲染器拿到什么路由表、backend 模式与 cron 的分支。真链路的验证在
 * `packages/cli/test/dev-topology.test.ts`（子进程真 dev server + 纯 HTTP）。
 */
import { describe, expect, it, vi } from 'vitest';
import { enhanceDevApp } from '@ubean/build/vite';
import type { DevHostAppLike } from '@ubean/build/vite';
import type { ScannedLayout, ScannedPageRoute } from '@ubean/scan';

function page(partial: Partial<ScannedPageRoute> & { name: string }): ScannedPageRoute {
  return {
    route: `/${partial.name.toLowerCase()}`,
    relativePath: `pages/${partial.name}.vue`,
    fullPath: `/abs/src/pages/${partial.name}.vue`,
    ...partial
  } as ScannedPageRoute;
}

const ABOUT = page({ name: 'About' });
const ALIAS = page({ name: 'AboutAlias', route: '/about-alias', isReuse: true, reuseTarget: 'About' });
const NOT_FOUND = page({ name: 'NotFound', route: '/:pathMatch(.*)*' });

const LAYOUTS: ScannedLayout[] = [
  { name: 'default', relativePath: 'layouts/default.vue', fullPath: '/abs/src/layouts/default.vue', isDefault: true }
] as ScannedLayout[];

function fakeApp(overrides: Partial<DevHostAppLike['options']> = {}) {
  const resetInit = vi.fn();
  const app: DevHostAppLike = {
    options: {
      layouts: undefined,
      routes: [{ relativePath: 'routes/api/hello.ts', fullPath: '/abs/src/routes/api/hello.ts' }],
      // 与扫描器一致：`notFoundPage` 从 `pages` 中剔除，单独传给路由表
      pages: [ABOUT, ALIAS],
      middleware: [{ relativePath: 'middleware/auth.ts', fullPath: '/abs/src/middleware/auth.ts' }],
      crons: [],
      notFoundPage: NOT_FOUND,
      ...overrides
    },
    resetInit
  };
  return { app, resetInit };
}

/** 记录每个被请求的模块 id，并返回一个最小模块对象。 */
function fakeLoader(modules: Record<string, unknown> = {}) {
  const requested: string[] = [];
  const loadModule = async (id: string) => {
    requested.push(id);
    if (id in modules) return modules[id];
    return { default: { __file: id } };
  };
  return { requested, loadModule };
}

const rendererStub = () => ({ render: async () => '', renderToStream: () => new ReadableStream() });

describe('enhanceDevApp', () => {
  it('写入 layouts，并为 routes / pages / middleware 建立经 Vite SSR 图的加载器', async () => {
    const { app } = fakeApp();
    const { loadModule, requested } = fakeLoader();

    enhanceDevApp({ app, layouts: LAYOUTS, loadModule, createRenderer: rendererStub as never });

    expect(app.options.layouts).toBe(LAYOUTS);
    expect(Object.keys(app.options.routeLoaders!)).toEqual(['routes/api/hello.ts']);
    expect(Object.keys(app.options.pageLoaders!).sort()).toEqual(['pages/About.vue', 'pages/AboutAlias.vue']);
    expect(Object.keys(app.options.middlewareLoaders!)).toEqual(['middleware/auth.ts']);

    await app.options.pageLoaders!['pages/About.vue']();
    expect(requested).toContain(ABOUT.fullPath);
  });

  it('reuse 路由的加载器指向目标页面（.reuse 文件没有组件）', async () => {
    const { app } = fakeApp();
    const { loadModule, requested } = fakeLoader();

    enhanceDevApp({ app, layouts: LAYOUTS, loadModule, createRenderer: rendererStub as never });

    await app.options.pageLoaders!['pages/AboutAlias.vue']();

    // 页面表按 relativePath 建键，加载时走目标页面的 fullPath
    expect(requested).toEqual([ABOUT.fullPath]);
    expect(ALIAS.fullPath).not.toBe(ABOUT.fullPath);
  });

  it('渲染器拿到含 404 catch-all 的路由表，并能解析布局与 defineApp 配置', async () => {
    const { app } = fakeApp();
    const { loadModule } = fakeLoader({ 'virtual:ubean-app': { resolveAppConfig: (mode: string) => ({ mode }) } });
    let received: Parameters<NonNullable<Parameters<typeof enhanceDevApp>[0]['createRenderer']>>[0] | undefined;

    enhanceDevApp({
      app,
      layouts: LAYOUTS,
      loadModule,
      createRenderer: (options => {
        received = options;
        return rendererStub();
      }) as never
    });

    expect(app.options.pageRenderer).toBeTruthy();
    expect(received!.routes.map(r => r.name)).toEqual(['About', 'AboutAlias', 'NotFound']);
    expect(received!.defaultLayout).toBe('default');
    expect(await received!.resolveLayoutComponent('default')).toMatchObject({ __file: LAYOUTS[0].fullPath });
    expect(await received!.resolveLayoutComponent(false)).toBeNull();
    expect(await received!.resolveLayoutComponent('nope')).toBeNull();
    expect(await received!.resolveAppConfig()).toEqual({ mode: 'server' });
  });

  it('backend 模式重置 init 且不创建渲染器', () => {
    const { app, resetInit } = fakeApp();
    const { loadModule } = fakeLoader();
    const createRenderer = vi.fn(rendererStub);

    enhanceDevApp({ app, layouts: LAYOUTS, loadModule, backend: true, createRenderer: createRenderer as never });

    expect(resetInit).toHaveBeenCalledTimes(1);
    expect(createRenderer).not.toHaveBeenCalled();
    expect(app.options.pageRenderer).toBeUndefined();
  });

  it('crons：先加载全部 cron 文件，再启动调度器', async () => {
    const { app } = fakeApp({ crons: [{ fullPath: '/abs/src/crons/a.ts' }, { fullPath: '/abs/src/crons/b.ts' }] });
    const { loadModule, requested } = fakeLoader();
    const startCronScheduler = vi.fn();

    enhanceDevApp({ app, layouts: LAYOUTS, loadModule, startCronScheduler, createRenderer: rendererStub as never });
    await vi.waitFor(() => expect(startCronScheduler).toHaveBeenCalledTimes(1));

    expect(requested).toContain('/abs/src/crons/a.ts');
    expect(requested).toContain('/abs/src/crons/b.ts');
  });

  it('cron 文件加载失败走 onCronError，不抛到调用方', async () => {
    const { app } = fakeApp({ crons: [{ fullPath: '/abs/src/crons/broken.ts' }] });
    const onCronError = vi.fn();
    const startCronScheduler = vi.fn();

    enhanceDevApp({
      app,
      layouts: LAYOUTS,
      loadModule: async () => {
        throw new Error('cron boom');
      },
      startCronScheduler,
      onCronError,
      createRenderer: rendererStub as never
    });
    await vi.waitFor(() => expect(onCronError).toHaveBeenCalledTimes(1));

    expect(String(onCronError.mock.calls[0][0])).toContain('cron boom');
    expect(startCronScheduler).not.toHaveBeenCalled();
  });
});
