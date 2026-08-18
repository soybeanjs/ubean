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
import type { Router, RouteRecordRaw, RouterHistory } from 'vue-router';

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
}

export function createUbeanRouter(options: CreateUbeanRouterOptions): Router {
  const base = options.base || '/';

  const history: RouterHistory = options.ssr ? createMemoryHistory(base) : createWebHistory(base);

  const router = createRouter({
    history,
    routes: options.routes,
    scrollBehavior(_to, _from, savedPosition) {
      if (savedPosition) return savedPosition;
      if (_to.hash) return { el: _to.hash, behavior: 'smooth' };
      return { top: 0 };
    }
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
