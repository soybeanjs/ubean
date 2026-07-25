/**
 * @ubean/types - Shared types for ubean
 *
 * 此包是所有子包的基础类型依赖,不依赖任何其他 @ubean/* 子包。
 * 为了避免循环依赖,以下基础类型从其他子包下沉到此处:
 * - BaseRouteMeta(从 @ubean/routing)
 * - Span 相关类型(从 @ubean/server)
 * - PageHead(从 @ubean/pages)
 */
import type { Context, MiddlewareHandler, Env as HonoEnv, Handler } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import type { Input as HonoInput, HandlerResponse } from 'hono/types';

/* -------------------------------------------------------------------------- */
/* 基础路由元数据(从 @ubean/routing 下沉,避免 routing ← types ← routing 循环)    */
/* -------------------------------------------------------------------------- */

/**
 * 基础路由元数据,由 @ubean/routing 使用。
 * 扩展的 RouteMeta 在此处定义,增加了 rateLimit 和 cache 字段。
 */
export interface BaseRouteMeta {
  requiresAuth?: boolean;
  [key: string]: unknown;
}

export interface RateLimitMeta {
  maxRequests: number;
  windowSeconds: number;
}

export interface CacheMeta {
  ttl: number;
  swr?: boolean;
}

export interface RouteMeta extends BaseRouteMeta {
  rateLimit?: RateLimitMeta;
  cache?: CacheMeta;
}

/* -------------------------------------------------------------------------- */
/* 路由规则类型(从 @ubean/config / @ubean/api-routes / @ubean/server 共享) */
/* -------------------------------------------------------------------------- */

/**
 * 路由规则,由 @ubean/api-routes (route-rules) 和 @ubean/server (cache) 共享。
 * 完整的 ResolvedConfig 在 @ubean/config 中定义。
 *
 * 注意:构建时预渲染策略已迁移至 `PrerenderConfig`(由 `ubean.config.ts` 的
 * `prerender` 字段统一管理),`RouteRule` 仅保留运行时关注点
 * (cache/headers/redirect/rewrite/proxy)。
 */
export interface RouteRule {
  cache?: { ttl?: number; swr?: boolean };
  headers?: Record<string, string>;
  redirect?: string | { to: string; statusCode?: number };
  rewrite?: string;
  proxy?: string;
}

/* -------------------------------------------------------------------------- */
/* 可观测性 Span 类型(从 @ubean/server 下沉,避免循环依赖)              */
/* -------------------------------------------------------------------------- */

export type SpanStatus = 'ok' | 'error' | 'cancelled';

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined | null;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface SpanEndOptions {
  status?: SpanStatus;
  error?: Error;
  attributes?: SpanAttributes;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface SpanOptions {
  name: string;
  attributes?: SpanAttributes;
  parent?: Span | SpanContext;
}

export interface Span {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  error?: Error;
  parent?: Span;
  end(options?: SpanEndOptions): void;
  setAttribute(key: string, value: string | number | boolean | undefined | null): void;
  setAttributes(attrs: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  isRecording(): boolean;
  duration(): number | undefined;
}

/* -------------------------------------------------------------------------- */
/* 页面 Head 类型(从 @ubean/pages 下沉,避免 pages ← types ← pages 循环)         */
/* -------------------------------------------------------------------------- */

export interface PageHead {
  title?: string;
  meta?: Array<Record<string, string>>;
  link?: Array<Record<string, string>>;
  script?: Array<Record<string, string>>;
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Hono 应用上下文类型                                                          */
/* -------------------------------------------------------------------------- */

export interface UbeanVariables extends RequestIdVariables {
  route: { meta: RouteMeta; path: string; method: string };
  span?: Span;
  locale?: string;
  pathWithoutLocale?: string;
}

export interface UbeanBindings {}

export interface UbeanEnv extends HonoEnv {
  Variables: UbeanVariables;
  Bindings: UbeanBindings;
}

export type UbeanContext = Context<UbeanEnv>;

export type Input = HonoInput;

export interface GenericSchema<O = unknown> {
  safeParse?(value: unknown): { success: boolean; data?: O; error?: { issues?: Array<{ message?: string }> } };
  parse?(value: unknown): O;
  _output?: O;
}

export type UbeanMiddleware<I extends Input = {}> = MiddlewareHandler<UbeanEnv, any, I>;

export type UbeanHandler<I extends Input = {}, R extends HandlerResponse<any> = HandlerResponse<any>> = Handler<
  UbeanEnv,
  any,
  I,
  R
>;

export type ComposedHandler = MiddlewareHandler<UbeanEnv>;
