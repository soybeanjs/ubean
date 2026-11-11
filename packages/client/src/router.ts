/**
 * Framework router factory — lives in `@ubean/client` (framework layer).
 *
 * The lean kernel `@ubean/vue` deliberately ships NO router factory: SPAs
 * import their route table (hand-written or from `virtual:ubean-vue-routes`)
 * and call vue-router's `createRouter` themselves. App factories
 * (`createUbeanClientApp` / `createUbeanSSRApp`) are framework conveniences and
 * own this wiring: history selection (web/memory), scroll behavior, and the
 * `setup(router)` guard hook.
 */
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import type { Router, RouteRecordRaw, RouterHistory, RouterOptions } from 'vue-router';

export interface CreateUbeanRouterOptions {
  routes: RouteRecordRaw[];
  ssr?: boolean;
  initialUrl?: string;
  base?: string;
  /**
   * 在 router 实例创建后、初始导航(SSR 的 `router.push(initialUrl)`)之前调用,
   * 用于注册 `beforeEach` / `beforeResolve` / `afterEach` 等导航守卫。
   *
   * 守卫注册必须同步完成(守卫本身可返回 Promise)。
   * 不要在此处执行异步操作(如发起 API 请求),因为这会延迟首次导航。
   *
   * 该回调在 Client 和 SSR 环境都会执行。
   */
  setup?: (router: Router) => void;
  /**
   * vue-router `scrollBehavior`（5.5 起 deprecated），覆盖默认滚动策略。
   *
   * 默认行为:返回顶部;带 hash 时仅当目标元素已存在才平滑滚动。
   * 启用 `scrollRestoration` 时**不再**默认传入（否则两套机制会争抢滚动位置）。
   */
  scrollBehavior?: RouterOptions['scrollBehavior'];
  /**
   * 已安装 `ScrollRestoration` 插件（见 `installScrollRestoration`）。
   * 为 `true` 时 router 不再带默认 `scrollBehavior`。
   */
  scrollRestoration?: boolean;
}

export function createUbeanRouter(options: CreateUbeanRouterOptions): Router {
  const base = options.base || '/';

  const history: RouterHistory = options.ssr ? createMemoryHistory(base) : createWebHistory(base);

  // 两套滚动机制不能同时生效：装了 ScrollRestoration 就交给它，
  // 只有用户显式给了 scrollBehavior 才保留（此时由用户自己负责不冲突）。
  const scrollBehavior = options.scrollBehavior ?? (options.scrollRestoration ? undefined : defaultScrollBehavior);

  const router = createRouter({
    history,
    routes: options.routes,
    ...(scrollBehavior ? { scrollBehavior } : {})
  });

  // 注册导航守卫 — 必须在初始导航前完成,否则守卫拦截不到首次路由。
  if (options.setup) {
    options.setup(router);
  }

  if (options.ssr && options.initialUrl) {
    router.push(options.initialUrl);
  }

  return router;
}

/**
 * 默认滚动策略:返回顶部;带 hash 时仅在目标元素已存在时平滑滚动,
 * 否则返回 `false`(跳过滚动,避免 VUE_ROUTER_R0042 告警)。
 */
function defaultScrollBehavior(
  to: Parameters<NonNullable<RouterOptions['scrollBehavior']>>[0],
  _from: Parameters<NonNullable<RouterOptions['scrollBehavior']>>[1],
  savedPosition: Parameters<NonNullable<RouterOptions['scrollBehavior']>>[2]
): ReturnType<NonNullable<RouterOptions['scrollBehavior']>> {
  if (savedPosition) return savedPosition;
  if (to.hash) {
    return typeof document !== 'undefined' && document.querySelector(to.hash)
      ? { el: to.hash, behavior: 'smooth' }
      : false;
  }
  return { top: 0 };
}
