export { createUbeanClient, getInitialPageData } from './client';
export type { UbeanVueRouter, UbeanVueHead, UbeanVueApp, SubmitOptions, SubmitResult } from './client';
export { createHeadManager } from './head';
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
export { createUbeanApp, createUbeanSSRApp, usePage, useRouter, useHead, useViewTransition, Link, Head } from './app';
export type { UbeanAppOptions, UbeanAppInstance } from './app';
export { defineApp, applyAppConfig, createDefaultAppConfig } from './define-app';
export type { DefineAppOptions, ResolvedAppConfig, AppPluginConfig } from './define-app';
export { definePage, defineMeta, defineMiddleware } from './page-macro';
export { useSeoMeta } from '../seo';
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
