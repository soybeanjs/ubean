import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import { safeJsonStringify } from './protocol';

/**
 * `__UBEAN_DEFERRED__` script 标签 ID — SSR 流式渲染完成后,延迟数据
 * 以 JSON 形式注入到此标签中,客户端水合时读取。
 */
export const DEFERRED_DATA_ID = '__UBEAN_DEFERRED__';

/**
 * 延迟值:包装一个 factory 函数,标记为"非关键数据"。
 *
 * SSR 时不阻塞初始渲染,数据在主内容之后流式注入。
 */
export interface DeferredValue<T> {
  readonly __isDeferred: true;
  readonly factory: () => Promise<T>;
}

/**
 * 标记一个 Promise 为可延迟的(非关键数据)。
 *
 * 在 SSR 流式渲染中,`defer()` 包装的 Promise 不会阻塞初始 HTML 输出。
 * 主内容渲染完成后,延迟数据解析结果作为 `<script>` 标签流式注入,
 * 客户端水合后立即可用。
 *
 * @example
 * ```ts
 * // 阻塞初始渲染(关键数据)
 * const critical = await fetchCritical();
 * // 不阻塞,流式输出(非关键数据)
 * const nonCritical = defer(() => fetchNonCritical());
 * ```
 */
export function defer<T>(factory: (() => Promise<T>) | Promise<T>): DeferredValue<T> {
  const fn = typeof factory === 'function' ? factory : () => factory;
  return { __isDeferred: true, factory: fn };
}

/**
 * 判断值是否为 DeferredValue(类型守卫)。
 */
export function isDeferredValue<T>(value: unknown): value is DeferredValue<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__isDeferred === true
  );
}

// ============== SSR 内部:per-request 注册表 ==============

interface DeferredEntry {
  key: string;
  promise: Promise<unknown>;
}

const entries: DeferredEntry[] = [];

/**
 * SSR 内部:注册一个 deferred promise,在流式渲染后统一解析。
 *
 * 在 `useDeferredData` 的 SSR 分支中调用。每次渲染前应调用 `__clearDeferred()`。
 */
export function __registerDeferred(key: string, promise: Promise<unknown>): void {
  entries.push({ key, promise });
}

/**
 * SSR 内部:解析所有已注册的 deferred promise,返回 key → data 映射。
 *
 * 失败的 promise 以 `{ __deferredError: message }` 形式包含在结果中,
 * 不影响其他 promise 的解析。
 */
export async function __resolveDeferred(): Promise<Record<string, unknown>> {
  if (entries.length === 0) return {};

  const results: Record<string, unknown> = {};
  await Promise.allSettled(
    entries.map(async (entry) => {
      try {
        results[entry.key] = await entry.promise;
      } catch (err) {
        results[entry.key] = {
          __deferredError: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );
  return results;
}

/**
 * SSR 内部:清空注册表。每次渲染前调用,避免上一个请求的残留。
 */
export function __clearDeferred(): void {
  entries.length = 0;
}

/**
 * SSR 内部:将 deferred 数据序列化为 `<script>` 标签字符串。
 *
 * 无数据时返回空字符串(不注入标签)。
 */
export function __serializeDeferred(data: Record<string, unknown>): string {
  if (Object.keys(data).length === 0) return '';
  return `<script id="${DEFERRED_DATA_ID}" type="application/json">${safeJsonStringify(data)}</script>`;
}

// ============== 客户端水合缓存 ==============

let clientCache: Record<string, unknown> | null | undefined;

/**
 * 客户端:从 DOM 读取 `__UBEAN_DEFERRED__` script 标签内容。
 *
 * 首次调用后缓存结果,后续调用直接返回缓存。
 * SSR 环境返回 `null`。
 */
function readClientCache(): Record<string, unknown> | null {
  if (clientCache !== undefined) return clientCache;
  if (typeof document === 'undefined') {
    clientCache = null;
    return clientCache;
  }

  const el = document.getElementById(DEFERRED_DATA_ID);
  if (!el?.textContent) {
    clientCache = {};
    return clientCache;
  }
  try {
    clientCache = JSON.parse(el.textContent);
  } catch {
    clientCache = {};
  }
  return clientCache;
}

/**
 * 重置客户端缓存(测试用)。
 */
export function __resetDeferredCache(): void {
  clientCache = undefined;
}

// ============== useDeferredData composable ==============

export interface UseDeferredDataResult<T> {
  /** 延迟数据(初始为 undefined,解析后更新) */
  data: ShallowRef<T | undefined>;
  /** 是否正在获取 */
  pending: Ref<boolean>;
  /** 错误信息(获取失败时设置) */
  error: ShallowRef<Error | null>;
}

/**
 * 在组件中使用延迟数据。
 *
 * - **SSR**: 注册 promise 但不阻塞渲染,组件渲染 fallback;渲染完成后数据流式注入
 * - **客户端水合**: 从 `__UBEAN_DEFERRED__` 读取已解析数据,立即显示(无闪烁)
 * - **客户端导航**: 调用 factory 获取数据,显示 pending → resolved
 *
 * @example
 * ```vue
 * <script setup>
 * import { defer, useDeferredData } from 'ubean';
 *
 * const { data: comments, pending } = useDeferredData(
 *   'comments',
 *   defer(() => fetch('/api/comments').then(r => r.json()))
 * );
 * </script>
 *
 * <template>
 *   <div v-if="pending">Loading comments...</div>
 *   <ul v-else>
 *     <li v-for="c in comments" :key="c.id">{{ c.text }}</li>
 *   </ul>
 * </template>
 * ```
 */
export function useDeferredData<T>(
  key: string,
  deferred: DeferredValue<T>
): UseDeferredDataResult<T> {
  const data = shallowRef<T | undefined>(undefined);
  const pending = ref(true);
  const error = shallowRef<Error | null>(null);

  if (typeof window === 'undefined') {
    // SSR: 注册 promise,不阻塞渲染
    __registerDeferred(key, deferred.factory());
    pending.value = true;
  } else {
    // Client: 先检查 SSR 流式注入的数据
    const cache = readClientCache();
    const cached = cache?.[key];

    if (cached !== undefined) {
      if (
        cached !== null &&
        typeof cached === 'object' &&
        '__deferredError' in (cached as Record<string, unknown>)
      ) {
        error.value = new Error(
          String((cached as Record<string, unknown>).__deferredError)
        );
      } else {
        data.value = cached as T;
      }
      pending.value = false;
    } else {
      // 客户端导航: 重新获取
      pending.value = true;
      deferred
        .factory()
        .then((result) => {
          data.value = result;
          pending.value = false;
        })
        .catch((err) => {
          error.value = err instanceof Error ? err : new Error(String(err));
          pending.value = false;
        });
    }
  }

  return { data, pending, error };
}
