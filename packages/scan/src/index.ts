/**
 * `@ubean/scan` —— 项目扫描与路由元数据层:服务端目录扫描(API 路由 /
 * 中间件 / 插件 / crons / queues / locales / entries)+ 页面扫描聚合
 * (`scanProject` 内部委托 `@ubean/vue/vite` 的 `scanPages`,页面路由
 * 唯一所有者是 `@ubean/vue`)。
 *
 * 服务端路由运行时(defineHandler / registerRoutes / rou3 router /
 * ISR / OpenAPI)在 `@ubean/routes`。
 *
 * 本文件大量 re-export `@ubean/vue` 与 `@ubean/vue/vite` 的导出,保持既有
 * 消费方(`packages/vite` / `routes` / `builder` / `cli` / 用户代码)
 * 的导入路径完全兼容。
 */

// 聚合扫描(API/中间件/插件/crons/queues/locales/entries + 页面[委托 vue])
export { scanProject } from './scan';
export { detectHttpExports, detectHttpExportsFromCode } from './detect-exports';

// 纯函数:所有权在 @ubean/vue/vite,此处 re-export(BC)
export { filePathToRoute, stripRouteGroups, parseMatchers, extractSlotAndIntercept } from '@ubean/vue/vite';
export { generateRouteName, generateLayoutName } from '@ubean/vue/vite';

// 服务端专用:API 路由 ID
export { generateApiRouteId } from './api-route-id';

// definePage 提取器:页面字段来自 @ubean/vue/vite(BC re-export),
// defineHandlerMeta(服务端)保留在本包
export { extractDefinePage, extractDefinePageFromCode, extractDefineMeta, extractDefineMetaFromCode } from './define-page';

// rou3 server router 与 Compiled* 类型已迁至 `@ubean/routes`(服务端路由运行时)

// matchers:所有权在 @ubean/vue(客户端内核,scan re-export 聚合)
export {
  defineMatcher,
  getMatcher,
  hasMatcher,
  listMatcherNames,
  clearMatchers,
  validateParams,
  createMatcherGuard
} from '@ubean/vue';
export type { MatcherFunction, MatcherGuardOptions } from '@ubean/vue';

export type {
  HttpMethod,
  ScannedFile,
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPlugin,
  ScannedCronTask,
  ScannedQueue,
  ScannedLocale,
  ScannedAppEntry,
  ScannedServerEntry,
  AppEntry,
  ScanOptions,
  ScanResult,
  DefineMetaResult
} from './types';
// 页面路由类型:所有权在 @ubean/vue,此处 re-export(BC)
export type { PageMeta, PageHead, ScannedPage, ScannedPageRoute, ScannedLayout, ScanPagesOptions, ScanPagesResult } from './types';
