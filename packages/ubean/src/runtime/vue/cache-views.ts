import { ref, computed, defineComponent, h } from 'vue';
import type { Component, ComputedRef, Ref } from 'vue';

/**
 * Page cache (keep-alive) store — a module-level singleton.
 *
 * ubean uses flat single-layer layout, so all page components are direct
 * children of a single layout's `<RouterView>`. A `<keep-alive :include="...">`
 * wraps that `<RouterView>`; the `include` list is the reactive array exposed
 * here. Caching is keyed by the page's **route name**, which is injected as the
 * component `name` at render time (see `createLayoutWrapper` in `app.ts`).
 *
 * In addition to the `include` list, an `exclude` list is also maintained.
 * `<keep-alive :exclude="...">` skips caching for matched names even if they
 * appear in `include`. This is useful for the "reload current page" pattern:
 * temporarily push a route name into `exclude`, wait a tick, then remove it —
 * the cached instance is pruned and the page remounts fresh on next visit.
 *
 * Usage:
 *   // declarative (compile-time): enable caching for a page
 *   definePage({ cache: true })
 *
 *   // runtime: toggle caching imperatively
 *   import { enablePageCache, disablePageCache } from 'ubean/runtime/vue';
 *   enablePageCache('DashboardIndex');
 *   disablePageCache('DashboardIndex');
 *
 *   // reload a cached page (clears its instance, forces remount)
 *   import { resetRouteCache } from 'ubean/runtime/vue';
 *   await resetRouteCache('DashboardIndex');
 */

// Store singletons on globalThis so that all module instances (which can be
// duplicated by the bundler when different entry points import the same code)
// share the same reactive state. Without this, `initCachedViewsFromRoutes`
// called in `createUbeanSSRApp` (one chunk) would modify a different ref
// than the one `useCacheViews()` reads in page components (another chunk),
// causing SSR hydration mismatches.
const _g = globalThis as typeof globalThis & {
  __ubeanCachedViewNames?: Ref<string[]>;
  __ubeanExcludedViewNames?: Ref<string[]>;
  __ubeanCacheEnabled?: Ref<boolean>;
};
const _cachedViewNames: Ref<string[]> = (_g.__ubeanCachedViewNames ??= ref([]));
const _excludedViewNames: Ref<string[]> = (_g.__ubeanExcludedViewNames ??= ref([]));
const _cacheEnabled: Ref<boolean> = (_g.__ubeanCacheEnabled ??= ref(true));

/**
 * Internal registry of named wrapper components used to give each route's
 * page component a stable `name` (the route name) so `<keep-alive :include>`
 * can match it. Keyed by route name.
 *
 * Each entry holds both the wrapper and the original component reference so
 * HMR (which replaces the original) can be detected and the wrapper rebuilt.
 */
interface WrapperEntry {
  wrapper: Component;
  original: Component;
}

const _wrapperRegistry = new Map<string, WrapperEntry>();

export interface UseCacheViewsReturn {
  /** Reactive list of cached route names — pass to `<keep-alive :include>`. */
  cachedViews: ComputedRef<string[]>;
  /** Reactive list of route names explicitly added to the cache. */
  cachedViewNames: ComputedRef<string[]>;
  /** Reactive list of route names excluded from cache — pass to `<keep-alive :exclude>`. */
  excludedViews: ComputedRef<string[]>;
  /** Whether page caching is globally enabled. */
  enabled: ComputedRef<boolean>;
  /** Enable page caching globally. */
  enable: () => void;
  /** Disable page caching globally (purges keep-alive immediately). */
  disable: () => void;
  /** Add a route name to the cache include list. */
  add: (name: string) => void;
  /** Remove a route name from the cache include list (prunes its instance). */
  remove: (name: string) => void;
  /** Whether a route name is currently in the cache include list. */
  has: (name: string) => boolean;
  /** Remove all route names from the cache include list. */
  clear: () => void;
  /** Add a route name to the cache exclude list (forces prune on next render). */
  addExclude: (name: string) => void;
  /** Remove a route name from the cache exclude list. */
  removeExclude: (name: string) => void;
  /** Whether a route name is currently in the cache exclude list. */
  hasExclude: (name: string) => boolean;
  /** Clear the cache exclude list. */
  clearExclude: () => void;
}

/**
 * Composable for reactive access to the page cache store.
 *
 * Safe to call inside any component `setup()`; the returned computeds are
 * tracked by the rendering effect so `<keep-alive :include>` stays in sync.
 */
export function useCacheViews(): UseCacheViewsReturn {
  return {
    cachedViews: computed(() => (_cacheEnabled.value ? _cachedViewNames.value : [])),
    cachedViewNames: computed(() => _cachedViewNames.value),
    excludedViews: computed(() => _excludedViewNames.value),
    enabled: computed(() => _cacheEnabled.value),
    enable: () => {
      _cacheEnabled.value = true;
    },
    disable: () => {
      _cacheEnabled.value = false;
    },
    add: (name: string) => {
      if (name && !_cachedViewNames.value.includes(name)) {
        _cachedViewNames.value = [..._cachedViewNames.value, name];
      }
    },
    remove: (name: string) => {
      _cachedViewNames.value = _cachedViewNames.value.filter(n => n !== name);
    },
    has: (name: string) => _cachedViewNames.value.includes(name),
    clear: () => {
      _cachedViewNames.value = [];
    },
    addExclude: (name: string) => {
      if (name && !_excludedViewNames.value.includes(name)) {
        _excludedViewNames.value = [..._excludedViewNames.value, name];
      }
    },
    removeExclude: (name: string) => {
      _excludedViewNames.value = _excludedViewNames.value.filter(n => n !== name);
    },
    hasExclude: (name: string) => _excludedViewNames.value.includes(name),
    clearExclude: () => {
      _excludedViewNames.value = [];
    }
  };
}

/** Enable keep-alive caching for a specific page (by route name). */
export function enablePageCache(name: string): void {
  if (name && !_cachedViewNames.value.includes(name)) {
    _cachedViewNames.value = [..._cachedViewNames.value, name];
  }
}

/** Disable keep-alive caching for a specific page (by route name). */
export function disablePageCache(name: string): void {
  _cachedViewNames.value = _cachedViewNames.value.filter(n => n !== name);
}

/**
 * Temporarily exclude a page from keep-alive (forces its cached instance
 * to be pruned on next render). Pair with `includePageCache()` to restore.
 *
 * Useful for the "reload current page" pattern: push the route name into
 * the exclude list, wait a tick, then remove it — the cached instance is
 * pruned and the page remounts fresh on next render.
 */
export function excludePageCache(name: string): void {
  if (name && !_excludedViewNames.value.includes(name)) {
    _excludedViewNames.value = [..._excludedViewNames.value, name];
  }
}

/** Remove a route name from the cache exclude list (restores caching). */
export function includePageCache(name: string): void {
  _excludedViewNames.value = _excludedViewNames.value.filter(n => n !== name);
}

/** Whether a specific page is currently excluded from cache. */
export function isPageExcluded(name: string): boolean {
  return _excludedViewNames.value.includes(name);
}

/**
 * Reload a cached page by temporarily excluding it from keep-alive.
 *
 * Pattern (mirrors `routeStore.resetRouteCache` in soybean-unify):
 *   1. Push the route name into the exclude list (prunes cached instance).
 *   2. Wait one tick (let `<keep-alive>` reconcile).
 *   3. Remove the route name from the exclude list.
 *
 * The page's `definePage({ cache: true })` declaration (or a prior
 * `enablePageCache(name)`) is still in effect, so the page will be re-cached
 * on the next visit.
 *
 * @param name Route name. If omitted, uses the current route's name
 *             (requires a Vue component setup context — fall back to
 *             passing the name explicitly from outside Vue).
 * @param delay Milliseconds to wait between exclude and include. Defaults
 *              to 50ms (matches soybean-unify's pattern).
 */
export async function resetRouteCache(name?: string, delay = 50): Promise<void> {
  const target = name;
  if (!target) return;
  // Only reset if the page is currently cached; otherwise nothing to prune.
  if (!_cachedViewNames.value.includes(target)) return;

  excludePageCache(target);
  await new Promise(resolve => setTimeout(resolve, delay));
  includePageCache(target);
}

/**
 * Invalidate cached page instance(s).
 *
 * - With a `name`: removes that page from the cache (its instance is pruned
 *   on next navigation).
 * - Without a `name`: clears all cached pages.
 *
 * Note: the page will be re-cached on next visit if its `definePage({ cache: true })`
 * is still in effect or `enablePageCache(name)` is called again.
 */
export function invalidatePageCache(name?: string): void {
  if (name) {
    disablePageCache(name);
  } else {
    _cachedViewNames.value = [];
  }
}

/** Whether a specific page is currently cached. */
export function isPageCached(name: string): boolean {
  return _cachedViewNames.value.includes(name);
}

/** Whether page caching is globally enabled. */
export function isCacheEnabled(): boolean {
  return _cacheEnabled.value;
}

/** Reactive ref of cached route names — for advanced use cases. */
export function getCachedViewNames(): Ref<string[]> {
  return _cachedViewNames;
}

/** Reactive ref of excluded route names — for advanced use cases. */
export function getExcludedViewNames(): Ref<string[]> {
  return _excludedViewNames;
}

/** Reactive ref of the global cache-enabled flag. */
export function getCacheEnabled(): Ref<boolean> {
  return _cacheEnabled;
}

/**
 * Seed the cache include list from route metadata.
 *
 * Called once during app bootstrap (`createUbeanApp`) to honor pages that
 * declared `definePage({ cache: true })`. Routes without `meta.cache` are
 * left untouched so runtime toggling remains possible.
 */
export function initCachedViewsFromRoutes(routes: Array<{ name?: string | symbol; meta?: { cache?: boolean } }>): void {
  const initial: string[] = [];
  for (const route of routes) {
    if (route.meta?.cache === true && typeof route.name === 'string' && route.name) {
      if (!initial.includes(route.name)) {
        initial.push(route.name);
      }
    }
  }
  if (initial.length > 0) {
    const existing = new Set(_cachedViewNames.value);
    for (const name of initial) {
      if (!existing.has(name)) existing.add(name);
    }
    _cachedViewNames.value = [...existing];
  }
}

/**
 * Get or create a named wrapper component for a page.
 *
 * The wrapper carries the route name as its component `name`, which is what
 * `<keep-alive :include>` matches against. The original page component is
 * rendered inside the wrapper. When the original changes (HMR in dev), the
 * wrapper is rebuilt so the new component takes effect.
 *
 * @internal — used by `createLayoutWrapper` in `app.ts`.
 */
export function getNamedPageWrapper(routeName: string, original: Component): Component {
  const cached = _wrapperRegistry.get(routeName);
  if (cached && cached.original === original) {
    return cached.wrapper;
  }
  const wrapper = defineComponent({
    name: routeName,
    setup() {
      return () => h(original as any);
    }
  });
  _wrapperRegistry.set(routeName, { wrapper, original });
  return wrapper;
}

/**
 * Clear the wrapper registry. Mainly useful in tests or when the entire
 * route table is rebuilt.
 *
 * @internal
 */
export function resetNamedPageWrappers(): void {
  _wrapperRegistry.clear();
}
