import {
  createApp as _createApp,
  createSSRApp as _createSSRApp,
  defineComponent,
  h,
  KeepAlive,
  Transition,
  ref,
  reactive,
  provide,
  inject,
  markRaw,
  watchEffect,
  computed,
  shallowRef
} from 'vue';
import type { App, Component, ConcreteComponent, InjectionKey, PropType, VNode } from 'vue';
import { RouterView, RouterLink, useRoute, useRouter as useVueRouter } from 'vue-router';
import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router';
import { useHead as useUnheadHead } from '@unhead/vue';
import type { VueHeadClient } from '@unhead/vue';
import { Head as UnheadHeadComponent } from '@unhead/vue/components';
import type { PageObject } from '../pages/protocol';
import { localizePath } from './i18n';
import { createUbeanRouter } from './router';
import { useCacheViews, initCachedViewsFromRoutes } from './cache-views';
import { usePageTransition, useReloadSignal } from './page-runtime';
import { supportsViewTransitions } from './view-transitions';
import type { ViewTransitionOptions } from './view-transitions';

const PAGE_KEY = Symbol('ubean-page');
const TRANSITION_KEY = Symbol('ubean-transition');
const SSR_KEY: InjectionKey<boolean> = Symbol('ubean-ssr');

export type { VueHeadClient };

export interface UbeanAppOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  initialPage?: PageObject;
  head?: VueHeadClient;
  viewTransitions?: boolean | ViewTransitionOptions;
  hydrate?: boolean;
}

export interface UbeanAppInstance {
  app: App;
  router: ReturnType<typeof createUbeanRouter>;
  head: VueHeadClient;
  page: PageObject;
}

function createLayoutWrapper(
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>,
  defaultLayout: string | null
) {
  const layoutCache = new Map<string, Component | null>();
  const layoutComp = shallowRef<Component | null>(null);
  const currentLayoutName = ref<string | false | null>(null);

  async function loadLayout(name: string | false | null | undefined) {
    const resolved = name === undefined ? defaultLayout : name;
    if (resolved === false || resolved == null) {
      layoutComp.value = null;
      return;
    }
    if (layoutCache.has(resolved)) {
      layoutComp.value = layoutCache.get(resolved) || null;
      return;
    }
    const comp = await resolveLayoutComponent(resolved);
    if (comp) {
      const raw = markRaw(comp);
      layoutCache.set(resolved, raw);
      layoutComp.value = raw;
    } else {
      layoutCache.set(resolved, null);
      layoutComp.value = null;
    }
  }

  return defineComponent({
    name: 'UbeanLayoutView',
    setup() {
      const route = useRoute();

      watchEffect(() => {
        const layoutName = route.meta.layout as string | false | undefined;
        if (layoutName !== currentLayoutName.value) {
          currentLayoutName.value = layoutName === undefined ? defaultLayout : layoutName;
          loadLayout(currentLayoutName.value);
        }
      });

      return () => {
        // Render the layout component directly. The layout is expected to
        // contain a `<PageView />` (or `<RouterView />`) inside its template
        // to render the matched page. This follows vue-router's guidance:
        // layouts use RouterView, not slot injection, so keep-alive can wrap
        // the RouterView cleanly without the v-slot closure issues.
        if (!layoutComp.value) {
          // No layout: render PageView directly so pages still render.
          return h(PageView);
        }
        return h(layoutComp.value as ConcreteComponent);
      };
    }
  });
}

/**
 * PageView — a globally-registered component that renders the matched route
 * page, wrapped with `<Transition>` and `<KeepAlive>`.
 *
 * Layouts use `<PageView />` (instead of `<slot />`) to render the matched
 * page. This follows vue-router's v-slot pattern, mirroring soybean-unify's
 * `layouts/modules/layout-content/index.vue`:
 *
 * ```html
 * <RouterView v-slot="{ Component, route }">
 *   <Transition :name="pageAnimateMode" mode="out-in">
 *     <KeepAlive :include="cachedRoutes" :exclude="excludeCachedRoutes">
 *       <component :is="Component" v-if="reloadSignal" :key="tabId" />
 *     </KeepAlive>
 *   </Transition>
 * </RouterView>
 * ```
 *
 * In ubean, the equivalents are:
 *   - `pageAnimateMode` → global `usePageTransition()` ref + `transition` prop + `route.meta.transition`
 *   - `cachedRoutes` / `excludeCachedRoutes` → `useCacheViews().cachedViews` / `excludedViews`
 *   - `reloadSignal` → `useReloadSignal().counter` (incremented by `reloadPage()`)
 *   - `tabId` → `reloadKey` prop + reload counter (forces remount when changed)
 *
 * Props:
 * - `transition`: transition name (string) or `false` to disable.
 *   Priority: prop > `route.meta.transition` > global `usePageTransition()`.
 * - `reloadKey`: a reactive key — changing it forces remount (reload).
 *   When omitted, falls back to `route.fullPath` + global reload counter.
 * - `mode`: Vue `<Transition>` mode. Defaults to `'out-in'`.
 *
 * On SSR, KeepAlive and Transition are skipped (client-only concepts).
 */
export const PageView = defineComponent({
  name: 'PageView',
  props: {
    transition: { type: [String, Boolean], default: undefined },
    reloadKey: { type: [String, Number], default: undefined },
    mode: { type: String as PropType<'out-in' | 'in-out' | 'default'>, default: 'out-in' }
  },
  setup(props) {
    const { cachedViews, excludedViews } = useCacheViews();
    const globalTransition = usePageTransition();
    const { counter: reloadCounter } = useReloadSignal();
    const ssr = inject(SSR_KEY, false);

    return () => {
      return h(RouterView, null, {
        default: ({ Component, route }: { Component: VNode | null; route: any }) => {
          if (!Component) return null;

          // SSR: render the matched component VNode directly (no keep-alive / transition).
          if (ssr) return Component;

          // Extract the component object from the VNode. RouterView passes
          // `Component` as `h(ViewComponent, props)` — a VNode whose `.type`
          // is the actual component object. We use that to create a fresh
          // VNode so keep-alive can cache by component identity.
          const comp = Component.type as ConcreteComponent;
          const componentProps = Component.props || {};

          // Resolve the render key. When `reloadKey` is provided explicitly,
          // use it verbatim. Otherwise, derive a key from the route's full
          // path combined with the global reload counter — bumping the
          // counter (via `reloadPage()`) forces a remount of the current
          // page, mirroring soybean-unify's `:key="tabStore.getTabIdByRoute(route)"`
          // + `v-if="appStore.reloadSignal"` pattern.

          // Determine transition name:
          //   1. `transition` prop === false → disabled (no transition)
          //   2. `transition` prop (string) → use as-is
          //   3. `route.meta.transition` → use as-is
          //   4. global `usePageTransition()` ref → use as-is
          //   5. otherwise → no transition
          const routeTransition = route.meta?.transition as string | undefined;
          const transitionName =
            props.transition === false
              ? undefined
              : (props.transition as string) || routeTransition || globalTransition.name.value || undefined;

          // Build the inner VNode: <component :is="comp" :key="key" />
          // Use separate consts for each layer so the slot closures capture
          // the correct VNode (not a re-assigned variable). This prevents
          // the infinite-recursion bug where a slot returns its own wrapper.
          const pageVNode = h(comp, {
            ...componentProps,
            key: props.reloadKey ?? `${route.fullPath}#${reloadCounter.value}`
          });

          // <KeepAlive :include="cachedViews" :exclude="excludedViews"><component /></KeepAlive>
          // Pass both include and exclude so runtime toggling works in both
          // directions (enablePageCache/disablePageCache + excludePageCache/includePageCache).
          const keepAliveProps: { include: string[]; exclude?: string[] } = {
            include: cachedViews.value
          };
          if (excludedViews.value.length > 0) {
            keepAliveProps.exclude = excludedViews.value;
          }
          const keepAliveVNode: VNode = h(KeepAlive, keepAliveProps, {
            default: () => pageVNode
          });

          // <Transition :name="..." mode="out-in"><KeepAlive>...</KeepAlive></Transition>
          if (transitionName) {
            return h(
              Transition,
              { name: transitionName, mode: props.mode },
              {
                default: () => keepAliveVNode
              }
            );
          }

          return keepAliveVNode;
        }
      });
    };
  }
});

export const Link = defineComponent({
  name: 'Link',
  props: {
    to: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    href: { type: String, default: undefined },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    activeClass: { type: String, default: 'router-link-active' },
    exactActiveClass: { type: String, default: 'router-link-exact-active' },
    noActiveClass: { type: Boolean, default: false }
  },
  setup(props, { slots, attrs }) {
    const resolvedTo = computed(() => {
      const path = props.to ?? props.href ?? '';
      if (typeof path === 'string' && (path.startsWith('http') || path.startsWith('//') || path.startsWith('#'))) {
        return path;
      }
      return localizePath(path as string);
    });

    const isExternal = computed(() => {
      const path = String(resolvedTo.value);
      return path.startsWith('http') || path.startsWith('//') || path.startsWith('#');
    });

    return () => {
      if (isExternal.value) {
        return h(
          'a',
          {
            ...attrs,
            href: resolvedTo.value,
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          slots.default ? slots.default() : undefined
        );
      }

      return h(
        RouterLink,
        {
          ...attrs,
          to: resolvedTo.value as RouteLocationRaw,
          replace: props.replace,
          activeClass: props.noActiveClass ? '' : props.activeClass,
          exactActiveClass: props.noActiveClass ? '' : props.exactActiveClass
        },
        slots.default
      );
    };
  }
});

export const Head = UnheadHeadComponent;

function createRootComponent(
  LayoutWrapper: Component,
  page: PageObject,
  transitionOpts: ViewTransitionOptions,
  isSSR: boolean
) {
  return defineComponent({
    name: isSSR ? 'UbeanSSRApp' : 'UbeanAppRoot',
    setup() {
      provide(PAGE_KEY, page);
      provide(TRANSITION_KEY, transitionOpts);
      provide(SSR_KEY, isSSR);

      return () => h(LayoutWrapper);
    }
  });
}

export function createUbeanApp(options: UbeanAppOptions): UbeanAppInstance {
  if (!options.head) {
    throw new Error('[ubean] createUbeanApp requires a head instance from @unhead/vue/client');
  }

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
    ssr: false
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  // Seed the keep-alive include list from routes that declared
  // `definePage({ cache: true })`. Runtime toggling via
  // `enablePageCache` / `disablePageCache` is still possible afterwards.
  initCachedViewsFromRoutes(options.routes as Array<{ name?: string | symbol; meta?: { cache?: boolean } }>);

  const RootComponent = createRootComponent(LayoutWrapper, page, transitionOpts, false);

  const app = options.hydrate ? _createSSRApp(RootComponent) : _createApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.component('PageView', PageView);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head, page };
}

export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>) {
  if (!options.head) {
    throw new Error('[ubean] createUbeanSSRApp requires a head instance from @unhead/vue/server');
  }

  const head = options.head;
  const page = reactive<PageObject>({ ...initialPage });

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: true,
    initialUrl: initialPage.url
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  // Seed the keep-alive include list on SSR too, so the server-rendered
  // cachedViews list matches the client's initial state. Without this,
  // pages that declared `definePage({ cache: true })` render "(empty)" on
  // the server but the route name on the client → hydration text mismatch.
  initCachedViewsFromRoutes(options.routes as Array<{ name?: string | symbol; meta?: { cache?: boolean } }>);

  const RootComponent = createRootComponent(LayoutWrapper, page, { enabled: false }, true);

  const app = _createSSRApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.component('PageView', PageView);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head };
}

export function usePage<T = Record<string, unknown>>(): PageObject<T> {
  const route = useRoute();
  const pageData = inject<PageObject | null>(PAGE_KEY, null);

  return reactive({
    url: computed(() => route.fullPath),
    params: computed(() => route.params),
    query: computed(() => route.query),
    meta: computed(() => route.meta),
    props: computed(() => pageData?.props || {}),
    component: computed(() => route.meta.pageName || pageData?.component || ''),
    errors: computed(() => pageData?.errors || null)
  }) as unknown as PageObject<T>;
}

export interface UbeanRouter {
  push: (url: string, opts?: { replace?: boolean }) => Promise<unknown>;
  replace: (url: string) => Promise<unknown>;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  readonly current: ReturnType<typeof useVueRouter>['currentRoute']['value'];
  readonly navigating: boolean;
  [key: string]: unknown;
}

export function useRouter(): UbeanRouter {
  const router = useVueRouter();
  return {
    ...router,
    push: (url: string, opts?: { replace?: boolean }) => (opts?.replace ? router.replace(url) : router.push(url)),
    replace: (url: string) => router.replace(url),
    back: () => router.back(),
    forward: () => router.forward(),
    refresh: () => router.go(0),
    get current() {
      return router.currentRoute.value;
    },
    get navigating() {
      return false;
    }
  } as UbeanRouter;
}

export { useUnheadHead as useHead };
export { useSeoMeta } from '@unhead/vue';

export function useViewTransition() {
  const opts = inject<ViewTransitionOptions>(TRANSITION_KEY, { enabled: true });
  return {
    enabled: opts.enabled !== false && supportsViewTransitions(),
    supports: supportsViewTransitions(),
    options: opts
  };
}
