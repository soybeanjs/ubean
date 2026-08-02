/**
 * ubean — 聚合器入口
 *
 * 纯 re-export 所有子包,对外提供与原 `ubean` 包一致的 API 表面。
 *
 * 冲突处理策略(显式 re-export 优先于 `export *`):
 * - `useRouter`:来自 `@ubean/routing`(服务端 rou3 router 实例,无参数),与 `@ubean/runtime` 的 Vue composable 版冲突 → 保留 routing 版本
 * - `createUbeanRouter`:来自 `@ubean/runtime`(Vue Router,接受 options),与 `@ubean/routing` 的服务端版本冲突 → 保留 runtime 版本(对齐原 ubean 行为)
 * - `createUbeanApp`:来自 `@ubean/app`(Hono 应用工厂)。`@ubean/runtime` 的 Vue 应用工厂已重命名为 `createUbeanVueApp`(ADR-0001),不再同名冲突。主入口选择性 export 不含 `createUbeanVueApp`(见 ADR-0005 待决子项)
 * - `useSeoMeta`:来自 `@ubean/seo`(自定义实现),与 `@ubean/runtime` 重新导出的 `@unhead/vue` 版本冲突 → 保留 seo 版本
 * - `defineMiddleware`:来自 `@ubean/api-routes`(真实实现),与 `@ubean/runtime` 的 no-op 宏冲突 → 保留 api-routes 版本
 * - `defineDataKey`:来自 `@ubean/pages`,与 `@ubean/runtime` 的 own 实现冲突 → 保留 pages 版本
 * - i18n 函数:来自 `@ubean/i18n`(纯函数版),与 `@ubean/runtime` 的 Vue reactive 包装版冲突 → 保留 i18n 版本
 * - `UbeanAppOptions` 类型:来自 `@ubean/app`,与 `@ubean/runtime` 的 Vue 版本冲突 → 保留 app 版本
 * - `InternalFetchOptions` 类型:来自 `@ubean/pages`,与 `@ubean/api-routes` 版本冲突 → 保留 pages 版本
 * - `PageAssetTags` 类型:来自 `@ubean/pages`,与 `@ubean/app` 版本冲突 → 保留 pages 版本
 */

// ============== 基础层(leaf packages,无内部冲突)==============
export * from '@ubean/types';
export * from '@ubean/utils';
export * from '@ubean/error';
export * from '@ubean/env';
export * from '@ubean/seo';
export * from '@ubean/pages';
export * from '@ubean/markdown';
export * from '@ubean/i18n';

// ============== 服务端运行时 ==============
export * from '@ubean/api-routes';
export * from '@ubean/actions';
export * from '@ubean/server';
export * from '@ubean/app';

// ============== 构建时工具 ==============
export * from '@ubean/auto-imports';
export * from '@ubean/prerender';
export * from '@ubean/preset';
export * from '@ubean/config';
export * from '@ubean/codegen';
export * from '@ubean/modules';

// ============== 路由(扫描器 + rou3 router + AST 提取器)==============
// 注意:`useRouter`(无参数,返回服务端 UbeanRouter 单例)来自此处
// `createUbeanRouter`(服务端版本)会被下方 @ubean/runtime 的 Vue 版本显式覆盖
// `@ubean/routing` 主入口已 re-export `./types` 中的所有类型,无需额外 `export type *`
export * from '@ubean/routing';

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
  // router (Vue 版本,覆盖 @ubean/routing 的服务端版本)
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
  // view-transitions
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType,
  // i18n(Vue reactive 版本,使用别名避免与 @ubean/i18n 纯函数版冲突)
  useI18n as useVueI18n,
  defineLocale as defineVueLocale,
  t as tVue,
  setLocale as setVueLocale,
  getLocale as getVueLocale,
  onLocaleChange as onVueLocaleChange,
  getLocaleDir as getVueLocaleDir,
  getLocaleName as getVueLocaleName,
  getRegisteredLocales as getVueRegisteredLocales,
  detectLocale as detectVueLocale,
  detectBrowserLocale as detectVueBrowserLocale,
  addLocale as addVueLocale,
  mergeLocale as mergeVueLocale,
  clearLocales as clearVueLocales,
  getI18nConfig as getVueI18nConfig,
  setI18nConfig as setVueI18nConfig,
  localizePath as localizeVuePath,
  switchLocalePath as switchVueLocalePath,
  getDefaultLocale as getDefaultVueLocale,
  extractLocaleFromPath as extractVueLocaleFromPath,
  useSwitchLocalePath,
  useLocalePath
} from '@ubean/runtime';

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
  HeadClient
} from '@ubean/runtime';

// ============== Vite 插件(通过子路径导出,避免拉入 vite 依赖)==============
export { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
export type { UbeanPluginOptions as UbeanCorePluginOptions } from '@ubean/build/vite';
// 别名 `ubeanPlugin`(对齐原 ubean 主入口导出名)— 指向 build 插件
// 注意:组合版 `ubeanPlugin`(build + vue + islands)在 `./vite` 子路径导出
export { ubeanPlugin } from '@ubean/build/vite';
export { ubeanVuePlugin } from '@ubean/vite';
export type { UbeanVuePluginOptions } from '@ubean/vite';
export { VUE_PLUGIN_INCLUDE } from '@ubean/vite';
// `ubeanIslandsPlugin` 来自 `/vite` 子路径;`getIslandsBootstrapScript` 在主入口
export { ubeanIslandsPlugin } from '@ubean/islands/vite';
export { ubeanServerActionsPlugin } from '@ubean/actions/vite';
export { vClient, getIslandsBootstrapScript, defineServerIsland, defineIsland } from '@ubean/islands';
export type { ServerIslandOptions, IslandStrategy, IslandOptions } from '@ubean/islands';
export { createVueRenderer } from '@ubean/ssr';
export type { VueRendererSimpleOptions, VueRendererRouterOptions, VueRendererOptions } from '@ubean/ssr';

// ============== Hono-OpenAPI 重新导出(对齐原 ubean 行为)==============
export { validator, describeRoute, resolver, openAPIRouteHandler } from 'hono-openapi';

// ============== i18n 路由(服务端,覆盖 @ubean/i18n 的浏览器版 switchLocalePath)==============
// 原始 ubean 从 `./runtime/i18n-routing` 导出这些;此处对齐行为
export {
  createI18nMiddleware,
  switchLocalePath,
  getLocalePath,
  getPathWithoutLocale,
  localeRoutes
} from '@ubean/i18n/routing';
export type { I18nRoutingOptions, I18nRoutingStrategy } from '@ubean/i18n/routing';

// ============== 数据库别名(对齐原 ubean 的 `raw as sqlRawAlias`)==============
export { rawSql as sqlRawAlias } from '@ubean/server';

// ============== 冲突消歧(显式 re-export 优先于上方 `export *`)==============
// 这些名称在多个子包中存在不同实现/类型,显式选择与原 ubean 一致的来源
export { useRouter } from '@ubean/routing'; // 服务端 rou3 router 单例
export { defineDataKey } from '@ubean/pages'; // pages 模块的 defineDataKey
export type { InternalFetchOptions, PageAssetTags, PageRenderer } from '@ubean/pages';

// ============== CLI scaffold 库(对齐原 ubean 主入口导出)==============
// `@ubean/cli` 主入口现在是纯库导出(scaffold/fs-ops/templates),无 `runMain` 副作用
export { createFsOps, scaffold, deleteScaffold, recoverScaffold, listScaffoldableFiles } from '@ubean/cli';
export type { FsOps, FsOpsOptions, BackupOptions, ScaffoldOptions, ScaffoldResult, ScaffoldType } from '@ubean/cli';

// ============== DevTools 自定义 Tab 注册(对齐原 ubean 主入口导出)==============
// 原位于 `packages/ubean/src/core/devtools/define-tab.ts`,Phase 7 迁移至 @ubean/devtools
export { defineDevToolsTab, getCustomTabs, clearCustomTabs } from '@ubean/devtools';
export type { DevToolsTabDefinition } from '@ubean/devtools';

// ============== logger(内联 consola,与原 ubean `core/log` 行为一致)==============
import { consola } from 'consola';

export const logger = consola.withTag('ubean');
