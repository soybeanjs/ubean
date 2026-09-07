/**
 * ubean — isomorphic 聚合入口(client-safe)
 *
 * 承诺:从此入口导入的任何值在浏览器与 Node 环境都安全 —— 不含 node:* 内建、
 * 文件系统扫描、构建时工具(oxc WASM 等)与 Hono 服务端运行时。可作为浏览器
 * 代码的稳定导入源,不会触发 Vite 在客户端预构建服务端依赖。
 *
 * 能力域分布:
 * - 服务端运行时(API 路由 / cache / db / queue / cron / ws / OpenAPI…)
 *   → `ubean/server`
 * - 构建时工具(prerender / preset / config 加载 / codegen 预设 / scan / Vite 插件)
 *   → `ubean/build`
 * - 服务端 i18n(ALS `t()` / 中间件)→ `ubean/i18n`
 * - 框架客户端运行时(含 islands 注册表桥接 / Server Actions 客户端运行时)
 *   → `ubean/client`
 * - Vue SSR 渲染器 → `ubean/ssr`
 * - Vite 插件组合 → `ubean/vite`;脚手架 → `ubean/scaffold`
 *
 * 冲突处理策略(显式 re-export 优先于 `export *`):
 * - `defineDataKey`:来自 `@ubean/pages`,与 `@ubean/client` 的 own 实现冲突 → 保留 pages 版本
 * - 原 i18n Vue 封装与服务端 ALS 版的同名冲突随服务端导出迁出而消解,
 *   `setLocale`/`getLocale`/`localizePath`/`switchLocalePath` 恢复自然命名
 * - `PageHead`/`HttpMethod` 等类型以 type-only 形式保留(编译期擦除,运行时零开销)
 */

import type { UbeanConfig } from '@ubean/config';

// ============== isomorphic 基础层(leaf packages,浏览器安全)==============
export * from '@ubean/shared';
export * from '@ubean/seo';
export * from '@ubean/pages';
export * from '@ubean/markdown';

// ============== Vue 客户端运行时(内核,选择性导出避免冲突)==============
// 注意:此处为 `@ubean/client` 内核版 `hydrateIslands`(不带 islands 注册表桥接);
// 框架应用的客户端代码请用 `ubean/client`(含桥接版 + Server Actions 运行时)。
export {
  // client entry
  getInitialPageData,
  getInitialState,
  // head
  useHeadInstance,
  // composables
  createLinkHandler,
  extractPageData,
  createDataCacheStore,
  createUseAsyncData,
  invalidateCache,
  clearCache,
  useServerData,
  // app (Vue 实例)
  createUbeanSSRApp,
  usePage,
  useHead,
  useViewTransition,
  Link,
  Head,
  PageView,
  // cache-views
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
  initCachedViewsFromRoutes,
  // page-runtime
  usePageTransition,
  setPageTransition,
  clearPageTransition,
  getPageTransitionName,
  useReloadSignal,
  reloadPage,
  getReloadCounter,
  isReloading,
  // router (Vue Router 工厂;服务端 rou3 router 为 createServerRouter,在 `ubean/server`)
  createUbeanRouter,
  // define-app
  defineApp,
  applyAppConfig,
  createDefaultAppConfig,
  mergeAppConfig,
  // page-macro(no-op 宏,构建时被 strip)
  definePage,
  defineMeta,
  // router-location
  resolveRoute,
  isActiveRoute,
  // islands hydrate(内核版;注册表桥接版在 `ubean/client`)
  hydrateIslands,
  collectIslands,
  hydrateIsland,
  hasPendingIslands,
  scheduleIslandHydration,
  // view-transitions
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType,
  // i18n(Vue 封装版;服务端 ALS 版在 `ubean/i18n`)。
  // `useI18n` 直接从 `vue-i18n` 导入(自动导入直源 vue-i18n)
  createUbeanI18n,
  configureI18nRuntime,
  setLocale,
  getLocale,
  localizePath,
  switchLocalePath,
  extractLocaleFromPath,
  useSwitchLocalePath,
  useLocalePath,
  useLocaleRoute,
  useLocaleHead,
  getI18nRuntimeConfig
} from '@ubean/client';

export type {
  UbeanVueContext,
  LinkProps,
  DataCacheStore,
  UseAsyncDataOptions,
  UseAsyncDataReturn,
  UbeanAppInstance,
  UseCacheViewsReturn,
  UsePageTransitionReturn,
  UseReloadSignalReturn,
  CreateUbeanRouterOptions,
  DefineAppOptions,
  ResolvedAppConfig,
  AppPluginConfig,
  RouteLocation,
  RouteLocationRaw,
  TypedLinkProps,
  IslandHydrateOptions,
  IslandRecord,
  HydrateIslandsOptions,
  ViewTransitionOptions,
  I18nRuntimeConfig
} from '@ubean/client';

// ============== Islands 客户端运行时(浏览器安全)==============
// 服务端组件注册表(`registerServerComponent` 等)在 `@ubean/islands/server`
export { vClient, getIslandsBootstrapScript, defineServerIsland, defineIsland } from '@ubean/islands';
export type { ServerIslandOptions, IslandStrategy, IslandOptions } from '@ubean/islands';

// ============== 日志(tslog v5 自带 browser build,isomorphic)==============
// Hono 请求日志中间件在 `ubean/server`
export { logger, getLogger, createUbeanLogger, setDebugLogging } from '@ubean/shared/logger';
export type { UbeanLogger, UbeanLoggerOptions, LogLevelName, RequestLoggerOptions } from '@ubean/shared/logger';

// ============== 配置定义(内联 identity 实现,避免拉入 config loader 的 node 依赖)==============
// `loadUbeanConfig` / `getConfig` / `defineModule` / `resolveModules` 等加载器 API 在 `ubean/build`
export function defineConfig(config?: UbeanConfig): UbeanConfig {
  return config ?? {};
}

// ============== 冲突消歧与类型固定(显式 re-export 优先于上方 `export *`)==============
export { defineDataKey } from '@ubean/pages';
export type { InternalFetchOptions, PageAssetTags, PageRenderer } from '@ubean/pages';
// PageHead 以 vue(经 scan)为准;HttpMethod 为 API 路由方法(含 HEAD/OPTIONS)。
// type-only 导出在编译期擦除,不产生运行时依赖
export type { PageHead, HttpMethod } from '@ubean/scan';
