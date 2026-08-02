import { safeJsonStringify } from './protocol';

export type DataKey = string | symbol;

export interface DataCacheEntry<T = unknown> {
  key: DataKey;
  data: T;
  timestamp: number;
  ttl?: number;
  tags?: string[];
}

type DataFetcher<T> = () => T | Promise<T>;

interface DataRegistry {
  entries: Map<DataKey, DataCacheEntry>;
  tagIndex: Map<string, Set<DataKey>>;
  /** In-flight promises for dedupe (per-key request coalescing). */
  inflight: Map<DataKey, Promise<unknown>>;
}

function createRegistry(): DataRegistry {
  return {
    entries: new Map(),
    tagIndex: new Map(),
    inflight: new Map()
  };
}

const globalRegistry = createRegistry();

const contextRegistry = new WeakMap<object, DataRegistry>();

function getRegistry(context?: object): DataRegistry {
  if (context) {
    let reg = contextRegistry.get(context);
    if (!reg) {
      reg = createRegistry();
      contextRegistry.set(context, reg);
    }
    return reg;
  }
  return globalRegistry;
}

export function defineDataKey(key: string): symbol {
  return Symbol.for(`ubean:data:${key}`);
}

// ============== SSR payload registry (per-request) ==============

/**
 * `__UBEAN_DATA__` script 标签 ID — SSR 渲染时,useData 解析的数据以 JSON 形式
 * 注入到此标签中,客户端水合时读取,避免二次请求。
 *
 * 与 `__UBEAN_DEFERRED__`(非关键延迟数据)和 `__UBEAN_STATE__`(用户状态如 Pinia)
 * 分离,职责单一,便于 SSG payload 提取(roadmap Task 3)。
 */
export const DATA_PAYLOAD_ID = '__UBEAN_DATA__';

/**
 * SSR payload 条目:记录 useData 解析结果,序列化到 `__UBEAN_DATA__`。
 * `error` 以字符串形式存储(可序列化),客户端水合时重建为 Error。
 */
export interface DataPayloadEntry {
  data: unknown;
  error: string | null;
  timestamp: number;
}

const ssrPayload: Map<string, DataPayloadEntry> = new Map();

/**
 * SSR 内部:注册一个 useData 解析结果到 payload。
 *
 * 在 `useData` 的 SSR 分支中调用。每次渲染前应调用 `__clearDataPayload()`。
 * 仅 string key 可注册(symbol 无法序列化)。
 */
export function __registerDataPayload(key: string, entry: DataPayloadEntry): void {
  ssrPayload.set(key, entry);
}

/**
 * SSR 内部:返回所有已注册的 payload 条目,用于序列化到 `__UBEAN_DATA__`。
 */
export function __resolveDataPayload(): Record<string, DataPayloadEntry> {
  return Object.fromEntries(ssrPayload);
}

/**
 * SSR 内部:清空 payload 注册表 + 全局 inflight。每次渲染前调用,
 * 避免上一个请求的残留。
 */
export function __clearDataPayload(): void {
  ssrPayload.clear();
  globalRegistry.inflight.clear();
}

/**
 * SSR 内部:将 data payload 序列化为 `<script>` 标签字符串。
 * 无数据时返回空字符串(不注入标签)。
 */
export function __serializeDataPayload(data: Record<string, DataPayloadEntry>): string {
  if (Object.keys(data).length === 0) return '';
  return `<script id="${DATA_PAYLOAD_ID}" type="application/json">${safeJsonStringify(data)}</script>`;
}

// ============== 客户端水合缓存 ==============
//
// 缓存类型说明:
// - undefined:尚未读取(下一次调用会启动读取)
// - Promise<...|null>:读取进行中(in-flight,去重并发调用)
// - Record<...>|null:已解析的值(后续调用直接命中,避免再次访问 DOM/Promise)
//
// SSG 场景下,`__UBEAN_DATA_PAYLOAD__` 全局变量可能是一个 Promise(由
// `fetch('/__data.json')` 解析而来),所以缓存值也需要支持 Promise。

let clientPayloadCache:
  | Promise<Record<string, DataPayloadEntry> | null>
  | Record<string, DataPayloadEntry>
  | null
  | undefined;

/**
 * 客户端:实际执行 payload 解析。
 *
 * 优先级:
 * 1. `globalThis.__UBEAN_DATA_PAYLOAD__`(SSG 模式注入,可能是 Promise / 对象 / null)
 *    - Promise → await,解析失败返回 null
 *    - 对象 → 直接使用
 *    - null/undefined → 降级到 DOM 路径
 * 2. DOM 读取 `__UBEAN_DATA__` script 标签(SSR/无 SSG 提取场景)
 *
 * SSR 环境(无 document)返回 `null`。
 */
async function computeClientPayload(): Promise<Record<string, DataPayloadEntry> | null> {
  // SSG 模式:全局已注入 payload(可能是 Promise<json> | json | null)
  const injected = (globalThis as { __UBEAN_DATA_PAYLOAD__?: unknown }).__UBEAN_DATA_PAYLOAD__;
  if (injected !== undefined) {
    try {
      const value = injected instanceof Promise ? await injected : injected;
      if (value && typeof value === 'object') {
        return value as Record<string, DataPayloadEntry>;
      }
      return null;
    } catch {
      return null;
    }
  }

  // 降级:从 DOM 读取内联 script(无 SSG 提取 / SSR 降级场景)
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(DATA_PAYLOAD_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as Record<string, DataPayloadEntry>;
  } catch {
    return null;
  }
}

/**
 * 客户端:读取 payload,带 in-flight 去重缓存。
 *
 * 首次调用启动计算并存 Promise 到缓存(去重并发调用);解析后用结果替换 Promise,
 * 后续调用直接命中同步缓存。
 * SSR 环境返回 `null`。
 */
function readClientPayload(): Promise<Record<string, DataPayloadEntry> | null> {
  const cached = clientPayloadCache;
  if (cached !== undefined) {
    // 已缓存:可能是 Promise(in-flight)或已解析的值
    return Promise.resolve(cached);
  }
  // 启动计算,缓存 Promise 去重并发调用
  const promise = computeClientPayload();
  clientPayloadCache = promise;
  // 解析后用值替换 Promise,后续调用直接命中同步路径
  return promise.then(
    value => {
      clientPayloadCache = value;
      return value;
    },
    () => {
      clientPayloadCache = null;
      return null;
    }
  );
}

/**
 * 重置客户端 payload 缓存(测试用)。
 */
export function __resetDataPayloadCache(): void {
  clientPayloadCache = undefined;
}

/**
 * 客户端水合:从 payload 缓存中读取指定 key 的初始数据,注入到 data registry。
 *
 * 在 `useData` 的客户端分支中调用:若 payload 命中,将数据写入 registry,
 * 后续逻辑直接走缓存命中路径,避免二次请求。
 * 仅处理 string key,且仅当 registry 中尚无该 key 时注入(不覆盖已有缓存)。
 *
 * @returns true 表示 payload 命中并已注入
 */
async function hydrateFromPayload(key: DataKey, registry: DataRegistry): Promise<boolean> {
  if (typeof key !== 'string') return false;
  if (registry.entries.has(key)) return false;

  const payload = await readClientPayload();
  if (!payload) return false;

  const entry = payload[key];
  if (!entry) return false;

  // 错误条目不注入缓存(让客户端重新请求)
  if (entry.error !== null) return false;

  registry.entries.set(key, {
    key,
    data: entry.data,
    timestamp: entry.timestamp,
    tags: undefined
  });
  return true;
}

export interface UseDataOptions<T> {
  key?: DataKey;
  tags?: string[];
  ttl?: number;
  staleWhileRevalidate?: boolean;
  fetcher: DataFetcher<T>;
  /**
   * Dedupe in-flight requests with the same key (default: `true`).
   * When enabled, concurrent calls within the same request cycle share a
   * single Promise, preventing duplicate fetcher invocations.
   */
  dedupe?: boolean;
}

export type DataStatus = 'idle' | 'pending' | 'success' | 'error';

export interface DataResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Alias for `!loading` (Nuxt `useAsyncData` compat). */
  pending: boolean;
  /** Current fetch status. */
  status: DataStatus;
  timestamp: number | undefined;
  invalidate: () => void;
  /**
   * Force re-fetch, bypassing cache and dedupe.
   * Mutates this result object in place and resolves when done.
   */
  refresh: () => Promise<void>;
}

/**
 * 判断当前是否为 SSR 环境(无 `window`)。
 * 与 `defer.ts` 保持一致的环境检测方式。
 */
function isSSR(): boolean {
  return typeof window === 'undefined';
}

/**
 * 将解析结果注册到 SSR payload(仅 string key + SSR 环境)。
 */
function registerSSRPayload(key: DataKey, data: unknown, error: Error | null): void {
  if (!isSSR()) return;
  if (typeof key !== 'string') return;
  __registerDataPayload(key, {
    data: error ? undefined : data,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    timestamp: Date.now()
  });
}

/**
 * 执行 fetcher,管理 inflight 注册 + cache 写入 + tag 索引 + SSR payload 注册。
 * dedupe 决定是否复用同 key 的 in-flight Promise。
 */
async function executeFetch<T>(
  options: UseDataOptions<T>,
  key: DataKey,
  registry: DataRegistry,
  _context?: object
): Promise<{ data: T; error: null } | { data: undefined; error: Error }> {
  const dedupe = options.dedupe !== false;

  // dedupe: 复用同 key 的 in-flight Promise(不阻塞,直接 await 共享结果)
  if (dedupe) {
    const existing = registry.inflight.get(key);
    if (existing) {
      try {
        const data = (await existing) as T;
        return { data, error: null };
      } catch (err) {
        return {
          data: undefined,
          error: err instanceof Error ? err : new Error(String(err))
        };
      }
    }
  }

  const promise = Promise.resolve(options.fetcher());
  if (dedupe) {
    registry.inflight.set(key, promise);
  }

  try {
    const data = await promise;
    const entry: DataCacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: options.ttl,
      tags: options.tags
    };
    registry.entries.set(key, entry);

    if (options.tags) {
      for (const tag of options.tags) {
        let tagSet = registry.tagIndex.get(tag);
        if (!tagSet) {
          tagSet = new Set();
          registry.tagIndex.set(tag, tagSet);
        }
        tagSet.add(key);
      }
    }

    registerSSRPayload(key, data, null);
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    registerSSRPayload(key, undefined, error);
    return { data: undefined, error };
  } finally {
    if (dedupe) {
      registry.inflight.delete(key);
    }
  }
}

export async function useData<T>(options: UseDataOptions<T>, context?: object): Promise<DataResult<T>> {
  const registry = getRegistry(context);
  const key = options.key || Symbol();

  const invalidate = () => {
    invalidateData(key, context);
  };

  // 客户端水合:首次访问时从 __UBEAN_DATA__(或 SSG 提取的 __data.json)
  // 注入初始数据到 registry
  if (!isSSR()) {
    await hydrateFromPayload(key, registry);
  }

  // 构建可变的 result 对象,refresh() 会原地更新其字段
  const result: DataResult<T> = {
    data: undefined,
    error: null,
    loading: false,
    pending: false,
    status: 'idle',
    timestamp: undefined,
    invalidate,
    refresh: async () => {
      // 强制刷新:先失效缓存,再重新获取(绕过 dedupe + cache)
      invalidateData(key, context);
      result.loading = true;
      result.pending = true;
      result.status = 'pending';
      const { data, error } = await executeFetch(options, key, registry, context);
      result.data = data;
      result.error = error;
      result.loading = false;
      result.pending = false;
      result.status = error ? 'error' : 'success';
      result.timestamp = registry.entries.get(key)?.timestamp;
    }
  };

  // 缓存命中检查(TTL 未过期)
  const cached = registry.entries.get(key) as DataCacheEntry<T> | undefined;
  if (cached) {
    const isExpired = cached.ttl !== undefined && Date.now() - cached.timestamp > cached.ttl;
    if (!isExpired) {
      result.data = cached.data;
      result.error = null;
      result.loading = false;
      result.pending = false;
      result.status = 'success';
      result.timestamp = cached.timestamp;
      return result;
    }
  }

  // 执行获取(dedupe 在 executeFetch 内处理)
  result.loading = true;
  result.pending = true;
  result.status = 'pending';
  const { data, error } = await executeFetch(options, key, registry, context);
  result.data = data;
  result.error = error;
  result.loading = false;
  result.pending = false;
  result.status = error ? 'error' : 'success';
  result.timestamp = registry.entries.get(key)?.timestamp;
  return result;
}

// ============== useAsyncData (Nuxt-style superset) ==============

/**
 * `useAsyncData` 选项:Nuxt 风格的 `useAsyncData(key, fn, options)` 第三参数。
 *
 * 是 `UseDataOptions` 的子集(去掉 `key`/`fetcher`,改用位置参数)。
 */
export interface UseAsyncDataOptions {
  tags?: string[];
  ttl?: number;
  staleWhileRevalidate?: boolean;
  /** Dedupe in-flight requests (default: `true`). */
  dedupe?: boolean;
}

/**
 * Nuxt 风格的 `useAsyncData(key, fn, options)`,作为 `useData` 的超集/别名。
 *
 * 与 `useData` 的区别仅在于调用签名:位置参数 `(key, fn, options)` vs
 * 选项对象 `{ key, fetcher, ... }`。返回值与 `useData` 完全一致。
 *
 * @example
 * ```ts
 * const { data, pending, error, refresh } = await useAsyncData(
 *   'posts',
 *   () => fetch('/api/posts').then(r => r.json()),
 *   { ttl: 60_000 }
 * );
 * ```
 */
export async function useAsyncData<T>(
  key: string,
  fn: DataFetcher<T>,
  options?: UseAsyncDataOptions,
  context?: object
): Promise<DataResult<T>> {
  return useData(
    {
      key,
      fetcher: fn,
      tags: options?.tags,
      ttl: options?.ttl,
      staleWhileRevalidate: options?.staleWhileRevalidate,
      dedupe: options?.dedupe
    },
    context
  );
}

export function invalidateData(keyOrTag: DataKey | string, context?: object): number {
  const registry = getRegistry(context);
  let count = 0;

  if (typeof keyOrTag === 'string') {
    const tagSet = registry.tagIndex.get(keyOrTag);
    if (tagSet) {
      for (const key of tagSet) {
        const entry = registry.entries.get(key);
        if (entry) {
          if (entry.tags) {
            for (const t of entry.tags) {
              const tSet = registry.tagIndex.get(t);
              if (tSet) tSet.delete(key);
            }
          }
          registry.entries.delete(key);
          count++;
        }
      }
      registry.tagIndex.delete(keyOrTag);
    }
  } else {
    const entry = registry.entries.get(keyOrTag);
    if (entry) {
      if (entry.tags) {
        for (const t of entry.tags) {
          const tSet = registry.tagIndex.get(t);
          if (tSet) tSet.delete(keyOrTag);
        }
      }
      registry.entries.delete(keyOrTag);
      count = 1;
    }
  }

  return count;
}

export function invalidateAll(context?: object): void {
  const registry = getRegistry(context);
  registry.entries.clear();
  registry.tagIndex.clear();
  registry.inflight.clear();
}

export function clearDataCache(context?: object): void {
  invalidateAll(context);
}

export function hasData(key: DataKey, context?: object): boolean {
  return getRegistry(context).entries.has(key);
}

export interface DependencyDeclaration {
  keys: DataKey[];
  tags?: string[];
}

export function declareDependencies(deps: DependencyDeclaration): DependencyDeclaration {
  return deps;
}

export function withDependencies<T>(fn: () => T | Promise<T>, _deps: DependencyDeclaration): () => Promise<T> {
  return async () => {
    return fn();
  };
}

export function getInvalidatedKeysForAction(
  actionName: string,
  invalidationMap: Record<string, Array<DataKey | string>>,
  context?: object
): number {
  const toInvalidate = invalidationMap[actionName];
  if (!toInvalidate) return 0;

  let count = 0;
  for (const key of toInvalidate) {
    count += invalidateData(key, context);
  }
  return count;
}

export interface InternalFetchOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  forwardHeaders?: string[];
}

const FORWARD_HEADER_DEFAULTS = [
  'cookie',
  'authorization',
  'x-request-id',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'accept-language',
  'user-agent',
  'referer'
];

export function createInternalFetch(
  c: {
    req: {
      raw?: Request;
      header?: (name: string) => string | undefined;
      url?: string;
    };
  },
  options: InternalFetchOptions = {}
): typeof fetch {
  const forwardHeaders = options.forwardHeaders || FORWARD_HEADER_DEFAULTS;
  const incomingHeaders = new Headers();

  for (const headerName of forwardHeaders) {
    const value = c.req.header?.(headerName);
    if (value) {
      incomingHeaders.set(headerName, value);
    }
  }

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      incomingHeaders.set(k, v);
    }
  }

  const baseURL = options.baseURL || '';

  return async function internalFetch(
    input: string | { url: string } | URL,
    init?: RequestInit & { headers?: unknown }
  ): Promise<Response> {
    let url: string;
    if (typeof input === 'string') {
      url = input.startsWith('http') ? input : `${baseURL}${input.startsWith('/') ? '' : '/'}${input}`;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = (input as { url: string }).url;
    }

    const mergedInit: RequestInit = {
      ...init,
      headers: mergeHeaders(incomingHeaders, init?.headers as ConstructorParameters<typeof Headers>[0] | undefined)
    };

    return fetch(url, mergedInit);
  };
}

function mergeHeaders(base: Headers, extra?: ConstructorParameters<typeof Headers>[0]): Headers {
  const result = new Headers(base);
  if (!extra) return result;

  if (extra instanceof Headers) {
    extra.forEach((value, key) => result.set(key, value));
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      result.set(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) result.set(key, String(value));
    }
  }

  return result;
}

export interface StreamHelper {
  enqueue: (chunk: unknown) => void;
  close: () => void;
  error: (err: Error) => void;
  response: Response;
}

export function createStreamResponse(
  init?: ResponseInit,
  onStart?: (stream: StreamHelper) => void | Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const helper: StreamHelper = {
        enqueue(chunk: unknown) {
          const data = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(data));
        },
        close() {
          controller.close();
        },
        error(err: Error) {
          controller.error(err);
        },
        response: null as unknown as Response
      };

      try {
        await onStart?.(helper);
      } catch (err) {
        controller.error(err);
      }
    }
  });

  const response = new Response(stream, {
    ...init,
    headers: {
      'Content-Type': init?.headers
        ? (init.headers as Record<string, string>)['Content-Type'] || 'text/event-stream'
        : 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(init?.headers as Record<string, string> | undefined)
    }
  });

  return response;
}

export function createSseStream(onStart?: (stream: StreamHelper) => void | Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const helper: StreamHelper = {
        enqueue(chunk: unknown) {
          let text: string;
          if (typeof chunk === 'string') {
            text = `data: ${chunk}\n\n`;
          } else {
            text = `data: ${JSON.stringify(chunk)}\n\n`;
          }
          controller.enqueue(encoder.encode(text));
        },
        close() {
          controller.close();
        },
        error(err: Error) {
          controller.error(err);
        },
        response: null as unknown as Response
      };

      controller.enqueue(encoder.encode(': connected\n\n'));

      try {
        await onStart?.(helper);
      } catch (err) {
        controller.error(err);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
