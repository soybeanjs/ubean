/**
 * @ubean/server - Server-side runtime primitives for ubean
 *
 * 此包提供所有服务端运行时原语:缓存、数据库、队列、cron、WebSocket、SSE、
 * 存储、可观测性、静态文件、CORS、限流。
 *
 * 客户端不应导入此包。
 */

/* -------------------------------------------------------------------------- */
/* 缓存                                                                         */
/* -------------------------------------------------------------------------- */
export {
  createMemoryStore,
  useCacheStore,
  clearCacheStore,
  createCacheMiddleware,
  cachedEventHandler,
  invalidateRouteCache,
  resolveRouteCacheRules
} from './cache';
export type { CacheEntry, CacheStore, CacheRule } from './cache';

/* -------------------------------------------------------------------------- */
/* 数据库                                                                       */
/* -------------------------------------------------------------------------- */
export {
  defineDatabase,
  useDatabase,
  closeDatabases,
  getDatabaseHooks,
  registerDb0Create,
  migrateDatabase,
  runMigrations,
  rawSql,
  sqlRaw,
  raw
} from './database';
export type {
  Database,
  DatabaseHooks,
  DatabaseConnector,
  DatabaseConnectorInstance,
  DrizzleConfig,
  DatabaseOptions,
  Migration
} from './database';

/* -------------------------------------------------------------------------- */
/* 队列                                                                         */
/* -------------------------------------------------------------------------- */
export {
  defineQueue,
  createMemoryQueueDriver,
  setQueueDriver,
  useQueueDriver,
  sendMessage,
  sendMessages,
  getQueueDefinitions,
  clearQueueDefinitions,
  startQueueWorkers,
  stopQueueWorkers,
  getQueueStats,
  getAllQueueStats
} from './queue';
export type {
  QueueMessage,
  QueueHandler,
  QueueOptions,
  QueueDefinition,
  QueueDriver,
  SendOptions,
  QueueStats
} from './queue';

/* -------------------------------------------------------------------------- */
/* Cron 定时任务                                                                */
/* -------------------------------------------------------------------------- */
export { defineScheduled, getScheduledTasks, clearScheduledTasks, runScheduledTask, createCronContext } from './cron';
export type { CronSchedule, CronTaskMeta, CronTaskDefinition, CronContext, ScheduledTask } from './cron';

export {
  createMemoryCronScheduler,
  startCronScheduler,
  resetCronRunCounts,
  parseCron,
  validateCron
} from './cron-scheduler';
export type { CronScheduler, SchedulerOptions } from './cron-scheduler';

/* -------------------------------------------------------------------------- */
/* WebSocket                                                                   */
/* -------------------------------------------------------------------------- */
export {
  createRoom,
  defineWebSocket,
  defineRoom,
  getRoom,
  getRooms,
  broadcast,
  registerWebSocket,
  getWebSocketDefinitions,
  handleUpgrade,
  handleMessage,
  handleClose,
  handleError,
  createWebSocketMiddleware,
  clearWebSocketState
} from './websocket';
export type { Peer, WebSocketRoom, WebSocketHooks, WebSocketDefinition, UpgradeResult } from './websocket';

/* -------------------------------------------------------------------------- */
/* SSE                                                                         */
/* -------------------------------------------------------------------------- */
export {
  formatSSEMessage,
  createSSEStream,
  defineSSE,
  getSSEConnections,
  broadcastSSE,
  closeAllSSE,
  sseHeaders,
  clearSSEState
} from './sse';
export type { SSEMessage, SSEConnection, SSEHandler, SSEOptions } from './sse';

/* -------------------------------------------------------------------------- */
/* 存储                                                                         */
/* -------------------------------------------------------------------------- */
export { createMemoryDriver, createStorage, useStorage, clearGlobalStorage, createKV, useKV } from './storage';
export type { StorageDriver, UbeanStorage, KVOptions, KVNamespace } from './storage';

/* -------------------------------------------------------------------------- */
/* 邮件发送 (P9-25)                                                             */
/* -------------------------------------------------------------------------- */
export {
  defineEmailProvider,
  createEmailTransport,
  setDefaultEmailProvider,
  useEmailProvider,
  getEmailTransport,
  getEmailProvider,
  getEmailProviderNames,
  sendEmail,
  renderEmailTemplate,
  getSentEmails,
  clearSentEmails,
  clearEmailProviders
} from './email';
export type {
  EmailAttachment,
  EmailOptions,
  EmailResult,
  EmailTransport,
  MockEmailTransport,
  EmailProviderType,
  LogEmailProviderConfig,
  SmtpEmailProviderConfig,
  MockEmailProviderConfig,
  SendmailEmailProviderConfig,
  EmailProviderConfig,
  DefineEmailProviderOptions,
  EmailProvider
} from './email';

/* -------------------------------------------------------------------------- */
/* 可观测性                                                                     */
/* -------------------------------------------------------------------------- */
export {
  generateRequestId,
  getRequestId,
  REQUEST_ID_HEADER,
  createSpan,
  createObservabilityTracer,
  setGlobalTracer,
  getGlobalTracer,
  startSpan,
  withSpan,
  createOpenTelemetryExporter,
  createConsoleExporter,
  createTracingMiddleware,
  getSpan
} from './observability';
export type {
  RequestIdOptions,
  ObservabilityHooks,
  ObservabilityExporter,
  ObservabilityConfig,
  ObservabilityTracer,
  TracingMiddlewareOptions
} from './observability';

/* -------------------------------------------------------------------------- */
/* 静态文件                                                                     */
/* -------------------------------------------------------------------------- */
export { serveStatic } from './static';
export type { ServeStaticOptions } from './static';

/* -------------------------------------------------------------------------- */
/* CORS                                                                        */
/* -------------------------------------------------------------------------- */
export { createCorsMiddleware, defineCors } from './cors';
export type { CorsOptions } from './cors';

/* -------------------------------------------------------------------------- */
/* 限流                                                                         */
/* -------------------------------------------------------------------------- */
export { createRateLimitMiddleware, defineRateLimit, createMemoryRateLimitStore } from './rate-limit';
export type { RateLimitOptions, RateLimitInfo, RateLimitStoreEntry, RateLimitStore } from './rate-limit';

/* -------------------------------------------------------------------------- */
/* CSRF 保护 (P9-12)                                                            */
/* -------------------------------------------------------------------------- */
export { createCsrfMiddleware, defineCsrf, generateCsrfToken } from './csrf';
export type { CsrfOptions } from './csrf';

/* -------------------------------------------------------------------------- */
/* 安全头 (P9-13)                                                               */
/* -------------------------------------------------------------------------- */
export { createSecurityHeadersMiddleware, defineSecurityHeaders, serializeCsp } from './security-headers';
export type { ContentSecurityPolicyDirectives, SecurityHeadersOptions } from './security-headers';

/* -------------------------------------------------------------------------- */
/* 通用 Sessions API (P9-11)                                                   */
/* -------------------------------------------------------------------------- */
export { createSessionMiddleware, createStorageSessionStore, useSession, defineSessionStore } from './sessions';
export type { Session, SessionData, SessionStore, SessionOptions } from './sessions';

/* -------------------------------------------------------------------------- */
/* after() 响应后执行 API (P9-14)                                              */
/* -------------------------------------------------------------------------- */
export { after, createAfterMiddleware, flushAfterCallbacks, getAfterCallbackCount } from './after';

/* -------------------------------------------------------------------------- */
/* 请求 memoization (P9-15) + fetch Data Cache (Task 4)                        */
/* -------------------------------------------------------------------------- */
export { createFetchMemoizationMiddleware, createMemoizedFetch } from './fetch-memo';
export {
  createDataCacheMiddleware,
  revalidateDataCacheTag,
  revalidateDataCachePath,
  clearDataCache,
  getDataCacheSize
} from './fetch-memo';
export type { FetchCacheOptions, FetchInitWithNext, DataCacheMiddlewareOptions } from './fetch-memo';

/* -------------------------------------------------------------------------- */
/* Draft/Preview Mode (P9-23)                                                  */
/* -------------------------------------------------------------------------- */
export {
  createDraftModeMiddleware,
  defineDraftMode,
  enableDraftMode,
  disableDraftMode,
  isDraftMode,
  useDraftMode
} from './draft-mode';
export type { DraftModeOptions, DraftMode } from './draft-mode';

/* -------------------------------------------------------------------------- */
/* Single-flight mutations (P9-16)                                             */
/* -------------------------------------------------------------------------- */
export {
  createSingleFlightMiddleware,
  defineSingleFlight,
  defineRevalidation,
  unregisterRevalidation,
  getRevalidationEntries,
  clearRevalidationRegistry,
  invalidate,
  invalidateKey,
  getInvalidatedKeys,
  runRevalidation
} from './single-flight';
export type {
  RevalidationKey,
  RevalidationContext,
  RevalidationFetcher,
  RevalidationEntry,
  RevalidationResult,
  SingleFlightOptions
} from './single-flight';

/* -------------------------------------------------------------------------- */
/* 组件级缓存 (P9-08)                                                          */
/* -------------------------------------------------------------------------- */
export {
  createComponentMemoryStore,
  useComponentCacheStore,
  clearComponentCacheStore,
  cacheLife,
  cacheTag,
  defineCachedFunction,
  /** @deprecated 使用 `defineCachedFunction` */
  wrapWithCache,
  revalidateTag,
  revalidateTags,
  revalidatePath,
  clearComponentCache
} from './cache-directive';
export type { ComponentCacheEntry, ComponentCacheStore, CachedFunctionOptions } from './cache-directive';
/** @deprecated 使用 `CachedFunctionOptions` */
export type { CacheWrapOptions } from './cache-directive';

/* -------------------------------------------------------------------------- */
/* Analytics (P9-27)                                                          */
/* -------------------------------------------------------------------------- */
export {
  createLogAnalyticsProvider,
  createMemoryAnalyticsProvider,
  createMockAnalyticsProvider,
  defineAnalyticsProvider,
  registerAnalyticsProvider,
  unregisterAnalyticsProvider,
  getAnalyticsProvider,
  listAnalyticsProviders,
  clearAnalyticsProviders,
  setGlobalAnalyticsProvider,
  getGlobalAnalyticsProvider,
  extractAnalyticsContext,
  trackPageView,
  trackEvent,
  trackRaw,
  createAnalyticsMiddleware,
  defineAnalytics,
  useAnalytics
} from './analytics';
export type {
  AnalyticsContext,
  AnalyticsEvent,
  AnalyticsProperties,
  AnalyticsRecord,
  AnalyticsProvider,
  AnalyticsProviderOptions,
  AnalyticsTrackOptions,
  AnalyticsMiddlewareOptions
} from './analytics';

/* -------------------------------------------------------------------------- */
/* Feature Flags / A/B Testing (P9-28)                                         */
/* -------------------------------------------------------------------------- */
export {
  createMemoryFeatureFlagStore,
  setGlobalFeatureFlagStore,
  getGlobalFeatureFlagStore,
  clearFeatureFlags,
  defineFeatureFlag,
  defineExperiment,
  evaluateFlag,
  evaluateFlagWithReason,
  getVariant,
  getVariantAssignment,
  extractFlagContext,
  createFeatureFlagsMiddleware,
  useFlags,
  useExperiments,
  useFlagContext,
  evaluateFlagFromContext,
  getVariantFromContext,
  listFlagNames,
  listExperimentNames,
  removeFeatureFlag,
  removeExperiment
} from './feature-flags';
export type {
  FlagValue,
  FlagContext,
  FlagKind,
  SegmentRule,
  Segment,
  Variant,
  FeatureFlagOptions,
  ExperimentOptions,
  FeatureFlagDefinition,
  ExperimentDefinition,
  FlagEvaluation,
  ExperimentAssignment,
  FeatureFlagStore,
  FeatureFlagsMiddlewareOptions
} from './feature-flags';

/* -------------------------------------------------------------------------- */
/* CDN / Edge Cache (Task 17)                                                  */
/* -------------------------------------------------------------------------- */
export {
  defineSurrogateKeys,
  getSurrogateKeys,
  setGlobalPurgeAdapter,
  getGlobalPurgeAdapter,
  purgeKeys,
  purgeUrls,
  createCacheControlMiddleware,
  createCloudflarePurgeAdapter,
  createFastlyPurgeAdapter,
  createMockPurgeAdapter,
  _resetCdnCache
} from './cdn-cache';
export type { SurrogateKeyHeader, CdnPurgeAdapter, PurgeResult, CacheControlOptions } from './cdn-cache';

/* -------------------------------------------------------------------------- */
/* 从 @ubean/types re-export 共享类型(方便消费者单入口导入)                       */
/* -------------------------------------------------------------------------- */
export type {
  RouteRule,
  Span,
  SpanAttributes,
  SpanContext,
  SpanEndOptions,
  SpanEvent,
  SpanOptions,
  SpanStatus,
  UbeanEnv,
  UbeanContext,
  UbeanVariables,
  UbeanBindings
} from '@ubean/types';
