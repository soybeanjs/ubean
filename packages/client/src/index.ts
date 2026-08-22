/**
 * @ubean/client — framework client runtime (full surface).
 *
 * Layered over the lean kernel `@ubean/vue` (plugin/components/router/
 * cache/transitions — re-exported here) plus framework extras:
 * app factories, unhead, i18n Vue wrappers, data layer, SSR state helpers,
 * color-mode/partytown/search utilities, islands hydration.
 *
 * Standalone SPAs that only need routing/cache/transitions should depend on
 * `@ubean/vue` directly (vue + vue-router only).
 */
export { getInitialPageData, getInitialState } from './client';

// Framework route-aware page context (the lean kernel's `usePage` returns
// PAGE_KEY pageData only — url/params/query/meta are completed here).
export { usePage } from './use-page';
export type { UbeanVuePage } from './use-page';
// Pure re-export of vue-router's `useRouter` — keeps the auto-import surface
// (`useRouter` from 'ubean/client') while preserving vue-router's typed
// `push`/`replace` overloads (RouteNamedMap generics). No wrapper.
export { useRouter } from 'vue-router';

// Lean kernel re-export (single source of truth: @ubean/vue)
export {
  ubeanVue,
  PageView,
  Link,
  SlotView,
  LayoutChainRenderer,
  ErrorBoundary,
  useViewTransition,
  PAGE_KEY,
  TRANSITION_KEY,
  SSR_KEY,
  LOADING_KEY,
  ERROR_KEY,
  LAYOUT_CHAIN_KEY,
  LOCALIZE_PATH_KEY,
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
  initCachedViewsFromRoutes,
  usePageTransition,
  setPageTransition,
  clearPageTransition,
  getPageTransitionName,
  useReloadSignal,
  reloadPage,
  getReloadCounter,
  isReloading,
  resolveRoute,
  isActiveRoute,
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType
} from '@ubean/vue';
export type {
  UbeanVueOptions,
  UbeanVuePageData,
  LayoutChainContext,
  UseCacheViewsReturn,
  UsePageTransitionReturn,
  UseReloadSignalReturn,
  RouteLocation,
  RouteLocationRaw,
  TypedLinkProps,
  ViewTransitionOptions
} from '@ubean/vue';

// Framework router factory — own implementation (the lean kernel ships none;
// standalone SPAs import their route table and call vue-router themselves).
export { createUbeanRouter } from './router';
export type { CreateUbeanRouterOptions } from './router';

export { useHeadInstance, injectHead } from './head';
export type { VueHeadClient as HeadClient } from './head';
// Re-export createHead from @unhead/vue so consumers (and ubean's own virtual
// modules) don't need @unhead/vue as a direct dependency — it's resolved through
// ubean's node_modules. Renamed to avoid name clash between client/server variants.
// NOTE: only the CLIENT variant here — `createServerHead` is exported from the
// `@ubean/client/server` subpath to keep this entry browser-safe.
export { createHead as createClientHead } from '@unhead/vue/client';
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
export type { UbeanVueContext, LinkProps, DataCacheStore, UseAsyncDataReturn } from './composables';
export {
  createUbeanClientApp,
  createUbeanSSRApp,
  useHead,
  useSeoMeta,
  Head,
  definePage,
  defineMeta,
  defineMiddleware
} from './app';
export type { UbeanAppOptions, UbeanAppInstance, VueHeadClient } from './app';
export { defineApp, applyAppConfig, createDefaultAppConfig, mergeAppConfig } from './define-app';
export type { DefineAppOptions, ResolvedAppConfig, AppPluginConfig } from './define-app';
export type { SeoMetadata, MetaTag, LinkTag } from '@ubean/seo';
// Islands hydration — single source of truth lives in `@ubean/islands/runtime`
// (the former in-runtime fork was removed; this re-export keeps the public
// surface of the old `@ubean/runtime` barrel).
export {
  hydrateIslands,
  collectIslands,
  hydrateIsland,
  hasPendingIslands,
  scheduleIslandHydration
} from '@ubean/islands/runtime';
export type {
  IslandHydrateOptions,
  IslandRecord,
  HydrateIslandsOptions,
  IslandHydrationScheduler
} from '@ubean/islands/runtime';
export { useData, useAsyncData, invalidateData, useFetch, setDefaultFetch } from '@ubean/pages';
export type { DataResult, UseAsyncDataOptions, UseFetchOptions } from '@ubean/pages';
export {
  useI18n,
  createUbeanI18n,
  installUbeanI18n,
  configureI18nRuntime,
  getI18nRuntimeConfig,
  initClientI18n,
  t,
  setLocale,
  getLocale,
  localizePath,
  switchLocalePath,
  extractLocaleFromPath,
  useSwitchLocalePath,
  useLocalePath,
  useLocaleRoute,
  useLocaleHead
} from './i18n';
export type { I18n as VueI18nInstance } from 'vue-i18n';
export type { I18nRuntimeConfig, LocaleLoader, LocaleMessages } from './i18n';
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
