/**
 * 组件级缓存 —— 运行时原语
 *
 * 通过 `defineCachedFunction()` 显式包装异步函数,缓存其返回值。
 *
 * 设计要点:
 * - **值缓存**(非 HTTP 响应缓存):缓存异步函数的返回值(JSON 可序列化),
 *   与 `cache.ts`(HTTP 响应缓存)解耦。
 * - **AsyncLocalStorage 作用域**:`cacheLife()` / `cacheTag()` 通过 ALS 写入
 *   当前缓存的执行作用域,无需手动传递 scope 对象。
 * - **标签失效**:`revalidateTag(tag)` 失效所有带该标签的缓存条目;
 *   `revalidatePath(path)` 失效匹配路径的缓存条目。
 * - **零外部依赖**:使用内置 `AsyncLocalStorage` + `Map` 内存存储。
 *
 * 用户通过 `defineCachedFunction(fn, options)` 显式声明缓存函数,无需 Vite 插件
 * 参与,运行时通过此模块的 API 执行缓存逻辑。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { revalidateDataCacheTag, revalidateDataCachePath, clearFetchDataCache } from './fetch-memo';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 组件级缓存条目。存储序列化后的值 + 标签 + 过期时间。
 */
export interface ComponentCacheEntry {
  /** JSON 序列化后的返回值。 */
  value: string;
  /** 关联的标签列表(用于 `revalidateTag`)。 */
  tags: string[];
  /** 创建时间戳(ms)。 */
  createdAt: number;
  /** 过期时间戳(ms)。 */
  expiresAt: number;
}

/**
 * 组件级缓存存储接口。
 *
 * 与 `CacheStore`(HTTP 响应缓存)不同,此接口存储任意 JSON 可序列化值。
 */
export interface ComponentCacheStore {
  get(key: string): Promise<ComponentCacheEntry | undefined>;
  set(key: string, entry: Omit<ComponentCacheEntry, 'createdAt' | 'expiresAt'>, ttl: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /** 返回所有键(用于标签/路径失效扫描)。 */
  keys?: () => Promise<string[]>;
}

/**
 * 当前缓存执行作用域(通过 AsyncLocalStorage 传递)。
 */
interface CacheScope {
  /** TTL(秒)。默认 60。 */
  ttl: number;
  /** 标签列表。 */
  tags: string[];
}

/* -------------------------------------------------------------------------- */
/* 内存存储实现                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 默认内存组件缓存存储。带标签反向索引以加速 `revalidateTag`。
 */
export function createComponentMemoryStore(maxEntries = 500): ComponentCacheStore {
  const store = new Map<string, ComponentCacheEntry>();
  /** tag → 关联的缓存键集合 */
  const tagIndex = new Map<string, Set<string>>();

  function addToTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      let set = tagIndex.get(tag);
      if (!set) {
        set = new Set();
        tagIndex.set(tag, set);
      }
      set.add(key);
    }
  }

  function removeFromTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      const set = tagIndex.get(tag);
      if (set) {
        set.delete(key);
        if (set.size === 0) tagIndex.delete(tag);
      }
    }
  }

  function evict(): void {
    if (store.size <= maxEntries) return;
    const entries = Array.from(store.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const removeCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      const [key, entry] = entries[i];
      removeFromTagIndex(key, entry.tags);
      store.delete(key);
    }
  }

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        removeFromTagIndex(key, entry.tags);
        store.delete(key);
        return undefined;
      }
      return entry;
    },
    async set(key, entry, ttl) {
      const now = Date.now();
      const existing = store.get(key);
      if (existing) removeFromTagIndex(key, existing.tags);
      const full: ComponentCacheEntry = {
        ...entry,
        createdAt: now,
        expiresAt: now + ttl * 1000
      };
      store.set(key, full);
      addToTagIndex(key, full.tags);
      evict();
    },
    async delete(key) {
      const entry = store.get(key);
      if (entry) removeFromTagIndex(key, entry.tags);
      return store.delete(key);
    },
    async clear() {
      store.clear();
      tagIndex.clear();
    },
    async keys() {
      return Array.from(store.keys());
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 全局存储 + 标签索引                                                          */
/* -------------------------------------------------------------------------- */

let globalComponentStore: ComponentCacheStore | null = null;

export function useComponentCacheStore(store?: ComponentCacheStore): ComponentCacheStore {
  if (store) {
    globalComponentStore = store;
    return store;
  }
  if (!globalComponentStore) {
    globalComponentStore = createComponentMemoryStore();
  }
  return globalComponentStore;
}

export function clearComponentCacheStore(): void {
  globalComponentStore = null;
}

/* -------------------------------------------------------------------------- */
/* AsyncLocalStorage 作用域                                                    */
/* -------------------------------------------------------------------------- */

const cacheScopeStorage = new AsyncLocalStorage<CacheScope>();

/**
 * 设置当前缓存作用域的 TTL(秒)。
 *
 * 必须在 `defineCachedFunction()` 包装的函数体内调用,否则为空操作(允许在
 * 非缓存上下文中调用以简化条件逻辑)。
 *
 * @example
 * ```ts
 * const getUser = defineCachedFunction(
 *   async (id: string) => {
 *     cacheLife(3600); // 缓存 1 小时
 *     return await db.query.user.findById(id);
 *   },
 *   { name: 'getUser' }
 * );
 * ```
 */
export function cacheLife(seconds: number): void {
  const scope = cacheScopeStorage.getStore();
  if (scope) {
    scope.ttl = Math.max(0, Math.floor(seconds));
  }
}

/**
 * 为当前缓存作用域添加标签。
 *
 * 标签可用于通过 `revalidateTag(tag)` 精确失效缓存。
 *
 * @example
 * ```ts
 * const getUser = defineCachedFunction(
 *   async (id: string) => {
 *     cacheTag('users', `user:${id}`);
 *     return await db.query.user.findById(id);
 *   },
 *   { name: 'getUser' }
 * );
 *
 * // 失效所有带 'users' 标签的缓存
 * await revalidateTag('users');
 * ```
 */
export function cacheTag(...tags: string[]): void {
  const scope = cacheScopeStorage.getStore();
  if (scope) {
    scope.tags.push(...tags);
  }
}

/* -------------------------------------------------------------------------- */
/* 缓存包装器                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 缓存函数选项。
 */
export interface CachedFunctionOptions {
  /** 缓存键前缀(通常是函数名或文件路径 + 函数名)。 */
  name: string;
  /** 默认 TTL(秒)。未调用 `cacheLife()` 时使用。默认 60。 */
  defaultTtl?: number;
  /**
   * 自定义缓存键生成函数。默认使用 `name + JSON.stringify(args)`。
   * 用于精细化控制缓存键(例如排除不稳定的参数)。
   */
  getKey?: (...args: unknown[]) => string;
}

/**
 * @deprecated 请使用 `CachedFunctionOptions`。保留旧名称仅为向后兼容。
 */
export type CacheWrapOptions = CachedFunctionOptions;

/**
 * 默认缓存键生成器:`name + ":" + JSON.stringify(args)`。
 */
function defaultGetKey(name: string, args: unknown[]): string {
  if (args.length === 0) return name;
  try {
    return `${name}:${JSON.stringify(args)}`;
  } catch {
    // 参数包含不可序列化的值,退化为时间戳键(不命中缓存)
    return `${name}:__unserializable__`;
  }
}

/**
 * 将异步函数包装为带缓存的函数。
 *
 * 用户在源码中显式调用此函数声明缓存函数(无需 Vite 插件参与)。
 *
 * 工作流程:
 * 1. 根据参数生成缓存键
 * 2. 查询缓存 → 命中则返回反序列化的值
 * 3. 未命中 → 在 `AsyncLocalStorage` 作用域中执行原函数
 *    - 函数体内的 `cacheLife()` / `cacheTag()` 写入作用域
 * 4. 将结果序列化存入缓存(带标签 + TTL)
 * 5. 返回结果
 *
 * @example
 * ```ts
 * import { defineCachedFunction, cacheLife, cacheTag } from '@ubean/server';
 *
 * const getUser = defineCachedFunction(
 *   async (id: string) => {
 *     cacheLife(3600);
 *     cacheTag('users', `user:${id}`);
 *     return await db.query.user.findById(id);
 *   },
 *   { name: 'getUser' }
 * );
 * ```
 *
 * @param fn 原始异步函数
 * @param options 缓存选项
 */
export function defineCachedFunction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: CachedFunctionOptions
): (...args: TArgs) => Promise<TResult> {
  const store = useComponentCacheStore();
  const defaultTtl = options.defaultTtl ?? 60;

  return async (...args: TArgs): Promise<TResult> => {
    const key = options.getKey ? options.getKey(...args) : defaultGetKey(options.name, args);

    // 查询缓存
    const cached = await store.get(key);
    if (cached) {
      try {
        return JSON.parse(cached.value) as TResult;
      } catch {
        // 反序列化失败,继续执行函数
      }
    }

    // 在缓存作用域中执行函数
    const scope: CacheScope = { ttl: defaultTtl, tags: [] };
    const result = await cacheScopeStorage.run(scope, () => fn(...args));

    // 序列化并存储
    try {
      const value = JSON.stringify(result);
      await store.set(key, { value, tags: scope.tags }, scope.ttl);
    } catch {
      // 结果不可序列化,跳过缓存(函数仍正常返回)
    }

    return result;
  };
}

/**
 * @deprecated 请使用 `defineCachedFunction()`。保留旧名称仅为向后兼容。
 */
export const wrapWithCache = defineCachedFunction;

/* -------------------------------------------------------------------------- */
/* 失效 API                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 失效所有带指定标签的缓存条目。
 *
 * @example
 * ```ts
 * // 用户数据更新后,失效所有 'users' 标签的缓存
 * await revalidateTag('users');
 * ```
 */
export async function revalidateTag(tag: string): Promise<number> {
  const store = useComponentCacheStore();
  let deleted = 0;

  if (store.keys) {
    // 优化路径:存储实现了 keys(),可批量扫描
    const allKeys = await store.keys();
    for (const key of allKeys) {
      const entry = await store.get(key);
      if (entry && entry.tags.includes(tag)) {
        await store.delete(key);
        deleted++;
      }
    }
  }

  // 同时失效 fetch Data Cache(Task 4):带该标签的 fetch 缓存条目
  deleted += await revalidateDataCacheTag(tag);

  return deleted;
}

/**
 * 失效多个标签的缓存条目。
 */
export async function revalidateTags(...tags: string[]): Promise<number> {
  let total = 0;
  for (const tag of tags) {
    total += await revalidateTag(tag);
  }
  return total;
}

/**
 * 失效缓存键匹配指定模式的条目。
 *
 * 支持 `*`(单段通配)和 `**`(多段通配)。
 *
 * @example
 * ```ts
 * // 失效所有 getUser 开头的缓存
 * await revalidatePath('getUser:*');
 * // 失效特定用户缓存
 * await revalidatePath('getUser:["user-123"]');
 * ```
 */
export async function revalidatePath(pattern: string | RegExp): Promise<number> {
  const store = useComponentCacheStore();
  let deleted = 0;

  if (store.keys) {
    const allKeys = await store.keys();
    const regex = pattern instanceof RegExp ? pattern : globToRegex(pattern);

    for (const key of allKeys) {
      if (regex.test(key)) {
        await store.delete(key);
        deleted++;
      }
    }
  }

  // 同时失效 fetch Data Cache(Task 4):缓存键匹配的 fetch 缓存条目
  deleted += await revalidateDataCachePath(pattern);

  return deleted;
}

/**
 * 清空所有组件级缓存。
 */
export async function clearComponentCache(): Promise<void> {
  const store = useComponentCacheStore();
  await store.clear();
  // 同时清空 fetch Data Cache(Task 4)
  clearFetchDataCache();
}

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 将 glob 模式转换为正则表达式。
 * `*` → `[^/]*`,`**` → `.*`。
 */
function globToRegex(pattern: string): RegExp {
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
