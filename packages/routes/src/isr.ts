/**
 * ISR (Incremental Static Regeneration) 缓存助手(P9-03)。
 *
 * 与 `@ubean/server` 的 `CacheStore` 结构兼容(但不直接依赖),由调用方
 * 通过 `RegisterOptions.cacheStore` / `IsrServeOptions.store` 注入实例。
 * 使用独立 key 前缀 `isr:`,避免与普通 `RouteRule.cache` 缓存的响应冲突。
 *
 * 语义:
 * - `get(key)`:仅当 entry 存在且未过期时返回
 * - `peek(key)`:无论是否过期都返回(用于 SWR);后端不支持时退化为 `get`
 * - `set(key, html, ttl)`:写入渲染后的 HTML
 *
 * ISR 流程(`serveIsr`):
 * 1. 命中且未过期 → 直接返回缓存的 HTML(`X-ISR: HIT`)
 * 2. 命中但已过期 + swr=true → 返回旧 HTML(`X-ISR: STALE`),后台异步重新生成
 * 3. 命中但已过期 + swr=false → 同步重新生成,更新缓存,返回新 HTML(`X-ISR: MISS`)
 * 4. 未命中 → 渲染、缓存、返回(`X-ISR: MISS`)
 *
 * 后台重新生成使用模块级的 `REVALIDATING` Set 去重,避免并发请求重复生成。
 */
import type { Context } from 'hono';
import type { IsrRule, RouteRule, UbeanEnv } from '@ubean/shared';
import { normalizeIsrRule } from './route-rules';

const ISR_KEY_PREFIX = 'isr:';
const REVALIDATING = new Set<string>();

/**
 * ISR 缓存条目(内部表示,与 @ubean/server 的 CacheEntry 结构兼容)。
 */
export interface IsrCacheEntryInternal {
  body: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
  statusText: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * ISR 缓存存储接口。与 `@ubean/server` 的 `CacheStore` 结构兼容 ——
 * 调用方注入任何满足此形状的实例即可(无需真正依赖 @ubean/server)。
 */
export interface IsrCacheStore {
  get(key: string): Promise<IsrCacheEntryInternal | undefined>;
  set(key: string, entry: Omit<IsrCacheEntryInternal, 'createdAt' | 'expiresAt'>, ttl: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /** 返回 entry(无论是否过期)。不实现时退化为 `get`(SWR 自动降级为同步重新生成) */
  peek?(key: string): Promise<IsrCacheEntryInternal | undefined>;
}

export interface IsrCacheEntry {
  html: string;
  status: number;
  headers: Record<string, string>;
}

export interface IsrServeOptions {
  /** 当前请求的路径名(用于构建 cache key) */
  pathname: string;
  /** ISR 规则(已规范化) */
  rule: IsrRule;
  /** 渲染函数:同步重新生成时调用 */
  render: () => Promise<{ html: string; status?: number; headers?: Record<string, string> }>;
  /** cache store(必传 —— 由调用方通过 RegisterOptions.cacheStore 注入) */
  store: IsrCacheStore;
}

export function buildIsrCacheKey(pathname: string): string {
  return `${ISR_KEY_PREFIX}${pathname}`;
}

/**
 * 读取缓存的 ISR entry(仅未过期)。
 */
export async function getIsrCache(store: IsrCacheStore, pathname: string): Promise<IsrCacheEntry | undefined> {
  const key = buildIsrCacheKey(pathname);
  const entry = await store.get(key);
  if (!entry) return undefined;
  return {
    html: new TextDecoder().decode(entry.body),
    status: entry.status,
    headers: entry.headers
  };
}

/**
 * 读取缓存的 ISR entry(即使已过期,用于 SWR)。
 * 后端不支持 `peek` 时退化为 `get`(无 SWR)。
 */
export async function getStaleIsrCache(store: IsrCacheStore, pathname: string): Promise<IsrCacheEntry | undefined> {
  if (!store.peek) return getIsrCache(store, pathname);
  const key = buildIsrCacheKey(pathname);
  const entry = await store.peek(key);
  if (!entry) return undefined;
  return {
    html: new TextDecoder().decode(entry.body),
    status: entry.status,
    headers: entry.headers
  };
}

/**
 * 写入 ISR 缓存。
 */
export async function setIsrCache(
  store: IsrCacheStore,
  pathname: string,
  entry: IsrCacheEntry,
  ttl: number
): Promise<void> {
  const key = buildIsrCacheKey(pathname);
  const body = new TextEncoder().encode(entry.html).buffer;
  await store.set(key, { body, headers: entry.headers, status: entry.status, statusText: '' }, ttl);
}

/**
 * 失效指定路径的 ISR 缓存。需要调用方提供 store(避免本包依赖全局单例)。
 */
export async function invalidateIsrCache(store: IsrCacheStore, pathname: string): Promise<boolean> {
  return store.delete(buildIsrCacheKey(pathname));
}

/**
 * 失效所有匹配模式的 ISR 缓存。仅对内存存储有效(读取底层 Map)。
 */
export async function invalidateIsrCachePattern(store: IsrCacheStore, pattern: RegExp): Promise<number> {
  const memStore = store as unknown as { store?: Map<string, unknown> };
  if (!memStore.store) return 0;
  let count = 0;
  for (const k of Array.from(memStore.store.keys())) {
    if (!k.startsWith(ISR_KEY_PREFIX)) continue;
    const path = k.slice(ISR_KEY_PREFIX.length);
    if (pattern.test(path)) {
      await store.delete(k);
      count++;
    }
  }
  return count;
}

/**
 * 判断 entry 是否已过期。配合 `getStaleIsrCache` 用于 SWR 判定。
 * 仅内存存储可用 —— 其他后端在 `getStaleIsrCache` 已退化为 `get`(永远 fresh),
 * 不会进入此分支。
 */
export function isIsrEntryStale(pathname: string, store: IsrCacheStore): boolean {
  const memStore = store as unknown as { store?: Map<string, { expiresAt?: number }> };
  if (!memStore.store) return false;
  const entry = memStore.store.get(buildIsrCacheKey(pathname));
  if (!entry?.expiresAt) return false;
  return Date.now() > entry.expiresAt;
}

/**
 * ISR 主入口:检查缓存 → 命中则返回,未命中/过期则调用 render 重新生成。
 *
 * 返回 `Response` 表示 ISR 处理完成(直接返回给客户端),
 * 返回 `undefined` 表示无 ISR 规则或调用方应自行处理(由 `serveIsr` 内部逻辑决定)。
 *
 * 实现说明:使用 `peek`(若可用)而非 `get` 来读取缓存,避免 `get` 在
 * 过期时删除 entry 导致 SWR 无法读取旧内容。后端不支持 `peek` 时退化为 `get`
 * (SWR 自动降级为同步重新生成)。
 */
export async function serveIsr(_c: Context<UbeanEnv>, options: IsrServeOptions): Promise<Response | undefined> {
  const store = options.store;
  const { pathname, rule, render } = options;
  const key = buildIsrCacheKey(pathname);

  // 1. 读取 entry(优先 peek 避免删除副作用)
  const rawEntry = store.peek ? await store.peek(key) : await store.get(key);

  if (rawEntry) {
    const isStale = Date.now() > rawEntry.expiresAt;
    const html = new TextDecoder().decode(rawEntry.body);

    if (!isStale) {
      // 命中且未过期 → HIT
      const headers = new Headers(rawEntry.headers);
      headers.set('X-ISR', 'HIT');
      return new Response(html, { status: rawEntry.status, headers });
    }

    // 命中但已过期
    if (rule.swr) {
      // SWR:返回旧内容 + 后台异步刷新
      const revalKey = key;
      if (!REVALIDATING.has(revalKey)) {
        REVALIDATING.add(revalKey);
        void render()
          .then(async result => {
            await setIsrCache(
              store,
              pathname,
              {
                html: result.html,
                status: result.status ?? 200,
                headers: result.headers ?? { 'Content-Type': 'text/html; charset=utf-8' }
              },
              rule.ttl
            );
          })
          .catch(() => {
            // 后台重新生成失败 —— 旧内容继续服务,下次请求会重试
          })
          .finally(() => {
            REVALIDATING.delete(revalKey);
          });
      }
      const headers = new Headers(rawEntry.headers);
      headers.set('X-ISR', 'STALE');
      return new Response(html, { status: rawEntry.status, headers });
    }
    // 非 SWR:继续到同步重新生成(不返回)
  }

  // 2. 未命中 / 已过期且非 swr → 同步重新生成
  const result = await render();
  const status = result.status ?? 200;
  const headers = result.headers ?? { 'Content-Type': 'text/html; charset=utf-8' };
  // 仅缓存 2xx 响应
  if (status >= 200 && status < 300) {
    await setIsrCache(store, pathname, { html: result.html, status, headers }, rule.ttl);
  }
  const respHeaders = new Headers(headers);
  respHeaders.set('X-ISR', 'MISS');
  return new Response(result.html, { status, headers: respHeaders });
}

/**
 * 从 context 读取匹配到的 routeRule,提取 ISR 规则。
 * 返回 `undefined` 表示该路由未启用 ISR。
 */
export function getIsrRuleFromContext(c: Context<UbeanEnv>): IsrRule | undefined {
  const rule = c.get('routeRule') as RouteRule | undefined;
  if (!rule?.isr) return undefined;
  return normalizeIsrRule(rule.isr);
}
