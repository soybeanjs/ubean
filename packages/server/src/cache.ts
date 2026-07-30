import type { Context, Next } from 'hono';
import type { RouteRule } from '@ubean/types';

export interface CacheEntry {
  body: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
  statusText: string;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: Omit<CacheEntry, 'createdAt' | 'expiresAt'>, ttl: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /**
   * 返回 entry(无论是否过期),不进行过期清理(P9-03 ISR SWR 用)。
   *
   * 不实现此方法的存储后端将不支持 ISR SWR(自动降级为同步重新生成)。
   */
  peek?(key: string): Promise<CacheEntry | undefined>;
}

export function createMemoryStore(maxEntries = 200): CacheStore {
  const store = new Map<string, CacheEntry>();

  function evict(): void {
    if (store.size <= maxEntries) return;
    const entries = Array.from(store.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const removeCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      store.delete(entries[i][0]);
    }
  }

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry;
    },
    async peek(key) {
      // 不进行过期检查 —— 供 ISR SWR 读取过期但可用的旧内容
      return store.get(key);
    },
    async set(key, entry, ttl) {
      const now = Date.now();
      store.set(key, {
        ...entry,
        createdAt: now,
        expiresAt: now + ttl * 1000
      });
      evict();
    },
    async delete(key) {
      return store.delete(key);
    },
    async clear() {
      store.clear();
    }
  };
}

let globalStore: CacheStore | null = null;

export function useCacheStore(store?: CacheStore): CacheStore {
  if (store) {
    globalStore = store;
    return store;
  }
  if (!globalStore) {
    globalStore = createMemoryStore();
  }
  return globalStore;
}

export function clearCacheStore(): void {
  globalStore = null;
}

function buildCacheKey(c: Context): string {
  const url = new URL(c.req.url);
  return `${c.req.method}:${url.pathname}${url.search}`;
}

function serializeResponse(res: Response): Promise<Omit<CacheEntry, 'createdAt' | 'expiresAt'>> {
  return res.arrayBuffer().then(body => {
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      const kl = k.toLowerCase();
      if (kl !== 'set-cookie' && kl !== 'authorization') {
        headers[k] = v;
      }
    });
    return { body, headers, status: res.status, statusText: res.statusText };
  });
}

function entryToResponse(entry: CacheEntry): Response {
  const headers = new Headers(entry.headers);
  headers.set('X-Cache', 'HIT');
  headers.set('Age', String(Math.max(0, Math.floor((Date.now() - entry.createdAt) / 1000))));
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers
  });
}

function isCacheableRequest(c: Context): boolean {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return false;
  if (c.req.header('authorization')) return false;
  if (c.req.header('cookie')) {
    const cc = c.req.header('cache-control') || '';
    if (!cc.includes('public')) return false;
  }
  const cc = c.req.header('cache-control');
  if (cc && (cc.includes('no-cache') || cc.includes('no-store'))) return false;
  return true;
}

function isCacheableResponse(res: Response): boolean {
  if (res.status !== 200) return false;
  if (res.headers.get('set-cookie')) return false;
  const cc = res.headers.get('cache-control');
  if (cc && (cc.includes('private') || cc.includes('no-store'))) return false;
  return true;
}

export interface CacheRule {
  ttl: number;
  swr?: boolean | number;
  name?: string;
}

function matchPath(pattern: string, path: string): boolean {
  const DOUBLE = '__DWC__';
  const SINGLE = '__SWC__';
  let s = pattern;
  s = s.replace(/\/\*\*/g, `/${DOUBLE}`);
  s = s.replace(/\*/g, SINGLE);
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(SINGLE, 'g'), '[^/]*');
  s = s.replace(new RegExp(`/${DOUBLE}`, 'g'), '(?:/.*)?');
  const re = new RegExp(`^${s}$`);
  return re.test(path);
}

export function createCacheMiddleware(
  options: {
    store?: CacheStore;
    rules?: Record<string, CacheRule>;
    defaultTtl?: number;
  } = {}
) {
  const store = options.store || useCacheStore();

  function findTtl(path: string): number | null {
    if (!options.rules) return null;
    const patterns = Object.keys(options.rules);
    for (const pattern of patterns) {
      if (matchPath(pattern, path)) {
        return options.rules[pattern].ttl;
      }
    }
    return null;
  }

  return async function cacheMiddleware(c: Context, next: Next) {
    const path = new URL(c.req.url).pathname;
    const ttl = findTtl(path);

    if (ttl != null && ttl > 0 && isCacheableRequest(c)) {
      const key = buildCacheKey(c);
      const existing = await store.get(key);
      if (existing) {
        return entryToResponse(existing);
      }
    }

    await next();

    if (ttl == null || ttl <= 0) return;

    const res = c.res as Response;
    if (!res || !isCacheableRequest(c) || !isCacheableResponse(res)) return;

    const serialized = await serializeResponse(res.clone());
    await store.set(buildCacheKey(c), serialized, ttl);
  };
}

export function cachedEventHandler<T extends (c: Context) => Response | Promise<Response>>(
  handler: T,
  options: CacheRule = { ttl: 60 }
): T {
  const store = useCacheStore();
  const ttl = options.ttl;
  const keyBase = options.name;

  return (async (c: Context) => {
    const key = keyBase || buildCacheKey(c);

    if (ttl > 0 && isCacheableRequest(c)) {
      const existing = await store.get(key);
      if (existing) {
        return entryToResponse(existing);
      }
    }

    const res = await handler(c);
    if (ttl > 0 && isCacheableResponse(res)) {
      const serialized = await serializeResponse(res.clone());
      await store.set(key, serialized, ttl);
    }
    return res;
  }) as T;
}

export async function invalidateRouteCache(keyPattern?: string | RegExp): Promise<void> {
  const store = useCacheStore();
  if (!keyPattern) {
    await store.clear();
    return;
  }
  if (typeof keyPattern === 'string') {
    await store.delete(keyPattern);
    return;
  }
  const memStore = store as unknown as { store?: Map<string, CacheEntry> };
  if (memStore.store) {
    for (const k of Array.from(memStore.store.keys())) {
      if (keyPattern.test(k)) {
        await store.delete(k);
      }
    }
  }
}

export function resolveRouteCacheRules(routeRules: Record<string, RouteRule>): Record<string, CacheRule> {
  const result: Record<string, CacheRule> = {};
  for (const [path, rule] of Object.entries(routeRules)) {
    if (rule.cache && rule.cache.ttl != null) {
      result[path] = { ttl: rule.cache.ttl, swr: rule.cache.swr };
    }
  }
  return result;
}
