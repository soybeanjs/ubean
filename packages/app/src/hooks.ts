/**
 * P9-09 全局 Hooks —— SvelteKit 式 handle / handleFetch / handleError
 *
 * 对齐 SvelteKit `src/hooks.server.ts` 的三个全局 hook:
 *
 * - **`handle`**:包裹每个请求,可修改 request 和 response。类似 Hono
 *   中间件但作用域更广(覆盖所有路由 + 静态资源 + 404)。
 * - **`handleFetch`**:拦截服务端代码中的 `fetch()` 调用(含 `internalFetch`),
 *   可修改请求头、URL、添加认证等。
 * - **`handleError`**:未捕获错误的统一处理入口,可记录日志/上报监控。
 *
 * ## 用法
 *
 * 用户在 `src/server.ts` 中通过 `defineServer({ hooks })` 注册:
 *
 * ```ts
 * // src/server.ts
 * import { defineServer } from '@ubean/app';
 *
 * export default defineServer({
 *   hooks: {
 *     handle: async ({ event, resolve }) => {
 *       console.log(`${event.request.method} ${event.request.url}`);
 *       const response = await resolve(event);
 *       response.headers.set('X-Custom', 'ubean');
 *       return response;
 *     },
 *     handleFetch: async ({ request, fetch }) => {
 *       request.headers.set('Authorization', `Bearer ${getToken()}`);
 *       return fetch(request);
 *     },
 *     handleError: async ({ event, error, status, message }) => {
 *       console.error(`[${status}] ${message}`, error);
 *     }
 *   }
 * });
 * ```
 *
 * 对齐:SvelteKit `hooks.server.ts` / Nuxt server plugins / Astro middleware。
 */

import type { Context } from 'hono';
import type { UbeanEnv } from '@ubean/types';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 请求事件 —— 传递给 `handle` 和 `handleError` 的上下文对象。
 */
export interface HandleEvent {
  /** 原始 Request 对象。 */
  request: Request;
  /** Hono Context(含 route params、variables、env 等)。 */
  context: Context<UbeanEnv>;
  /** 客户端 IP(从 `x-forwarded-for` 或 `x-real-ip` 提取)。 */
  clientAddress: string;
  /** 请求 ID(从 `x-request-id` header 或自动生成)。 */
  requestId: string;
}

/**
 * `handle` hook 的输入参数。
 */
export interface HandleInput {
  /** 请求事件。 */
  event: HandleEvent;
  /** resolve 函数:执行正常的请求处理流程,返回 Response。 */
  resolve: (event: HandleEvent) => Promise<Response>;
}

/**
 * 全局请求处理 hook。
 *
 * 类似 Hono 中间件,但作用于**所有**请求(含 404、静态资源、错误响应)。
 * 可用于:统一添加 header、请求日志、A/B 测试、认证预处理等。
 *
 * @example
 * ```ts
 * handle: async ({ event, resolve }) => {
 *   const start = Date.now();
 *   const response = await resolve(event);
 *   response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
 *   return response;
 * }
 * ```
 */
export type Handle = (input: HandleInput) => Promise<Response>;

/**
 * `handleFetch` hook 的输入参数。
 */
export interface HandleFetchInput {
  /** 原始 fetch Request。 */
  request: Request;
  /** 内部 fetch 函数:执行实际的 HTTP 请求(进程内调度或网络请求)。 */
  fetch: (request: Request) => Promise<Response>;
  /** 调用 fetch 的服务端上下文(可能为 undefined)。 */
  serverContext?: Context<UbeanEnv>;
}

/**
 * 服务端 fetch 拦截 hook。
 *
 * 拦截服务端代码中的 `fetch()` 调用(含 ubean 的 `internalFetch`),
 * 可修改请求头、URL、注入认证 token 等。
 *
 * @example
 * ```ts
 * handleFetch: async ({ request, fetch }) => {
 *   // 为所有服务端 fetch 添加内部 API token
 *   request.headers.set('X-Internal-Auth', process.env.INTERNAL_TOKEN);
 *   return fetch(request);
 * }
 * ```
 */
export type HandleFetch = (input: HandleFetchInput) => Promise<Response>;

/**
 * `handleError` hook 的输入参数。
 */
export interface HandleErrorInput {
  /** 请求事件。 */
  event: HandleEvent;
  /** 捕获的错误。 */
  error: unknown;
  /** HTTP 状态码(500/404 等)。 */
  status: number;
  /** 错误消息(已脱敏,适合展示给用户)。 */
  message: string;
}

/**
 * 全局错误处理 hook。
 *
 * 在未捕获错误发生时调用,可用于:日志记录、错误上报(Sentry 等)、
 * 自定义错误响应(需在 `handle` 中实现)。
 *
 * 注意:此 hook 仅用于**副作用**(日志/上报),不影响返回给客户端的
 * 错误响应。要自定义错误响应,请使用 `handle` 拦截 5xx 响应。
 *
 * @example
 * ```ts
 * handleError: async ({ event, error, status, message }) => {
 *   Sentry.captureException(error, {
 *     tags: { status, path: event.request.url },
 *   });
 * }
 * ```
 */
export type HandleError = (input: HandleErrorInput) => void | Promise<void>;

/**
 * 全局 hooks 集合。
 */
export interface GlobalHooks {
  /** 请求处理 hook。 */
  handle?: Handle;
  /** 服务端 fetch 拦截 hook。 */
  handleFetch?: HandleFetch;
  /** 错误处理 hook。 */
  handleError?: HandleError;
}

/* -------------------------------------------------------------------------- */
/* 全局 hooks 注册表                                                            */
/* -------------------------------------------------------------------------- */

let globalHooks: GlobalHooks = {};

/**
 * 设置全局 hooks。
 *
 * 由 `applyServerConfig` 在应用启动时调用。
 */
export function setGlobalHooks(hooks: GlobalHooks): void {
  globalHooks = { ...hooks };
}

/**
 * 获取全局 hooks。
 */
export function getGlobalHooks(): GlobalHooks {
  return globalHooks;
}

/**
 * 清空全局 hooks(测试用)。
 */
export function clearGlobalHooks(): void {
  globalHooks = {};
}

/* -------------------------------------------------------------------------- */
/* 辅助函数                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 从 Hono Context 构建请求事件。
 */
export function createHandleEvent(c: Context<UbeanEnv>): HandleEvent {
  const requestId = (c.get('requestId' as never) as string) || c.req.header('x-request-id') || '';
  const clientAddress =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';

  return {
    request: c.req.raw,
    context: c,
    clientAddress,
    requestId
  };
}

/**
 * 从错误中提取安全消息(移除敏感信息)。
 *
 * - 404 → "Not Found"
 * - 5xx → "Internal Server Error"(生产环境不暴露内部错误详情,
 *   也不区分 Error / 非 Error 类型,避免信息泄漏)
 * - 4xx(非 404)→ 返回 `error.message`(仅当 error 是 Error 实例),
 *   否则返回 "Bad Request"
 */
export function extractErrorMessage(error: unknown, status: number): string {
  if (status === 404) return 'Not Found';
  if (status >= 500) return 'Internal Server Error';
  if (error instanceof Error) return error.message;
  return 'Bad Request';
}

/**
 * 包装 resolve 函数:将 Hono 的请求处理流程封装为 `resolve(event)` 调用。
 *
 * 返回一个函数,调用后会执行 `next()` 让 Hono 处理请求,然后返回 `c.res`。
 */
export function wrapResolve(
  c: Context<UbeanEnv>,
  next: () => Promise<void>
): (event: HandleEvent) => Promise<Response> {
  return async (_event: HandleEvent) => {
    await next();
    return c.res as Response;
  };
}

/**
 * 应用 `handle` hook:如果已注册,则用 hook 包裹请求处理流程。
 *
 * 返回 `true` 表示 hook 已处理请求(调用方应跳过后续中间件),
 * `false` 表示无 hook 或 hook 已调用 resolve。
 */
export async function applyHandleHook(c: Context<UbeanEnv>, next: () => Promise<void>): Promise<boolean> {
  const hook = globalHooks.handle;
  if (!hook) return false;

  const event = createHandleEvent(c);
  const resolve = wrapResolve(c, next);

  const response = await hook({ event, resolve });
  c.res = response;
  return true;
}

/**
 * 应用 `handleFetch` hook:如果已注册,则用 hook 包裹 fetch 调用。
 */
export async function applyHandleFetchHook(
  request: Request,
  defaultFetch: (request: Request) => Promise<Response>,
  serverContext?: Context<UbeanEnv>
): Promise<Response> {
  const hook = globalHooks.handleFetch;
  if (!hook) {
    return defaultFetch(request);
  }
  return hook({ request, fetch: defaultFetch, serverContext });
}

/**
 * 应用 `handleError` hook:如果已注册,则调用它。
 */
export async function applyHandleErrorHook(c: Context<UbeanEnv>, error: unknown, status: number): Promise<void> {
  const hook = globalHooks.handleError;
  if (!hook) return;

  const event = createHandleEvent(c);
  const message = extractErrorMessage(error, status);
  await hook({ event, error, status, message });
}
