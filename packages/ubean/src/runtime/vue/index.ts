export { getInitialPageData } from './client';
export {
  createClient,
  defaultClient,
  get,
  post,
  put,
  patch,
  del as delete,
  head,
  opts as options,
  $get,
  $post,
  $put,
  $patch,
  $del as $delete,
  raw,
  extend,
  runtime,
  diagnoseEnvironment
} from '../client';
export type { ApiClient, ClientOptions, RequestOptions, ClientError, FlatResponse } from '../client';
export { useHeadInstance, injectHead } from './head';
export type { VueHeadClient as HeadClient } from './head';
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
  createUbeanApp,
  createUbeanSSRApp,
  usePage,
  useRouter,
  useHead,
  useViewTransition,
  Link,
  Head,
  useSeoMeta
} from './app';
export type { UbeanAppOptions, UbeanAppInstance, VueHeadClient } from './app';
export { createUbeanRouter } from './router';
export type { CreateUbeanRouterOptions } from './router';
export { defineApp, applyAppConfig, createDefaultAppConfig } from './define-app';
export type { DefineAppOptions, ResolvedAppConfig, AppPluginConfig } from './define-app';
export { definePage, defineMeta, defineMiddleware } from './page-macro';
export type { SeoMetadata, MetaTag, LinkTag } from '../seo';
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
