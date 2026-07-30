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
 * ISR (Incremental Static Regeneration) 规则。
 *
 * - `number` → `{ ttl: <秒数>, swr: false }` 的简写
 * - 对象形式可显式指定 `swr` 启用 stale-while-revalidate 语义
 *   (返回过期内容 + 后台异步重新生成)
 */
export interface IsrRule {
  /** 缓存有效期(秒)。过期后下次请求触发重新生成 */
  ttl: number;
  /** 是否启用 stale-while-revalidate:过期时先返回旧内容,后台异步刷新 */
  swr?: boolean;
}

/**
 * 路由规则,由 @ubean/api-routes (route-rules) 和 @ubean/server (cache) 共享。
 * 完整的 ResolvedConfig 在 @ubean/config 中定义。
 *
 * P9-03 扩展:支持 per-route 渲染规则(`ssr`/`prerender`/`isr`)。
 * 这些字段为运行时 / 构建时的渲染提示,与原有的 `cache`/`headers`/`redirect`/
 * `rewrite`/`proxy` 等运行时规则并存:
 *
 * - `ssr: true`        强制该路由走 SSR(覆盖全局 `ssr.exclude`)
 * - `ssr: false`       强制该路由跳过 SSR(走 CSR shell)
 * - `ssr: 'streaming'` 强制该路由走流式 SSR(覆盖全局 `ssr.streaming`)
 * - `prerender: true`  该路由加入 SSG 预渲染队列(由 `@ubean/prerender` 自动发现)
 * - `isr: 60` 或 `isr: { ttl: 60, swr: true }`  启用 ISR,以 TTL 秒缓存渲染 HTML
 *
 * 注意:构建时预渲染策略已迁移至 `PrerenderConfig`(由 `ubean.config.ts` 的
 * `prerender` 字段统一管理),`RouteRule.prerender` 仅作为自动发现标记 ——
 * `prerender: true` 的路由会被 `collectPrerenderRoutes` 加入队列(受
 * `PrerenderConfig.exclude` 过滤)。
 */
export interface RouteRule {
  cache?: { ttl?: number; swr?: boolean };
  headers?: Record<string, string>;
  redirect?: string | { to: string; statusCode?: number };
  rewrite?: string;
  proxy?: string;
  /**
   * Per-route SSR 渲染策略(P9-03)。覆盖全局 `ssr.exclude` / `ssr.streaming`。
   *
   * - `true`  强制 SSR(即使命中全局 exclude)
   * - `false` 强制 CSR(即使全局未排除)
   * - `'streaming'` 强制流式 SSR(等同于 `ssr: true` + 流式输出)
   */
  ssr?: boolean | 'streaming';
  /**
   * 标记该路由加入 SSG 预渲染队列(P9-03)。
   * 由 `collectPrerenderRoutes` 自动从 `routeRules` 中扫描发现。
   */
  prerender?: boolean;
  /**
   * 启用 ISR(增量静态再生,P9-03)。
   *
   * 服务端将渲染后的 HTML 以 TTL 秒缓存;过期后下次请求触发重新生成。
   * `swr: true` 时,过期窗口内先返回旧 HTML,同时后台异步刷新。
   */
  isr?: number | IsrRule;
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
  /**
   * 匹配到的路由规则(P9-03)。由 `createRouteRulesMiddleware` 在请求开始时
   * 写入,供页面渲染器读取 per-route 的 `ssr`/`isr`/`prerender` 等字段。
   * 未启用 routeRules 中间件时为 `undefined`。
   */
  routeRule?: RouteRule;
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
