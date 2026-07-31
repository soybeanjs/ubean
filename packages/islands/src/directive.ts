/**
 * `v-client` Vue custom directive — Islands hydration strategy directive.
 *
 * Replaces the legacy `client:load` / `client:idle` / `client:visible` /
 * `client:media` / `client:only` attribute syntax with idiomatic Vue
 * directive syntax: `v-client.load`, `v-client.idle`, etc.
 *
 * ## Two-layer design
 *
 * 1. **Compile-time (Vite plugin)**: The `ubean:islands` Vite plugin detects
 *    `v-client.*` in Vue SFC templates and transforms the element into an
 *    `<ubean-island>` placeholder, exactly as it does for legacy `client:*`
 *    attributes. This is the primary code path for SSR/Islands mode.
 *
 * 2. **Runtime (Vue directive)**: When the Vite plugin is NOT active (e.g.
 *    CSR-only apps, unit tests, or component libraries), the directive
 *    registers as a normal Vue directive and marks the element with
 *    `data-client-directive` / `data-media` attributes so that
 *    `hydrateIslands()` can still find and process it.
 *
 * ## Usage
 *
 * ```vue
 * <template>
 *   <!-- Hydrate immediately on page load -->
 *   <Counter v-client.load />
 *
 *   <!-- Hydrate when browser is idle -->
 *   <HeavyChart v-client.idle />
 *
 *   <!-- Hydrate when element scrolls into view -->
 *   <LazyMap v-client.visible />
 *
 *   <!-- Hydrate when media query matches -->
 *   <MobileNav v-client.media="'(max-width: 768px)'" />
 *
 *   <!-- Skip SSR, render only on client -->
 *   <ClientOnlyWidget v-client.only />
 * </template>
 * ```
 *
 * ## Migration from `client:*` syntax
 *
 * | Legacy                    | New                          |
 * | ------------------------- | ---------------------------- |
 * | `<Comp client:load />`    | `<Comp v-client.load />`     |
 * | `<Comp client:idle />`    | `<Comp v-client.idle />`     |
 * | `<Comp client:visible />` | `<Comp v-client.visible />`  |
 * | `<Comp client:media="X"/>`| `<Comp v-client.media="X" />`|
 * | `<Comp client:only />`    | `<Comp v-client.only />`     |
 *
 * Both syntaxes are supported; `v-client.*` is preferred for new code.
 */
import type { DirectiveBinding, ObjectDirective } from 'vue';

/* -------------------------------------------------------------------------- */
/* Type Definitions                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The five hydration strategies supported by the Islands directive.
 *
 * - `load`:    Hydrate immediately on page load (default).
 * - `idle`:    Hydrate when the browser is idle (`requestIdleCallback`).
 * - `visible`: Hydrate when the element scrolls into viewport (`IntersectionObserver`).
 * - `media`:   Hydrate when a CSS media query matches (`matchMedia`).
 * - `only`:    Skip SSR entirely — render placeholder during SSR, hydrate on client.
 */
export type ClientStrategy = 'load' | 'idle' | 'visible' | 'media' | 'only';

/**
 * Modifiers for the `v-client` directive.
 *
 * Exactly one modifier should be active. If multiple are present, the first
 * matching strategy in priority order (load → idle → visible → media → only)
 * is used.
 */
export interface ClientDirectiveModifiers {
  /** Hydrate immediately on page load. */
  load?: boolean;
  /** Hydrate when the browser is idle. */
  idle?: boolean;
  /** Hydrate when the element enters the viewport. */
  visible?: boolean;
  /** Hydrate when the media query (passed as directive value) matches. */
  media?: boolean;
  /** Skip SSR, render only on the client. */
  only?: boolean;
}

/**
 * The value passed to `v-client.media` — a CSS media query string.
 *
 * For other strategies, the value is `undefined` (not passed).
 *
 * @example
 * ```vue
 * <Comp v-client.media="'(max-width: 768px)'" />
 * <Comp v-client.media="isMobile ? '(max-width: 768px)' : '(min-width: 769px)'" />
 * ```
 */
export type ClientDirectiveValue = string | undefined;

/**
 * The full directive binding for `v-client`.
 *
 * Provides type-safe access to modifiers and value in directive hooks.
 * Modifiers are cast to `ClientDirectiveModifiers` at runtime since Vue's
 * `DirectiveBinding` types them as `Record<string, boolean>`.
 */
export type ClientDirectiveBinding = DirectiveBinding<ClientDirectiveValue>;

/**
 * The `v-client` directive type.
 *
 * Use this for type-safe registration on a Vue app:
 * ```typescript
 * app.directive('client', vClient);
 * ```
 */
export type VClientDirective = ObjectDirective<HTMLElement, ClientDirectiveValue, ClientStrategy>;

/* -------------------------------------------------------------------------- */
/* Strategy Resolution                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the hydration strategy from directive modifiers.
 *
 * Priority: load → idle → visible → media → only.
 * If no modifier is present, defaults to `'load'`.
 */
export function resolveClientStrategy(modifiers: ClientDirectiveModifiers): ClientStrategy {
  if (modifiers.load) return 'load';
  if (modifiers.idle) return 'idle';
  if (modifiers.visible) return 'visible';
  if (modifiers.media) return 'media';
  if (modifiers.only) return 'only';
  return 'load';
}

/**
 * Map a `ClientStrategy` to the legacy `ClientDirective` string.
 *
 * Used internally by the Vite plugin to maintain backward compatibility
 * with the `<ubean-island data-directive="client:load">` format.
 */
export function strategyToLegacyDirective(strategy: ClientStrategy): string {
  return `client:${strategy}`;
}

/**
 * Parse a directive string (legacy `client:xxx` or new `v-client.xxx`) into
 * a `ClientStrategy`.
 *
 * @internal Used by the Vite plugin to unify old and new syntax.
 */
export function legacyDirectiveToStrategy(directive: string): ClientStrategy | null {
  const match = directive.match(/^(?:client:|v-client\.)(load|idle|visible|media|only)$/);
  return match ? (match[1] as ClientStrategy) : null;
}

/* -------------------------------------------------------------------------- */
/* Directive Implementation                                                    */
/* -------------------------------------------------------------------------- */

/** Data attribute used to mark elements for the Islands hydration system. */
export const CLIENT_DIRECTIVE_ATTR = 'data-client-directive';
/** Data attribute for the media query (used with `v-client.media`). */
export const CLIENT_MEDIA_ATTR = 'data-media';
/** Data attribute marking a client-only element (skip SSR). */
export const CLIENT_ONLY_ATTR = 'data-client-only';

/** WeakMap for storing cleanup functions per element. */
const cleanupMap = new WeakMap<HTMLElement, (() => void)[]>();

/**
 * The `v-client` Vue custom directive.
 *
 * Registers on the Vue app via `app.directive('client', vClient)`.
 *
 * In SSR/Islands mode: the Vite plugin transforms `v-client.*` before the
 * directive runs, so this code only executes in CSR-only scenarios.
 *
 * In CSR-only mode: the directive marks the element with data attributes
 * so `hydrateIslands()` can discover it, and directly applies the hydration
 * strategy (idle/visible/media) for immediate effect.
 */
export const vClient: VClientDirective = {
  mounted(el, binding) {
    const modifiers = binding.modifiers;
    const strategy = resolveClientStrategy(modifiers);
    const mediaQuery = typeof binding.value === 'string' ? binding.value : undefined;

    // Mark the element for hydrateIslands() discovery
    el.setAttribute(CLIENT_DIRECTIVE_ATTR, strategy);
    if (strategy === 'media' && mediaQuery) {
      el.setAttribute(CLIENT_MEDIA_ATTR, mediaQuery);
    }
    if (strategy === 'only') {
      el.setAttribute(CLIENT_ONLY_ATTR, 'true');
    }

    // In CSR mode, directly apply the deferral strategy.
    // (In Islands mode, the Vite plugin replaces the element with
    // <ubean-island> and hydrateIslands() handles strategy.)
    applyStrategy(el, strategy, mediaQuery);
  },

  unmounted(el) {
    const cleanups = cleanupMap.get(el);
    if (cleanups) {
      for (const cleanup of cleanups) cleanup();
      cleanupMap.delete(el);
    }
    el.removeAttribute(CLIENT_DIRECTIVE_ATTR);
    el.removeAttribute(CLIENT_MEDIA_ATTR);
    el.removeAttribute(CLIENT_ONLY_ATTR);
  }
};

/**
 * Apply a hydration deferral strategy directly to a DOM element.
 *
 * Used by the runtime directive (CSR mode) and exported for advanced use
 * cases (e.g. custom wrapper components).
 *
 * - `load`: No deferral (element is already mounted).
 * - `idle`: Defers visibility until `requestIdleCallback`.
 * - `visible`: Defers visibility until `IntersectionObserver` fires.
 * - `media`: Defers visibility until `matchMedia` matches.
 * - `only`: No deferral (element is already on client).
 */
export function applyStrategy(el: HTMLElement, strategy: ClientStrategy, mediaQuery?: string): void {
  if (strategy === 'load' || strategy === 'only') {
    // No deferral needed — element is already mounted/visible
    return;
  }

  const cleanups: (() => void)[] = [];

  if (strategy === 'idle') {
    const ric = (globalThis as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;
    if (typeof ric === 'function') {
      const id = ric(
        () => {
          el.removeAttribute('data-client-pending');
        },
        { timeout: 2000 }
      );
      cleanups.push(() => {
        const cancel = (globalThis as any).cancelIdleCallback as ((id: number) => void) | undefined;
        if (typeof cancel === 'function') cancel(id);
      });
    } else {
      const id = setTimeout(() => {
        el.removeAttribute('data-client-pending');
      }, 200);
      cleanups.push(() => clearTimeout(id));
    }
    el.setAttribute('data-client-pending', 'idle');
  } else if (strategy === 'visible') {
    const IOCtor = (globalThis as any).IntersectionObserver as
      | (new (
          cb: (entries: { isIntersecting: boolean }[]) => void,
          opts?: { rootMargin?: string }
        ) => {
          observe: (t: HTMLElement) => void;
          disconnect: () => void;
        })
      | undefined;
    if (typeof IOCtor === 'function') {
      const io = new IOCtor(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              io.disconnect();
              el.removeAttribute('data-client-pending');
            }
          }
        },
        { rootMargin: '200px' }
      );
      io.observe(el);
      cleanups.push(() => io.disconnect());
    }
    el.setAttribute('data-client-pending', 'visible');
  } else if (strategy === 'media' && mediaQuery) {
    const window_ = (globalThis as any).window as { matchMedia?: (q: string) => MediaQueryList } | undefined;
    const mql = window_?.matchMedia?.(mediaQuery);
    if (mql) {
      if (mql.matches) {
        // Already matches — no pending state
      } else {
        const fn = (e: MediaQueryListEvent) => {
          if (e.matches) {
            el.removeAttribute('data-client-pending');
            if (mql.removeEventListener) mql.removeEventListener('change', fn);
            else if (mql.removeListener) mql.removeListener(fn);
          }
        };
        if (mql.addEventListener) mql.addEventListener('change', fn);
        else if (mql.addListener) mql.addListener(fn);
        cleanups.push(() => {
          if (mql.removeEventListener) mql.removeEventListener('change', fn);
          else if (mql.removeListener) mql.removeListener(fn);
        });
        el.setAttribute('data-client-pending', 'media');
      }
    }
  }

  if (cleanups.length > 0) {
    cleanupMap.set(el, cleanups);
  }
}

/**
 * Clean up all strategy resources for an element.
 *
 * Exported for wrapper components that manage elements manually.
 */
export function cleanupStrategy(el: HTMLElement): void {
  const cleanups = cleanupMap.get(el);
  if (cleanups) {
    for (const cleanup of cleanups) cleanup();
    cleanupMap.delete(el);
  }
  el.removeAttribute('data-client-pending');
}

/* -------------------------------------------------------------------------- */
/* Vue Type Augmentation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Augment Vue's type system to recognize `v-client` in templates.
 *
 * This provides IDE autocompletion and type checking for:
 * - `v-client.load` / `v-client.idle` / `v-client.visible` /
 *   `v-client.media` / `v-client.only`
 * - The directive value (string for media query)
 *
 * @internal This is automatically applied when the module is imported.
 */
declare module 'vue' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ComponentCustomProperties {
    /**
     * `v-client` directive — Islands hydration strategy.
     *
     * Modifiers: `.load`, `.idle`, `.visible`, `.media`, `.only`
     * Value: `string` (media query, only for `.media`)
     */
    vClient: VClientDirective;
  }

  interface ComponentCustomOptions {
    /**
     * Register the `v-client` directive on this component's app.
     * (Framework-level — users don't need to set this manually.)
     */
    clientDirective?: boolean;
  }
}
