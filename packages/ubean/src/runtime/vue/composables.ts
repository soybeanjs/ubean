import { defineDataKey as _defineDataKey } from '../pages/data';
import type { PageObject } from '../pages/protocol';

const _global = globalThis as any;

export interface UbeanVueContext {
  __ubean_client?: ReturnType<typeof import('./client').createUbeanClient>;
  __ubean_data_cache?: DataCacheStore;
}

export interface LinkProps {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
}

export interface DataCacheStore {
  get: <T = unknown>(key: string | symbol) => T | undefined;
  set: <T = unknown>(key: string | symbol, value: T, tags?: string[]) => void;
  has: (key: string | symbol) => boolean;
  invalidate: (keyOrTag: string | symbol) => number;
  clear: () => void;
  subscribe: (fn: () => void) => () => void;
  getTimestamp: (key: string | symbol) => number | undefined;
}

export function createDataCacheStore(): DataCacheStore {
  const cache = new Map<string | symbol, { data: unknown; timestamp: number; tags?: string[] }>();
  const tagIndex = new Map<string, Set<string | symbol>>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const fn of listeners) fn();
  }

  return {
    get<T = unknown>(key: string | symbol): T | undefined {
      return cache.get(key)?.data as T | undefined;
    },
    set<T = unknown>(key: string | symbol, value: T, tags?: string[]): void {
      cache.set(key, { data: value, timestamp: Date.now(), tags });
      if (tags) {
        for (const tag of tags) {
          let set = tagIndex.get(tag);
          if (!set) {
            set = new Set();
            tagIndex.set(tag, set);
          }
          set.add(key);
        }
      }
      notify();
    },
    has(key: string | symbol): boolean {
      return cache.has(key);
    },
    invalidate(keyOrTag: string | symbol): number {
      let count = 0;
      if (typeof keyOrTag === 'string') {
        if (cache.has(keyOrTag)) {
          const entry = cache.get(keyOrTag)!;
          if (entry.tags) {
            for (const t of entry.tags) {
              const ts = tagIndex.get(t);
              if (ts) ts.delete(keyOrTag);
            }
          }
          cache.delete(keyOrTag);
          count = 1;
        }

        const keys = tagIndex.get(keyOrTag);
        if (keys) {
          for (const k of keys) {
            const entry = cache.get(k);
            if (entry) {
              if (entry.tags) {
                for (const t of entry.tags) {
                  const ts = tagIndex.get(t);
                  if (ts) ts.delete(k);
                }
              }
              cache.delete(k);
              count++;
            }
          }
          tagIndex.delete(keyOrTag);
        }
      } else {
        const entry = cache.get(keyOrTag);
        if (entry) {
          if (entry.tags) {
            for (const t of entry.tags) {
              const ts = tagIndex.get(t);
              if (ts) ts.delete(keyOrTag);
            }
          }
          cache.delete(keyOrTag);
          count = 1;
        }
      }
      if (count > 0) notify();
      return count;
    },
    clear(): void {
      cache.clear();
      tagIndex.clear();
      notify();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getTimestamp(key: string | symbol): number | undefined {
      return cache.get(key)?.timestamp;
    }
  };
}

export interface UseAsyncDataOptions<T> {
  key?: string;
  tags?: string[];
  lazy?: boolean;
  server?: boolean;
  default?: () => T;
  transform?: (input: unknown) => T;
}

export interface UseAsyncDataReturn<T> {
  data: { value: T | undefined };
  error: { value: Error | null };
  loading: { value: boolean };
  refresh: () => Promise<void>;
  invalidate: () => void;
}

export function createUseAsyncData(store: DataCacheStore) {
  return function useAsyncData<T = unknown>(
    keyOrFetcher: string | (() => Promise<T>),
    fetcherOrOptions?: (() => Promise<T>) | UseAsyncDataOptions<T>,
    options?: UseAsyncDataOptions<T>
  ): UseAsyncDataReturn<T> {
    let key: string;
    let fetcher: () => Promise<T>;
    let opts: UseAsyncDataOptions<T> = {};

    if (typeof keyOrFetcher === 'string') {
      key = keyOrFetcher;
      fetcher = fetcherOrOptions as () => Promise<T>;
      opts = options || {};
    } else {
      fetcher = keyOrFetcher;
      key = (fetcherOrOptions as UseAsyncDataOptions<T> | undefined)?.key || Math.random().toString(36).slice(2);
      opts = (fetcherOrOptions as UseAsyncDataOptions<T> | undefined) || {};
    }

    const state = {
      data: { value: store.get<T>(key) ?? (opts.default ? opts.default() : undefined) },
      error: { value: null as Error | null },
      loading: { value: false }
    };

    async function execute() {
      state.loading.value = true;
      state.error.value = null;
      try {
        const raw = await fetcher();
        const value = opts.transform ? opts.transform(raw) : raw;
        store.set(key, value, opts.tags);
        state.data.value = value;
      } catch (err) {
        state.error.value = err instanceof Error ? err : new Error(String(err));
      } finally {
        state.loading.value = false;
      }
    }

    function invalidate() {
      store.invalidate(key);
    }

    if (!opts.lazy) {
      if (!store.has(key)) {
        execute();
      }
    }

    store.subscribe(() => {
      state.data.value = store.get<T>(key) ?? (opts.default ? opts.default() : undefined);
    });

    return {
      data: state.data,
      error: state.error,
      loading: state.loading,
      refresh: execute,
      invalidate
    };
  };
}

export function invalidateCache(store: DataCacheStore, keyOrTag: string): number {
  return store.invalidate(keyOrTag);
}

export function clearCache(store: DataCacheStore): void {
  store.clear();
}

export function defineDataKey(key: string): symbol {
  return _defineDataKey(key);
}

export function createLinkHandler(ctx: UbeanVueContext) {
  return {
    getProps: () => ({}),
    async navigate(href: string, opts: { replace?: boolean } = {}) {
      if (!ctx.__ubean_client) {
        const loc = _global.location;
        if (opts.replace) loc.replace(href);
        else loc.href = href;
        return;
      }
      await ctx.__ubean_client.navigate(href, opts);
    },
    async prefetch(href: string) {
      if (ctx.__ubean_client) {
        await ctx.__ubean_client.prefetch(href);
      }
    }
  };
}

export function extractPageData<T = Record<string, unknown>>(): PageObject<T> | null {
  if (typeof _global.document === 'undefined') return null;
  const el = _global.document.getElementById('__UBEAN_PAGE_DATA__');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || 'null');
  } catch {
    return null;
  }
}

export async function useServerData<T>(fetcher: () => Promise<T>): Promise<T> {
  return fetcher();
}

export function getInvalidatedKeysForAction(
  actionName: string,
  invalidationMap: Record<string, Array<string | symbol>>,
  store: DataCacheStore
): number {
  const toInvalidate = invalidationMap[actionName];
  if (!toInvalidate) return 0;
  let count = 0;
  for (const key of toInvalidate) {
    count += store.invalidate(key);
  }
  return count;
}
