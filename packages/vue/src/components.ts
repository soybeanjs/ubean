/**
 * @ubean/vue — lean components & plugin.
 *
 * Hard boundary of this module (and the whole package):
 *  - dependencies are `vue` + `vue-router` ONLY — no `@ubean/*`, no `node:*`,
 *    no `@unhead/vue`
 *  - no i18n: `Link` renders paths verbatim unless a localizer is provided
 *    via `LOCALIZE_PATH_KEY` (the framework runtime `@ubean/client` provides
 *    the reactive `localizePath`; lean SPAs simply don't)
 *  - no islands directive: the `v-client` directive is a framework concern
 *    (`@ubean/client` registers it inside its app factories)
 */
import {
  defineComponent,
  defineAsyncComponent,
  h,
  KeepAlive,
  Suspense,
  Transition,
  inject,
  computed,
  watch,
  shallowRef,
  onErrorCaptured,
  provide,
  createCommentVNode
} from 'vue';
import type { App, Component, ConcreteComponent, InjectionKey, Plugin, PropType, VNode } from 'vue';
import { RouterView, RouterLink, useRoute } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import { initCachedViewsFromRoutes, getNamedPageWrapper, useCacheViews, _flushPendingReincludes } from './cache-views';
import { usePageTransition, _reloading, _reloadBlank, _pageReloadCounts } from './page-runtime';
import { supportsViewTransitions } from './view-transitions';
import type { ViewTransitionOptions } from './view-transitions';

/**
 * Injection keys (exported for advanced use cases — e.g. testing utilities
 * that need to provide the page/transition context outside the plugin).
 *
 * `Symbol.for` is REQUIRED: in the ubean dev server `@ubean/vue` can be
 * loaded twice (once through Node's ESM cache for the SSR app factory, once
 * through Vite's transformed module graph for auto-imported components).
 * Per-realm `Symbol()` keys would then differ across copies and break
 * provide/inject silently (e.g. `<Link>` losing its i18n localizer →
 * hydration href mismatch). Registered keys are shared globally, so every
 * copy resolves to the same Symbol.
 */
export const PAGE_KEY = Symbol.for('ubean-page');
export const TRANSITION_KEY = Symbol.for('ubean-transition');
export const SSR_KEY: InjectionKey<boolean> = Symbol.for('ubean-ssr');
export const LOADING_KEY: InjectionKey<Component | null> = Symbol.for('ubean-loading');
export const ERROR_KEY: InjectionKey<Component | null> = Symbol.for('ubean-error');

/**
 * Module-level reload placeholder — a single comment vnode reused across
 * renders while `_reloadBlank` is active (see the KeepAlive slot in
 * `PageView` for why it must be a comment, not null).
 */
const _reloadPlaceholder: VNode = createCommentVNode('ubean-reload');

/** Dev-only one-shot flag for the out-in degradation warning. */
let _warnedOutIn = false;

/**
 * Injectable path localizer (optional i18n bridge). The framework runtime
 * (`@ubean/client`) provides the reactive `localizePath`; when absent,
 * `Link` renders paths verbatim — this package never imports i18n itself.
 */
export const LOCALIZE_PATH_KEY: InjectionKey<(path: string, locale?: string) => string> =
  Symbol.for('ubean-localize-path');

/**
 * Layout chain context — provided by `LayoutChainRenderer` so that `<PageView />`
 * inside a layout knows whether to render the next nested layout or the actual
 * page. When `depth < components.length - 1`, `PageView` renders the next
 * `LayoutChainRenderer`; otherwise it renders the matched page via `<RouterView>`.
 */
interface LayoutChainContext {
  components: Array<Component | null>;
  depth: number;
}
export const LAYOUT_CHAIN_KEY: InjectionKey<LayoutChainContext | null> = Symbol.for('ubean-layout-chain');
export type { LayoutChainContext };

/**
 * LayoutChainRenderer — recursively renders a chain of nested layout
 * components (framework factories build the chain; lean SPAs may use it
 * directly for nested layouts via render functions).
 */
export const LayoutChainRenderer = defineComponent({
  name: 'UbeanLayoutChain',
  props: {
    components: { type: Array as PropType<Array<Component | null>>, required: true },
    depth: { type: Number, default: 0 }
  },
  setup(props) {
    // Provide the chain context so PageView knows whether to render the next
    // layout or the actual page.
    provide(LAYOUT_CHAIN_KEY, {
      get components() {
        return props.components;
      },
      get depth() {
        return props.depth;
      }
    });

    return (): VNode => {
      const comp = props.components[props.depth];
      if (!comp) {
        // No layout at this depth — fall through to PageView (which renders
        // the actual page via RouterView).
        return h(PageView);
      }
      return h(comp as ConcreteComponent);
    };
  }
});

/**
 * ErrorBoundary — catches rendering, async resolution, and setup errors
 * from descendant components. When an error is caught, renders the
 * configured `errorComponent` instead of the slot content. The error state
 * resets automatically on route change.
 */
export const ErrorBoundary = defineComponent({
  name: 'UbeanErrorBoundary',
  props: {
    component: { type: [Object, Function] as PropType<Component | null>, default: null }
  },
  setup(props, { slots }) {
    const error = shallowRef<Error | null>(null);

    // Reset error on route change so navigating away clears the boundary
    const route = useRoute();
    watch(
      () => route.fullPath,
      () => {
        error.value = null;
      }
    );

    onErrorCaptured(err => {
      error.value = err as Error;
      return false; // Prevent error from propagating further up
    });

    return () => {
      if (error.value && props.component) {
        return h(props.component as ConcreteComponent, { error: error.value });
      }
      return slots.default?.();
    };
  }
});

/**
 * PageView — renders the matched route page wrapped with `<Transition>` and
 * `<KeepAlive>`. Layouts use `<PageView />` (instead of `<slot />`) as the
 * page outlet.
 *
 * Equivalents of soybean-unify's layout-content pattern:
 *   - `pageAnimateMode` → `transition` prop + `route.meta.transition` + global `usePageTransition()`
 *   - `cachedRoutes` / `excludeCachedRoutes` → `useCacheViews().cachedViews` / `excludedViews`
 *   - `reloadSignal` → `useReloadSignal().counter` (incremented by `reloadPage()`)
 *
 * Props:
 * - `transition`: transition name (string) or `false` to disable.
 *   Priority: prop > `route.meta.transition` > global `usePageTransition()`.
 * - `reloadKey`: a reactive key — changing it forces remount (reload).
 *   When omitted, falls back to `route.fullPath` + per-page reload count.
 * - `mode`: Vue `<Transition>` mode. Defaults to `'default'` (cross-fade —
 *   old page plays its leave while the new one enters, both driven through
 *   KeepAlive's delayLeave). `'out-in'` is DEGRADED to `'default'` with a
 *   dev warning: vue@3.5.41's `out-in` renders an `emptyPlaceholder` hollow
 *   KeepAlive on page swaps, which crashes hand-written render chains
 *   (`updateSlots` reading `children._`) and corrupts keep-alive cache
 *   state on compiled chains (vuejs/core#10771 family). Revisit when the
 *   upstream fix lands.
 *
 * On SSR (via `SSR_KEY`), KeepAlive/Transition/Suspense/ErrorBoundary are
 * skipped (client-only concepts).
 */
export const PageView = defineComponent({
  name: 'PageView',
  props: {
    transition: { type: [String, Boolean], default: undefined },
    reloadKey: { type: [String, Number], default: undefined },
    mode: { type: String as PropType<'out-in' | 'in-out' | 'default'>, default: 'default' }
  },
  setup(props) {
    const { cachedViews, excludedViews } = useCacheViews();
    const globalTransition = usePageTransition();
    const ssr = inject(SSR_KEY, false);
    const loadingComp = inject(LOADING_KEY, null);
    const errorComp = inject(ERROR_KEY, null);
    const layoutChain = inject(LAYOUT_CHAIN_KEY, null);

    // Cache-declaration restore point — replaces the former router-factory
    // `afterEach` hook (this package no longer creates routers). `flush: 'post'`
    // guarantees the outgoing page instance has already been processed by
    // `<KeepAlive>` under the OLD include list (i.e. destroyed, not cached)
    // before `resetRouteCache`'s pending declaration is re-enabled.
    const route = useRoute();
    watch(
      () => route.fullPath,
      () => {
        const currentPageName =
          (route.meta?.pageName as string | undefined) ?? (typeof route.name === 'string' ? route.name : undefined);
        _flushPendingReincludes(currentPageName);
      },
      { flush: 'post' }
    );

    return (): VNode => {
      // Inside a nested layout chain with more layouts to render → render
      // the next LayoutChainRenderer instead of the actual page.
      if (layoutChain && layoutChain.depth < layoutChain.components.length - 1) {
        return h(LayoutChainRenderer, {
          components: layoutChain.components,
          depth: layoutChain.depth + 1
        });
      }

      return h(RouterView, null, {
        default: ({ Component, route: $route }: { Component: VNode | null; route: any }) => {
          if (!Component) return null;

          // SSR: render the matched component VNode directly.
          if (ssr) return Component;

          // Wrap the page component with a named wrapper carrying the route
          // name (`route.meta.pageName`) so `<KeepAlive :include>` matches —
          // `<script setup>` SFCs don't auto-set `name`.
          const rawComp = Component.type as ConcreteComponent;
          const pageName = $route.meta?.pageName as string | undefined;
          const comp = pageName ? getNamedPageWrapper(pageName, rawComp) : rawComp;
          const componentProps = Component.props || {};

          // Transition priority: prop(false) > prop(string) > route.meta > global
          const routeTransition = $route.meta?.transition as string | undefined;
          const transitionName =
            props.transition === false
              ? undefined
              : (props.transition as string) || routeTransition || globalTransition.name.value || undefined;

          // Render key: explicit reloadKey, or fullPath + PER-PAGE reload
          // count. `reloadPage(name)` bumps only that page's count → its key
          // changes → KeepAlive cache miss → fresh mount (the old-key entry
          // is pruned around the remount by `_remountWithFreshCache`'s
          // include toggle). Per-page (not global) so an unrelated page's
          // reload never invalidates other pages' cache entries.
          const pageReloadCount = pageName ? (_pageReloadCounts.get(pageName) ?? 0) : 0;
          const pageVNode = h(comp, {
            ...componentProps,
            key: props.reloadKey ?? `${$route.fullPath}#${pageReloadCount}`
          });

          // <KeepAlive :include="cachedViews" :exclude="excludedViews">
          // SLOT CONTRACT — must return a single vnode (or null), NEVER an
          // array: Vue's `getInnerChild` calls this raw slot fn directly and
          // treats the value as a single child (`innerChild.type`). An array
          // yields `type === undefined` which `<Transition out-in>` mistakes
          // for a real child swap → spurious leave → `emptyPlaceholder`
          // hollow vnodes (children=null) patch each other → `updateSlots`
          // crashes. null is safe everywhere: KeepAlive normalizes it to a
          // comment (empty fast-path) and Transition bails via `!innerChild`.
          //
          // During a reload, `_reloadBlank` renders a COMMENT vnode here for
          // a few ticks (see `_remountWithFreshCache`) — the page unmounts
          // and remounts under a fresh key WITHOUT Transition's leave branch.
          // IMPORTANT: it must be a comment vnode, NOT null — on include
          // re-renders the fresh KeepAlive vnode is not yet patched
          // (`component === undefined`), so Vue's `getInnerChild` falls back
          // to `children.default()`; a null return trips the
          // `!innerChild → emptyPlaceholder` branch (hollow KeepAlive,
          // children=null) whose patch crashes `updateSlots` (vue@3.5.41).
          // A comment vnode instead hits the `type !== Comment` short-circuits.
          const keepAliveProps: { include: string[]; exclude?: string[] } = {
            include: cachedViews.value
          };
          if (excludedViews.value.length > 0) {
            keepAliveProps.exclude = excludedViews.value;
          }
          const keepAliveVNode: VNode = h(KeepAlive, keepAliveProps, {
            default: () => (_reloadBlank.value ? _reloadPlaceholder : pageVNode)
          });

          // <Suspense> fallback during async page loading (client only,
          // only when a loading component is provided via LOADING_KEY).
          const contentVNode: VNode =
            !ssr && loadingComp
              ? h(Suspense, null, {
                  default: () => keepAliveVNode,
                  fallback: () => h(loadingComp as ConcreteComponent)
                })
              : keepAliveVNode;

          // Transition is ALWAYS present (structural stability): when the
          // patch position alternates between `Transition(KeepAlive)` and a
          // bare `KeepAlive` (pages declaring different transitions), Vue
          // unmounts the entire old subtree on each swap — keep-alive cache
          // included. Rendering a nameless Transition instead costs nothing
          // (no CSS classes resolve) and keeps the component chain identical
          // across every route.
          const transitionVNode: VNode = h(
            Transition,
            {
              name: transitionName ?? '',
              // 'out-in' + KeepAlive child = vue@3.5.41 upstream bug (see
              // the `mode` prop docs) — degrade to 'default' (cross-fade).
              mode: _reloading.value || props.mode === 'out-in' ? 'default' : props.mode,
              // `appear` — also play the enter transition on first mount;
              // pointless (and noisy) without a name.
              appear: !!transitionName
            },
            { default: () => contentVNode }
          );
          if (props.mode === 'out-in' && import.meta.env?.DEV && !_warnedOutIn) {
            _warnedOutIn = true;
            console.warn(
              '[PageView] mode="out-in" is degraded to "default": vue@3.5.41 out-in + KeepAlive ' +
                'trips emptyPlaceholder bugs (updateSlots crash on hand-written chains, cache ' +
                'corruption on compiled chains). Using cross-fade instead.'
            );
          }

          // ErrorBoundary wraps everything when an error component is
          // provided via ERROR_KEY (client only).
          if (!ssr && errorComp) {
            return h(ErrorBoundary, { component: errorComp }, { default: () => transitionVNode });
          }

          return transitionVNode;
        }
      });
    };
  }
});

/**
 * SlotView — renders a named parallel route slot. Parallel routes are
 * registered as Vue Router named views on the matched route record;
 * `<SlotView name="analytics" />` resolves the slot component from the
 * current route (deepest matched record exposing the slot wins).
 *
 * Resolution is independent of RouterView depth chaining, so SlotView works
 * both as a sibling of `<PageView />` and inside the default view page
 * component (a nested `<RouterView>` there would look at depth + 1 and
 * never find the named view).
 */
export const SlotView = defineComponent({
  name: 'SlotView',
  props: {
    name: { type: String, required: true }
  },
  setup(props) {
    const route = useRoute();
    // Cache async wrappers per slot name so re-renders don't remount the slot.
    const asyncWrappers = new Map<string, Component>();

    const resolveSlot = (): Component | null => {
      for (let i = route.matched.length - 1; i >= 0; i--) {
        const components = route.matched[i].components;
        if (components && props.name in components) {
          return (components as Record<string, unknown>)[props.name] as Component | null;
        }
      }
      return null;
    };

    return (): VNode => {
      const comp = resolveSlot();
      if (!comp) return createCommentVNode(`slot-view:${props.name}`);
      // 函数 + 无 render/setup → 懒加载 loader(而非函数式组件)。
      // 断言为结构形状:FunctionalComponent 上不存在 render/setup,
      // 直接断言 ConcreteComponent 会在严格模式下报属性不存在。
      const fn = comp as { render?: unknown; setup?: unknown };
      if (typeof comp === 'function' && !fn.render && !fn.setup) {
        // Lazy loader — vue-router resolves these during navigation, but the
        // raw record may still hold the loader on first paint.
        let wrapper = asyncWrappers.get(props.name);
        if (!wrapper) {
          wrapper = defineAsyncComponent(() => (comp as unknown as () => Promise<Component>)());
          asyncWrappers.set(props.name, wrapper);
        }
        return h(wrapper);
      }
      return h(comp as ConcreteComponent);
    };
  }
});

type LinkTo = string | Record<string, unknown>;
type PathLocalizer = (path: string, locale?: string) => string;

function isExternalHref(path: string): boolean {
  return path.startsWith('http') || path.startsWith('//') || path.startsWith('#');
}

function resolveLinkTo(to: LinkTo, localize: PathLocalizer | null, locale?: string): LinkTo {
  if (typeof to !== 'string') {
    if (!localize) return to;
    const path = to.path;
    if (typeof path !== 'string' || isExternalHref(path)) return to;
    return { ...to, path: localize(path, locale) };
  }
  if (isExternalHref(to) || !localize) return to;
  return localize(to, locale);
}

/**
 * Link — internal links render via RouterLink; external links (`http*`,
 * `//`, `#`) render as native `<a target="_blank" rel="noopener noreferrer">`.
 *
 * Path localization is opt-in via `LOCALIZE_PATH_KEY` (provided by the
 * framework runtime); lean SPAs render paths verbatim.
 */
export const Link = defineComponent({
  name: 'Link',
  props: {
    to: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    href: { type: String, default: undefined },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    activeClass: { type: String, default: 'router-link-active' },
    exactActiveClass: { type: String, default: 'router-link-exact-active' },
    noActiveClass: { type: Boolean, default: false },
    /** Target locale for path localization; omit to use the current locale. */
    locale: { type: String, default: undefined }
  },
  setup(props, { slots, attrs }) {
    const localize = inject(LOCALIZE_PATH_KEY, null);

    const resolvedTo = computed(() => resolveLinkTo(props.to ?? props.href ?? '', localize, props.locale));
    const isExternal = computed(() => typeof resolvedTo.value === 'string' && isExternalHref(resolvedTo.value));

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

/**
 * `PAGE_KEY` 注入的页面数据形状(框架工厂 / SSR 链路提供;精简 SPA
 * 通常不提供,`usePage()` 返回空对象)。
 *
 * 路由态(url/params/query/meta)不在此处 —— 直接用 vue-router 的
 * `useRoute()`;导航(push/replace 带类型推导)直接用 vue-router 的
 * `useRouter()`。本包不再包装二者,避免丢失 vue-router 的泛型能力。
 */
export interface UbeanVuePageData<TProps = Record<string, unknown>> {
  /** 工厂/SSR 注入的页面 props(框架数据协议)。 */
  props?: Record<string, TProps>;
  /** 页面组件标识(框架 SSR 数据)。 */
  component?: string;
  /** 校验错误映射(表单/服务端校验协议)。 */
  errors?: Record<string, string> | null;
}

const _EMPTY_PAGE_DATA: UbeanVuePageData = {};

/**
 * `usePage()` — 读取 `PAGE_KEY` 注入的页面数据(精简版:仅 pageData)。
 *
 * 路由驱动的 url/params/query 请使用 vue-router 的 `useRoute()`;
 * 导航请使用 vue-router 的 `useRouter()`(push/replace 自带
 * RouteNamedMap 泛型推导)。
 *
 * 未提供 `PAGE_KEY` 时返回共享的空对象(字段均为 undefined)。
 */
export function usePage<TProps = Record<string, unknown>>(): UbeanVuePageData<TProps> {
  return inject<UbeanVuePageData<TProps> | null>(PAGE_KEY, null) ?? (_EMPTY_PAGE_DATA as UbeanVuePageData<TProps>);
}

/** `useViewTransition()` — whether native View Transitions are available/enabled. */
export function useViewTransition() {
  const opts = inject<ViewTransitionOptions>(TRANSITION_KEY, { enabled: true });
  return {
    enabled: opts.enabled !== false && supportsViewTransitions(),
    supports: supportsViewTransitions(),
    options: opts
  };
}

/**
 * `ubeanVue` — the plugin exposing the lean kernel. This is the ONLY wiring
 * entry of `@ubean/vue` (no app factory, no router factory):
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { createRouter, createWebHistory } from 'vue-router';
 * import { ubeanVue } from '@ubean/vue';
 * import { routes } from 'virtual:ubean-vue-routes'; // @ubean/vue/vite
 *
 * const router = createRouter({ history: createWebHistory(), routes });
 * const app = createApp(App);
 * app.use(router);
 * app.use(ubeanVue, { routes }); // Link/PageView/SlotView + cache seeding
 * app.mount('#app');
 * ```
 */
export interface UbeanVueOptions {
  /**
   * Route records — seeds the keep-alive include list from `meta.cache: true`
   * declarations (the lean equivalent of the framework's
   * `definePage({ cache: true })` macro).
   */
  routes?: Array<{ name?: string | symbol; meta?: { cache?: boolean } }>;
}

export const ubeanVue: Plugin<UbeanVueOptions> = {
  install(app: App, options?: UbeanVueOptions) {
    app.component('Link', Link);
    app.component('PageView', PageView);
    app.component('SlotView', SlotView);
    if (options?.routes) {
      initCachedViewsFromRoutes(options.routes);
    }
  }
};

export default ubeanVue;
