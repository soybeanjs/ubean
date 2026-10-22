/**
 * dev/SSR 路由表（RM-V11 的组成部件，从 CLI dev server 抽出）。
 *
 * 这里解决的是一个**曾经出过缺陷**的问题类别：服务端 SSR 用的路由表与客户端
 * `virtual:ubean-pages` 的路由表由两处代码各自拼装，一旦不一致就会出现
 * 「SSR 与客户端解析到不同 route record」→ 水合不一致，甚至整页降级。
 *
 * 已实测的两次事故：
 * - **R8**：dev 的服务端路由表只由扫描到的页面构成，**漏了客户端的 404 catch-all**，
 *   于是渲染未知路径时 vue-router 报 `VUE_ROUTER_R0004` 无匹配，页面只渲染出布局外壳，
 *   404 组件自身的 DOM 与 `useHead` 标题全部缺失。
 * - 语言前缀路由：服务端若不带与客户端相同的 locale param，`/zh/xxx` 会落到 catch-all。
 *
 * 因此本模块把「和客户端保持一致」变成可测的约束（见 `dev-ssr-routes.test.ts` 里
 * 直接对照 `generatePagesModuleSource` 产出的客户端路由表），而不是靠两处注释互相提醒。
 */
import { toVueRouterLocalePath } from '@ubean/i18n';
import type { ScannedLayout, ScannedPageRoute } from '@ubean/scan';
import { NOT_FOUND_ROUTE_PATH, resolvePageKind, sortPagesForRouting } from '@ubean/vue';

/** 扫描器方言 `**:slug`（catch-all）→ vue-router 的 `:slug(.*)*`。 */
export function toVueRouterPagePath(route: string): string {
  return route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*');
}

/**
 * `definePage({ redirect })` 的 vue-router 目标。
 *
 * 字符串重定向是**静态路径**，vue-router 不插值参数，所以带语言前缀时必须用
 * 函数形式拼一次（客户端 `generatePagesModuleSource` 生成的是同一个形状）。
 * `to.params.locale` 的运行期值就是 URL 段本身，不需要再查 locale 表；默认语言在
 * `prefix_except_default` / `prefix_and_default` 下没有 param，自然不带前缀。
 */
function redirectTarget(target: string, localeVueParam?: string): string | ((to: DevSsrRedirectLocation) => string) {
  if (!localeVueParam) return target;
  // 目标为 `/` 时不要拼出 `/zh/` —— 服务端 `localizePath` 给的是 `/zh`。
  const suffix = target === '/' ? '' : target;
  return to => (to.params.locale ? `/${to.params.locale}${suffix}` : target);
}

interface DevSsrRedirectLocation {
  params: Record<string, string | string[]>;
}

/** vue-router 路由记录的运行期形状（只声明 dev 侧真正用到的字段）。 */
export interface DevSsrRoute {
  path: string;
  name: string;
  /** 普通路由用 `component`；并行路由（`@slot/`）用 `components` 命名视图，二者互斥。 */
  component?: () => Promise<unknown>;
  components?: Record<string, () => Promise<unknown>>;
  /**
   * `definePage({ redirect })` 的目标 —— 本路由不渲染组件，访问时跳转。
   *
   * 与客户端 `virtual:ubean-pages` 同形：字符串是静态路径，带语言前缀时用
   * 函数形式按 `to.params.locale` 补前缀（字符串重定向不插值参数）。
   */
  redirect?: string | ((to: DevSsrRedirectLocation) => string);
  meta: {
    /** 单层布局名、多层嵌套数组（P9-17）或 `false`（禁用）。 */
    layout: string | string[] | false | null;
    pageName: string;
    cache?: true;
    /**
     * 其余键是 `definePage({ meta })` 的透传（`iframeUrl` / `title` / `i18nKey` …）。
     * 不声明的话，用到这些 meta 的页面（例如按 `meta.iframeUrl` 取地址的内嵌页）
     * 在 SSR 首屏渲染成空态，水合后客户端才有值 —— 首屏与水合结果不一致。
     */
    [key: string]: unknown;
  };
}

export interface DevSsrRoutesOptions {
  pages: readonly ScannedPageRoute[];
  layouts: readonly ScannedLayout[];
  /**
   * 组件加载器。dev 下必须是「经 Vite SSR 图加载」（`ssrLoadModule`），否则 SSR 会用到
   * 另一份 vue/vue-router 实例，注入键（实例级 Symbol）不一致 → 渲染直接崩。
   */
  loadComponent: (fullPath: string) => Promise<unknown>;
  /** 与客户端 `virtual:ubean-pages` 相同的 locale param（如 `:locale(zh)?`）。 */
  localeVueParam?: string;
}

/**
 * 构建 SSR 路由表。
 *
 * 顺序与形状刻意对齐客户端：页面按扫描顺序、reuse 路由复用目标页面的组件、
 * 全局捕获路由（`pages/404.vue` / `pages/not-found.vue`）排最后。catch-all 用
 * `/:locale?/:pathMatch(.*)*` —— SSR 渲染的是**请求 URL 本身**（不像 SSG 渲染静态产物、
 * 可以用 `/404`），必须与客户端同形才能让两侧 `useRoute()` 解析出同一份 matched 结构。
 */
export function buildDevSsrRoutes(options: DevSsrRoutesOptions): DevSsrRoute[] {
  const { pages, layouts, loadComponent, localeVueParam } = options;
  const defaultLayout = layouts.find(l => l.isDefault)?.name ?? null;

  // `routable: false` 的页面不进 SSR 路由表 —— 客户端 `virtual:ubean-pages` 也没有它们，
  // 两侧必须同形。（它们仍在 `pages` 里供宿主消费菜单目录等应用层语义。）
  // 捕获路由排最后：vue-router 的 catch-all 按**注册顺序**匹配，内置 404 排在
  // 用户 `[...slug].vue` 之前会把它整个吞掉。
  const routablePages = sortPagesForRouting(pages.filter(p => p.routable !== false));

  const withLocale = (path: string) => (localeVueParam ? toVueRouterLocalePath(path, localeVueParam) : path);

  // reuse 路由只带 `definePage` 元数据，加载它拿不到 Vue 组件 —— 必须加载目标页面的模块。
  const pageByName = new Map<string, ScannedPageRoute>();
  for (const page of routablePages) pageByName.set(page.name, page);

  const componentFor = (page: ScannedPageRoute) => {
    const target = resolvePageKind(page) === 'reuse' && page.reuseTarget ? pageByName.get(page.reuseTarget) : undefined;
    const fullPath = target?.fullPath || page.fullPath;
    return async () => (await loadComponent(fullPath)) as { default?: unknown } | unknown;
  };

  const routeFor = (page: ScannedPageRoute): DevSsrRoute => ({
    path: withLocale(page.isGlobalCatchAll ? NOT_FOUND_ROUTE_PATH : toVueRouterPagePath(page.route)),
    name: page.name,
    ...(page.redirect
      ? { redirect: redirectTarget(page.redirect, localeVueParam) }
      : { component: componentFor(page) }),
    meta: {
      layout: page.layout === false ? false : page.layout || defaultLayout,
      pageName: page.name,
      cache: page.cache === true ? true : undefined,
      // 与客户端 `buildRouteMeta` 同优先级：框架字段在前，用户 `definePage({ meta })`
      // 在后（可覆盖同名键，但不能顶掉 `pageName` / `layout` 这类结构字段之外的东西）。
      ...(page.pageMeta?.meta as Record<string, unknown> | undefined)
    }
  });

  // **按 route 路径分组**：并行路由（`@slot/`）在客户端是同一条路由记录上的命名视图
  // （`components: { default, <slot> }`）。若在这里各注册成一条路由，同路径的两条记录会互相
  // 覆盖 —— 实测 dev SSR 首屏渲染的是插槽页，而客户端水合后渲染默认视图（首屏与客户端不一致）。
  const grouped = new Map<string, { default?: ScannedPageRoute; slots: ScannedPageRoute[] }>();
  for (const page of routablePages) {
    const group = grouped.get(page.route) ?? { slots: [] };
    if (page.slot) group.slots.push(page);
    else if (!group.default) group.default = page;
    grouped.set(page.route, group);
  }

  const routes: DevSsrRoute[] = [];
  for (const group of grouped.values()) {
    const primary = group.default ?? group.slots[0];
    if (!primary) continue;
    const route = routeFor(primary);
    if (group.slots.length > 0) {
      const components: Record<string, () => Promise<unknown>> = {};
      // redirect 页没有组件实现，不进命名视图。
      if (group.default && !group.default.redirect) components.default = componentFor(group.default);
      for (const slotPage of group.slots) components[slotPage.slot!] = componentFor(slotPage);
      delete route.component;
      route.components = components;
    }
    routes.push(route);
  }

  return routes;
}
