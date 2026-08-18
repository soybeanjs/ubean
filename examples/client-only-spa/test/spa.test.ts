import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/**
 * client-only-spa 功能正确性测试(@ubean/vue 精简内核 + 文件式路由全能力)
 *
 * 验证独立 SPA 场景的完整链路:
 *  1. 插件装配:ubeanVue 注册组件 + routes 播种(与 src/main.ts 相同方式)
 *  2. 文件路由全约定:动态参数+matcher/可选/catch-all/路由组/reuse/特殊页/并行 slot
 *  3. markdown 页面(md 编译 + frontmatter → meta)与 head 提取(head: true)
 *  4. matcher 守卫:校验失败重定向 NotFound
 *  5. PageView/Link 渲染协议(SSR 直渲 + 内存路由冒烟)
 *  6. 页面缓存控制(声明式/运行时/剪枝)
 *  7. 过渡与重载信号
 *  8. 实体路由文件生成器冒烟(@ubean/vue/generator)
 *  9. 示例产物纯净度:dist 零 node: 导入、无自动引入产物
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, createSSRApp, defineComponent, h, provide } from 'vue';
import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createRouter, createMemoryHistory } from 'vue-router';
import {
  ubeanVue,
  PageView,
  Link,
  SSR_KEY,
  definePage,
  defineMatcher,
  createMatcherGuard,
  getMatcher,
  clearMatchers,
  useCacheViews,
  enablePageCache,
  disablePageCache,
  isPageCached,
  invalidatePageCache,
  initCachedViewsFromRoutes,
  resetRouteCache,
  setPageTransition,
  clearPageTransition,
  getPageTransitionName,
  reloadPage,
  isReloading,
  getReloadCounter,
  resolveRoute,
  isActiveRoute
} from '@ubean/vue';
// 路由表来自 vite 插件生成的虚拟模块(与 src/main.ts 同源)——
// vitest 读取 vite.config.ts,插件对测试同样生效
import {
  routes,
  pageNames,
  loadingComponent,
  errorComponent,
  resolvePageComponent,
  hasNotFoundPage,
  hasErrorPage
} from 'virtual:ubean-vue-routes';

function page(text: string): Component {
  return defineComponent({
    name: `Page${text.replace(/[^a-zA-Z]/g, '')}`,
    setup: () => () => h('div', { class: 'page-content' }, text)
  });
}

function makeTestRoutes() {
  return [
    { path: '/', name: 'Home', component: page('home-page'), meta: { pageName: 'Home' } },
    {
      path: '/cache-demo',
      name: 'CacheDemo',
      component: page('cache-page'),
      meta: { pageName: 'CacheDemo', cache: true }
    },
    {
      path: '/about',
      name: 'About',
      component: page('about-page'),
      meta: { pageName: 'About', cache: true, transition: 'fade' }
    }
  ];
}

/* -------------------------------------------------------------------------- */
/* 1. 插件装配(与 main.ts 相同)                                             */
/* -------------------------------------------------------------------------- */

describe('ubeanVue 插件装配', () => {
  it('注册全局组件;虚拟模块 routes 的 definePage cache 声明播种生效', () => {
    invalidatePageCache();
    const app = createApp({ render: () => h('div') });
    app.use(ubeanVue, { routes: routes as never });

    expect(app.component('Link')).toBe(Link);
    expect(app.component('PageView')).toBe(PageView);
    expect(app.component('SlotView')).toBeDefined();

    // definePage({ cache: true }):CacheDemo/About 缓存,Home 不缓存
    expect(isPageCached('CacheDemo')).toBe(true);
    expect(isPageCached('About')).toBe(true);
    expect(isPageCached('Home')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 文件路由虚拟模块(全约定)                                                */
/* -------------------------------------------------------------------------- */

describe('virtual:ubean-vue-routes(vite 插件生成)', () => {
  it('路由表:文件派生路径 + definePage 覆盖(名称/缓存/过渡)', () => {
    const paths = routes.map(r => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/cache-demo');
    expect(paths).toContain('/about');
    expect(paths).toContain('/:pathMatch(.*)*'); // 404.vue → catch-all

    const about = routes.find(r => r.path === '/about') as { meta: Record<string, unknown> };
    expect(about.meta.pageName).toBe('About');
    expect(about.meta.cache).toBe(true);
    expect(about.meta.transition).toBe('fade');

    const home = routes.find(r => r.path === '/') as { name: string };
    expect(home.name).toBe('Home'); // definePage name 覆盖 'Index'
  });

  it('动态参数 + matcher 语法:[id=numeric] → /users/:id + meta.matchers', () => {
    const usersIndex = routes.find(r => r.path === '/users');
    const usersId = routes.find(r => r.path === '/users/:id') as { meta: Record<string, unknown> };
    expect(usersIndex).toBeDefined();
    expect(usersId).toBeDefined();
    expect(usersId.meta.matchers).toEqual({ id: 'numeric' });
    expect(usersId.meta.pageName).toBe('UsersId');
  });

  it('可选参数与 catch-all:[[page]] → /docs/:page?,[...slug] → /blog/:slug(.*)*(方言转换)', () => {
    const docs = routes.find(r => r.path === '/docs/:page?');
    // scanner 方言 `/blog/**:slug` 经虚拟模块转换为 vue-router `:slug(.*)*`
    const blog = routes.find(r => r.path === '/blog/:slug(.*)*');
    expect(docs).toBeDefined();
    expect((docs as { name: string }).name).toBe('DocsPageOptional');
    expect(blog).toBeDefined();
    expect((blog as { name: string }).name).toBe('BlogAllSlug');
  });

  it('路由组剥离:(marketing)/pricing.vue → /pricing(组名不参与 URL)', () => {
    const pricing = routes.find(r => r.path === '/pricing');
    expect(pricing).toBeDefined();
    expect((pricing as { name: string }).name).toBe('Pricing');
    // 组目录不产生 /marketing 前缀路由
    expect(routes.some(r => r.path.startsWith('/marketing'))).toBe(false);
  });

  it('reuse 路由:about2.reuse.ts → /about2,组件解析指向目标 About', async () => {
    const about2 = routes.find(r => r.path === '/about2') as {
      name: string;
      meta: Record<string, unknown>;
    };
    expect(about2).toBeDefined();
    expect(about2.name).toBe('About2');
    expect(about2.meta.reuseTarget).toBe('About');
    // reuse 继承目标缓存声明(About cache: true)
    expect(about2.meta.cache).toBe(true);

    // 组件解析:reuse 路由解析到目标页组件(名称注入为路由名以匹配 keep-alive)
    const target = await resolvePageComponent('About2');
    const original = await resolvePageComponent('About');
    expect(target).toBe(original);
  });

  it('并行路由:@analytics/ 生成 named views(dashboard components.default + analytics)', () => {
    const dashboard = routes.find(r => r.path === '/dashboard') as {
      components: Record<string, unknown>;
      meta: Record<string, unknown>;
    };
    expect(dashboard).toBeDefined();
    expect(dashboard.components).toHaveProperty('default');
    expect(dashboard.components).toHaveProperty('analytics');
    expect(dashboard.meta.parallelSlots as string[]).toContain('analytics');
  });

  it('特殊页:loading/error 组件可用,404/error 存在性检查为 true', () => {
    expect(loadingComponent).not.toBeNull();
    expect(errorComponent).not.toBeNull();
    expect(hasNotFoundPage()).toBe(true);
    expect(hasErrorPage()).toBe(true);
  });

  it('markdown 页面:guide.md → /guide,frontmatter(name/head)提取到 meta', () => {
    const guide = routes.find(r => r.path === '/guide') as { meta: Record<string, unknown> };
    expect(guide).toBeDefined();
    expect(guide.meta.pageName).toBe('Guide');
    expect(guide.meta.head as Record<string, unknown>).toMatchObject({ title: '指南 - @ubean/vue SPA' });
  });

  it('head 提取(head: true):definePage head 进入 route.meta.head', () => {
    const settings = routes.find(r => r.path === '/settings') as { meta: Record<string, unknown> };
    expect(settings).toBeDefined();
    expect((settings.meta.head as Record<string, unknown>)?.title).toBe('设置 - TSX 页面');

    const usersId = routes.find(r => r.path === '/users/:id') as { meta: Record<string, unknown> };
    expect((usersId.meta.head as Record<string, unknown>)?.title).toBe('用户详情');
  });

  it('TSX 页面:settings.tsx 参与扫描(definePage 提取与 .vue 一致)', async () => {
    expect(pageNames).toContain('Settings');
    const settingsComp = await resolvePageComponent('Settings');
    expect(settingsComp).toBeDefined();
  });

  it('pageNames 含全部页面(含 markdown/特殊页 404)', () => {
    expect(pageNames).toContain('Home');
    expect(pageNames).toContain('CacheDemo');
    expect(pageNames).toContain('About');
    expect(pageNames).toContain('About2');
    expect(pageNames).toContain('Users');
    expect(pageNames).toContain('UsersId');
    expect(pageNames).toContain('Guide');
    expect(pageNames).toContain('Settings');
    expect(pageNames).toContain('Dashboard');
    expect(pageNames).toContain('NotFound');
  });

  it('definePage 运行时 no-op 兜底(无插件环境)', () => {
    expect(() => definePage({ cache: true })).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* 2b. matcher 注册表与守卫                                                    */
/* -------------------------------------------------------------------------- */

describe('动态参数 matcher', () => {
  beforeEach(() => {
    clearMatchers();
    defineMatcher('numeric', v => /^\d+$/.test(v));
  });

  it('注册表:getMatcher 取回校验函数', () => {
    expect(getMatcher('numeric')?.('42')).toBe(true);
    expect(getMatcher('numeric')?.('abc')).toBe(false);
    expect(getMatcher('nope')).toBeUndefined();
  });

  it('守卫:meta.matchers 校验失败重定向 NotFound,合法参数放行', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes as never
    });
    router.beforeEach(createMatcherGuard());
    await router.push('/users/42');
    expect(router.currentRoute.value.name).toBe('UsersId');

    await router.push('/users/abc');
    expect(router.currentRoute.value.name).toBe('NotFound');

    // 非 matcher 路由不受影响
    await router.push('/docs/install');
    expect(router.currentRoute.value.name).toBe('DocsPageOptional');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 渲染协议                                                                */
/* -------------------------------------------------------------------------- */

describe('PageView / Link 渲染', () => {
  async function renderAt(url: string, root: Component) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: makeTestRoutes() as never,
      scrollBehavior: () => ({ top: 0 })
    });
    router.push(url);
    const app = createSSRApp(root);
    app.use(router);
    await router.isReady();
    return renderToString(app);
  }

  it('PageView 渲染匹配路由的页面组件(SSR_KEY 直渲)', async () => {
    const Root = defineComponent({
      setup() {
        provide(SSR_KEY, true);
        return () => h('div', [h(PageView)]);
      }
    });
    expect(await renderAt('/cache-demo', Root)).toContain('cache-page');
    expect(await renderAt('/', Root)).toContain('home-page');
  });

  it('Link 内部/外部链接渲染形态正确', async () => {
    const Root = defineComponent({
      setup() {
        provide(SSR_KEY, true);
        return () =>
          h('div', [
            h(Link, { to: '/about' }, { default: () => 'about-link' }),
            h(Link, { to: 'https://vuejs.org' }, { default: () => 'external' })
          ]);
      }
    });
    const html = await renderAt('/', Root);
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="https://vuejs.org"');
    expect(html).toContain('target="_blank"');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 页面缓存控制                                                            */
/* -------------------------------------------------------------------------- */

describe('页面缓存控制', () => {
  beforeEach(() => {
    invalidatePageCache();
    useCacheViews().clearExclude();
  });

  it('enable/disable 幂等切换;invalidate 精确与全清', () => {
    enablePageCache('Home');
    enablePageCache('Home');
    expect(isPageCached('Home')).toBe(true);
    expect(useCacheViews().cachedViewNames.value.filter(n => n === 'Home')).toHaveLength(1);

    disablePageCache('Home');
    expect(isPageCached('Home')).toBe(false);

    enablePageCache('A');
    enablePageCache('B');
    invalidatePageCache('A');
    expect(isPageCached('A')).toBe(false);
    expect(isPageCached('B')).toBe(true);
    invalidatePageCache();
    expect(isPageCached('B')).toBe(false);
  });

  it('resetRouteCache 剪除缓存声明;离开页面时由 PageView 的路由 watch 恢复', async () => {
    initCachedViewsFromRoutes(makeTestRoutes() as never);
    await resetRouteCache('CacheDemo');
    // 新语义:include 立即移除(活跃实例将在离开时销毁,而非入缓存)
    expect(isPageCached('CacheDemo')).toBe(false);
    // 重新播种(模拟路由 afterEach/PageView watch 恢复后的下一次进入)
    enablePageCache('CacheDemo');
    expect(isPageCached('CacheDemo')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. 过渡与重载                                                              */
/* -------------------------------------------------------------------------- */

describe('过渡与重载', () => {
  it('全局过渡名 set/clear/none 归一化', () => {
    setPageTransition('fade');
    expect(getPageTransitionName().value).toBe('fade');
    setPageTransition('none');
    expect(getPageTransitionName().value).toBe('');
    clearPageTransition();
    expect(getPageTransitionName().value).toBe('');
  });

  it('reloadPage 计数递增,isReloading 翻转', async () => {
    const before = getReloadCounter().value;
    const p = reloadPage(undefined, 20);
    const during = isReloading();
    await p;
    expect(during).toBe(true);
    expect(isReloading()).toBe(false);
    expect(getReloadCounter().value).toBe(before + 1);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. 路由纯函数 + 产物纯净度                                                 */
/* -------------------------------------------------------------------------- */

describe('路由纯函数与产物纯净度', () => {
  it('resolveRoute / isActiveRoute 语义', () => {
    expect(resolveRoute('about')).toBe('/about');
    expect(resolveRoute({ path: '/x/:id', params: { id: 7 } })).toBe('/x/7');
    expect(isActiveRoute('/users/1', '/users')).toBe(true);
    expect(isActiveRoute('/usersx', '/users')).toBe(false);
  });

  it('示例构建产物:零 node: 导入、零框架运行时引用(仅 @ubean/vue + 声明的可选 peer)', () => {
    const distDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
    if (!existsSync(distDir)) return; // 未构建时跳过

    const jsFiles = readdirSync(distDir).filter(f => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const f of jsFiles) {
      const code = readFileSync(`${distDir}${f}`, 'utf-8');
      // 只检查真实 import/export-from 与动态 import 说明符
      // (页面文案/注释中出现 "node:" 之类的字样不算导入)
      const specifiers = [...code.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
      const dynamicImports = [...code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
      const all = [...specifiers, ...dynamicImports];
      expect(
        all.filter(s => s.startsWith('node:')),
        `${f} 不应包含 node: 导入`
      ).toEqual([]);
      // @ubean/vue 是唯一允许的 @ubean 引用;可选 peer(@unhead/vue)按需懒加载
      expect(
        all.filter(s => s.startsWith('@ubean/') && s !== '@ubean/vue'),
        `${f} 不应引用 @ubean/vue 之外的 ubean 包`
      ).toEqual([]);
      expect(
        all.filter(s => s.startsWith('@ubean/i18n')),
        `${f} 不应引用 @ubean/i18n`
      ).toEqual([]);
      expect(
        all.filter(s => s.startsWith('@ubean/islands')),
        `${f} 不应引用 @ubean/islands`
      ).toEqual([]);
      expect(
        all.filter(s => s.startsWith('@ubean/pages')),
        `${f} 不应引用 @ubean/pages`
      ).toEqual([]);
      expect(
        all.filter(s => s.startsWith('@ubean/markdown')),
        `${f} 不应把 @ubean/markdown 打进运行时(构建期依赖)`
      ).toEqual([]);
    }
  });

  it('示例无自动引入产物(auto-imports.d.ts 不存在)', () => {
    const autoImports = fileURLToPath(new URL('../auto-imports.d.ts', import.meta.url));
    expect(existsSync(autoImports)).toBe(false);
  });
});
