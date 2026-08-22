export { defineHandler, defineHandlerMeta, defineMiddleware, isHandlerChain, extractRouteMeta } from './handler';

// rou3 server router(自 @ubean/routing 迁入;createUbeanRouter 改名 createServerRouter,
// 与 @ubean/client 的 Vue Router 工厂 createUbeanRouter 彻底消歧)
export { UbeanRouter, useRouter, createServerRouter } from './server-router';
export type { CompiledRoute, CompiledMiddleware, CompiledPage, CompiledLayout } from './server-router';

export {
  registerRoutes,
  registerApiRoutes,
  registerPageRoutes,
  createRouteLoader,
  sortPagesForRegistration
} from './router';
export type { RouteRegistrar, RegisterOptions } from './router';

export {
  compileRouteRules,
  matchRouteRules,
  createRouteRulesMiddleware,
  normalizeIsrRule,
  applyPathTransform
} from './route-rules';
export type { RouteRulesMiddlewareOptions } from './route-rules';
export type { RouteRule, CompiledRouteRule, IsrRule } from './route-rules';
export { resolveSelectSsr, ssrModeHeader } from './select-ssr';
export type { SelectSsrMode, SelectSsrValue, ResolveSelectSsrInput, ResolvedSelectSsr } from './select-ssr';

export {
  serveIsr,
  getIsrCache,
  getStaleIsrCache,
  setIsrCache,
  invalidateIsrCache,
  invalidateIsrCachePattern,
  isIsrEntryStale,
  buildIsrCacheKey,
  getIsrRuleFromContext
} from './isr';
export type { IsrCacheStore, IsrCacheEntry, IsrCacheEntryInternal, IsrServeOptions } from './isr';

// Note: P9-02 page-action helpers (parseFormActionName, handleActionResponse,
// runServerAction) are internal to the router's `handlePageRequest` and are
// NOT re-exported here. The public Server Actions API lives in `@ubean/actions`.
// Tests import directly from `../src/page-actions`.

export { setInternalFetcher, getInternalFetcher, clearInternalFetcher, createInternalAdapter } from './internal-fetch';
export type { InternalFetchOptions } from './internal-fetch';

export { isBotUserAgent } from './bot-detection';

export { registerOpenAPIRoutes } from './openapi';
export type { OpenAPIGenerationOptions } from './openapi';

// Re-export shared types for convenience
export type {
  RouteMeta,
  UbeanEnv,
  UbeanContext,
  UbeanVariables,
  UbeanBindings,
  UbeanMiddleware,
  UbeanHandler,
  ComposedHandler,
  Input,
  GenericSchema,
  Span,
  SpanContext,
  SpanStatus,
  SpanAttributes,
  SpanEvent,
  SpanOptions,
  SpanEndOptions
} from '@ubean/shared';
