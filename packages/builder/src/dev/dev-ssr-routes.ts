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

/** 扫描器方言 `**:slug`（catch-all）→ vue-router 的 `:slug(.*)*`。 */
export function toVueRouterPagePath(route: string): string {
  return route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*');
}

/** vue-router 路由记录的运行期形状（只声明 dev 侧真正用到的字段）。 */
export interface DevSsrRoute {
  path: string;
  name: string;
  /** 普通路由用 `component`；并行路由（`@slot/`）用 `components` 命名视图，二者互斥。 */
  component?: () => Promise<unknown>;
  components?: Record<string, () => Promise<unknown>>;
  meta: {
    /** 单层布局名、多层嵌套数组（P9-17）或 `false`（禁用）。 */
    layout: string | string[] | false | null;
    pageName: string;
    cache?: true;
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
  /** `pages/404.vue` 经扫描得到的条目；缺省则不注册 catch-all。 */
  notFoundPage?: ScannedPageRoute;
}

/**
 * 构建 SSR 路由表。
 *
 * 顺序与形状刻意对齐客户端：页面按扫描顺序、reuse 路由复用目标页面的组件、
 * 最后是 404 catch-all。catch-all 用 `/:locale?/:pathMatch(.*)*` —— SSR 渲染的是
 * **请求 URL 本身**（不像 SSG 渲染静态产物、可以用 `/404`），必须与客户端同形才能
 * 让两侧 `useRoute()` 解析出同一份 matched 结构。
 */
export function buildDevSsrRoutes(options: DevSsrRoutesOptions): DevSsrRoute[] {
  const { pages, layouts, loadComponent, localeVueParam, notFoundPage } = options;
  const defaultLayout = layouts.find(l => l.isDefault)?.name ?? null;

  const withLocale = (path: string) => (localeVueParam ? toVueRouterLocalePath(path, localeVueParam) : path);

  // reuse 路由只带 `definePage` 元数据，加载它拿不到 Vue 组件 —— 必须加载目标页面的模块。
  const pageByName = new Map<string, ScannedPageRoute>();
  for (const page of pages) pageByName.set(page.name, page);

  const componentFor = (page: ScannedPageRoute) => {
    const target = page.isReuse && page.reuseTarget ? pageByName.get(page.reuseTarget) : undefined;
    const fullPath = target?.fullPath || page.fullPath;
    return async () => (await loadComponent(fullPath)) as { default?: unknown } | unknown;
  };

  const routeFor = (page: ScannedPageRoute): DevSsrRoute => ({
    path: withLocale(toVueRouterPagePath(page.route)),
    name: page.name,
    component: componentFor(page),
    meta: {
      layout: page.layout === false ? false : page.layout || defaultLayout,
      pageName: page.name,
      cache: page.cache === true ? true : undefined
    }
  });

  // **按 route 路径分组**：并行路由（`@slot/`）在客户端是同一条路由记录上的命名视图
  // （`components: { default, <slot> }`）。若在这里各注册成一条路由，同路径的两条记录会互相
  // 覆盖 —— 实测 dev SSR 首屏渲染的是插槽页，而客户端水合后渲染默认视图（首屏与客户端不一致）。
  const grouped = new Map<string, { default?: ScannedPageRoute; slots: ScannedPageRoute[] }>();
  for (const page of pages) {
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
      if (group.default) components.default = componentFor(group.default);
      for (const slotPage of group.slots) components[slotPage.slot!] = componentFor(slotPage);
      delete route.component;
      route.components = components;
    }
    routes.push(route);
  }

  if (notFoundPage) {
    routes.push({
      path: withLocale('/:pathMatch(.*)*'),
      name: 'NotFound',
      component: async () => (await loadComponent(notFoundPage.fullPath)) as { default?: unknown } | unknown,
      meta: {
        layout: notFoundPage.layout === false ? false : notFoundPage.layout || defaultLayout,
        pageName: 'NotFound'
      }
    });
  }

  return routes;
}
