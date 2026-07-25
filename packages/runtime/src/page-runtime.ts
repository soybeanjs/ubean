import { ref, computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { resetRouteCache } from './cache-views';

/**
 * Global page runtime config — animation mode + reload signal.
 *
 * These module-level singletons mirror the patterns found in soybean-unify's
 * `themeStore.pageAnimateMode` and `appStore.reloadSignal`:
 *
 *   - `pageAnimateMode` is a global transition name applied to every
 *     `<PageView />` unless overridden by the `transition` prop or
 *     `route.meta.transition`. Set to `'none'` (or empty string) to disable
 *     transitions globally.
 *
 *   - `reloadSignal` is a counter that increments each time `reloadPage()` is
 *     called. `<PageView />` watches this counter (via `:key`) and remounts
 *     the current page when it changes — combined with `resetRouteCache()` to
 *     prune the cached keep-alive instance so the remount is fresh.
 *
 * These are intentionally framework-provided singletons (not pinia stores)
 * because ubean ships without a state management library and the values are
 * globally unique by nature.
 */

const _pageTransitionName: Ref<string> = ref('');
const _reloadCounter: Ref<number> = ref(0);

export interface UsePageTransitionReturn {
  /** Reactive transition name. Empty string means "no transition". */
  name: ComputedRef<string>;
  /** Set the global transition name. Use '' or 'none' to disable. */
  set: (name: string) => void;
  /** Clear the global transition name (disables transitions). */
  clear: () => void;
  /** Whether a transition is currently configured. */
  enabled: ComputedRef<boolean>;
}

/**
 * Composable for reactive access to the global page transition name.
 *
 * Used by `<PageView />` as the fallback transition name when neither the
 * `transition` prop nor `route.meta.transition` is set.
 *
 * Layout components can also read this to display a settings UI:
 *
 * ```ts
 * const transition = usePageTransition();
 * // transition.name.value === 'fade-slide'
 * transition.set('zoom-fadein');
 * transition.clear();
 * ```
 */
export function usePageTransition(): UsePageTransitionReturn {
  return {
    name: computed(() => _pageTransitionName.value),
    set: (name: string) => {
      _pageTransitionName.value = name === 'none' ? '' : name;
    },
    clear: () => {
      _pageTransitionName.value = '';
    },
    enabled: computed(() => _pageTransitionName.value !== '')
  };
}

/** Imperatively set the global page transition name. */
export function setPageTransition(name: string): void {
  _pageTransitionName.value = name === 'none' ? '' : name;
}

/** Imperatively clear the global page transition name (disables transitions). */
export function clearPageTransition(): void {
  _pageTransitionName.value = '';
}

/** Reactive ref of the global transition name — for advanced use cases. */
export function getPageTransitionName(): Ref<string> {
  return _pageTransitionName;
}

export interface UseReloadSignalReturn {
  /** Reactive counter that increments on each `reloadPage()` call. */
  counter: ComputedRef<number>;
  /** Whether a reload is currently in progress. */
  reloading: ComputedRef<boolean>;
  /** Trigger a reload of the current page. */
  reload: (routeName?: string, duration?: number) => Promise<void>;
}

/**
 * Internal flag — set to `true` while a reload is in progress so consumers
 * can show a loading indicator if they wish.
 */
const _reloading = ref(false);

/**
 * Composable for reactive access to the page reload signal.
 *
 * `<PageView />` uses the returned `counter` as part of its render key, so
 * each `reload()` call forces the current page to remount. Combined with
 * `resetRouteCache()` (called internally), the cached keep-alive instance is
 * pruned first, so the remount is fresh — equivalent to the
 * `v-if="appStore.reloadSignal"` pattern in soybean-unify's layout-content.
 *
 * Usage from any component:
 *
 * ```ts
 * const { reload } = useReloadSignal();
 * async function onReloadClick() {
 *   await reload(); // reloads the current page
 * }
 * ```
 *
 * @param routeNameGetter Optional function returning the current route name.
 *                        If provided, used to call `resetRouteCache(name)`.
 *                        If omitted, `reload()` only bumps the counter.
 */
export function useReloadSignal(routeNameGetter?: () => string | undefined | null): UseReloadSignalReturn {
  return {
    counter: computed(() => _reloadCounter.value),
    reloading: computed(() => _reloading.value),
    reload: async (routeName?: string, duration = 300) => {
      _reloading.value = true;
      try {
        // If a name is provided explicitly, use it; otherwise try the getter.
        const name = routeName ?? routeNameGetter?.();
        if (name) {
          await resetRouteCache(name, 50);
        }
        // Brief delay to let the keep-alive reconcile + transition play out,
        // matching soybean-unify's `reloadPage(duration)` pattern.
        await new Promise(resolve => setTimeout(resolve, duration));
        _reloadCounter.value++;
      } finally {
        _reloading.value = false;
      }
    }
  };
}

/**
 * Imperatively trigger a page reload.
 *
 * - `name`: route name to reload. If provided, the cached keep-alive instance
 *   is pruned first via `resetRouteCache(name)`. If omitted, only the reload
 *   counter is bumped (forces remount but does not prune cache).
 * - `duration`: milliseconds to wait for transition/cleanup. Defaults to 300.
 */
export async function reloadPage(name?: string, duration = 300): Promise<void> {
  _reloading.value = true;
  try {
    if (name) {
      await resetRouteCache(name, 50);
    }
    await new Promise(resolve => setTimeout(resolve, duration));
    _reloadCounter.value++;
  } finally {
    _reloading.value = false;
  }
}

/** Reactive ref of the reload counter — for advanced use cases. */
export function getReloadCounter(): Ref<number> {
  return _reloadCounter;
}

/** Whether a reload is currently in progress. */
export function isReloading(): boolean {
  return _reloading.value;
}
