/**
 * @ubean/app - Hono app factory and server config for ubean
 *
 * 此包提供:
 * - `createUbeanApp(options)` — 创建 ubean Hono 应用
 * - `defineServer(options)` — 定义服务端配置(server-side counterpart of `defineApp`)
 * - `UbeanApp` 类 + `UbeanAppPlugin` / `UbeanAppOptions` / `UbeanRuntimeHooks` 类型
 * - P9-09: 全局 Hooks (`handle`/`handleFetch`/`handleError`),对齐 SvelteKit
 *
 * 客户端不应导入此包。
 */

export { UbeanApp, createUbeanApp, applyServerConfig } from './app';

export type { UbeanAppOptions, UbeanAppPlugin, UbeanRuntimeHooks, AppPlugin, PageRenderer, PageAssetTags } from './app';

export { defineServer, createDefaultServerConfig, mergeServerConfigs } from './define-server';

export type { DefineServerOptions, ResolvedServerConfig, ServerHooks } from './define-server';

/* -------------------------------------------------------------------------- */
/* P9-09 全局 Hooks (handle/handleFetch/handleError)                            */
/* -------------------------------------------------------------------------- */
export {
  setGlobalHooks,
  getGlobalHooks,
  clearGlobalHooks,
  createHandleEvent,
  extractErrorMessage,
  wrapResolve,
  applyHandleHook,
  applyHandleFetchHook,
  applyHandleErrorHook
} from './hooks';
export type {
  HandleEvent,
  HandleInput,
  Handle,
  HandleFetchInput,
  HandleFetch,
  HandleErrorInput,
  HandleError,
  GlobalHooks
} from './hooks';

/* -------------------------------------------------------------------------- */
/* 便捷类型 re-export(消费者单入口导入)                                          */
/* -------------------------------------------------------------------------- */

export type { RouteRule, RouteMeta, UbeanEnv, UbeanMiddleware, ComposedHandler } from '@ubean/shared';

export type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from '@ubean/scan';

export type { RouteRegistrar, RegisterOptions } from '@ubean/routes';
