import type { App, Component, Plugin } from 'vue';
import type { Router } from 'vue-router';
import type { PageHead } from '@ubean/shared';
import type { ViewTransitionOptions } from '@ubean/vue';

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
  /**
   * SSR 专用:在 `renderToString(app)` 完成后调用,从 app 实例提取需要
   * 序列化到客户端的状态(如 Pinia 的 `pinia.state.value`)。
   *
   * 返回的对象会被 `safeJsonStringify` 序列化并注入到 HTML 的
   * `__UBEAN_STATE__` script 标签中。
   *
   * 仅在 server mode 下生效;client mode 下被忽略。
   *
   * @example
   * ```ts
   * import { createPinia } from 'pinia';
   * defineApp({
   *   plugins: [createPinia()],
   *   serializeState: (app) => ({
   *     pinia: app.config.globalProperties.$pinia.state.value
   *   })
   * });
   * ```
   */
  serializeState?: (app: App) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Client 专用:在 `applyAppConfig`(注册插件/provide)之后、`app.mount()` 之前调用,
   * 用于从 `__UBEAN_STATE__` 反序列化的状态回填到 app(如 Pinia 的水合)。
   *
   * `state` 即 `serializeState` 在服务端返回的对象;若服务端未配置 `serializeState`
   * 或返回空,`state` 为 `null`。
   *
   * 仅在 client mode 下生效;server mode 下被忽略。
   *
   * @example
   * ```ts
   * import { createPinia } from 'pinia';
   * defineApp({
   *   plugins: [createPinia()],
   *   hydrateState: (app, state) => {
   *     if (state?.pinia) {
   *       app.config.globalProperties.$pinia.state.value = state.pinia;
   *     }
   *   }
   * });
   * ```
   */
  hydrateState?: (app: App, state: Record<string, unknown> | null) => void;
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
  serializeState?: (app: App) => Record<string, unknown> | Promise<Record<string, unknown>>;
  hydrateState?: (app: App, state: Record<string, unknown> | null) => void;
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
    viewTransitions: options.viewTransitions,
    serializeState: options.serializeState,
    hydrateState: options.hydrateState
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

/**
 * 从多个 `ResolvedAppConfig` 合并出一个最终配置(shared + client/server)。
 *
 * `serializeState` 与 `hydrateState` 的合并语义:server 配置的 `serializeState` 优先,
 * client 配置的 `hydrateState` 优先;shared 配置作为默认值。
 *
 * 这个函数在 `virtual:ubean-app` 虚拟模块中以 JS 字符串形式重新实现
 * (`_mergeAppConfig`),保持两者语义一致。
 */
export function mergeAppConfig(
  base: ResolvedAppConfig,
  ...configs: (ResolvedAppConfig | null | undefined)[]
): ResolvedAppConfig {
  const result: ResolvedAppConfig = { ...base };
  for (const cfg of configs) {
    if (!cfg) continue;
    if (cfg.plugins) result.plugins = [...(result.plugins || []), ...cfg.plugins];
    if (cfg.globalComponents) result.globalComponents = { ...result.globalComponents, ...cfg.globalComponents };
    if (cfg.provides) result.provides = { ...result.provides, ...cfg.provides };
    if (cfg.head) result.head = { ...result.head, ...cfg.head };
    if (cfg.rootId) result.rootId = cfg.rootId;
    if (cfg.rootAttrs) result.rootAttrs = { ...result.rootAttrs, ...cfg.rootAttrs };
    if (cfg.onAppCreated) result.onAppCreated = cfg.onAppCreated;
    if (cfg.onClientReady) result.onClientReady = cfg.onClientReady;
    if (cfg.errorComponent) result.errorComponent = cfg.errorComponent;
    if (cfg.loadingComponent) result.loadingComponent = cfg.loadingComponent;
    if (cfg.viewTransitions !== undefined) result.viewTransitions = cfg.viewTransitions;
    if (cfg.serializeState) result.serializeState = cfg.serializeState;
    if (cfg.hydrateState) result.hydrateState = cfg.hydrateState;
    if (cfg.router?.setup) {
      const prevSetup = result.router?.setup;
      if (prevSetup) {
        result.router = {
          setup: (router: Router) => {
            prevSetup(router);
            cfg.router!.setup!(router);
          }
        };
      } else {
        result.router = { setup: cfg.router.setup };
      }
    }
  }
  return result;
}
