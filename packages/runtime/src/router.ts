import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import type { Router, RouteRecordRaw, RouterHistory } from 'vue-router';

export interface CreateUbeanRouterOptions {
  routes: RouteRecordRaw[];
  ssr?: boolean;
  initialUrl?: string;
  base?: string;
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

  if (options.ssr && options.initialUrl) {
    router.push(options.initialUrl);
  }

  return router;
}
