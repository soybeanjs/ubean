import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/**
 * @ubean/vue 功能正确性测试
 *
 * 验证精简内核的完整链路(依赖白名单:vue + vue-router):
 *  1. `ubeanVue` 插件:全局组件注册 + routes 播种 keep-alive
 *  2. PageView/Link 渲染协议(SSR 直渲路径,内存路由)
 *  3. 页面缓存控制:播种/开关/剪枝/重置
 *  4. 过渡与重载信号
 *  5. 路由纯函数
 *  6. 依赖纯净度:package.json 白名单 + dist 零 node:/@ubean:/@unhead 导入
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, createSSRApp, defineComponent, h, provide } from 'vue';
import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createRouter, createMemoryHistory } from 'vue-router';
import { _flushPendingReincludes } from '../src/cache-views';
import {
  ubeanVue,
  PageView,
  Link,
  SSR_KEY,
  PAGE_KEY,
  definePage,
  usePage,
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
  isActiveRoute,
  supportsViewTransitions
} from '../src/index';
import { generatePagesModuleSource, generateTypedRouter, generateVirtualModuleDts } from '../src/virtual-pages';
import { scanClientPages, stripDefinePageCalls } from '../src/vite';

/** 与用户真实用法一致:内核不产出 router 工厂,直接用 vue-router 创建。 */
function makeSSRRouter(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: makeRoutes() as never,
    scrollBehavior: () => ({ top: 0 })
  });
  router.push(url);
  return router;
}

function page(text: string): Component {
  return defineComponent({
    name: `Page${text.replace(/[^a-zA-Z]/g, '')}`,
    setup: () => () => h('div', { class: 'page-content' }, text)
  });
}

function makeRoutes() {
  return [
    { path: '/', name: 'Home', component: page('home-page'), meta: { pageName: 'Home' } },
    {
      path: '/cache-demo',
      name: 'CacheDemo',
      component: page('cache-page'),
      meta: { pageName: 'CacheDemo', cache: true }
    },
    { path: '/about', name: 'About', component: page('about-page'), meta: { pageName: 'About', transition: 'fade' } }
  ];
}

/* -------------------------------------------------------------------------- */
/* 1. 插件                                                                    */
/* -------------------------------------------------------------------------- */

describe('ubeanVue 插件(唯一装配入口)', () => {
  it('注册 Link/PageView/SlotView 全局组件', () => {
    const app = createApp({ render: () => h('div') });
    app.use(ubeanVue);

    expect(app.component('Link')).toBe(Link);
    expect(app.component('PageView')).toBe(PageView);
    expect(app.component('SlotView')).toBeDefined();
  });

  it('options.routes 按 meta.cache 播种 keep-alive 列表', () => {
    invalidatePageCache();
    const app = createApp({ render: () => h('div') });
    app.use(ubeanVue, { routes: makeRoutes() as never });

    expect(isPageCached('CacheDemo')).toBe(true); // meta.cache: true
    expect(isPageCached('Home')).toBe(false); // 未声明
  });

  it('不注册任何指令(lean 内核无 islands 依赖)', () => {
    const app = createApp({ render: () => h('div') });
    app.use(ubeanVue);
    // v-client 是框架运行时(@ubean/client 工厂)的职责
    expect(app.directive('client')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 1.5 usePage(精简版:仅 pageData,无路由依赖)                              */
/* -------------------------------------------------------------------------- */

describe('usePage(精简版)', () => {
  it('无 PAGE_KEY 注入 → 共享空对象(不依赖 router 即可调用)', async () => {
    let result: ReturnType<typeof usePage> | undefined;
    const app = createSSRApp({
      setup() {
        result = usePage();
        return () => h('div');
      }
    });
    await renderToString(app); // 无 router —— 旧版(路由驱动)在此会抛错
    expect(result).toBeDefined();
    expect(result!.component).toBeUndefined();
    expect(result!.props).toBeUndefined();
    expect(result!.errors).toBeUndefined();
  });

  it('两次无注入调用返回同一共享空对象(零分配)', async () => {
    let a: ReturnType<typeof usePage> | undefined;
    let b: ReturnType<typeof usePage> | undefined;
    const app = createSSRApp({
      setup() {
        a = usePage();
        b = usePage();
        return () => h('div');
      }
    });
    await renderToString(app);
    expect(a).toBe(b);
  });

  it('提供 PAGE_KEY → 原样返回注入的 pageData(保持引用与响应性)', async () => {
    const pageData = { component: 'UserPage', props: { id: 1 }, errors: null };
    let result: ReturnType<typeof usePage> | undefined;
    // provide 与 inject 必须跨组件:inject 读取父级 provides,
    // 同组件内 provide 自己不可见(与框架工厂 → 页面的结构一致)。
    const Child = defineComponent({
      setup() {
        result = usePage();
        return () => h('div');
      }
    });
    const app = createSSRApp({
      setup() {
        provide(PAGE_KEY, pageData);
        return () => h(Child);
      }
    });
    await renderToString(app);
    expect(result).toBe(pageData); // 同一引用:reactive PageObject 的响应性自然保留
    expect(result!.component).toBe('UserPage');
    expect(result!.props).toEqual({ id: 1 });
    expect(result!.errors).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 渲染协议(SSR 直渲)                                                     */
/* -------------------------------------------------------------------------- */

describe('PageView / Link 渲染', () => {
  async function renderAt(url: string, root: Component) {
    const router = makeSSRRouter(url);
    const app = createSSRApp(root);
    app.use(router);
    await router.isReady();
    return renderToString(app);
  }

  it('PageView 渲染匹配路由的页面组件(SSR_KEY 直渲,跳过 keep-alive/transition)', async () => {
    const Root = defineComponent({
      setup() {
        provide(SSR_KEY, true);
        return () => h('div', [h(PageView)]);
      }
    });
    const html = await renderAt('/cache-demo', Root);
    expect(html).toContain('cache-page');
  });

  it('Link 内部链接渲染 RouterLink(<a>),外部链接渲染 _blank 原生锚点', async () => {
    const Root = defineComponent({
      setup() {
        provide(SSR_KEY, true);
        return () =>
          h('div', [
            h(Link, { to: '/about' }, { default: () => 'about-link' }),
            h(Link, { to: 'https://example.com/x' }, { default: () => 'external-link' })
          ]);
      }
    });
    const html = await renderAt('/', Root);

    expect(html).toContain('href="/about"');
    expect(html).toContain('about-link');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('未提供 LOCALIZE_PATH_KEY 时 Link 原样透传路径(零 i18n 依赖)', async () => {
    const Root = defineComponent({
      setup() {
        provide(SSR_KEY, true);
        return () => h(Link, { to: '/zh/about' }, { default: () => 'plain' });
      }
    });
    const html = await renderAt('/', Root);
    expect(html).toContain('href="/zh/about"'); // 不做本地化改写
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 页面缓存控制                                                            */
/* -------------------------------------------------------------------------- */

describe('页面缓存(keep-alive include 列表)', () => {
  beforeEach(() => {
    invalidatePageCache();
    useCacheViews().clearExclude();
  });

  it('enablePageCache / disablePageCache 运行时切换(幂等)', () => {
    enablePageCache('Home');
    expect(isPageCached('Home')).toBe(true);

    disablePageCache('Home');
    expect(isPageCached('Home')).toBe(false);

    enablePageCache('Home');
    enablePageCache('Home');
    expect(useCacheViews().cachedViewNames.value.filter(n => n === 'Home')).toHaveLength(1);
  });

  it('useCacheViews() 响应式视图与 exclude 命名操作同步', () => {
    const views = useCacheViews();
    views.add('Dynamic');
    expect(views.has('Dynamic')).toBe(true);

    views.addExclude('Dynamic');
    expect(views.hasExclude('Dynamic')).toBe(true);

    views.removeExclude('Dynamic');
    views.remove('Dynamic');
    expect(views.has('Dynamic')).toBe(false);
  });

  it('invalidatePageCache(name) 精确清除;无参全清', () => {
    enablePageCache('A');
    enablePageCache('B');
    invalidatePageCache('A');
    expect(isPageCached('A')).toBe(false);
    expect(isPageCached('B')).toBe(true);
    invalidatePageCache();
    expect(isPageCached('B')).toBe(false);
  });

  it('resetRouteCache 剪除缓存,导航离开后恢复声明(afterEach 钩子语义)', async () => {
    initCachedViewsFromRoutes(makeRoutes() as never);
    expect(isPageCached('CacheDemo')).toBe(true);

    await resetRouteCache('CacheDemo');

    // 剪除:include 立即移除(活跃页的缓存实例将在离开时销毁)
    expect(isPageCached('CacheDemo')).toBe(false);

    // 仍在该页时不应恢复
    _flushPendingReincludes('CacheDemo');
    expect(isPageCached('CacheDemo')).toBe(false);

    // 导航离开(afterEach 以新页面名触发)→ 声明恢复,下次进入全新挂载并重新入缓存
    _flushPendingReincludes('Home');
    expect(isPageCached('CacheDemo')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. 过渡与重载信号                                                          */
/* -------------------------------------------------------------------------- */

describe('过渡与重载信号', () => {
  it('setPageTransition / clearPageTransition 修改全局过渡名 ref', () => {
    setPageTransition('fade');
    expect(getPageTransitionName().value).toBe('fade');

    setPageTransition('none'); // 'none' 归一化为禁用
    expect(getPageTransitionName().value).toBe('');

    clearPageTransition();
    expect(getPageTransitionName().value).toBe('');
  });

  it('reloadPage 递增重载计数;执行期间 isReloading 翻转', async () => {
    const before = getReloadCounter().value;
    let reloadingDuring = false;

    const p = reloadPage(undefined, 20); // 不传 name:仅 bump 计数
    reloadingDuring = isReloading();
    await p;

    expect(reloadingDuring).toBe(true);
    expect(isReloading()).toBe(false);
    expect(getReloadCounter().value).toBe(before + 1);
  });

  it('reloadPage(name) 对缓存页:计数递增,缓存声明保留(隐藏窗口语义)', async () => {
    enablePageCache('ReloadMe');
    const before = getReloadCounter().value;

    await reloadPage('ReloadMe', 10);

    // 隐藏 → 空窗口剪除 → 恢复:include 声明最终保持,isPageCached 不变
    expect(getReloadCounter().value).toBe(before + 1);
    expect(isPageCached('ReloadMe')).toBe(true);
  });

  it('supportsViewTransitions 在 node 下安全返回布尔值', () => {
    expect(typeof supportsViewTransitions()).toBe('boolean');
  });
});

/* -------------------------------------------------------------------------- */
/* 5. 路由纯函数                                                              */
/* -------------------------------------------------------------------------- */

describe('路由纯函数', () => {
  it('resolveRoute:字符串直通 / params 与 query 填充 / hash 拼接', () => {
    expect(resolveRoute('/about')).toBe('/about');
    expect(resolveRoute('about')).toBe('/about'); // 自动补前导斜杠
    expect(resolveRoute({ path: '/x/:id', params: { id: 7 } })).toBe('/x/7');
    expect(resolveRoute({ path: '/x', query: { a: 1, b: null } })).toBe('/x?a=1'); // null 被过滤
    expect(resolveRoute({ path: '/x', hash: '#sec' })).toBe('/x#sec');
  });

  it('isActiveRoute:前缀匹配语义(root 精确匹配)', () => {
    expect(isActiveRoute('/', '/')).toBe(true);
    expect(isActiveRoute('/about', '/')).toBe(false); // root 需精确
    expect(isActiveRoute('/users/1', '/users')).toBe(true); // 前缀
    expect(isActiveRoute('/usersx', '/users')).toBe(false); // 段边界
    expect(isActiveRoute('/about', '/about', true)).toBe(true); // exact
    expect(isActiveRoute('/about/extra', '/about', true)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. 依赖纯净度(核心承诺)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 剥离 JS 源码中的行注释与块注释(字符串字面量保留原样,含转义处理)。
 * 用于依赖纯净度检查,避免 JSDoc 中的示例 import 语句造成误报。
 */
function stripComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    // 行注释
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    // 块注释
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // 字符串字面量原样保留(含转义)
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') {
          out += code[i] + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += code[i];
        i++;
      }
      if (i < n) {
        out += code[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

describe('@ubean/vue 依赖纯净度', () => {
  it('运行时依赖白名单:主入口仅 vue + vue-router(/vite 构建期依赖额外允许)', async () => {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies);
    // 运行时承诺:vue/vue-router。pathe/scule/ufo(路由纯函数)与
    // tinyglobby(扫描)仅被 `/vite` 构建期插件与纯函数模块使用,
    // 不进客户端产物(见下方 dist 导入面测试)。
    const allowedDeps = ['vue', 'vue-router', 'pathe', 'scule', 'ufo', 'tinyglobby'];
    for (const allowed of allowedDeps) {
      expect(deps).toContain(allowed);
    }
    expect(deps.filter(d => !allowedDeps.includes(d))).toEqual([]);
  });

  it('主入口产物零 node:/@ubean:/@unhead/vite 导入(完全自包含于 vue 生态)', () => {
    const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
    if (!existsSync(distDir)) return; // 未构建时跳过(根构建脚本会先 build)

    const p = `${distDir}index.js`;
    if (!existsSync(p)) return;
    const code = readFileSync(p, 'utf-8');
    // 提取真实 import/export-from 说明符(先剥离注释,避免 JSDoc 示例误报)
    const specifiers = [...stripComments(code).matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map(
      m => m[1]
    );
    // 静态导入禁止 node:/@ubean:/@unhead:/vite/tinyglobby;
    // 动态导入仅允许 `@unhead/vue`(head.ts 的 createPageHead 按需加载,
    // optional peer,不调用不加载 —— 不进默认客户端产物)
    const staticOffenders = specifiers.filter(
      s =>
        s.startsWith('node:') ||
        s.startsWith('@ubean/') ||
        s.startsWith('@unhead/') ||
        s === 'vite' ||
        s === 'tinyglobby'
    );
    expect(
      staticOffenders,
      `index.js 不应包含静态 node:/@ubean:/@unhead/vite 导入,发现:${staticOffenders.join(', ')}`
    ).toEqual([]);
    const dynamicImports = [...stripComments(code).matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    const dynamicOffenders = dynamicImports.filter(s => s !== '@unhead/vue');
    expect(
      dynamicOffenders,
      `index.js 动态导入仅允许 @unhead/vue(按需加载),发现:${dynamicOffenders.join(', ')}`
    ).toEqual([]);
  });

  it('/vite 产物真实导入面仅构建期依赖(模板字符串中的示例用单引号,可区分)', () => {
    const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
    const p = `${distDir}vite.js`;
    if (!existsSync(p)) return;
    const code = readFileSync(p, 'utf-8');
    // 打包器真实导入统一双引号;生成器模板里的 d.ts/示例文本用单引号 —— 以此区分
    const realImports = [...code.matchAll(/^[ \t]*import\s[^'"]*?from\s*"([^"]+)"/gm)].map(m => m[1]);
    expect(realImports.filter(s => s.startsWith('@unhead/') || s === 'vue' || s === 'vue-router')).toEqual([]);
    expect(
      realImports.every(
        s =>
          s.startsWith('node:') || s === 'vite' || s === 'tinyglobby' || s === 'pathe' || s === 'scule' || s === 'ufo'
      )
    ).toBe(true);
  });

  it('主入口可在 node 中直接 import 且无副作用', async () => {
    await expect(import('../src/index')).resolves.toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 7. 文件路由插件核心(/vite,构建期)                                        */
/* -------------------------------------------------------------------------- */

describe('文件路由插件核心(scanClientPages / generate / strip)', () => {
  it('definePage 运行时是 no-op(无插件环境兜底)', () => {
    expect(() => definePage({ cache: true, transition: 'fade' })).not.toThrow();
    expect(definePage()).toBeUndefined();
  });

  it('stripDefinePageCalls 剥除宏调用,保留其余代码与注释/字符串', () => {
    const src = `import { ref } from 'vue';
// definePage({ cache: true }) — 注释里的不算
const msg = 'definePage({ cache: true }) 字符串里的也不算';
definePage({
  name: 'About',
  cache: true,
  transition: 'fade'
});
const x = ref(1);
const s = '括号)内部';
`;
    const out = stripDefinePageCalls(src);
    // 真实宏调用(含参数对象)被完整剥除
    expect(out).not.toContain("name: 'About'");
    expect(out).not.toContain('transition');
    expect(out).toContain('const x = ref(1)');
    expect(out).toContain("const s = '括号)内部'");
    expect(out).toContain("import { ref } from 'vue'");
    // 注释与字符串字面量中的 definePage 保留(不影响语义)
    expect(out).toContain('// definePage({ cache: true })');
    expect(out).toContain("'definePage({ cache: true }) 字符串里的也不算'");
  });

  it('scanClientPages:文件派生路由 + definePage 提取 + 特殊页识别', async () => {
    const root = fileURLToPath(new URL('../.temp-scan-fixture/', import.meta.url));
    const pagesDir = `${root}src/pages`;
    const { mkdir, rm, writeFile: wf } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
    await mkdir(`${pagesDir}/users`, { recursive: true });
    await mkdir(`${pagesDir}/components`, { recursive: true });

    await wf(
      `${pagesDir}/index.vue`,
      `<script setup>definePage({ name: 'Home' });</script>\n<template><div /></template>`
    );
    await wf(
      `${pagesDir}/about.vue`,
      `<script setup lang="ts">\nimport { definePage } from '@ubean/vue';\ndefinePage({ cache: true, transition: 'fade', meta: { custom: 1 } });\n</script>`
    );
    await wf(`${pagesDir}/users/[id].vue`, `<template><div /></template>`);
    await wf(`${pagesDir}/404.vue`, `<template><div>404</div></template>`);
    await wf(`${pagesDir}/_ignored.vue`, `<template><div /></template>`);
    await wf(`${pagesDir}/components/nested.vue`, `<template><div /></template>`);

    const scan = await scanClientPages(root, {});

    // _ignored / components/ 被排除;顺序为确定性文件字母序(index.vue 排在 about 后)
    expect(scan.pages.map(p => p.path)).toEqual(['/about', '/', '/users/:id']);

    const home = scan.pages.find(p => p.path === '/')!;
    expect(home.name).toBe('Home'); // definePage name 覆盖文件派生 'Index'

    const about = scan.pages.find(p => p.path === '/about')!;
    expect(about.name).toBe('About');
    expect(about.cache).toBe(true);
    expect(about.pageMeta?.transition).toBe('fade');
    expect(about.pageMeta?.meta?.custom).toBe(1); // meta 自由字段透传

    // 扫描结果保留文件派生路径;catch-all '/:pathMatch(.*)*' 由虚拟模块生成
    expect(scan.notFoundPage?.route).toBe('/404');
    expect(scan.notFoundPage?.name).toBe('NotFound');

    await rm(root, { recursive: true, force: true });
  });

  it('generatePagesModuleSource 产出纯 JS 虚拟模块(路由表 + pageNames + 特殊页)', async () => {
    const scan: import('../src/virtual-pages').PagesModuleInput = {
      pages: [
        { fullPath: '/x/pages/index.vue', route: '/', path: '/', name: 'Home', isReuse: false, isMarkdown: false },
        {
          fullPath: '/x/pages/about.vue',
          route: '/about',
          path: '/about',
          name: 'About',
          cache: true,
          isReuse: false,
          isMarkdown: false,
          pageMeta: { transition: 'fade' }
        }
      ],
      layouts: [],
      notFoundPage: {
        fullPath: '/x/pages/404.vue',
        route: '/404',
        path: '/404',
        name: 'NotFound',
        isReuse: false,
        isMarkdown: false
      },
      loadingPage: {
        fullPath: '/x/pages/loading.vue',
        route: '/loading',
        path: '/loading',
        name: 'Loading',
        isReuse: false,
        isMarkdown: false
      },
      errorPage: {
        fullPath: '/x/pages/error.vue',
        route: '/error',
        path: '/error',
        name: 'Error',
        isReuse: false,
        isMarkdown: false
      }
    };
    const code = generatePagesModuleSource(scan);

    // 无 TS 语法(虚拟模块按 JS 解析)
    expect(code).not.toContain('import type');
    expect(code).not.toContain(' as const');

    expect(code).toContain(`import("/x/pages/index.vue")`);
    expect(code).toContain('const Page_Home ='); // loader 声明存在(修复前缺失)
    expect(code).toContain(`path: "/about"`);
    expect(code).toContain(`"cache":true`);
    expect(code).toContain(`"transition":"fade"`);
    expect(code).toContain(`"/:pathMatch(.*)*"`);
    expect(code).toContain('export const pageNames');
    expect(code).toContain('export const loadingComponent');
    expect(code).toContain('export const errorComponent');
  });

  it('generateVirtualModuleDts 产出环境模块声明(script,pageNames union)', () => {
    const input = {
      pages: [{ fullPath: '/a.vue', route: '/', path: '/', name: 'Home', isReuse: false, isMarkdown: false }],
      notFoundPage: {
        fullPath: '/404.vue',
        route: '/404',
        path: '/404',
        name: 'NotFound',
        isReuse: false,
        isMarkdown: false
      }
    };
    const dts = generateVirtualModuleDts(input);
    // script 文件:不得含顶层 export,否则 declare module 变为模块增强
    expect(dts).toContain(`declare module 'virtual:ubean-vue-routes'`);
    expect(dts).toContain(`"Home" | "NotFound"`);
    expect(dts.trim().startsWith('//')).toBe(true);

    // generateTypedRouter(module 文件):RouteNamedMap 增强 + 顶层 export {}
    const typed = generateTypedRouter(input);
    expect(typed).toContain(`export {};`);
    expect(typed).toContain(`declare module 'vue-router/auto-routes'`);
    expect(typed).toContain(`declare module 'vue-router'`);
    expect(typed).toContain(`"Home": RouteRecordInfo<"Home", "/"`);
  });
});
