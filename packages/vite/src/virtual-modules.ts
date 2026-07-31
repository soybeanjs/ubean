import { defineVirtualModule, getCssImports } from '@ubean/build';
import type { ScannedPageRoute, ScannedLayout, ScannedAppEntry, ScannedServerEntry } from '@ubean/routing';

/**
 * Convert ubean route path to vue-router compatible path.
 * - `**:param` (catch-all) → `:param(.*)*`
 * - `:param?` (optional) → `:param?` (already compatible)
 * - `:param` (dynamic) → `:param` (already compatible)
 */
function toVueRouterPath(route: string): string {
  return route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*');
}

/**
 * Sort pages so that reuse routes come after their targets.
 *
 * A reuse route generates `const Page_Reuse = Page_Target;` in the virtual
 * module. If the reuse route is declared before its target, JavaScript's TDZ
 * (temporal dead zone) throws `Cannot access 'Page_Target' before initialization`.
 *
 * This topological sort ensures targets are always emitted before their
 * reuse routes. Pages without reuse dependencies retain their original order.
 */
function sortPagesByReuseDependency(pages: ScannedPageRoute[]): ScannedPageRoute[] {
  const result: ScannedPageRoute[] = [];
  const visited = new Set<string>();

  // Build name → page map for quick lookup
  const byName = new Map<string, ScannedPageRoute>();
  for (const p of pages) {
    byName.set(p.name, p);
  }

  function visit(page: ScannedPageRoute) {
    if (visited.has(page.name)) return;
    visited.add(page.name);

    // If this is a reuse route, visit the target first
    if (page.isReuse && page.reuseTarget && byName.has(page.reuseTarget)) {
      visit(byName.get(page.reuseTarget)!);
    }

    result.push(page);
  }

  for (const p of pages) {
    visit(p);
  }

  return result;
}

export function createVuePagesVirtualModule(
  pages: ScannedPageRoute[],
  layouts: ScannedLayout[],
  notFoundPage?: ScannedPageRoute,
  loadingPage?: ScannedPageRoute,
  errorPage?: ScannedPageRoute
) {
  return defineVirtualModule('virtual:ubean-pages', () => {
    const pageLoaders: string[] = [];
    const layoutLoaders: string[] = [];
    const routeEntries: string[] = [];

    // Build a name → page index for resolving reuse targets. Reuse routes
    // reference another page's component via `reuseTarget`, so they must
    // reuse the target's loader instead of importing the `.reuse.ts` file
    // (which only contains `definePage` metadata, not a Vue component).
    const pageByName = new Map<string, ScannedPageRoute>();
    for (const p of pages) {
      pageByName.set(p.name, p);
    }

    // Sort pages so that reuse routes come AFTER their targets.
    // A reuse route generates `const Page_Reuse = Page_Target;` — if it
    // appears before the target's `const Page_Target = () => import(...)`,
    // JavaScript's temporal dead zone (TDZ) throws "Cannot access
    // 'Page_Target' before initialization". Topological sort ensures
    // targets are always declared first.
    const sortedPages = sortPagesByReuseDependency(pages);

    // Generate page loader variables for all pages (including slot pages).
    for (const p of sortedPages) {
      const varName = `Page_${p.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (p.isReuse && p.reuseTarget && pageByName.has(p.reuseTarget)) {
        // Reuse route: reference the target page's component loader instead
        // of importing the `.reuse.ts` file (which holds only route metadata).
        const targetVarName = `Page_${p.reuseTarget.replace(/[^a-zA-Z0-9]/g, '_')}`;
        pageLoaders.push(`const ${varName} = ${targetVarName};`);
      } else {
        pageLoaders.push(`const ${varName} = () => import(${JSON.stringify(p.fullPath)}).then(m => m.default || m);`);
      }
    }

    // Group parallel routes by route path so they can be registered as
    // Vue Router named views (`components: { default, slotName }`).
    // Pages without a slot are "default" views; pages with a slot populate
    // the corresponding named view. Intercepting routes (pages with
    // `interceptTarget`) are registered as separate routes with a distinct
    // name and intercept metadata in `meta`.
    const routeGroups = new Map<string, { default?: ScannedPageRoute; slots: Map<string, ScannedPageRoute> }>();
    const interceptPages: ScannedPageRoute[] = [];

    for (const p of sortedPages) {
      if (p.interceptTarget) {
        interceptPages.push(p);
        continue;
      }
      const routerPath = toVueRouterPath(p.route);
      let group = routeGroups.get(routerPath);
      if (!group) {
        group = { slots: new Map() };
        routeGroups.set(routerPath, group);
      }
      if (p.slot) {
        group.slots.set(p.slot, p);
      } else {
        // First non-slot page wins as the default view.
        if (!group.default) group.default = p;
      }
    }

    // Generate route entries for grouped (non-intercepting) routes.
    for (const [routerPath, group] of routeGroups) {
      const defaultPage = group.default;
      const slotPages = [...group.slots.values()];
      // Skip groups with no default and no slots (shouldn't happen).
      if (!defaultPage && slotPages.length === 0) continue;

      const primaryPage = defaultPage || slotPages[0];
      let layoutValue: string;
      if (primaryPage.layout === false) {
        layoutValue = 'false';
      } else if (Array.isArray(primaryPage.layout)) {
        layoutValue = primaryPage.layout.length > 0 ? JSON.stringify(primaryPage.layout) : 'undefined';
      } else if (typeof primaryPage.layout === 'string') {
        layoutValue = primaryPage.layout === 'default' ? 'undefined' : JSON.stringify(primaryPage.layout);
      } else {
        layoutValue = 'undefined';
      }
      const cacheValue = primaryPage.cache === true ? 'true' : 'undefined';

      if (slotPages.length > 0) {
        // Parallel route: use `components` (named views) instead of `component`.
        const componentParts: string[] = [];
        if (defaultPage) {
          componentParts.push(`default: Page_${defaultPage.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
        for (const sp of slotPages) {
          componentParts.push(`${JSON.stringify(sp.slot)}: Page_${sp.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
        routeEntries.push(
          `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(primaryPage.name)}, components: { ${componentParts.join(', ')} }, meta: { layout: ${layoutValue}, pageName: ${JSON.stringify(primaryPage.name)}, cache: ${cacheValue}, parallelSlots: ${JSON.stringify(slotPages.map(s => s.slot))} } }`
        );
      } else {
        // Regular route (no parallel slots).
        const varName = `Page_${defaultPage!.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        routeEntries.push(
          `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(defaultPage!.name)}, component: ${varName}, meta: { layout: ${layoutValue}, pageName: ${JSON.stringify(defaultPage!.name)}, cache: ${cacheValue} } }`
        );
      }
    }

    // Generate route entries for intercepting routes. These are registered
    // as separate routes with a `__intercept_` name prefix and intercept
    // metadata in `meta`, so the runtime can resolve them via navigation
    // guards (e.g., when navigating to `interceptTarget` from `interceptFrom`).
    for (const p of interceptPages) {
      const varName = `Page_${p.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const routerPath = toVueRouterPath(p.route);
      let layoutValue: string;
      if (p.layout === false) {
        layoutValue = 'false';
      } else if (Array.isArray(p.layout)) {
        layoutValue = p.layout.length > 0 ? JSON.stringify(p.layout) : 'undefined';
      } else if (typeof p.layout === 'string') {
        layoutValue = p.layout === 'default' ? 'undefined' : JSON.stringify(p.layout);
      } else {
        layoutValue = 'undefined';
      }
      const cacheValue = p.cache === true ? 'true' : 'undefined';
      const interceptName = `__intercept_${p.name}`;
      routeEntries.push(
        `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(interceptName)}, component: ${varName}, meta: { layout: ${layoutValue}, pageName: ${JSON.stringify(p.name)}, cache: ${cacheValue}, interceptFrom: ${JSON.stringify(p.interceptFrom)}, interceptTarget: ${JSON.stringify(p.interceptTarget)}, isIntercepting: true } }`
      );
    }

    // 404 catch-all route: when `pages/404.vue` is detected, register a
    // Vue Router catch-all `/:pathMatch(.*)*` so unmatched URLs render the
    // 404 component instead of a blank page. Works for both SPA navigation
    // and SSR (Vue Router matches the catch-all on the server too).
    let notFoundLoaderName = 'null';
    if (notFoundPage) {
      notFoundLoaderName = 'NotFoundPage';
      pageLoaders.push(
        `const ${notFoundLoaderName} = () => import(${JSON.stringify(notFoundPage.fullPath)}).then(m => m.default || m);`
      );
      routeEntries.push(
        `  { path: '/:pathMatch(.*)*', name: 'NotFound', component: ${notFoundLoaderName}, meta: { pageName: 'NotFound' } }`
      );
    }

    // Loading component: when `pages/loading.vue` is detected, export its
    // loader so `virtual:ubean-app` can pass it to `<Suspense>` as fallback.
    let loadingLoaderName = 'null';
    if (loadingPage) {
      loadingLoaderName = 'LoadingPage';
      pageLoaders.push(
        `const ${loadingLoaderName} = () => import(${JSON.stringify(loadingPage.fullPath)}).then(m => m.default || m);`
      );
    }

    // Error component: when `pages/error.vue` is detected, export its
    // loader so `virtual:ubean-app` can pass it to the ErrorBoundary.
    let errorLoaderName = 'null';
    if (errorPage) {
      errorLoaderName = 'ErrorPage';
      pageLoaders.push(
        `const ${errorLoaderName} = () => import(${JSON.stringify(errorPage.fullPath)}).then(m => m.default || m);`
      );
    }

    for (const l of layouts) {
      const varName = `Layout_${l.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      layoutLoaders.push(`const ${varName} = () => import(${JSON.stringify(l.fullPath)}).then(m => m.default || m);`);
    }

    const defaultLayout = layouts.find(l => l.isDefault);
    const defaultLayoutName = defaultLayout ? defaultLayout.name : 'null';

    // Build layout loader map
    const layoutLoaderMap = layouts
      .map(l => {
        const varName = `Layout_${l.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        return `  ${JSON.stringify(l.name)}: ${varName}`;
      })
      .join(',\n');

    return `${`
// Auto-generated by ubean - do not edit
/* eslint-disable */

${pageLoaders.join('\n')}
${layoutLoaders.join('\n')}

export const routes = [
${routeEntries.join(',\n')}
];

const _layoutLoaders = {
${layoutLoaderMap}
};

const _pageLoaders = {
${sortedPages.map(p => `  ${JSON.stringify(p.name)}: ${`Page_${p.name.replace(/[^a-zA-Z0-9]/g, '_')}`}`).join(',\n')}
};

export const pageNames = [${sortedPages.map(p => JSON.stringify(p.name)).join(', ')}] as const;
export const layoutNames = [${layouts.map(l => JSON.stringify(l.name)).join(', ')}] as const;
export const defaultLayout = ${defaultLayoutName === 'null' ? 'null' : JSON.stringify(defaultLayoutName)} as const;

export type RouteName = (typeof pageNames)[number];
export type LayoutName = (typeof layoutNames)[number];

export function resolvePageComponent(name) {
  const loader = _pageLoaders[name];
  if (!loader) {
    return Promise.reject(new Error('[ubean] Page component not found: ' + name));
  }
  return loader();
}

export function resolveLayoutComponent(name) {
  if (!name) return Promise.resolve(null);
  const loader = _layoutLoaders[name];
  if (!loader) {
    return Promise.resolve(null);
  }
  return loader();
}

export function resolveLoadingComponent() {
  ${loadingLoaderName === 'null' ? 'return Promise.resolve(null);' : `return ${loadingLoaderName}();`}
}

export function resolveErrorComponent() {
  ${errorLoaderName === 'null' ? 'return Promise.resolve(null);' : `return ${errorLoaderName}();`}
}

export function hasNotFoundPage() {
  return ${notFoundLoaderName !== 'null'};
}

export function hasErrorPage() {
  return ${errorLoaderName !== 'null'};
}

export const pages = {
${pages.map(p => `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, route: ${JSON.stringify(p.route)}, path: ${JSON.stringify(p.path)}, layout: ${JSON.stringify(p.layout)}, isReuse: ${p.isReuse}, reuseTarget: ${JSON.stringify(p.reuseTarget)} }`).join(',\n')}
};

export const layouts = {
${layouts.map(l => `  ${JSON.stringify(l.name)}: { name: ${JSON.stringify(l.name)}, isDefault: ${l.isDefault} }`).join(',\n')}
};

export default {
  routes,
  pageNames,
  layoutNames,
  defaultLayout,
  resolvePageComponent,
  resolveLayoutComponent,
  resolveLoadingComponent,
  resolveErrorComponent,
  hasNotFoundPage,
  hasErrorPage,
  pages,
  layouts
};
`.trim()}\n`;
  });
}

const EMPTY_APP_ENTRY: ScannedAppEntry = {
  shared: { exists: false },
  server: { exists: false },
  client: { exists: false }
};

export function createVueAppEntryVirtualModule(appEntry: ScannedAppEntry = EMPTY_APP_ENTRY) {
  return defineVirtualModule('virtual:ubean-app', () => {
    const hasSharedApp = appEntry.shared.exists;
    const hasServerApp = appEntry.server.exists;
    const hasClientApp = appEntry.client.exists;

    const sharedImport = hasSharedApp
      ? `import _sharedApp from ${JSON.stringify(appEntry.shared.fullPath)};`
      : 'const _sharedApp = null;';
    const serverImport = hasServerApp
      ? `import _serverApp from ${JSON.stringify(appEntry.server.fullPath)};`
      : 'const _serverApp = null;';
    const clientImport = hasClientApp
      ? `import _clientApp from ${JSON.stringify(appEntry.client.fullPath)};`
      : 'const _clientApp = null;';

    return `${`
// Auto-generated by ubean - do not edit
/* eslint-disable */
${sharedImport}
${serverImport}
${clientImport}

import {
  createUbeanApp,
  createUbeanSSRApp,
  usePage,
  useRouter,
  useHead,
  useSeoMeta,
  Link,
  Head,
  getInitialPageData,
  getInitialState,
  defineApp,
  applyAppConfig,
  createDefaultAppConfig,
  createClientHead,
  createServerHead,
  hydrateIslands
} from 'ubean/runtime/vue';

export {
  createUbeanApp,
  createUbeanSSRApp,
  usePage,
  useRouter,
  useHead,
  useSeoMeta,
  Link,
  Head,
  getInitialPageData,
  getInitialState,
  defineApp,
  applyAppConfig,
  createDefaultAppConfig
};

import {
  routes,
  resolvePageComponent,
  resolveLayoutComponent,
  defaultLayout,
  pageNames,
  layoutNames,
  resolveLoadingComponent,
  resolveErrorComponent,
  hasNotFoundPage,
  hasErrorPage
} from 'virtual:ubean-pages';

export {
  routes,
  resolvePageComponent,
  resolveLayoutComponent,
  defaultLayout,
  pageNames,
  layoutNames,
  resolveLoadingComponent,
  resolveErrorComponent,
  hasNotFoundPage,
  hasErrorPage
};

function _mergeAppConfig(base, ...configs) {
  const result = { ...base };
  for (const cfg of configs) {
    if (!cfg) continue;
    if (cfg.plugins) result.plugins = [...(result.plugins || []), ...cfg.plugins];
    if (cfg.globalComponents) result.globalComponents = { ...(result.globalComponents || {}), ...cfg.globalComponents };
    if (cfg.provides) result.provides = { ...(result.provides || {}), ...cfg.provides };
    if (cfg.head) result.head = { ...(result.head || {}), ...cfg.head };
    if (cfg.rootId) result.rootId = cfg.rootId;
    if (cfg.rootAttrs) result.rootAttrs = { ...(result.rootAttrs || {}), ...cfg.rootAttrs };
    if (cfg.onAppCreated) result.onAppCreated = cfg.onAppCreated;
    if (cfg.onClientReady) result.onClientReady = cfg.onClientReady;
    if (cfg.errorComponent) result.errorComponent = cfg.errorComponent;
    if (cfg.loadingComponent) result.loadingComponent = cfg.loadingComponent;
    if (cfg.viewTransitions !== undefined) result.viewTransitions = cfg.viewTransitions;
    if (cfg.serializeState) result.serializeState = cfg.serializeState;
    if (cfg.hydrateState) result.hydrateState = cfg.hydrateState;
  }
  // router.setup:累加语义 — shared 和 client/server 各自定义的 setup 都会执行
  // (顺序:shared 先,client/server 后)。这样 shared 可放通用守卫(如埋点),
  // client/server 可放环境专用守卫(如 SSR 鉴权)。
  const setups = [];
  for (const cfg of [base, ...configs]) {
    if (cfg?.router?.setup) setups.push(cfg.router.setup);
  }
  if (setups.length === 1) {
    result.router = { setup: setups[0] };
  } else if (setups.length > 1) {
    result.router = {
      setup: (router) => {
        for (const s of setups) s(router);
      }
    };
  }
  return result;
}

export function resolveAppConfig(mode) {
  const base = createDefaultAppConfig();
  if (!_sharedApp && !_serverApp && !_clientApp) return base;

  const sharedCfg = typeof _sharedApp === 'function' ? _sharedApp() : _sharedApp;
  const serverCfg = mode === 'server' && _serverApp ? (typeof _serverApp === 'function' ? _serverApp() : _serverApp) : null;
  const clientCfg = mode === 'client' && _clientApp ? (typeof _clientApp === 'function' ? _clientApp() : _clientApp) : null;

  const merged = _mergeAppConfig(base, sharedCfg, mode === 'server' ? serverCfg : clientCfg);

  // onAppCreated: shared config is the default; server/client-specific overrides it if present.
  if (sharedCfg?.onAppCreated) merged.onAppCreated = sharedCfg.onAppCreated;
  if (mode === 'client' && clientCfg?.onClientReady) merged.onClientReady = clientCfg.onClientReady;
  else if (mode === 'server' && serverCfg?.onAppCreated) merged.onAppCreated = serverCfg.onAppCreated;

  return merged;
}

export function createApp() {
  const config = resolveAppConfig('client');
  const head = createClientHead();

  // Push global app head (from defineApp) as defaults before any page-level head.
  if (config.head) {
    const headInput = {};
    if (config.head.title) headInput.title = config.head.title;
    if (config.head.htmlAttrs) headInput.htmlAttrs = config.head.htmlAttrs;
    if (config.head.bodyAttrs) headInput.bodyAttrs = config.head.bodyAttrs;
    if (config.head.meta) headInput.meta = config.head.meta;
    if (config.head.link) headInput.link = config.head.link;
    if (config.head.script) headInput.script = config.head.script;
    head.push(headInput);
  }

  // Resolve the auto-detected loading component from pages/loading.vue.
  // defineApp({ loadingComponent }) takes priority over the auto-detected file.
  const _autoLoadingComponent = resolveLoadingComponent();
  const loadingComponent = config.loadingComponent || (_autoLoadingComponent ? () => _autoLoadingComponent : undefined);

  // Resolve the auto-detected error component from pages/error.vue.
  // defineApp({ errorComponent }) takes priority over the auto-detected file.
  const _autoErrorComponent = resolveErrorComponent();
  const errorComponent = config.errorComponent || (_autoErrorComponent ? () => _autoErrorComponent : undefined);

  const initialPage = getInitialPageData();
  const instance = createUbeanApp({
    routes,
    resolveLayoutComponent,
    defaultLayout,
    head,
    viewTransitions: config.viewTransitions,
    initialPage: initialPage || undefined,
    hydrate: !!initialPage,
    routerSetup: config.router?.setup,
    loadingComponent,
    errorComponent
  });

  applyAppConfig(instance.app, config, 'client');

  if (config.onAppCreated) config.onAppCreated(instance.app);

  // SSR 状态水合:在 applyAppConfig(注册插件)之后、mount 之前调用。
  // getInitialState() 从 DOM 的 __UBEAN_STATE__ script 读取服务端
  // serializeState 产生的状态对象(如 Pinia 的 state)。
  // 必须在 mount 前执行,否则 store 已初始化为默认值,水合无效。
  if (config.hydrateState) {
    const state = getInitialState();
    config.hydrateState(instance.app, state);
  }

  const mountApp = () => {
    instance.app.mount('#' + (config.rootId || 'app'));
    if (config.onClientReady) {
      config.onClientReady(instance.app);
    }
    // 自动水合 Islands:使用双重 requestAnimationFrame 确保 Vue 的渲染
    // 循环（含异步组件解析和 router.isReady 后的 patch）完全结束后再水合,
    // 避免 Vue re-render 覆盖已水合的 island 内容。
    // 用户无需在 onClientReady 中手动调用 hydrateIslands。
    var doHydrateIslands = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          hydrateIslands({ appContext: instance.app });
        });
      });
    };
    doHydrateIslands();
    // SPA 导航后也需要水合新页面中的 islands(router.afterEach 在每次导航完成后触发)
    instance.router.afterEach(function () {
      doHydrateIslands();
    });
  };

  // When hydrating SSR content, must wait for router to be ready before mounting,
  // otherwise RouterView has no matched route and causes hydration mismatch.
  if (initialPage) {
    instance.router.isReady().then(mountApp);
  } else {
    mountApp();
  }

  return instance;
}

export function createSSRApp(initialPage) {
  const config = resolveAppConfig('server');
  const head = createServerHead();

  // SSR doesn't need Suspense fallback (server resolves async synchronously),
  // but we still pass it for consistency.
  const _autoLoadingComponent = resolveLoadingComponent();
  const loadingComponent = config.loadingComponent || (_autoLoadingComponent ? () => _autoLoadingComponent : undefined);

  const _autoErrorComponent = resolveErrorComponent();
  const errorComponent = config.errorComponent || (_autoErrorComponent ? () => _autoErrorComponent : undefined);

  const { app, router } = createUbeanSSRApp(initialPage, {
    routes,
    resolveLayoutComponent,
    defaultLayout,
    head,
    routerSetup: config.router?.setup,
    loadingComponent,
    errorComponent
  });

  applyAppConfig(app, config, 'server');

  if (config.onAppCreated) config.onAppCreated(app);

  return { app, router, head, config };
}

export const rootId = 'app';
`.trim()}\n`;
  });
}

export function createClientEntryVirtualModule() {
  return defineVirtualModule('virtual:ubean-client-entry', () => {
    const cssImports = getCssImports();
    const cssLines = cssImports.map((css: string) => `import ${JSON.stringify(css)};`).join('\n');
    return `${`
// Auto-generated by ubean client entry - do not edit
/* eslint-disable */
${cssLines}
import { createApp } from 'virtual:ubean-app';

createApp();
`.trim()}\n`;
  });
}

const EMPTY_SERVER_ENTRY: ScannedServerEntry = {
  shared: { exists: false },
  dev: { exists: false },
  prod: { exists: false }
};

export function createServerEntryVirtualModule(serverEntry: ScannedServerEntry = EMPTY_SERVER_ENTRY) {
  return defineVirtualModule('virtual:ubean-server', () => {
    const hasShared = serverEntry.shared.exists;
    const hasDev = serverEntry.dev.exists;
    const hasProd = serverEntry.prod.exists;

    const sharedImport = hasShared
      ? `import _sharedServer from ${JSON.stringify(serverEntry.shared.fullPath)};`
      : 'const _sharedServer = null;';
    const devImport = hasDev
      ? `import _devServer from ${JSON.stringify(serverEntry.dev.fullPath)};`
      : 'const _devServer = null;';
    const prodImport = hasProd
      ? `import _prodServer from ${JSON.stringify(serverEntry.prod.fullPath)};`
      : 'const _prodServer = null;';

    return `${`
// Auto-generated by ubean server entry - do not edit
/* eslint-disable */
${sharedImport}
${devImport}
${prodImport}

import {
  defineServer,
  createDefaultServerConfig,
  mergeServerConfigs
} from 'ubean/runtime/app';

export {
  defineServer,
  createDefaultServerConfig,
  mergeServerConfigs
};

/**
 * Resolve the user's server config for the given mode ('dev' | 'prod').
 * Merges shared config with mode-specific config. Returns an empty
 * config when no server entry file exists.
 */
export function resolveServerConfig(mode) {
  const base = createDefaultServerConfig();

  if (!_sharedServer && !_devServer && !_prodServer) return base;

  const sharedCfg = typeof _sharedServer === 'function' ? _sharedServer() : _sharedServer;
  const modeCfg = mode === 'dev'
    ? (typeof _devServer === 'function' ? _devServer() : _devServer)
    : (typeof _prodServer === 'function' ? _prodServer() : _prodServer);

  return mergeServerConfigs(base, sharedCfg, modeCfg);
}
`.trim()}\n`;
  });
}
