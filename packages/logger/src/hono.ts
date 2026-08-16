import type { MiddlewareHandler } from 'hono';
import { getLogger } from './logger';
import type { RequestLoggerOptions } from './types';

/**
 * 判断路径是否应被跳过。
 */
function shouldSkip(path: string, exclude: RequestLoggerOptions['exclude']): boolean {
  if (!exclude) return false;
  if (typeof exclude === 'function') return exclude(path);
  for (const pattern of exclude) {
    if (typeof pattern === 'string') {
      if (pattern === path) return true;
      if (pattern === '**' || pattern === '/**') return true;
      if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        if (path === prefix || path.startsWith(`${prefix}/`)) return true;
      }
      if (path.startsWith(pattern)) return true;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(path)) return true;
    }
  }
  return false;
}

/**
 * Hono 请求日志中间件。
 *
 * 记录每个请求:方法、路径、状态码、耗时,以及错误与慢请求(按 `slowThreshold`)。
 * 利用 Hono compose 设置的 `c.error` 识别被 `onError` 收敛的异常(此时 `next()` 不抛出,
 * 而是以 500 Response 正常返回);若中间件链本身向外抛出异常也会被记录后重新抛出。
 *
 * @example
 * ```ts
 * import { createRequestLoggerMiddleware } from '@ubean/logger/hono';
 * import { createUbeanApp } from 'ubean/runtime/app';
 *
 * const app = createUbeanApp();
 * app.use('*', createRequestLoggerMiddleware({
 *   exclude: ['/_health', '/_devtools/**'],
 *   slowThreshold: 2000
 * }));
 * ```
 */
export function createRequestLoggerMiddleware(options: RequestLoggerOptions = {}): MiddlewareHandler {
  const log = options.logger ?? getLogger('http');
  const slowThreshold = options.slowThreshold ?? 1000;

  return async (c, next) => {
    const { method } = c.req;
    const path = c.req.path;
    const url = options.logQuery ? c.req.url : path;

    if (shouldSkip(path, options.exclude)) {
      return next();
    }

    const requestId = c.get('requestId') as string | undefined;
    const start = Date.now();

    log.info({ method, path, requestId }, `--> ${method} ${url}`);

    try {
      await next();
      const duration = Date.now() - start;
      const status = c.res.status;

      // Hono compose 在子级 dispatch 用 onError 收敛异常并设置 c.error,next() 不抛出
      const error = c.error as Error | undefined;
      if (error) {
        log.error(
          { method, path, status, durationMs: duration, requestId, error: error.message },
          `<!- ${method} ${url} ${status} ${duration}ms ERROR`
        );
      } else if (status >= 500) {
        log.error(
          { method, path, status, durationMs: duration, requestId },
          `<-- ${method} ${url} ${status} ${duration}ms`
        );
      } else if (status >= 400 || duration >= slowThreshold) {
        log.warn(
          { method, path, status, durationMs: duration, requestId },
          `<-- ${method} ${url} ${status} ${duration}ms`
        );
      } else {
        log.info(
          { method, path, status, durationMs: duration, requestId },
          `<-- ${method} ${url} ${status} ${duration}ms`
        );
      }
    } catch (err) {
      const duration = Date.now() - start;
      log.error(
        {
          method,
          path,
          durationMs: duration,
          requestId,
          error: err instanceof Error ? err.message : String(err)
        },
        `<!- ${method} ${url} ERROR ${duration}ms`
      );
      throw err;
    }
  };
}
