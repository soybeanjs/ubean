/**
 * CDN / Edge cache 集成 (Task 17)
 *
 * 提供基于 surrogate key 的 CDN 缓存失效管理,支持多平台适配器
 * (Cloudflare / Fastly / Vercel / AWS CloudFront / Azure CDN)。
 *
 * 核心概念:
 * - **Surrogate Key**: 为响应打上标签(如 `page:home`, `user:42`),
 *   后续当数据变更时可通过 key 批量失效 CDN 缓存,无需逐 URL 清除
 * - **Cache-Control 生成**: 根据路由规则生成标准 Cache-Control 头
 * - **Purge 适配器**: 各平台 CDN 缓存清除 API 的统一抽象
 *
 * 用法:
 * ```typescript
 * import {
 *   defineSurrogateKeys,
 *   createCacheControlMiddleware,
 *   createCloudflarePurgeAdapter,
 *   purgeKeys
 * } from '@ubean/server';
 *
 * // 中间件:为 /products/* 响应打上 surrogate keys
 * app.use('/products/*', (c, next) => {
 *   c.header('Cache-Tag', 'products,product-list');
 *   return next();
 * });
 *
 * // 中间件:自动设置 Cache-Control
 * app.use('*', createCacheControlMiddleware({
 *   defaultMaxAge: 60,
 *   sMaxAge: 300
 * }));
 *
 * // 数据变更时失效缓存
 * const adapter = createCloudflarePurgeAdapter({
 *   zoneId: '...',
 *   apiToken: process.env.CF_API_TOKEN!
 * });
 * await purgeKeys(adapter, ['products', 'product-list']);
 * ```
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Surrogate key 头部名称(各平台不同)。
 * Cloudflare 用 `Cache-Tag`,Fastly 用 `Surrogate-Key`,
 * Vercel 用 `x-vercel-cache-tags`。
 */
export type SurrogateKeyHeader = 'Cache-Tag' | 'Surrogate-Key' | 'x-vercel-cache-tags' | string;

/**
 * CDN 缓存清除适配器接口
 */
export interface CdnPurgeAdapter {
  /** 适配器名称(用于日志/调试) */
  name: string;
  /** 按 surrogate key 清除缓存 */
  purgeKeys(keys: string[]): Promise<PurgeResult>;
  /** 按 URL 清除缓存(可选) */
  purgeUrls?(urls: string[]): Promise<PurgeResult>;
  /** 清除全部缓存(谨慎使用) */
  purgeAll?(): Promise<PurgeResult>;
}

/**
 * 清除操作结果
 */
export interface PurgeResult {
  /** 是否成功 */
  success: boolean;
  /** 被清除的 key/url 数量 */
  purged: number;
  /** 平台返回的原始响应(调试用) */
  raw?: unknown;
  /** 错误信息(失败时) */
  error?: string;
}

/**
 * Cache-Control 中间件选项
 */
export interface CacheControlOptions {
  /** 默认 max-age(秒),浏览器缓存 */
  defaultMaxAge?: number;
  /** s-maxage(秒),CDN/共享缓存 */
  sMaxAge?: number;
  /** stale-while-revalidate(秒) */
  staleWhileRevalidate?: number;
  /** stale-if-error(秒) */
  staleIfError?: number;
  /** 是否公开缓存(默认 true) */
  public?: boolean;
  /** 是否不可变(用于带 hash 的静态资源) */
  immutable?: boolean;
  /** 按路径模式自定义 max-age */
  rules?: Array<{
    pattern: string | RegExp;
    maxAge?: number;
    sMaxAge?: number;
    immutable?: boolean;
  }>;
  /** 跳过路径(前缀匹配) */
  exclude?: string[];
  /** 是否对 404/5xx 设置 no-cache(默认 true) */
  noCacheOnError?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Surrogate Key 管理                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 为当前响应设置 surrogate key 头部。
 *
 * 在路由处理器中调用,为响应打上缓存标签,
 * 后续可通过 `purgeKeys(adapter, keys)` 批量失效。
 *
 * @example
 * ```typescript
 * app.get('/products/:id', async (c) => {
 *   const product = await getProduct(c.req.param('id'));
 *   defineSurrogateKeys(c, [`product:${product.id}`, 'product-list']);
 *   return c.json(product);
 * });
 * ```
 */
export function defineSurrogateKeys(
  c: Context<UbeanEnv>,
  keys: string[],
  header: SurrogateKeyHeader = 'Cache-Tag'
): void {
  if (keys.length === 0) return;
  c.header(header, keys.join(','));
}

/**
 * 从请求上下文读取 surrogate keys(通常用于测试/调试)。
 */
export function getSurrogateKeys(c: Context<UbeanEnv>, header: SurrogateKeyHeader = 'Cache-Tag'): string[] {
  const value = c.res?.headers.get(header) || c.req.header(header.toLowerCase());
  if (!value) return [];
  return value
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* 全局适配器注册表                                                               */
/* -------------------------------------------------------------------------- */

let globalPurgeAdapter: CdnPurgeAdapter | null = null;

/**
 * 设置全局默认 CDN 清除适配器。
 */
export function setGlobalPurgeAdapter(adapter: CdnPurgeAdapter | null): void {
  globalPurgeAdapter = adapter;
}

/**
 * 获取全局默认清除适配器。
 */
export function getGlobalPurgeAdapter(): CdnPurgeAdapter | null {
  return globalPurgeAdapter;
}

/**
 * 使用指定适配器(或全局适配器)按 key 清除 CDN 缓存。
 *
 * @example
 * ```typescript
 * // 数据变更后失效相关页面缓存
 * await purgeKeys(['product:42', 'product-list']);
 * ```
 */
export async function purgeKeys(adapterOrKeys: CdnPurgeAdapter | string[], keys?: string[]): Promise<PurgeResult> {
  let adapter: CdnPurgeAdapter | null;
  let keysToPurge: string[];

  if (Array.isArray(adapterOrKeys)) {
    adapter = globalPurgeAdapter;
    keysToPurge = adapterOrKeys;
  } else {
    adapter = adapterOrKeys;
    keysToPurge = keys || [];
  }

  if (!adapter) {
    return { success: false, purged: 0, error: 'No CDN purge adapter configured' };
  }

  if (keysToPurge.length === 0) {
    return { success: true, purged: 0 };
  }

  return adapter.purgeKeys(keysToPurge);
}

/**
 * 按 URL 清除 CDN 缓存。
 */
export async function purgeUrls(adapterOrUrls: CdnPurgeAdapter | string[], urls?: string[]): Promise<PurgeResult> {
  let adapter: CdnPurgeAdapter | null;
  let urlsToPurge: string[];

  if (Array.isArray(adapterOrUrls)) {
    adapter = globalPurgeAdapter;
    urlsToPurge = adapterOrUrls;
  } else {
    adapter = adapterOrUrls;
    urlsToPurge = urls || [];
  }

  if (!adapter) {
    return { success: false, purged: 0, error: 'No CDN purge adapter configured' };
  }

  if (!adapter.purgeUrls) {
    return { success: false, purged: 0, error: `Adapter "${adapter.name}" does not support URL purging` };
  }

  if (urlsToPurge.length === 0) {
    return { success: true, purged: 0 };
  }

  return adapter.purgeUrls(urlsToPurge);
}

/* -------------------------------------------------------------------------- */
/* Cache-Control 中间件                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 创建 Cache-Control 头部生成中间件。
 *
 * 根据路由规则自动设置 `Cache-Control` 响应头,
 * 支持按路径模式自定义 max-age / s-maxage / immutable 等。
 *
 * @example
 * ```typescript
 * app.use('*', createCacheControlMiddleware({
 *   defaultMaxAge: 60,
 *   sMaxAge: 300,
 *   rules: [
 *     { pattern: '/_assets/**', maxAge: 31536000, immutable: true },
 *     { pattern: '/api/**', maxAge: 0 }
 *   ],
 *   exclude: ['/api/health', '/api/webhook']
 * }));
 * ```
 */
export function createCacheControlMiddleware(options: CacheControlOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    defaultMaxAge,
    sMaxAge,
    staleWhileRevalidate,
    staleIfError,
    public: isPublic = true,
    immutable = false,
    rules = [],
    exclude = [],
    noCacheOnError = true
  } = options;

  return async function cacheControlMiddleware(c: Context<UbeanEnv>, next: Next) {
    const path = c.req.path;

    // 跳过排除路径
    if (exclude.some(prefix => path.startsWith(prefix))) {
      await next();
      return;
    }

    await next();

    // 如果已有 Cache-Control 头,不覆盖
    if (c.res?.headers.get('cache-control')) return;

    const status = c.res?.status ?? 200;

    // 错误响应不缓存
    if (noCacheOnError && (status >= 400 || status === 301)) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }

    // 查找匹配的规则
    const matchedRule = rules.find(rule => {
      if (typeof rule.pattern === 'string') {
        return matchGlobPath(path, rule.pattern);
      }
      return rule.pattern.test(path);
    });

    const maxAge = matchedRule?.maxAge ?? defaultMaxAge;
    const swMaxAge = matchedRule?.sMaxAge ?? sMaxAge;
    const isImmutable = matchedRule?.immutable ?? immutable;

    // 不设置 maxAge 时跳过(不添加 Cache-Control)
    if (maxAge === undefined && swMaxAge === undefined) return;

    const directives: string[] = [];

    if (maxAge === 0) {
      directives.push('no-cache, no-store, must-revalidate');
    } else {
      directives.push(isPublic ? 'public' : 'private');
      if (maxAge !== undefined) directives.push(`max-age=${maxAge}`);
      if (swMaxAge !== undefined) directives.push(`s-maxage=${swMaxAge}`);
      if (staleWhileRevalidate !== undefined) directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
      if (staleIfError !== undefined) directives.push(`stale-if-error=${staleIfError}`);
      if (isImmutable) directives.push('immutable');
    }

    c.header('Cache-Control', directives.join(', '));
  };
}

/**
 * 简单的 glob 路径匹配(支持 `*` 单段和 `**` 多段)。
 */
function matchGlobPath(path: string, pattern: string): boolean {
  // 将 glob 转为正则
  const regexStr = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

/* -------------------------------------------------------------------------- */
/* 内置 Purge 适配器                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Cloudflare 缓存清除适配器
 *
 * 使用 Cloudflare API 按 Cache-Tag 清除缓存。
 * 需要 zone ID 和 API Token(需 Cache Purge 权限)。
 *
 * @example
 * ```typescript
 * const adapter = createCloudflarePurgeAdapter({
 *   zoneId: process.env.CF_ZONE_ID!,
 *   apiToken: process.env.CF_API_TOKEN!
 * });
 * setGlobalPurgeAdapter(adapter);
 * await purgeKeys(['product:42']);
 * ```
 */
export function createCloudflarePurgeAdapter(options: {
  zoneId: string;
  apiToken: string;
  endpoint?: string;
}): CdnPurgeAdapter {
  const endpoint = options.endpoint || 'https://api.cloudflare.com/client/v4';
  const { zoneId, apiToken } = options;

  return {
    name: 'cloudflare',

    async purgeKeys(keys: string[]): Promise<PurgeResult> {
      if (keys.length === 0) return { success: true, purged: 0 };

      try {
        const resp = await fetch(`${endpoint}/zones/${zoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tags: keys })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          return {
            success: false,
            purged: 0,
            error: `Cloudflare API error: ${resp.status} ${resp.statusText}`,
            raw: data
          };
        }

        return { success: true, purged: keys.length, raw: data };
      } catch (err) {
        return {
          success: false,
          purged: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    },

    async purgeUrls(urls: string[]): Promise<PurgeResult> {
      if (urls.length === 0) return { success: true, purged: 0 };

      try {
        const resp = await fetch(`${endpoint}/zones/${zoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ files: urls })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          return {
            success: false,
            purged: 0,
            error: `Cloudflare API error: ${resp.status} ${resp.statusText}`,
            raw: data
          };
        }

        return { success: true, purged: urls.length, raw: data };
      } catch (err) {
        return {
          success: false,
          purged: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    },

    async purgeAll(): Promise<PurgeResult> {
      try {
        const resp = await fetch(`${endpoint}/zones/${zoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ purge_everything: true })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          return {
            success: false,
            purged: 0,
            error: `Cloudflare API error: ${resp.status} ${resp.statusText}`,
            raw: data
          };
        }

        return { success: true, purged: -1, raw: data };
      } catch (err) {
        return {
          success: false,
          purged: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  };
}

/**
 * Fastly 缓存清除适配器
 *
 * 使用 Fastly API 按 Surrogate-Key 清除缓存。
 * 需要 service ID 和 API key。
 */
export function createFastlyPurgeAdapter(options: {
  serviceId: string;
  apiKey: string;
  endpoint?: string;
}): CdnPurgeAdapter {
  const endpoint = options.endpoint || 'https://api.fastly.com';
  const { serviceId, apiKey } = options;

  return {
    name: 'fastly',

    async purgeKeys(keys: string[]): Promise<PurgeResult> {
      if (keys.length === 0) return { success: true, purged: 0 };

      try {
        const resp = await fetch(`${endpoint}/service/${serviceId}/purge`, {
          method: 'POST',
          headers: {
            'Fastly-Key': apiKey,
            'Surrogate-Key': keys.join(' ')
          }
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          return {
            success: false,
            purged: 0,
            error: `Fastly API error: ${resp.status} ${resp.statusText}`,
            raw: data
          };
        }

        return { success: true, purged: keys.length, raw: data };
      } catch (err) {
        return {
          success: false,
          purged: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  };
}

/**
 * Mock purge 适配器(用于测试)
 *
 * 记录所有清除操作,便于断言。
 */
export function createMockPurgeAdapter(): CdnPurgeAdapter & {
  purgedKeys: string[][];
  purgedUrls: string[][];
  purgedAllCount: number;
  reset(): void;
} {
  const purgedKeys: string[][] = [];
  const purgedUrls: string[][] = [];
  let purgedAllCount = 0;

  return {
    name: 'mock',
    purgedKeys,
    purgedUrls,
    get purgedAllCount() {
      return purgedAllCount;
    },
    async purgeKeys(keys: string[]): Promise<PurgeResult> {
      purgedKeys.push([...keys]);
      return { success: true, purged: keys.length };
    },
    async purgeUrls(urls: string[]): Promise<PurgeResult> {
      purgedUrls.push([...urls]);
      return { success: true, purged: urls.length };
    },
    async purgeAll(): Promise<PurgeResult> {
      purgedAllCount++;
      return { success: true, purged: -1 };
    },
    reset() {
      purgedKeys.length = 0;
      purgedUrls.length = 0;
      purgedAllCount = 0;
    }
  };
}

/**
 * 清除全局状态(主要用于测试隔离)
 */
export function _resetCdnCache(): void {
  globalPurgeAdapter = null;
}
