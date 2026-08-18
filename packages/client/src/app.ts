/**
 * Framework app factories — consumed by the ubean aggregator & `@ubean/ssr`.
 *
 * `createUbeanClientApp` / `createUbeanSSRApp` wire the lean kernel from
 * `@ubean/vue` together with framework extras: unhead, i18n path
 * localization, layout-chain resolution, islands directive, and
 * SSR/hydration semantics.
 */
import {
  createApp as _createApp,
  createSSRApp as _createSSRApp,
  defineComponent,
  h,
  reactive,
  provide,
  markRaw,
  watchEffect,
  shallowRef
} from 'vue';
import type { App, Component, ConcreteComponent } from 'vue';
import type { RouteRecordRaw } from 'vue-router';
import { useRoute } from 'vue-router';
import { vClient } from '@ubean/islands/directive';
import type { PageObject } from '@ubean/pages';
// Lean kernel (single source of truth lives in @ubean/vue)
import {
  PageView,
  SlotView,
  Link,
  LayoutChainRenderer,
  PAGE_KEY,
  TRANSITION_KEY,
  SSR_KEY,
  LOADING_KEY,
  ERROR_KEY,
  LOCALIZE_PATH_KEY,
  useViewTransition,
  ubeanVue,
  initCachedViewsFromRoutes
} from '@ubean/vue';
import type { ViewTransitionOptions } from '@ubean/vue';
import { useHead as useUnheadHead } from '@unhead/vue';
import type { VueHeadClient } from '@unhead/vue';
import { Head as UnheadHeadComponent } from '@unhead/vue/components';
import { localizePath, initClientI18n } from './i18n';
// Framework router factory (the lean kernel ships no factory — see ./router.ts)
import { createUbeanRouter } from './router';

// Re-export the lean surface for framework consumers of this subpath.
// `usePage`(路由感知版)与 `useRouter`(vue-router 纯 re-export)见下方。
export { PageView, SlotView, Link, ubeanVue, useViewTransition };
export { usePage } from './use-page';
export type { UbeanVuePage } from './use-page';
export { useRouter } from 'vue-router';
export {
  PAGE_KEY,
  TRANSITION_KEY,
  SSR_KEY,
  LOADING_KEY,
  ERROR_KEY,
  LAYOUT_CHAIN_KEY,
  LOCALIZE_PATH_KEY
} from '@ubean/vue';
export type { UbeanVueOptions, LayoutChainContext } from '@ubean/vue';
export { LayoutChainRenderer } from '@ubean/vue';
// no-op macros (stripped by the framework's build plugin)
export { definePage, defineMeta, defineMiddleware } from './page-macro';
// Framework router factory (own implementation — the lean kernel ships none)
export { createUbeanRouter } from './router';
export type { CreateUbeanRouterOptions } from './router';

export type { VueHeadClient };

export interface UbeanAppOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  initialPage?: PageObject;
  head?: VueHeadClient;
  viewTransitions?: boolean | ViewTransitionOptions;
  hydrate?: boolean;
  /**
   * 在 router 实例创建后、`app.use(router)` 之前调用,
   * 用于注册 vue-router 的导航守卫(`beforeEach` / `beforeResolve` / `afterEach`)。
   *
   * Client 和 SSR 都会执行。守卫注册必须同步完成(守卫本身可返回 Promise)。
   */
  routerSetup?: (router: ReturnType<typeof createUbeanRouter>) => void;
  /**
   * 页面加载时的 fallback 组件,在 SPA 导航懒加载页面组件期间显示。
   * 来源:`pages/loading.vue` 自动检测 或 `defineApp({ loadingComponent })` 显式配置。
   * 优先级:`defineApp({ loadingComponent })` > `pages/loading.vue`
   */
  loadingComponent?: Component | (() => Component);
  /**
   * 渲染错误兜底组件,当页面组件渲染、异步解析或 setup 抛出错误时显示。
   * 来源:`pages/error.vue` 自动检测 或 `defineApp({ errorComponent })` 显式配置。
   * 优先级:`defineApp({ errorComponent })` > `pages/error.vue`
   * 通过 Vue 的 `errorCaptured` 生命周期实现错误边界。
   */
  errorComponent?: Component | (() => Component);
}

export interface UbeanAppInstance {
  app: App;
  router: ReturnType<typeof createUbeanRouter>;
  head: VueHeadClient;
  page: PageObject;
}

/**
 * Normalize the `layout` route meta field into an array of layout names
 * (outer → inner). Handles `string`, `string[]`, `false`, and `undefined`
 * (falls back to `defaultLayout`). The `'default'` name is filtered out
 * because the default layout is applied implicitly when no layout is specified.
 */
function normalizeLayoutNames(layout: string | string[] | false | undefined, defaultLayout: string | null): string[] {
  if (layout === false || layout == null) {
    return layout === false ? [] : defaultLayout ? [defaultLayout] : [];
  }
  if (Array.isArray(layout)) {
    // 'default' inside an array is a literal layout name (refers to
    // `layouts/default.vue`), not the special "use default" directive.
    return layout.filter(n => typeof n === 'string');
  }
  if (layout === 'default') {
    return defaultLayout ? [defaultLayout] : [];
  }
  return [layout];
}

function createLayoutWrapper(
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>,
  defaultLayout: string | null
) {
  const layoutCache = new Map<string, Component | null>();
  const layoutComps = shallowRef<Array<Component | null>>([]);

  async function loadLayout(name: string): Promise<Component | null> {
    if (layoutCache.has(name)) return layoutCache.get(name)!;
    const comp = await resolveLayoutComponent(name);
    const raw = comp ? markRaw(comp) : null;
    layoutCache.set(name, raw);
    return raw;
  }

  return defineComponent({
    name: 'UbeanLayoutView',
    setup() {
      const route = useRoute();

      watchEffect(async () => {
        const layoutField = route.meta.layout as string | string[] | false | undefined;
        const resolved = layoutField === undefined ? (defaultLayout ?? undefined) : layoutField;
        const names = normalizeLayoutNames(resolved, defaultLayout);
        if (names.length === 0) {
          layoutComps.value = [];
          return;
        }
        const comps = await Promise.all(names.map(n => loadLayout(n)));
        layoutComps.value = comps;
      });

      return () => {
        const comps = layoutComps.value;
        if (comps.length === 0) {
          // No layout: render PageView directly so pages still render.
          return h(PageView);
        }
        // Render the layout chain starting at depth 0.
        return h(LayoutChainRenderer, { components: comps, depth: 0 });
      };
    }
  });
}

/**
 * Resolve a component from either a direct `Component` or a
 * function returning a `Component` (lazy resolver from auto-detection
 * like `resolveLoadingComponent()` / `resolveErrorComponent()`).
 * Returns `null` if no component is configured.
 */
function resolveComp(comp?: Component | (() => Component)): Component | null {
  if (!comp) return null;
  if (typeof comp === 'function' && !(comp as any).render && !(comp as any).setup) {
    // It's a factory function (() => Component), call it to get the actual component
    try {
      const resolved = (comp as () => Component)();
      return resolved ? markRaw(resolved as ConcreteComponent) : null;
    } catch {
      return null;
    }
  }
  return markRaw(comp as ConcreteComponent);
}

function createRootComponent(
  LayoutWrapper: Component,
  page: PageObject,
  transitionOpts: ViewTransitionOptions,
  isSSR: boolean,
  loadingComponent?: Component | null,
  errorComponent?: Component | null
) {
  return defineComponent({
    name: isSSR ? 'UbeanSSRApp' : 'UbeanAppRoot',
    setup() {
      provide(PAGE_KEY, page);
      provide(TRANSITION_KEY, transitionOpts);
      provide(SSR_KEY, isSSR);
      provide(LOADING_KEY, loadingComponent ?? null);
      provide(ERROR_KEY, errorComponent ?? null);
      // i18n bridge: `@ubean/vue`'s Link localizes internal paths through
      // this hook. `localizePath` (./i18n) tracks `localeRef`, so Links
      // re-render on locale switches. Lean `@ubean/vue` SPAs never load this.
      provide(LOCALIZE_PATH_KEY, (path: string) => localizePath(path));

      return () => h(LayoutWrapper);
    }
  });
}

export function createUbeanClientApp(options: UbeanAppOptions): UbeanAppInstance {
  if (!options.head) {
    throw new Error('[ubean] createUbeanClientApp requires a head instance from @unhead/vue/client');
  }

  // Hydrate SSR-injected locale data (idempotent, no-op without DOM data)
  // before any component renders — moved out of module-load side effects.
  initClientI18n();

  const initial =
    options.initialPage ||
    ({
      component: '',
      props: {},
      params: {},
      url: '/'
    } as PageObject);

  const head = options.head;
  const transitionOpts: ViewTransitionOptions =
    options.viewTransitions === false
      ? { enabled: false }
      : options.viewTransitions === true || options.viewTransitions == null
        ? { enabled: true }
        : options.viewTransitions;

  const page = reactive<PageObject>({ ...initial }) as PageObject;

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: false,
    setup: options.routerSetup
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  // Seed the keep-alive include list from routes that declared
  // `definePage({ cache: true })`. Runtime toggling via
  // `enablePageCache` / `disablePageCache` is still possible afterwards.
  initCachedViewsFromRoutes(options.routes as Array<{ name?: string | symbol; meta?: { cache?: boolean } }>);

  const RootComponent = createRootComponent(
    LayoutWrapper,
    page,
    transitionOpts,
    false,
    resolveComp(options.loadingComponent),
    resolveComp(options.errorComponent)
  );

  const app = options.hydrate ? _createSSRApp(RootComponent) : _createApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.component('PageView', PageView);
  app.component('SlotView', SlotView);
  app.directive('client', vClient);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head, page };
}

export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>) {
  if (!options.head) {
    throw new Error('[ubean] createUbeanSSRApp requires a head instance from @unhead/vue/server');
  }

  // Register SSR-injected locales before rendering so `availableLocales`
  // matches what the client will register during hydration.
  initClientI18n();

  const head = options.head;
  const page = reactive<PageObject>({ ...initialPage });

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: true,
    initialUrl: initialPage.url,
    setup: options.routerSetup
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  // Seed the keep-alive include list on SSR too, so the server-rendered
  // cachedViews list matches the client's initial state. Without this,
  // pages that declared `definePage({ cache: true })` render "(empty)" on
  // the server but the route name on the client → hydration text mismatch.
  initCachedViewsFromRoutes(options.routes as Array<{ name?: string | symbol; meta?: { cache?: boolean } }>);

  const RootComponent = createRootComponent(
    LayoutWrapper,
    page,
    { enabled: false },
    true,
    resolveComp(options.loadingComponent),
    resolveComp(options.errorComponent)
  );

  const app = _createSSRApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.component('PageView', PageView);
  app.component('SlotView', SlotView);
  app.directive('client', vClient);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head };
}

export const Head = UnheadHeadComponent;
export { useUnheadHead as useHead };
export { useSeoMeta } from '@unhead/vue';
