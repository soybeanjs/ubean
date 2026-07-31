/**
 * 请求 memoization (P9-15)
 *
 * 对齐 Next.js 自动 fetch memoization,在同一请求内对相同 URL 的 fetch
 * 自动去重,避免瀑布式请求和重复数据获取。
 *
 * 工作原理:
 * 1. 中间件为每个请求创建一个 memoization Map(通过 AsyncLocalStorage)
 * 2. 包装 globalThis.fetch,在请求作用域内对相同 URL+options 返回同一 Promise
 * 3. 请求结束后清理 memoization Map
 *
 * 用法:
 * ```typescript
 * // 中间件(自动启用 memoization)
 * app.use('*', createFetchMemoizationMiddleware());
 *
 * // 路由处理器中多次 fetch 同一 URL 只会实际请求一次
 * const data1 = await fetch('https://api.example.com/users/1');
 * const data2 = await fetch('https://api.example.com/users/1'); // 命中缓存
 * ```
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

interface MemoEntry {
  promise: Promise<Response>;
  timestamp: number;
}

interface MemoContext {
  cache: Map<string, MemoEntry>;
  originalFetch: typeof globalThis.fetch;
  patched: boolean;
}

const MEMO_TTL_MS = 0; // 默认请求内永久(同请求同 URL 只请求一次)

/**
 * 生成 memoization key
 */
function memoKey(input: string | URL | Request, init?: RequestInit): string {
  let url: string;
  let method = 'GET';

  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input instanceof Request) {
    url = input.url;
    method = input.method;
  } else {
    url = String(input);
  }

  if (init?.method) {
    method = init.method.toUpperCase();
  }

  // POST/PUT/PATCH/DELETE 不 memoize(变更操作)
  if (method !== 'GET' && method !== 'HEAD') {
    return '';
  }

  // 包含 body 的请求不 memoize
  if (init?.body) {
    return '';
  }

  return `${method}:${url}`;
}

/**
 * 创建 fetch memoization 中间件
 *
 * 在请求作用域内包装 globalThis.fetch,对相同 GET URL 自动去重
 */
export function createFetchMemoizationMiddleware(
  options: {
    /** 自定义哪些 URL 不参与 memoization */
    exclude?: (url: string) => boolean;
    /** 是否跳过非 GET 请求(默认 true,即非 GET 不 memoize) */
    skipNonGet?: boolean;
  } = {}
): MiddlewareHandler<UbeanEnv> {
  const { exclude } = options;

  return async function fetchMemoizationMiddleware(c: Context<UbeanEnv>, next: Next) {
    const ctx: MemoContext = {
      cache: new Map(),
      originalFetch: globalThis.fetch,
      patched: false
    };

    // 创建请求作用域的 fetch 包装器
    const patchedFetch: typeof globalThis.fetch = async (input, init) => {
      const key = memoKey(input, init);

      // 不需要 memoize 的请求直接走原始 fetch
      if (!key || (exclude && exclude(typeof input === 'string' ? input : input.toString()))) {
        return ctx.originalFetch(input, init);
      }

      // 检查缓存
      const existing = ctx.cache.get(key);
      if (existing) {
        // 克隆 Response(fetch Response 可能有 body 只能读一次的问题)
        const cloned = existing.promise.then(res => res.clone());
        return cloned;
      }

      // 发起新请求并存入缓存
      const promise = ctx.originalFetch(input, init).then(res => {
        // 如果响应不成功,不缓存(让后续请求可以重试)
        if (!res.ok && res.status >= 500) {
          ctx.cache.delete(key);
        }
        return res;
      });

      ctx.cache.set(key, { promise, timestamp: Date.now() });
      return promise;
    };

    // 临时替换 globalThis.fetch
    const prevFetch = globalThis.fetch;
    globalThis.fetch = patchedFetch;
    ctx.patched = true;

    try {
      await next();
    } finally {
      // 恢复原始 fetch
      globalThis.fetch = prevFetch;
      ctx.cache.clear();
    }
  };
}

/**
 * 手动创建一个 memoized fetch 函数(不依赖中间件/AsyncLocalStorage)
 *
 * 适用于在非请求上下文中手动使用 memoization
 */
export function createMemoizedFetch(
  options: {
    originalFetch?: typeof globalThis.fetch;
    ttl?: number;
  } = {}
): {
  fetch: typeof globalThis.fetch;
  clear: () => void;
  size: () => number;
} {
  const originalFetch = options.originalFetch || globalThis.fetch.bind(globalThis);
  const ttl = options.ttl ?? MEMO_TTL_MS;
  const cache = new Map<string, MemoEntry>();

  const memoizedFetch: typeof globalThis.fetch = async (input, init) => {
    const key = memoKey(input, init);

    if (!key) {
      return originalFetch(input, init);
    }

    // 检查 TTL
    if (ttl > 0) {
      const existing = cache.get(key);
      if (existing && Date.now() - existing.timestamp > ttl) {
        cache.delete(key);
      }
    }

    // 检查缓存
    const existing = cache.get(key);
    if (existing) {
      return existing.promise.then(res => res.clone());
    }

    const promise = originalFetch(input, init).then(res => {
      if (!res.ok && res.status >= 500) {
        cache.delete(key);
      }
      return res;
    });

    cache.set(key, { promise, timestamp: Date.now() });
    return promise;
  };

  return {
    fetch: memoizedFetch,
    clear: () => cache.clear(),
    size: () => cache.size
  };
}
