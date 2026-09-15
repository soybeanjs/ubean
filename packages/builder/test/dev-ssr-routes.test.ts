/**
 * dev/SSR 路由表（RM-V11）。
 *
 * 这组断言的价值不在「函数算得对」，而在**与客户端路由表同形** —— R8 就是这两张表不一致
 * 造成的（服务端漏了 404 catch-all → 未知路径只渲染出布局外壳）。因此这里刻意不写
 * 「我期望 catch-all 长这样」，而是**解析客户端 `generatePagesModuleSource` 的真实产出**再对照，
 * 让两张表的一致性成为可执行约束：客户端改了 catch-all，这里就会红。
 */
import { describe, expect, it } from 'vitest';
import { buildDevSsrRoutes, toVueRouterPagePath } from '@ubean/build/vite';
import type { ScannedLayout, ScannedPageRoute } from '@ubean/scan';
import { generatePagesModuleSource } from '@ubean/vue/vite';

function page(partial: Partial<ScannedPageRoute> & { name: string; route: string }): ScannedPageRoute {
  return {
    relativePath: `pages/${partial.name}.vue`,
    fullPath: `/abs/src/pages/${partial.name}.vue`,
    ...partial
  } as ScannedPageRoute;
}

const HOME = page({ name: 'Home', route: '/' });
const ABOUT = page({ name: 'About', route: '/about', layout: 'marketing' });
const BLOG = page({ name: 'BlogAll', route: '/blog/**:slug' });
const ALIAS = page({ name: 'AboutAlias', route: '/about-alias', isReuse: true, reuseTarget: 'About' });
const SLUG = page({ name: 'SlugPage', route: '/[...slug]' as string });
const NOT_FOUND = page({ name: 'NotFound', route: '/:pathMatch(.*)*' });

const LAYOUTS: ScannedLayout[] = [
  { name: 'default', relativePath: 'layouts/default.vue', fullPath: '/abs/src/layouts/default.vue', isDefault: true },
  { name: 'marketing', relativePath: 'layouts/marketing.vue', fullPath: '/abs/src/layouts/marketing.vue' }
] as ScannedLayout[];

const load = async (fullPath: string) => ({ default: { __file: fullPath } });

/** 从客户端虚拟模块源码里抽出 `export const routes` 里的 path/name，用于跨表对照。 */
function clientRouteEntries(source: string): Array<{ path: string; name: string }> {
  const block = source.slice(source.indexOf('export const routes = ['), source.indexOf('const _layoutLoaders'));
  return [...block.matchAll(/path:\s*("(?:[^"\\]|\\.)*"),\s*name:\s*"([^"]+)"/g)].map(m => ({
    path: JSON.parse(m[1]) as string,
    name: m[2]
  }));
}

function clientSource(notFoundPage?: ScannedPageRoute, vueParam?: string) {
  return generatePagesModuleSource(
    { pages: [HOME, ABOUT, BLOG, ALIAS, SLUG], layouts: LAYOUTS, notFoundPage } as never,
    { vueParam }
  );
}

describe('toVueRouterPagePath', () => {
  it('扫描器方言 **:slug 转成 vue-router 的 catch-all', () => {
    expect(toVueRouterPagePath('/blog/**:slug')).toBe('/blog/:slug(.*)*');
  });

  it('已是 vue-router 写法的不受影响', () => {
    expect(toVueRouterPagePath('/user/:id')).toBe('/user/:id');
    expect(toVueRouterPagePath('/')).toBe('/');
  });
});

describe('buildDevSsrRoutes', () => {
  it('页面路径与客户端路由表逐条一致（含 catch-all 页面与 reuse 路由）', () => {
    const source = clientSource(NOT_FOUND);
    const client = clientRouteEntries(source);
    const server = buildDevSsrRoutes({
      pages: [HOME, ABOUT, BLOG, ALIAS, SLUG],
      layouts: LAYOUTS,
      loadComponent: load,
      notFoundPage: NOT_FOUND
    });

    expect(server.map(r => ({ path: r.path, name: r.name }))).toEqual(client);
  });

  it('带语言前缀时同样与客户端一致', () => {
    const vueParam = ':locale(zh)?';
    const source = clientSource(NOT_FOUND, vueParam);
    const client = clientRouteEntries(source);
    const server = buildDevSsrRoutes({
      pages: [HOME, ABOUT, BLOG, ALIAS, SLUG],
      layouts: LAYOUTS,
      loadComponent: load,
      notFoundPage: NOT_FOUND,
      localeVueParam: vueParam
    });

    expect(server.map(r => ({ path: r.path, name: r.name }))).toEqual(client);
    // 语言前缀确实生效（不是被静默忽略）：首页变成可选的 `/:locale(zh)?`
    expect(server[0].path).toBe('/:locale(zh)?');
    // 其余页面同样带前缀（与客户端 `withLocaleParam` 的拼接规则一致）
    expect(server.find(r => r.name === 'About')!.path).toBe('/:locale(zh)?/about');
  });

  it('R8 回归：无 notFoundPage 时不注册 catch-all，注册时名字与路径都对', () => {
    const without = buildDevSsrRoutes({ pages: [HOME], layouts: LAYOUTS, loadComponent: load });
    expect(without.some(r => r.name === 'NotFound')).toBe(false);

    const with404 = buildDevSsrRoutes({
      pages: [HOME],
      layouts: LAYOUTS,
      loadComponent: load,
      notFoundPage: NOT_FOUND
    });
    const catchAll = with404.at(-1);
    expect(catchAll?.name).toBe('NotFound');
    expect(catchAll?.path).toBe('/:pathMatch(.*)*');
    expect(catchAll?.meta.pageName).toBe('NotFound');
  });

  it('catch-all 由 components 懒加载真正的 404 组件', async () => {
    const routes = buildDevSsrRoutes({
      pages: [HOME],
      layouts: LAYOUTS,
      loadComponent: load,
      notFoundPage: NOT_FOUND
    });
    const mod = (await routes.at(-1)!.component()) as { default: { __file: string } };
    expect(mod.default.__file).toBe(NOT_FOUND.fullPath);
  });

  it('reuse 路由加载目标页面的组件，而不是 .reuse 文件', async () => {
    const routes = buildDevSsrRoutes({ pages: [ABOUT, ALIAS], layouts: LAYOUTS, loadComponent: load });
    const alias = routes.find(r => r.name === 'AboutAlias')!;
    const mod = (await alias.component()) as { default: { __file: string } };
    expect(mod.default.__file).toBe(ABOUT.fullPath);
  });

  it('布局解析：显式布局 > 默认布局，false 表示禁用', () => {
    const routes = buildDevSsrRoutes({
      pages: [HOME, ABOUT, page({ name: 'Bare', route: '/bare', layout: false })],
      layouts: LAYOUTS,
      loadComponent: load
    });
    expect(routes.find(r => r.name === 'About')!.meta.layout).toBe('marketing');
    expect(routes.find(r => r.name === 'Home')!.meta.layout).toBe('default');
    expect(routes.find(r => r.name === 'Bare')!.meta.layout).toBe(false);
  });

  it('无默认布局时回退到 null', () => {
    const routes = buildDevSsrRoutes({
      pages: [HOME],
      layouts: [LAYOUTS[1]],
      loadComponent: load
    });
    expect(routes[0].meta.layout).toBeNull();
  });

  it('cache: true 透传到 meta（KeepAlive 需要）', () => {
    const routes = buildDevSsrRoutes({
      pages: [page({ name: 'Cached', route: '/cached', cache: true })],
      layouts: LAYOUTS,
      loadComponent: load
    });
    expect(routes[0].meta.cache).toBe(true);
  });
});
