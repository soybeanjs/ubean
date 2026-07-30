export { defineHandler, defineHandlerMeta, defineMiddleware, isHandlerChain, extractRouteMeta } from './handler';

export { registerRoutes, registerApiRoutes, registerPageRoutes, createRouteLoader } from './router';
export type { RouteRegistrar, RegisterOptions } from './router';

export { compileRouteRules, matchRouteRules, createRouteRulesMiddleware, normalizeIsrRule } from './route-rules';
export type { RouteRule, CompiledRouteRule, IsrRule } from './route-rules';

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

export { setInternalFetcher, getInternalFetcher, clearInternalFetcher, createInternalAdapter } from './internal-fetch';
export type { InternalFetchOptions } from './internal-fetch';

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
} from '@ubean/types';
