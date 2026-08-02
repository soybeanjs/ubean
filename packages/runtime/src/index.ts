export { getInitialPageData, getInitialState } from './client';

// Augment vue-router's RouteMeta with ubean-managed meta fields so projects
// get full type-safety when reading `route.meta.cache` / `route.meta.pageName`
// without needing their own `declare module 'vue-router'` block.
declare module 'vue-router' {
  interface RouteMeta {
    /** Whether this page is kept-alive (set by `definePage({ cache: true })`). */
    cache?: boolean;
    /** The page route name (set by ubean's virtual pages module). */
    pageName?: string;
    /** The layout name, array of layout names (nested, outer → inner), or `false` to disable layout. */
    layout?: string | string[] | false;
    /** Whether authentication is required for this route. */
    requiresAuth?: boolean;
    /**
     * Page transition name (used by `<PageView>`). Falls back to the global
     * `usePageTransition()` ref when not set. Set to empty string to disable
     * transitions for this specific page.
     */
    transition?: string;
  }
}

export { useHeadInstance, injectHead } from './head';
export type { VueHeadClient as HeadClient } from './head';
// Re-export createHead from @unhead/vue so consumers (and ubean's own virtual
// modules) don't need @unhead/vue as a direct dependency — it's resolved through
// ubean's node_modules. Renamed to avoid name clash between client/server variants.
export { createHead as createClientHead } from '@unhead/vue/client';
export { createHead as createServerHead } from '@unhead/vue/server';
export {
  createLinkHandler,
  extractPageData,
  createDataCacheStore,
  createUseAsyncData,
  invalidateCache,
  clearCache,
  defineDataKey,
  useServerData,
  getInvalidatedKeysForAction
} from './composables';
export type {
  UbeanVueContext,
  LinkProps,
  DataCacheStore,
  UseAsyncDataOptions,
  UseAsyncDataReturn
} from './composables';
export {
  createUbeanVueApp,
  createUbeanSSRApp,
  usePage,
  useRouter,
  useHead,
  useViewTransition,
  Link,
  Head,
  PageView,
  SlotView,
  useSeoMeta
} from './app';
export type { UbeanAppOptions, UbeanAppInstance, VueHeadClient } from './app';
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
  initCachedViewsFromRoutes
} from './cache-views';
export type { UseCacheViewsReturn } from './cache-views';
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
export { createUbeanRouter } from './router';
export type { CreateUbeanRouterOptions } from './router';
export { defineApp, applyAppConfig, createDefaultAppConfig, mergeAppConfig } from './define-app';
export type { DefineAppOptions, ResolvedAppConfig, AppPluginConfig } from './define-app';
export { definePage, defineMeta, defineMiddleware } from './page-macro';
export type { SeoMetadata, MetaTag, LinkTag } from '@ubean/seo';
export { resolveRoute, isActiveRoute } from './router-location';
export type { RouteLocation, RouteLocationRaw, TypedLinkProps } from './router-location';
export { hydrateIslands, collectIslands, hydrateIsland } from './islands';
export type { IslandHydrateOptions, IslandRecord, HydrateIslandsOptions } from './islands';
export {
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType
} from './view-transitions';
export type { ViewTransitionOptions } from './view-transitions';
export {
  useI18n,
  defineLocale,
  t,
  setLocale,
  getLocale,
  onLocaleChange,
  getLocaleDir,
  getLocaleName,
  getRegisteredLocales,
  detectLocale,
  detectBrowserLocale,
  addLocale,
  mergeLocale,
  clearLocales,
  getI18nConfig,
  setI18nConfig,
  localizePath,
  switchLocalePath,
  getDefaultLocale,
  extractLocaleFromPath,
  useSwitchLocalePath,
  useLocalePath
} from './i18n';
export type { VueI18nInstance } from './i18n';
export {
  useColorMode,
  configureColorMode,
  getColorModeConfig,
  getColorModeScript,
  resolveColorModeConfig,
  forceColorMode,
  unforceColorMode,
  _resetColorMode
} from './color-mode';
export type { ColorModeConfig, ColorMode } from './color-mode';
// P9-22: Third-party script optimization (Partytown integration)
export {
  useScript,
  configurePartyTown,
  getPartyTownConfig,
  isPartyTownEnabled,
  getPartyTownScript,
  getPartyTownHeadContent,
  resolvePartyTownConfig,
  _resetPartyTown
} from './party-town';
export type { PartyTownConfig, UseScriptOptions, UseScriptReturn, ScriptTrigger } from './party-town';
// P9-26: Full-text search (Pagefind integration)
export {
  useSearch,
  initPagefind,
  executeSearch,
  configureSearch,
  getSearchConfig,
  resolveSearchConfig,
  isPagefindLoaded,
  _resetSearch,
  _setPagefindMock
} from './search';
export type { SearchResult, SearchFilters, UseSearchOptions, UseSearchReturn, SearchRuntimeConfig } from './search';
