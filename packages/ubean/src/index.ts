/**
 * ubean — 聚合器入口
 *
 * 纯 re-export 所有子包,对外提供与原 `ubean` 包一致的 API 表面。
 *
 * 冲突处理策略(显式 re-export 优先于 `export *`):
 * - `useRouter`:来自 `@ubean/routes`(服务端 rou3 router 实例,无参数),与 `@ubean/client` 的 Vue composable 版冲突 → 保留 routes 版本
 * - `createUbeanRouter`:来自 `@ubean/client`(Vue Router,接受 options)。原 `@ubean/routing` 的服务端同名版本已改名 `createServerRouter`(`@ubean/routes`),同名冲突彻底消歧
 * - `createUbeanApp`:来自 `@ubean/app`(Hono 应用工厂)。`@ubean/client` 的 Vue 应用工厂已重命名为 `createUbeanClientApp`(ADR-0001),不再同名冲突。主入口选择性 export 不含 `createUbeanClientApp`(见 ADR-0005 待决子项)
 * - `useSeoMeta`:来自 `@ubean/seo`(自定义实现),与 `@ubean/client` 重新导出的 `@unhead/vue` 版本冲突 → 保留 seo 版本
 * - `defineMiddleware`:来自 `@ubean/routes`(真实实现),与 `@ubean/client` 的 no-op 宏冲突 → 保留 routes 版本
 * - `defineDataKey`:来自 `@ubean/pages`,与 `@ubean/client` 的 own 实现冲突 → 保留 pages 版本
 * - 原 `clearDataCache` 同名冲突已通过重命名消歧:`@ubean/pages` → `clearPageData`(页面数据层,= invalidateAll 别名);`@ubean/server` → `clearFetchDataCache`(fetch Data Cache)
 * - i18n 函数:来自 `@ubean/i18n`(ALS + 路径编译),与 `@ubean/client` 的 Vue composable 版冲突 → 保留 i18n 版本
 * - `UbeanAppOptions` 类型:来自 `@ubean/app`,与 `@ubean/client` 的 Vue 版本冲突 → 保留 app 版本
 * - `InternalFetchOptions` 类型:来自 `@ubean/pages`,与 `@ubean/routes` 版本冲突 → 保留 pages 版本
 * - `PageHead` 类型:来自 `@ubean/scan`(re-export `@ubean/vue`,页面路由唯一所有者的权威版本),与 `@ubean/shared` 的下沉副本冲突 → 保留 scan 版本
 * - `PageAssetTags` 类型:来自 `@ubean/pages`,与 `@ubean/app` 版本冲突 → 保留 pages 版本
 * - `HttpMethod` 类型:来自 `@ubean/scan`(API 路由,含 HEAD/OPTIONS),与 `@ubean/pages` 的 useFetch 子集冲突 → 保留 scan 版本
 */

// ============== 基础层(leaf packages,无内部冲突)==============
export * from '@ubean/shared';
// Node-only 工具（端口探测 / vite 配置探测）——聚合器主入口为服务端语义，保留导出
export * from '@ubean/shared/node';
export * from '@ubean/seo';
export * from '@ubean/pages';
export * from '@ubean/markdown';
export * from '@ubean/i18n';

// ============== 服务端运行时 ==============
export * from '@ubean/routes';
export * from '@ubean/server';
export * from '@ubean/app';

// ============== 构建时工具 ==============
// 注意: auto-imports 预设已并入 `@ubean/build/codegen`（VUE_PRESET/UBEAN_CLIENT_PRESET 等
// 经下方 `export * from '@ubean/build/codegen'` 导出)
export * from '@ubean/build/prerender';
export * from '@ubean/preset';
export * from '@ubean/config';
export * from '@ubean/build/codegen';

// ============== 路由扫描器 + AST 提取器 ==============
// 注意:`useRouter`(无参数,返回服务端 UbeanRouter 单例)已随 rou3 router
// 迁至 `@ubean/routes`(上方 `export * from '@ubean/routes'` 已导出,
// 文件末尾另有显式消歧 re-export)
// `@ubean/scan` 主入口已 re-export `./types` 中的所有类型,无需额外 `export type *`
export * from '@ubean/scan';

// ============== Vue 客户端运行时(选择性导出,避免冲突)==============
// 跳过与其它包冲突的符号(见文件顶部冲突处理策略)
export {
  // client entry
  getInitialPageData,
  getInitialState,
  // head
  useHeadInstance,
  injectHead,
  // composables
  createLinkHandler,
  extractPageData,
  createDataCacheStore,
  createUseAsyncData,
  invalidateCache,
  clearCache,
  useServerData,
  // 注意:`getInvalidatedKeysForAction` 不从 @ubean/runtime 重新导出
  // 保留 @ubean/pages 的 2-arg 版本(对齐原 ubean 行为,context 参数可选)
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
  // router (Vue Router 工厂;服务端版本为 createServerRouter,见 @ubean/routes)
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
  // islands hydrate
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
  // i18n(Vue composable 版本; 服务端 ALS 版从 `@ubean/i18n` / `ubean/runtime/i18n` 导出)
  useI18n as useVueI18n,
  createUbeanI18n,
  configureI18nRuntime,
  t as tVue,
  setLocale as setVueLocale,
  getLocale as getVueLocale,
  localizePath as localizeVuePath,
  switchLocalePath as switchVueLocalePath,
  extractLocaleFromPath as extractVueLocaleFromPath,
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
  VueHeadClient,
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
  VueI18nInstance,
  I18nRuntimeConfig,
  HeadClient
} from '@ubean/client';

// ============== Vite 插件(通过子路径导出,避免拉入 vite 依赖)==============
export { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
export type { UbeanPluginOptions as UbeanCorePluginOptions } from '@ubean/build/vite';
// 别名 `ubeanPlugin`(对齐原 ubean 主入口导出名)— 指向 build 插件
// 注意:组合版 `ubeanPlugin`(build + vue + islands)在 `./vite` 子路径导出
export { ubeanPlugin } from '@ubean/build/vite';
export { ubeanVite } from '@ubean/build/vue';
export type { UbeanViteOptions } from '@ubean/build/vue';
export { VUE_PLUGIN_INCLUDE } from '@ubean/build/vue';
// `ubeanIslandsPlugin` 来自 `/vite` 子路径;`getIslandsBootstrapScript` 在主入口
export { ubeanIslandsPlugin } from '@ubean/islands/vite';
export { ubeanServerActionsPlugin } from '@ubean/build/actions';
export { vClient, getIslandsBootstrapScript, defineServerIsland, defineIsland } from '@ubean/islands';
export type { ServerIslandOptions, IslandStrategy, IslandOptions } from '@ubean/islands';
export { createVueRenderer } from '@ubean/client/ssr';
export type { VueRendererSimpleOptions, VueRendererRouterOptions, VueRendererOptions } from '@ubean/client/ssr';

// ============== Hono-OpenAPI 重新导出(对齐原 ubean 行为)==============
export { validator, describeRoute, resolver, openAPIRouteHandler } from 'hono-openapi';

// ============== i18n 路由(服务端,覆盖 @ubean/i18n 的浏览器版 switchLocalePath)==============
// 原始 ubean 从 `./runtime/i18n-routing` 导出这些;此处对齐行为
export {
  createI18nMiddleware,
  switchLocalePath,
  getRequestLocale,
  getPathWithoutLocale,
  compileLocalePaths,
  extractLocaleFromPath
} from '@ubean/i18n/routing';
export type { I18nMiddlewareOptions, I18nRoutingStrategy } from '@ubean/i18n/routing';

// ============== 数据库别名(对齐原 ubean 的 `raw as sqlRawAlias`)==============
export { rawSql as sqlRawAlias } from '@ubean/server';

// ============== 冲突消歧(显式 re-export 优先于上方 `export *`)==============
// 这些名称在多个子包中存在不同实现/类型,显式选择与原 ubean 一致的来源
export { useRouter } from '@ubean/routes'; // 服务端 rou3 router 单例
export { defineDataKey } from '@ubean/pages'; // pages 模块的 defineDataKey
// 原 `clearDataCache` 同名冲突已消歧:pages 版 → `clearPageData`,
// server 版 → `clearFetchDataCache`,两者均经 `export *` 从主包导出,不再需要别名
export type { InternalFetchOptions, PageAssetTags, PageRenderer } from '@ubean/pages';
export type { PageHead, HttpMethod } from '@ubean/scan'; // PageHead 以 vue(经 scan)为准;HttpMethod 为 API 路由方法(含 HEAD/OPTIONS)

// ============== CLI scaffold 库(对齐原 ubean 主入口导出)==============
// `@ubean/cli` 主入口现在是纯库导出(scaffold/fs-ops/templates),无 `runMain` 副作用
export { createFsOps, scaffold, deleteScaffold, recoverScaffold, listScaffoldableFiles } from '@ubean/cli';
export type { FsOps, FsOpsOptions, BackupOptions, ScaffoldOptions, ScaffoldResult, ScaffoldType } from '@ubean/cli';

// DevTools 自定义 Tab 从 `@ubean/devtools` 导入（opt-in，不进入聚合器硬依赖）

// ============== logger(基于 tslog@5 的统一日志系统)==============
export { logger, getLogger, createUbeanLogger } from '@ubean/shared/logger';
export type { UbeanLogger, UbeanLoggerOptions, LogLevelName, RequestLoggerOptions } from '@ubean/shared/logger';
// Hono 请求日志中间件(需要 hono,独立子路径避免核心 logger 引入 hono)
export { createRequestLoggerMiddleware } from '@ubean/shared/logger/hono';
