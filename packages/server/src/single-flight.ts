/**
 * Single-flight mutations (P9-16)
 *
 * 对齐 SolidStart single-flight mutations 模式:当一个 Server Action (P9-02)
 * 变更数据后,客户端通常需要重新获取依赖数据(瀑布式:mutation → refetch A
 * → refetch B)。single-flight 将这些重新获取打包进 mutation 响应,
 * 在单个 round-trip 内完成,避免瀑布式请求。
 *
 * 工作原理:
 * 1. `defineRevalidation(keys, fetcher)` 在应用启动时注册重新获取处理器
 * 2. Action 处理器内调用 `invalidate(keys)` 标记需要重新获取的依赖键
 * 3. 中间件在响应生成后拦截响应,执行匹配的 revalidation fetcher,
 *    将结果打包进响应体(JSON 响应添加 `__ubean_revalidation__` 字段)
 * 4. 客户端读取该字段一次性更新所有依赖缓存
 *
 * 用法:
 * ```typescript
 * // 注册 revalidation 依赖
 * defineRevalidation(['users'], async () => ({
 *   users: await db.query.users.findMany()
 * }));
 *
 * // 中间件
 * app.use('*', createSingleFlightMiddleware());
 *
 * // Action 处理器
 * export const createUser = defineAction(async (input) => {
 *   await db.insert(users).values(input);
 *   invalidate(['users']); // 标记 users 需要重新获取
 *   return { ok: true };
 * });
 * ```
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

/** 重新获取键 —— 字符串标识符,用于匹配 invalidate() 与 defineRevalidation() */
export type RevalidationKey = string;

/**
 * 重新获取上下文,传递给每个 revalidation fetcher。
 */
export interface RevalidationContext {
  /** 触发本次重新获取的键列表(invalidate 调用的键与该 entry 的键的交集) */
  keys: RevalidationKey[];
  /** Hono 上下文(用于读取请求信息、session 等) */
  context: Context<UbeanEnv>;
}

/**
 * Revalidation fetcher —— 返回需要打包进响应的重新获取数据。
 *
 * 返回值必须是一个扁平对象 `Record<string, unknown>`,其键是客户端缓存键,
 * 值是重新获取的数据。多个 fetcher 的返回值会被合并到同一个 bundle 中。
 */
export type RevalidationFetcher = (ctx: RevalidationContext) => Promise<Record<string, unknown>>;

/**
 * 已注册的 revalidation 条目。
 */
export interface RevalidationEntry {
  /** 该 fetcher 负责的重新获取键列表 */
  keys: RevalidationKey[];
  /** 重新获取处理器 */
  fetcher: RevalidationFetcher;
  /** 可选名称(用于调试) */
  name?: string;
}

/**
 * 单个 revalidation 结果条目。
 */
export interface RevalidationResult {
  /** 重新获取的数据(已合并) */
  data: Record<string, unknown>;
  /** 被重新获取的键 */
  keys: RevalidationKey[];
  /** 时间戳(ms) */
  timestamp: number;
  /** fetcher 执行中产生的错误(若有) */
  errors: Array<{ keys: RevalidationKey[]; message: string }>;
}

/**
 * Single-flight 中间件选项。
 */
export interface SingleFlightOptions {
  /** 标记响应包含 revalidation 数据的 header 名称 */
  revalidationHeader?: string;
  /** JSON 响应体中存放 revalidation 数据的字段名 */
  revalidationField?: string;
  /** 只处理这些 Content-Type 的响应(默认 application/json) */
  contentTypes?: string[];
  /** 跳过函数 —— 返回 true 则不处理该请求 */
  skip?: (c: Context<UbeanEnv>) => boolean | Promise<boolean>;
  /** revalidation fetcher 是否并行执行(默认 true) */
  parallel?: boolean;
}

/* -------------------------------------------------------------------------- */
/* 请求作用域(AsyncLocalStorage)                                               */
/* -------------------------------------------------------------------------- */

interface SingleFlightContext {
  /** 当前请求中被 invalidate 的键集合 */
  invalidatedKeys: Set<RevalidationKey>;
  /** 是否已注册(中间件已激活) */
  registered: boolean;
}

let asyncLocalStorage: {
  run: (store: SingleFlightContext, fn: () => Promise<void>) => Promise<void>;
  getStore?: () => SingleFlightContext | undefined;
} | null = null;

try {
  // 服务端包仅在 Node.js 环境运行,直接 import node:async_hooks
  const { AsyncLocalStorage } = await import('node:async_hooks');
  asyncLocalStorage = new AsyncLocalStorage<SingleFlightContext>() as any;
} catch {
  // 非 Node.js 环境(如 Cloudflare Workers),降级为 fallback 模式
}

/**
 * Fallback: 使用全局 Map(基于 requestId,不如 AsyncLocalStorage 精确)
 */
const fallbackStore = new Map<string, SingleFlightContext>();

function getRequestId(c: Context<UbeanEnv>): string {
  return (c.get('requestId') as string) || 'default';
}

function getCurrentContext(c?: Context<UbeanEnv>): SingleFlightContext | undefined {
  if (asyncLocalStorage) {
    return asyncLocalStorage.getStore?.();
  }
  if (c) {
    return fallbackStore.get(getRequestId(c));
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* 内存注册表                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 全局 revalidation 处理器注册表(进程内内存)。
 *
 * 每个 entry 声明它负责哪些 revalidation 键。当 `invalidate(keys)` 被调用时,
 * 中间件查找所有键与 invalidated 键有交集的 entry 并执行其 fetcher。
 */
const revalidationRegistry: RevalidationEntry[] = [];

/**
 * 注册一个 revalidation 依赖。
 *
 * @param keys 该 fetcher 负责的重新获取键列表
 * @param fetcher 重新获取处理器,返回需要打包进响应的数据
 * @param name 可选名称(用于调试)
 *
 * @example
 * ```typescript
 * defineRevalidation(['users', 'user-count'], async (ctx) => {
 *   const [users, count] = await Promise.all([
 *     db.query.users.findMany(),
 *     db.select({ count: count() }).from(users)
 *   ]);
 *   return { users, 'user-count': count };
 * });
 * ```
 */
export function defineRevalidation(
  keys: RevalidationKey[],
  fetcher: RevalidationFetcher,
  name?: string
): RevalidationEntry {
  const entry: RevalidationEntry = { keys: [...keys], fetcher, name };
  revalidationRegistry.push(entry);
  return entry;
}

/**
 * 取消注册一个 revalidation 条目。
 */
export function unregisterRevalidation(entry: RevalidationEntry): boolean {
  const idx = revalidationRegistry.indexOf(entry);
  if (idx === -1) return false;
  revalidationRegistry.splice(idx, 1);
  return true;
}

/**
 * 获取所有已注册的 revalidation 条目(只读副本,用于测试/调试)。
 */
export function getRevalidationEntries(): RevalidationEntry[] {
  return [...revalidationRegistry];
}

/**
 * 清空所有 revalidation 注册(主要用于测试)。
 */
export function clearRevalidationRegistry(): void {
  revalidationRegistry.length = 0;
}

/**
 * 标记需要重新获取的依赖键。
 *
 * 必须在 single-flight 中间件作用域内(action 处理器中)调用,
 * 否则给出开发警告。
 *
 * @example
 * ```typescript
 * export const deleteUser = defineAction(async (input) => {
 *   await db.delete(users).where(eq(users.id, input.id));
 *   invalidate(['users', `user:${input.id}`]);
 *   return { ok: true };
 * });
 * ```
 */
export function invalidate(keys: RevalidationKey[]): void {
  const ctx = asyncLocalStorage?.getStore?.();
  if (ctx && ctx.registered) {
    for (const key of keys) {
      ctx.invalidatedKeys.add(key);
    }
    return;
  }

  // Fallback: 使用全局存储(需配合中间件设置 requestId)
  // 这种情况下回调可能不会执行(无中间件时)
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.warn(
      '[ubean] invalidate() called outside of single-flight middleware context, revalidation will not be executed'
    );
  }
}

/**
 * 标记单个键需要重新获取(`invalidate([key])` 的简写)。
 */
export function invalidateKey(key: RevalidationKey): void {
  invalidate([key]);
}

/**
 * 获取当前请求中被 invalidate 的键(主要用于测试/调试)。
 */
export function getInvalidatedKeys(c?: Context<UbeanEnv>): RevalidationKey[] {
  const ctx = getCurrentContext(c);
  if (!ctx) return [];
  return Array.from(ctx.invalidatedKeys);
}

/* -------------------------------------------------------------------------- */
/* Revalidation 执行                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 查找所有键与 invalidated 键有交集的 entry。
 */
function findMatchingEntries(invalidatedKeys: RevalidationKey[]): RevalidationEntry[] {
  if (invalidatedKeys.length === 0) return [];
  const keySet = new Set(invalidatedKeys);
  return revalidationRegistry.filter(entry => entry.keys.some(k => keySet.has(k)));
}

/**
 * 执行所有匹配的 revalidation fetcher 并收集结果。
 */
async function executeRevalidation(
  invalidatedKeys: RevalidationKey[],
  c: Context<UbeanEnv>,
  parallel: boolean
): Promise<RevalidationResult> {
  const entries = findMatchingEntries(invalidatedKeys);
  const data: Record<string, unknown> = {};
  const errors: Array<{ keys: RevalidationKey[]; message: string }> = [];
  const touchedKeys = new Set<RevalidationKey>();

  const runFetcher = async (entry: RevalidationEntry): Promise<void> => {
    const matchedKeys = entry.keys.filter(k => invalidatedKeys.includes(k));
    for (const k of matchedKeys) touchedKeys.add(k);
    try {
      const result = await entry.fetcher({ keys: matchedKeys, context: c });
      if (result && typeof result === 'object') {
        Object.assign(data, result);
      }
    } catch (err) {
      errors.push({
        keys: entry.keys,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  };

  if (parallel) {
    await Promise.all(entries.map(runFetcher));
  } else {
    for (const entry of entries) {
      await runFetcher(entry);
    }
  }

  return {
    data,
    keys: Array.from(touchedKeys),
    timestamp: Date.now(),
    errors
  };
}

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 创建 single-flight mutations 中间件。
 *
 * 拦截 Server Action 响应,执行由 `invalidate()` 标记的 revalidation,
 * 将结果打包进响应体,使客户端在单个 round-trip 内获得更新后的数据。
 *
 * @example
 * ```typescript
 * app.use('*', createSingleFlightMiddleware());
 * ```
 */
export function createSingleFlightMiddleware(options: SingleFlightOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    revalidationHeader = 'X-Ubean-Revalidated',
    revalidationField = '__ubean_revalidation__',
    contentTypes = ['application/json'],
    skip,
    parallel = true
  } = options;

  return async function singleFlightMiddleware(c: Context<UbeanEnv>, next: Next) {
    if (skip && (await skip(c))) {
      await next();
      return;
    }

    const ctx: SingleFlightContext = { invalidatedKeys: new Set(), registered: true };
    const reqId = getRequestId(c);
    fallbackStore.set(reqId, ctx);

    if (asyncLocalStorage) {
      await asyncLocalStorage.run(ctx, async () => {
        await next();
      });
    } else {
      await next();
    }

    fallbackStore.delete(reqId);

    // 收集被 invalidate 的键
    const invalidatedKeys = Array.from(ctx.invalidatedKeys);
    if (invalidatedKeys.length === 0) {
      return;
    }

    // 执行 revalidation
    const result = await executeRevalidation(invalidatedKeys, c, parallel);

    // 将结果打包进响应
    const response = c.res;
    const contentType = response.headers.get('content-type') || '';

    const shouldProcess = contentTypes.some(ct => contentType.includes(ct));
    if (!shouldProcess) {
      // 非 JSON 响应:仅设置 header 标记(无法修改 body)
      c.header(revalidationHeader, invalidatedKeys.join(','));
      return;
    }

    // 解析原响应体并注入 revalidation 数据
    try {
      const originalBody = await response.json();
      const newBody = {
        ...(originalBody && typeof originalBody === 'object' ? originalBody : { value: originalBody }),
        [revalidationField]: result
      };
      const newResponse = c.json(newBody, response.status as any);
      // 保留原始响应 headers(除了 content-type 会被 c.json 重置)
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'content-length') {
          newResponse.headers.set(key, value);
        }
      });
      newResponse.headers.set(revalidationHeader, result.keys.join(','));
      c.res = newResponse;
    } catch {
      // 响应体不是有效 JSON,仅设置 header 标记
      c.header(revalidationHeader, invalidatedKeys.join(','));
    }
  };
}

/**
 * 手动执行 revalidation(用于自定义中间件或测试)。
 *
 * 在中间件作用域外也可调用 —— 直接传入 invalidated 键与上下文。
 */
export async function runRevalidation(
  invalidatedKeys: RevalidationKey[],
  c: Context<UbeanEnv>,
  parallel = true
): Promise<RevalidationResult> {
  return executeRevalidation(invalidatedKeys, c, parallel);
}

/**
 * Single-flight 中间件别名(与 cors/rate-limit 的 define* 风格一致)。
 */
export function defineSingleFlight(options: SingleFlightOptions = {}): MiddlewareHandler<UbeanEnv> {
  return createSingleFlightMiddleware(options);
}
