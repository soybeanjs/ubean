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
 * P9-04 扩展:支持 Partial Prerendering(`ppr`)。
 * - `ppr: true` 启用 PPR:静态壳预渲染 + Suspense 流式动态内容
 *   (对齐 Next.js 16 PPR / Astro `server:defer`)。运行时强制流式 SSR,
 *   覆盖全局 `ssr.exclude`;同时该路由加入预渲染队列(等价于 `prerender: true`),
 *   预渲染产物作为静态壳供运行时复用。
 *
 * 注意:构建时预渲染策略已迁移至 `PrerenderConfig`(由 `ubean.config.ts` 的
 * `prerender` 字段统一管理),`RouteRule.prerender` 仅作为自动发现标记 ——
 * `prerender: true` 的路由会被 `collectPrerenderRoutes` 加入队列(受
 * `PrerenderConfig.exclude` 过滤)。`ppr: true` 隐含 `prerender: true`。
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
  /**
   * 启用 Partial Prerendering / Server Islands(P9-04)。
   *
   * - `true` 该路由启用 PPR:静态壳预渲染 + Suspense 流式动态内容
   *
   * 运行时行为:
   * - 强制流式 SSR(覆盖 `ssr.exclude` / 全局 `streaming`),等价于 `ssr: 'streaming'`
   * - 隐含 `prerender: true`,该路由会被预渲染(产物作为静态壳)
   * - 页面内带 `server:defer` 指令的组件在预渲染时仅渲染 fallback,
   *   在流式 SSR 时通过 Suspense 边界流式输出实际内容
   *
   * 对齐:Next.js 16 PPR(稳定)、Astro 5 `server:defer`。
   */
  ppr?: boolean;
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

/* -------------------------------------------------------------------------- */
/* Server Actions (P9-02)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Action ID — a stable string identifier for a server action.
 *
 * Generated from the action's source location (file path + export name) so
 * the client and server sides agree on the same ID without runtime
 * coordination. Format: `<base32(sha1(relPath:exportName))>`.
 */
export type ActionId = string;

/**
 * Context passed to every server action handler.
 *
 * - `request`: the underlying `Request` (for headers, cookies, etc.)
 * - `context`: the Hono context (for `c.set`, `c.get`, `c.req`, etc.)
 * - `params`: route params extracted from the URL (for page-level actions)
 */
export interface ActionContext {
  request: Request;
  context: Context<UbeanEnv>;
  params: Record<string, string>;
}

/**
 * Result returned by a server action.
 *
 * - `data`: the action's return value (serializable)
 * - `error`: an `ActionError` instance thrown by the handler, or `null`
 * - `errors`: per-field validation errors (SvelteKit-style `ActionFailure<{ fields }>`),
 *   populated when the handler returns `fail()` with field errors
 *
 * Either `data` (success) or `error`/`errors` (failure) is set; never both.
 */
export interface ActionResult<T = unknown> {
  data?: T;
  error?: { message: string; code?: string };
  errors?: Record<string, string> | null;
  status: number;
}

/**
 * A handler that runs server-side when an action is invoked.
 *
 * - When `schema` is provided to `defineAction`, the handler receives the
 *   parsed/validated `data` (typed by the schema's output).
 * - Without a schema, the handler receives the raw `input` (FormData or
 *   parsed JSON object).
 *
 * The handler may return any serializable value, throw an `ActionError`,
 * or call `fail()` to return field-level validation errors.
 */
export type ActionHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: ActionContext
) => Promise<TOutput | ActionFailure> | TOutput | ActionFailure;

/**
 * Field-level validation failure (SvelteKit-style).
 *
 * Returned by `fail()` inside an action handler to signal validation errors
 * back to the form without throwing. The page can read `result.errors` to
 * display per-field messages.
 */
export interface ActionFailure<T = Record<string, string>> {
  __actionFailure: true;
  status: number;
  errors: T;
}

/**
 * Schema accepted by `defineAction` for input validation.
 *
 * Any Standard Schema (`safeParse`/`parse`) or a function
 * `(value: unknown) => { success: true; data } | { success: false; error }`.
 */
export interface ActionSchema<TOutput = unknown> {
  safeParse?(value: unknown): { success: boolean; data?: TOutput; error?: { issues?: Array<{ message?: string }> } };
  parse?(value: unknown): TOutput;
  _output?: TOutput;
}

/**
 * A registered server action — the runtime representation produced by
 * `defineAction`. Carries the action ID and the original handler.
 *
 * The function is callable server-side (direct invocation with typed input)
 * and is replaced by an RPC stub on the client (POST to `/__actions`).
 */
export interface ServerAction<TInput = unknown, TOutput = unknown> {
  /** Stable action ID (file path + export name hash). */
  id: ActionId;
  /** The handler that runs server-side. */
  handler: ActionHandler<TInput, TOutput>;
  /** Optional schema for input validation. */
  schema?: ActionSchema<TOutput>;
  /** Original function name (for error messages / debugging). */
  name: string;
  /** Source file path (project-relative, for debugging). */
  filePath?: string;
}

/**
 * Brand used to identify a server action at runtime (`Symbol`).
 */
export const ACTION_BRAND = Symbol.for('ubean.action');

/**
 * Type guard: is the value a registered `ServerAction`?
 */
export function isServerAction(value: unknown): value is ServerAction {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[ACTION_BRAND] === true &&
    typeof (value as ServerAction).id === 'string' &&
    typeof (value as ServerAction).handler === 'function'
  );
}

/**
 * Error thrown by action handlers to signal a user-facing error.
 *
 * The `code` field can be used for programmatic error handling on the client
 * (e.g. `err.code === 'INVALID_CREDENTIALS'`).
 */
export class ActionError extends Error {
  code?: string;
  status: number;
  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'ActionError';
    this.code = opts.code;
    this.status = opts.status ?? 400;
  }
}

/**
 * Mark a return value as a field-level validation failure.
 *
 * Used inside `defineAction` handlers to signal validation errors back to
 * the form without throwing. Mirrors SvelteKit's `fail()` helper.
 *
 * ```ts
 * export const login = defineAction(async (input) => {
 *   if (!input.email) return fail(400, { email: 'Email is required' });
 *   return { user: input.email };
 * });
 * ```
 */
export function fail<T extends Record<string, string>>(status: number, errors: T): ActionFailure<T> {
  return { __actionFailure: true, status, errors };
}

/**
 * Type guard: is the value an `ActionFailure` (returned by `fail()`)?
 */
export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ActionFailure).__actionFailure === true
  );
}
