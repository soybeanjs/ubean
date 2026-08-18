import { ref, computed, nextTick, reactive } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { disablePageCache, enablePageCache, isPageCached } from './cache-views';

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
 *     the current page when it changes — for cached pages the keep-alive
 *     instance is pruned and rebuilt around the remount so it is fresh.
 *
 * These are intentionally framework-provided singletons (not pinia stores)
 * because ubean ships without a state management library and the values are
 * globally unique by nature.
 */

// Store singletons on globalThis so duplicated module instances (dev-server
// dep re-optimization, `?t=` HMR variants) share the same runtime state —
// same defense as `cache-views.ts`.
const _g = globalThis as typeof globalThis & {
  __ubeanPageTransitionName?: Ref<string>;
  __ubeanReloadCounter?: Ref<number>;
  __ubeanReloading?: Ref<boolean>;
  __ubeanReloadBlank?: Ref<boolean>;
  __ubeanPageReloadCounts?: Map<string, number>;
};
const _pageTransitionName: Ref<string> = (_g.__ubeanPageTransitionName ??= ref(''));
const _reloadCounter: Ref<number> = (_g.__ubeanReloadCounter ??= ref(0));

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
 * Composable for reactive access to the page reload signal.
 *
 * `<PageView />` uses the returned `counter` as part of its render key, so
 * each `reload()` call forces the current page to remount. For cached pages
 * the stale keep-alive instance is pruned around the remount (see
 * `_remountWithFreshCache`), so the remount is fresh while the cache
 * declaration stays in effect — equivalent to the
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
 *                        If provided (and `reload()` is called without an
 *                        explicit name), used to prune/rebuild that page's
 *                        cache around the remount. If omitted, `reload()`
 *                        only bumps the counter.
 */
/**
 * Internal flag — while `true`, `<PageView>` forces its `<Transition>` mode
 * to `'default'` (defensive: the reload sequence below never enters the
 * leave path, but if a stray re-render does, 'default' mode produces no
 * hollow placeholders).
 *
 * @internal — consumed by `components.ts` (same package).
 */
export const _reloading: Ref<boolean> = (_g.__ubeanReloading ??= ref(false));

/**
 * Internal blank flag — while `true`, `<PageView>`'s `<KeepAlive>` slot
 * renders a comment vnode instead of the page. Drives the reload sequence
 * in `_remountWithFreshCache`.
 *
 * @internal — consumed by `components.ts` (same package).
 */
export const _reloadBlank: Ref<boolean> = (_g.__ubeanReloadBlank ??= ref(false));

/**
 * Per-page reload counts — ONLY the reloaded page's key changes, so other
 * pages' KeepAlive cache entries (keyed by vnode key) stay valid across an
 * unrelated page's reload. (A global counter in the key would invalidate
 * every page's cache on any reload.)
 *
 * @internal — consumed by `components.ts` (same package).
 */
export const _pageReloadCounts: Map<string, number> = (_g.__ubeanPageReloadCounts ??= reactive(
  new Map<string, number>()
));

/**
 * Internal reload driver — remounts the current page fresh via a brief
 * blank window (the `v-if="reloadSignal"` pattern from soybean-unify):
 *
 *   1. Enter reload mode (Transition falls back to 'default' mode).
 *   2. Blank the KeepAlive slot — the old page instance deactivates
 *      (cached) or unmounts; KeepAlive renders a comment. A comment inner
 *      child makes `<Transition>` skip its leave branch entirely, so Vue
 *      never produces an `emptyPlaceholder` hollow KeepAlive (children=null)
 *      whose patch crashes `updateSlots` (`Cannot read properties of null
 *      (reading '_')` — vue@3.5.41, same family as vuejs/core#10771).
 *   3. Prune the stale old-key cache entry via an include toggle
 *      (disable→enable) — safe while the KeepAlive child is blank: include
 *      changes only affect the cache set, never a hollow-vnode patch.
 *   4. Bump the page's reload count (new key) and un-blank in the same
 *      flush — the fresh page mounts; the enter transition plays. The
 *      global counter also bumps so `useReloadSignal().counter` consumers
 *      stay in sync.
 *   5. Leave reload mode.
 *
 * Without a `name` there is no way to target a page's key, so the call is
 * signal-only (global counter bump, no remount).
 */
async function _remountWithFreshCache(name?: string | null): Promise<void> {
  if (!name) {
    _reloadCounter.value++;
    return;
  }

  _reloading.value = true;

  _reloadBlank.value = true;
  await nextTick();

  if (isPageCached(name)) {
    disablePageCache(name);
    await nextTick();
    enablePageCache(name);
    await nextTick();
  }

  _pageReloadCounts.set(name, (_pageReloadCounts.get(name) ?? 0) + 1);
  _reloadCounter.value++;
  _reloadBlank.value = false;
  await nextTick();

  _reloading.value = false;
}

export function useReloadSignal(routeNameGetter?: () => string | undefined | null): UseReloadSignalReturn {
  return {
    counter: computed(() => _reloadCounter.value),
    reloading: computed(() => _reloading.value),
    reload: async (routeName?: string, duration = 300) => {
      _reloading.value = true;
      try {
        // If a name is provided explicitly, use it; otherwise try the getter.
        const name = routeName ?? routeNameGetter?.();
        await _remountWithFreshCache(name);
        // Brief delay to let the transition play out, matching
        // soybean-unify's `reloadPage(duration)` pattern.
        await new Promise(resolve => setTimeout(resolve, duration));
      } finally {
        _reloading.value = false;
      }
    }
  };
}

/**
 * Imperatively trigger a page reload.
 *
 * - `name`: route name to reload (REQUIRED for an actual remount). The page
 *   is blanked, its stale keep-alive entry pruned, and a fresh instance
 *   mounts under a new key — while its cache declaration stays in effect.
 *   Only THIS page's key changes: other pages' keep-alive entries survive.
 *   If omitted, the call is signal-only (the global counter bumps for
 *   `useReloadSignal().counter` consumers; nothing remounts).
 * - `duration`: milliseconds to wait for transition/cleanup. Defaults to 300.
 */
export async function reloadPage(name?: string, duration = 300): Promise<void> {
  _reloading.value = true;
  try {
    await _remountWithFreshCache(name);
    await new Promise(resolve => setTimeout(resolve, duration));
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
