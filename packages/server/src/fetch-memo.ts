/**
 * 请求 memoization (P9-15) + fetch Data Cache (Task 4)
 *
 * 本模块提供两层 fetch 增强:
 *
 * 1. **请求 memoization (P9-15)** —— 同一请求内对相同 URL 的 fetch 自动去重,
 *    请求结束后清理。对齐 Next.js 自动 fetch memoization。
 *
 * 2. **fetch Data Cache (Task 4)** —— 跨请求缓存 GET 响应,对齐 Next.js Data Cache。
 *    仅当 fetch 传入 `next: { revalidate, tags }` 时启用;无 `next` 选项的 fetch
 *    不缓存(默认行为不变)。支持 `revalidateTag` / `revalidatePath` 失效。
 *
 * 用法:
 * ```typescript
 * // 请求内去重(P9-15)
 * app.use('*', createFetchMemoizationMiddleware());
 *
 * // 跨请求 Data Cache(Task 4)
 * app.use('*', createDataCacheMiddleware());
 *
 * // 路由处理器中:
 * // - 无 next 选项:不缓存(默认行为)
 * // - next: { revalidate: 60 }:缓存 60 秒
 * // - next: { tags: ['users'] }:缓存并通过 revalidateTag('users') 失效
 * const data = await fetch('https://api.example.com/users/1', {
 *   next: { revalidate: 60, tags: ['users'] }
 * });
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

/* -------------------------------------------------------------------------- */
/* fetch Data Cache (Task 4)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * fetch Data Cache 选项(对齐 Next.js `next` 字段)。
 *
 * 仅当 fetch 的 `init.next` 包含 `revalidate` 或 `tags` 时启用跨请求缓存;
 * 无 `next` 选项或 `noStore: true` 时不缓存(默认行为不变)。
 */
export interface FetchCacheOptions {
  /** TTL(秒)。0 = 不缓存;`Infinity` / 未定义 = 永久缓存(直到被失效)。 */
  revalidate?: number;
  /** 关联标签列表(用于 `revalidateTag(tag)` 失效)。 */
  tags?: string[];
  /** 显式退出缓存(等价于 `revalidate: 0`)。 */
  noStore?: boolean;
}

/** 持有 Next.js 风格 `next` 选项的 RequestInit 扩展。 */
export interface FetchInitWithNext extends RequestInit {
  /** Next.js 风格的 fetch 缓存控制选项。 */
  next?: FetchCacheOptions;
}

/** 序列化的 Response(可多次重建为可消费的 Response 实例)。 */
interface SerializedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
}

/** Data Cache 条目。 */
interface DataCacheEntry {
  response: SerializedResponse;
  tags: string[];
  createdAt: number;
  expiresAt: number;
}

/** Data Cache 中间件选项。 */
export interface DataCacheMiddlewareOptions {
  /**
   * 是否为开发模式(默认 `process.env.NODE_ENV !== 'production'`)。
   * dev 模式下默认不缓存(便于开发时看到最新数据),可通过 `forceDevCache` 强制启用。
   */
  dev?: boolean;
  /** dev 模式下也启用缓存(用于测试)。 */
  forceDevCache?: boolean;
  /** 自定义 URL 排除规则(返回 true 的 URL 不缓存)。 */
  exclude?: (url: string) => boolean;
}

const DATA_CACHE_MAX_ENTRIES = 1000;
/** 不参与缓存键的 header(自动设置、易变)。 */
const SKIP_HEADER_KEYS = new Set(['user-agent', 'accept-encoding', 'connection', 'host', 'content-length']);

/** Data Cache 存储:key → entry */
const dataCacheStore = new Map<string, DataCacheEntry>();
/** tag → 关联的缓存键集合(反向索引,加速 revalidateTag) */
const dataCacheTagIndex = new Map<string, Set<string>>();

function dataCacheAddToTagIndex(key: string, tags: string[]): void {
  for (const tag of tags) {
    let set = dataCacheTagIndex.get(tag);
    if (!set) {
      set = new Set();
      dataCacheTagIndex.set(tag, set);
    }
    set.add(key);
  }
}

function dataCacheRemoveFromTagIndex(key: string, tags: string[]): void {
  for (const tag of tags) {
    const set = dataCacheTagIndex.get(tag);
    if (set) {
      set.delete(key);
      if (set.size === 0) dataCacheTagIndex.delete(tag);
    }
  }
}

function dataCacheEvict(): void {
  if (dataCacheStore.size <= DATA_CACHE_MAX_ENTRIES) return;
  const entries = Array.from(dataCacheStore.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  const removeCount = Math.ceil(entries.length * 0.2);
  for (let i = 0; i < removeCount; i++) {
    const [key, entry] = entries[i];
    dataCacheRemoveFromTagIndex(key, entry.tags);
    dataCacheStore.delete(key);
  }
}

function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * 生成 Data Cache 键:`method:url:sorted(headers)`。
 *
 * 排除自动设置/易变的 header(User-Agent / Accept-Encoding / Connection / Host /
 * Content-Length),保证相同语义的请求命中同一缓存键。
 */
function dataCacheKey(input: string | URL | Request, init?: FetchInitWithNext): string {
  let url: string;
  let method = 'GET';
  let headers: Headers;

  if (typeof input === 'string') {
    url = input;
    headers = new Headers(init?.headers);
  } else if (input instanceof URL) {
    url = input.toString();
    headers = new Headers(init?.headers);
  } else if (input instanceof Request) {
    url = input.url;
    method = input.method;
    headers = new Headers(input.headers);
    if (init?.headers) {
      const initHeaders = new Headers(init.headers);
      initHeaders.forEach((v, k) => headers.set(k, v));
    }
  } else {
    url = String(input);
    headers = new Headers(init?.headers);
  }

  if (init?.method) {
    method = init.method.toUpperCase();
  }

  const headerEntries: string[] = [];
  headers.forEach((value, key) => {
    if (SKIP_HEADER_KEYS.has(key.toLowerCase())) return;
    headerEntries.push(`${key.toLowerCase()}:${value}`);
  });
  headerEntries.sort();

  return `${method}:${url}:${headerEntries.join('|')}`;
}

/**
 * 从 init 中提取 Data Cache 选项。返回 `null` 表示该请求不应被缓存。
 *
 * 规则:
 * - 无 `next` 选项 → 不缓存(默认行为不变)
 * - `next.noStore: true` → 不缓存
 * - `next.revalidate: 0` → 不缓存
 * - `next.revalidate > 0` 或 `next.tags` 非空 → 缓存
 * - 仅 `next: {}`(无 revalidate/tags) → 永久缓存(对齐 Next.js 行为)
 */
function extractCacheOptions(init?: FetchInitWithNext): FetchCacheOptions | null {
  if (!init?.next) return null;
  const { revalidate, tags, noStore } = init.next;
  if (noStore) return null;
  if (revalidate === 0) return null;
  return { revalidate, tags, noStore };
}

/** 序列化 Response 为可存储格式(消费 body 一次)。 */
async function serializeResponse(res: Response): Promise<SerializedResponse> {
  const body = await res.arrayBuffer();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, statusText: res.statusText, headers, body };
}

/** 从序列化数据重建 Response(每次返回新的可消费实例)。 */
function deserializeResponse(serialized: SerializedResponse): Response {
  return new Response(serialized.body.slice(0), {
    status: serialized.status,
    statusText: serialized.statusText,
    headers: new Headers(serialized.headers)
  });
}

/**
 * 创建 fetch Data Cache 中间件(Task 4)。
 *
 * 在请求作用域内包装 `globalThis.fetch`,对带 `next: { revalidate, tags }` 选项的
 * GET/HEAD 请求按 TTL 跨请求缓存响应。无 `next` 选项的请求走原始路径(默认行为不变)。
 *
 * 行为:
 * - 仅缓存 2xx 响应(4xx/5xx 不缓存,允许后续重试)
 * - dev 模式默认 no-cache(可通过 `forceDevCache` 强制启用,用于测试)
 * - 与 `revalidateTag` / `revalidatePath` 集成,失效对应缓存条目
 *
 * @example
 * ```ts
 * import { createDataCacheMiddleware } from '@ubean/server';
 * app.use('*', createDataCacheMiddleware());
 *
 * // 路由处理器中:
 * const res = await fetch('https://api.example.com/data', {
 *   next: { revalidate: 60, tags: ['data'] }
 * });
 * ```
 */
export function createDataCacheMiddleware(options: DataCacheMiddlewareOptions = {}): MiddlewareHandler<UbeanEnv> {
  const dev = options.dev ?? isDevMode();
  const skipCache = dev && !options.forceDevCache;
  const { exclude } = options;

  return async function dataCacheMiddleware(c: Context<UbeanEnv>, next: Next) {
    const originalFetch = globalThis.fetch;

    const patchedFetch: typeof globalThis.fetch = async (input, init) => {
      const cacheOpts = extractCacheOptions(init as FetchInitWithNext | undefined);

      // 不需要缓存的请求直接走原始 fetch
      if (!cacheOpts || skipCache) {
        return originalFetch(input, init);
      }

      // 仅缓存 GET/HEAD(对齐 Next.js Data Cache 行为)
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        return originalFetch(input, init);
      }

      if (exclude && exclude(typeof input === 'string' ? input : input.toString())) {
        return originalFetch(input, init);
      }

      const key = dataCacheKey(input, init as FetchInitWithNext);
      const now = Date.now();

      // 检查缓存命中
      const existing = dataCacheStore.get(key);
      if (existing && now <= existing.expiresAt) {
        return deserializeResponse(existing.response);
      }
      // 过期清理
      if (existing) {
        dataCacheRemoveFromTagIndex(key, existing.tags);
        dataCacheStore.delete(key);
      }

      // 发起新请求
      const res = await originalFetch(input, init);
      // 仅缓存 2xx 响应(对齐 Next.js:4xx/5xx 不缓存)
      if (!res.ok) return res;

      const ttl = cacheOpts.revalidate === undefined ? Infinity : cacheOpts.revalidate;
      const tags = cacheOpts.tags ?? [];
      const serialized = await serializeResponse(res);

      dataCacheStore.set(key, {
        response: serialized,
        tags,
        createdAt: now,
        expiresAt: ttl === Infinity ? Number.MAX_SAFE_INTEGER : now + ttl * 1000
      });
      dataCacheAddToTagIndex(key, tags);
      dataCacheEvict();

      // 返回新的 Response(原 res 的 body 已被消费用于序列化)
      return deserializeResponse(serialized);
    };

    const prevFetch = globalThis.fetch;
    globalThis.fetch = patchedFetch;

    try {
      await next();
    } finally {
      globalThis.fetch = prevFetch;
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Data Cache 失效 API(由 cache-directive.ts 的 revalidateTag/revalidatePath 集成调用) */
/* -------------------------------------------------------------------------- */

/**
 * 失效所有带指定标签的 Data Cache 条目。返回删除数量。
 *
 * 用户通常无需直接调用 —— `cache-directive.ts` 的 `revalidateTag` 会自动调用此函数。
 */
export async function revalidateDataCacheTag(tag: string): Promise<number> {
  const set = dataCacheTagIndex.get(tag);
  if (!set) return 0;
  const keys = Array.from(set);
  for (const key of keys) {
    const entry = dataCacheStore.get(key);
    if (entry) {
      dataCacheRemoveFromTagIndex(key, entry.tags);
      dataCacheStore.delete(key);
    }
  }
  return keys.length;
}

/**
 * 失效缓存键匹配指定模式的 Data Cache 条目。返回删除数量。
 *
 * 用户通常无需直接调用 —— `cache-directive.ts` 的 `revalidatePath` 会自动调用此函数。
 */
export async function revalidateDataCachePath(pattern: string | RegExp): Promise<number> {
  const regex = pattern instanceof RegExp ? pattern : dataCacheGlobToRegex(pattern);
  let deleted = 0;
  for (const key of Array.from(dataCacheStore.keys())) {
    if (regex.test(key)) {
      const entry = dataCacheStore.get(key);
      if (entry) {
        dataCacheRemoveFromTagIndex(key, entry.tags);
        dataCacheStore.delete(key);
        deleted++;
      }
    }
  }
  return deleted;
}

/** 清空所有 fetch Data Cache 条目(主要用于测试)。 */
export function clearFetchDataCache(): void {
  dataCacheStore.clear();
  dataCacheTagIndex.clear();
}

/** 返回 Data Cache 当前条目数(主要用于测试)。 */
export function getDataCacheSize(): number {
  return dataCacheStore.size;
}

/** 将 glob 模式转换为正则表达式(与 cache-directive.ts 保持一致)。 */
function dataCacheGlobToRegex(pattern: string): RegExp {
  const DOUBLE = '__DWC__';
  const SINGLE = '__SWC__';
  let s = pattern;
  s = s.replace(/\/\*\*/g, `/${DOUBLE}`);
  s = s.replace(/\*/g, SINGLE);
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(SINGLE, 'g'), '[^/]*');
  s = s.replace(new RegExp(`/${DOUBLE}`, 'g'), '(?:/.*)?');
  return new RegExp(`^${s}$`);
}
