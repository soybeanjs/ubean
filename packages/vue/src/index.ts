/**
 * @ubean/vue — lean Vue client kernel (plugin-first) & page-routing owner.
 *
 * Surface: `ubeanVue` plugin · PageView/Link/SlotView · `createClientRouter`
 * · `definePage` client macro · page cache (keep-alive) · page transitions &
 * reload signal · View Transitions helpers · route pure functions · dynamic
 * route matchers (`defineMatcher` / `createMatcherGuard`) · page-level head
 * (`setupPageHeadGuard` / `createPageHead`).
 *
 * Page-routing ownership: file-based routing scanning & virtual-module
 * generation live in this package's `/vite` subpath (multi pagesDir/layoutsDir,
 * reuse routes, special pages, parallel/intercepting routes, markdown pages
 * opt-in, page head opt-in). The `@ubean/scan` aggregator delegates page
 * scanning here and layers server-side routing (rou3) + SSR on top.
 *
 * Build-time companion: the `@ubean/vue/vite` subpath provides file-based
 * routing (scan → `virtual:ubean-vue-routes`) and compile-time `definePage`
 * extraction — it runs in Node during dev/build only and never enters the
 * client bundle.
 *
 * NOT included (framework runtime `@ubean/client` concerns): app factories
 * (`createUbeanClientApp`/`createUbeanSSRApp`), unhead/Head/SEO, i18n, islands,
 * data layer, SSR state helpers, auto-import presets.
 *
 * Runtime dependency whitelist (main entry): `vue` + `vue-router` only.
 */

import type { PageHead } from './types';

// Augment vue-router's RouteMeta with ubean-managed meta fields so projects
// get full type-safety when reading `route.meta.cache` / `route.meta.pageName`
// without needing their own `declare module 'vue-router'` block.
declare module 'vue-router' {
  interface RouteMeta {
    /** Whether this page is kept-alive (lean: route `meta: { cache: true }`). */
    cache?: boolean;
    /** The page route name (used by KeepAlive include matching). */
    pageName?: string;
    /** Layout name(s) or `false` to disable (consumed by framework factories). */
    layout?: string | string[] | false;
    /** Whether authentication is required for this route. */
    requiresAuth?: boolean;
    /**
     * Page transition name (used by `<PageView>`). Falls back to the global
     * `usePageTransition()` ref when not set. Empty string disables
     * transitions for this specific page.
     */
    transition?: string;
    /**
     * Static page-level head (`definePage({ head })` / markdown frontmatter).
     * Only populated when the `/vite` plugin runs with `head: true`; apply
     * via `setupPageHeadGuard()` (SPA) or the SSR pipeline.
     */
    head?: PageHead;
    /** `[param=matcher]` mapping consumed by `createMatcherGuard()`. */
    matchers?: Record<string, string>;
    /** Select SSR mode from `definePage({ ssr })`. */
    ssr?: boolean | 'streaming' | 'data-only';
  }
}

// plugin & components & keys
export {
  ubeanVue,
  PageView,
  Link,
  SlotView,
  LayoutChainRenderer,
  ErrorBoundary,
  usePage,
  useViewTransition,
  PAGE_KEY,
  TRANSITION_KEY,
  SSR_KEY,
  LOADING_KEY,
  ERROR_KEY,
  LAYOUT_CHAIN_KEY,
  LOCALIZE_PATH_KEY
} from './components';
export type { UbeanVueOptions, UbeanVuePageData, LayoutChainContext } from './components';
export { ubeanVue as default } from './components';

// page cache (keep-alive)
export {
  useCacheViews,
  enablePageCache,
  disablePageCache,
  excludePageCache,
  includePageCache,
  isPageExcluded,
  resetRouteCache,
  invalidatePageCache,
  isPageCached,
  isCacheEnabled,
  getCachedViewNames,
  getExcludedViewNames,
  getCacheEnabled,
  getNamedPageWrapper,
  resetNamedPageWrappers,
  initCachedViewsFromRoutes
} from './cache-views';
export type { UseCacheViewsReturn } from './cache-views';

// page transitions & reload signal
export {
  usePageTransition,
  setPageTransition,
  clearPageTransition,
  getPageTransitionName,
  useReloadSignal,
  reloadPage,
  getReloadCounter,
  isReloading
} from './page-runtime';
export type { UsePageTransitionReturn, UseReloadSignalReturn } from './page-runtime';

// definePage client macro (no-op at runtime; extracted by `@ubean/vue/vite`)
export { definePage } from './define-page';
export type { DefineClientPageOptions } from './define-page';

// route pure functions
export { resolveRoute, isActiveRoute } from './router-location';
export type { RouteLocation, RouteLocationRaw, TypedLinkProps } from './router-location';

// View Transitions helpers
export {
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType
} from './view-transitions';
export type { ViewTransitionOptions } from './view-transitions';

// dynamic route matchers (`[param=matcher]` registry + guards)
export {
  defineMatcher,
  getMatcher,
  hasMatcher,
  listMatcherNames,
  clearMatchers,
  validateParams,
  createMatcherGuard
} from './matchers';
export type { MatcherFunction, MatcherGuardOptions } from './matchers';

// page-level head (SPA guard + lazy @unhead/vue factory)
export { setupPageHeadGuard, createPageHead, pushPageHead } from './head';
export type { PageHeadClient } from './head';

// shared page-routing types (also re-exported by the @ubean/scan aggregator)
export type { PageHead, PageMeta, ScannedPage, ScannedLayout, ScanPagesOptions, ScanPagesResult } from './types';
