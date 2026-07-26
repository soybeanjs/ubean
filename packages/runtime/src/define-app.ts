import type { App, Component, Plugin } from 'vue';
import type { Router } from 'vue-router';
import type { PageHead } from '@ubean/types';
import type { ViewTransitionOptions } from './view-transitions';

export interface AppPluginConfig {
  plugin: Plugin | [Plugin, ...any[]];
  mode?: 'all' | 'client' | 'server';
}

/**
 * Router 钩子配置 — 暴露 vue-router 的导航守卫注册入口。
 *
 * `setup(router)` 在 router 实例创建后、`app.use(router)` 之前调用,
 * 因此守卫能拦截首次导航(包括 SSR 的初始 URL push)。
 *
 * Client 和 SSR 都会执行,适合做鉴权、埋点、进度条等逻辑。
 *
 * @example
 * ```ts
 * defineApp({
 *   router: {
 *     setup(router) {
 *       router.beforeEach((to, from) => {
 *         if (to.meta.requiresAuth && !isAuthenticated()) {
 *           return '/login';
 *         }
 *       });
 *       router.afterEach((to) => {
 *         analytics.track('page_view', { path: to.fullPath });
 *       });
 *     }
 *   }
 * });
 * ```
 */
export interface RouterConfig {
  /**
   * 在 router 创建后、初始导航前调用。
   * 用于注册 `beforeEach` / `beforeResolve` / `afterEach` 等守卫。
   *
   * 注意:setup 必须同步注册守卫(虽然守卫本身可以返回 Promise)。
   * 不要在 setup 中执行异步操作(如请求 API),因为这会延迟首次导航。
   */
  setup?: (router: Router) => void;
}

export interface DefineAppOptions {
  plugins?: Array<Plugin | [Plugin, ...any[]] | AppPluginConfig>;
  globalComponents?: Record<string, Component>;
  provides?: Record<string | symbol, unknown>;
  head?: PageHead;
  rootId?: string;
  rootAttrs?: Record<string, string>;
  /**
   * 路由钩子配置,用于注册 vue-router 的导航守卫。
   * 在 Client 和 SSR 都会执行。
   */
  router?: RouterConfig;
  onAppCreated?: (app: App) => void | Promise<void>;
  onClientReady?: (app: App) => void | Promise<void>;
  errorComponent?: Component;
  loadingComponent?: Component;
  viewTransitions?: boolean | ViewTransitionOptions;
}

export interface ResolvedAppConfig {
  plugins: AppPluginConfig[];
  globalComponents: Record<string, Component>;
  provides: Record<string | symbol, unknown>;
  head?: PageHead;
  rootId: string;
  rootAttrs: Record<string, string>;
  router?: RouterConfig;
  onAppCreated?: (app: App) => void | Promise<void>;
  onClientReady?: (app: App) => void | Promise<void>;
  errorComponent?: Component;
  loadingComponent?: Component;
  viewTransitions?: boolean | ViewTransitionOptions;
}

export function defineApp(options: DefineAppOptions): ResolvedAppConfig {
  const plugins: AppPluginConfig[] = [];

  if (options.plugins) {
    for (const p of options.plugins) {
      if (Array.isArray(p)) {
        plugins.push({ plugin: p as [Plugin, ...any[]], mode: 'all' });
      } else if (typeof p === 'object' && 'plugin' in p) {
        plugins.push(p);
      } else {
        plugins.push({ plugin: p as Plugin, mode: 'all' });
      }
    }
  }

  return {
    plugins,
    globalComponents: options.globalComponents || {},
    provides: options.provides || {},
    head: options.head,
    rootId: options.rootId || 'app',
    rootAttrs: options.rootAttrs || {},
    router: options.router,
    onAppCreated: options.onAppCreated,
    onClientReady: options.onClientReady,
    errorComponent: options.errorComponent,
    loadingComponent: options.loadingComponent,
    viewTransitions: options.viewTransitions
  };
}

export function applyAppConfig(app: App, config: ResolvedAppConfig, mode: 'client' | 'server'): void {
  for (const { plugin, mode: pluginMode = 'all' } of config.plugins) {
    if (pluginMode === 'all' || pluginMode === mode) {
      if (Array.isArray(plugin)) {
        app.use(plugin[0], ...plugin.slice(1));
      } else {
        app.use(plugin);
      }
    }
  }

  for (const [name, comp] of Object.entries(config.globalComponents)) {
    app.component(name, comp);
  }

  for (const [key, value] of Object.entries(config.provides)) {
    app.provide(key, value);
  }
}

export function createDefaultAppConfig(): ResolvedAppConfig {
  return {
    plugins: [],
    globalComponents: {},
    provides: {},
    rootId: 'app',
    rootAttrs: {}
  };
}
