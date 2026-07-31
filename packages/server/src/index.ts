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
/* 组件级缓存指令 (P9-08)                                                       */
/* -------------------------------------------------------------------------- */
export {
  createComponentMemoryStore,
  useComponentCacheStore,
  clearComponentCacheStore,
  cacheLife,
  cacheTag,
  wrapWithCache,
  revalidateTag,
  revalidateTags,
  revalidatePath,
  clearComponentCache
} from './cache-directive';
export type { ComponentCacheEntry, ComponentCacheStore, CacheWrapOptions } from './cache-directive';

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
