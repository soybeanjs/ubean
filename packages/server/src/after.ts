/**
 * after() 响应后执行 API (P9-14)
 *
 * 对齐 Next.js 16 `after()`,允许在响应发送后执行非关键任务
 * (日志/分析/缓存失效等),不阻塞 TTFB。
 *
 * 工作原理:
 * 1. 在请求上下文中维护一个回调队列(通过 AsyncLocalStorage)
 * 2. `after(fn)` 将回调注册到队列
 * 3. 响应发送后,中间件遍历队列并 fire-and-forget 执行所有回调
 *
 * 用法:
 * ```typescript
 * // 中间件
 * app.use('*', createAfterMiddleware());
 *
 * // 路由处理器中
 * export const POST = defineHandler(async (c) => {
 *   after(() => logAnalytics(c));
 *   after(() => invalidateCache(c.req.path));
 *   return c.json({ ok: true });
 * });
 * ```
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

type AfterCallback = () => void | Promise<void>;

interface AfterContext {
  callbacks: AfterCallback[];
  registered: boolean;
}

/**
 * 使用 AsyncLocalStorage 实现请求作用域
 * 在非 Node.js 环境中降级为基于 requestId 的 Map
 */
let asyncLocalStorage: {
  run: (store: AfterContext, fn: () => Promise<void>) => Promise<void>;
  getStore?: () => AfterContext | undefined;
} | null = null;

try {
  // 服务端包仅在 Node.js 环境运行,直接 import node:async_hooks
  const { AsyncLocalStorage } = await import('node:async_hooks');
  asyncLocalStorage = new AsyncLocalStorage<AfterContext>() as any;
} catch {
  // 非 Node.js 环境(如 Cloudflare Workers),降级为 fallback 模式
}

/**
 * Fallback: 使用全局 Map(基于请求 ID,不如 AsyncLocalStorage 精确)
 */
const fallbackStore = new Map<string, AfterContext>();

function getRequestId(c: Context<UbeanEnv>): string {
  return (c.get('requestId') as string) || 'default';
}

/**
 * 注册一个在响应发送后执行的回调
 *
 * @example
 * ```typescript
 * import { after } from 'ubean';
 *
 * export const POST = defineHandler(async (c) => {
 *   const result = doWork();
 *   after(() => {
 *     // 这些不会阻塞响应
 *     analytics.track('post_created', result);
 *     invalidateCache('/posts');
 *   });
 *   return c.json(result);
 * });
 * ```
 */
export function after(callback: AfterCallback): void {
  if (asyncLocalStorage) {
    const ctx = asyncLocalStorage.getStore?.();
    if (ctx && ctx.registered) {
      ctx.callbacks.push(callback);
      return;
    }
  }

  // Fallback: 使用全局存储(需配合中间件设置 requestId)
  // 这种情况下回调可能不会执行(无中间件时)
  // 开发环境下给出警告
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.warn('[ubean] after() called outside of after middleware context, callback will not be executed');
  }
}

/**
 * 创建 after() 中间件
 *
 * 在响应发送后执行所有通过 `after()` 注册的回调
 */
export function createAfterMiddleware(): MiddlewareHandler<UbeanEnv> {
  return async function afterMiddleware(c: Context<UbeanEnv>, next: Next) {
    const ctx: AfterContext = { callbacks: [], registered: true };

    // 设置 fallback context(基于 requestId)
    const reqId = getRequestId(c);
    fallbackStore.set(reqId, ctx);

    if (asyncLocalStorage) {
      // 使用 AsyncLocalStorage 提供精确的请求作用域
      await asyncLocalStorage.run(ctx, async () => {
        await next();
      });
    } else {
      // Fallback: 直接调用
      await next();
    }

    // 响应已生成,现在执行 after 回调(fire-and-forget)
    const callbacks = ctx.callbacks;
    fallbackStore.delete(reqId);

    if (callbacks.length > 0) {
      // 使用 waitUntil 模式(如果有)或 setTimeout 异步执行
      const executeCallbacks = async () => {
        for (const cb of callbacks) {
          try {
            await cb();
          } catch (err) {
            console.error('[ubean] after() callback error:', err);
          }
        }
      };

      // 尝试使用 waitUntil(如果上下文中有)
      const waitUntil = (c as any).executionContext?.waitUntil;
      if (typeof waitUntil === 'function') {
        waitUntil(executeCallbacks());
      } else if (typeof globalThis.queueMicrotask === 'function') {
        // 在下一个微任务中执行,不阻塞当前响应
        globalThis.queueMicrotask(() => {
          executeCallbacks().catch(err => console.error('[ubean] after() error:', err));
        });
      } else {
        // 最终 fallback
        setTimeout(() => {
          executeCallbacks().catch(err => console.error('[ubean] after() error:', err));
        }, 0);
      }
    }
  };
}

/**
 * 手动执行 after 回调(用于自定义中间件或测试)
 */
export async function flushAfterCallbacks(c: Context<UbeanEnv>): Promise<void> {
  const reqId = getRequestId(c);
  const ctx = fallbackStore.get(reqId);
  if (!ctx) return;

  for (const cb of ctx.callbacks) {
    try {
      await cb();
    } catch (err) {
      console.error('[ubean] after() callback error:', err);
    }
  }

  ctx.callbacks = [];
  fallbackStore.delete(reqId);
}

/**
 * 获取当前请求中注册的 after 回调数量(主要用于测试)
 */
export function getAfterCallbackCount(c?: Context<UbeanEnv>): number {
  if (asyncLocalStorage) {
    const store = (asyncLocalStorage as any).getStore?.();
    if (store) return store.callbacks.length;
  }
  if (c) {
    const ctx = fallbackStore.get(getRequestId(c));
    if (ctx) return ctx.callbacks.length;
  }
  return 0;
}
