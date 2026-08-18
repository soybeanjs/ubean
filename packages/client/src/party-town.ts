/**
 * P9-22: Third-party script optimization (Partytown integration).
 *
 * Aligns with Nuxt `@nuxtjs/scripts` and Astro Partytown integration.
 *
 * Provides:
 * - `useScript(src, options)` composable for loading third-party scripts with
 *   strategies: `'load'` (immediate), `'idle'` (requestIdleCallback),
 *   `'visible'` (IntersectionObserver on a ref), `'manual'` (explicit call).
 * - `getPartyTownScript(config)` generates the inline Partytown config script
 *   injected into `<head>` to initialize the Web Worker.
 * - Partytown runs third-party scripts off the main thread, improving
 *   performance by preventing analytics/tag-manager scripts from blocking
 *   the main thread.
 *
 * Usage (composable):
 * ```typescript
 * import { useScript } from 'ubean/runtime/party-town';
 *
 * // Load Google Analytics via Partytown when browser is idle
 * const { load, remove } = useScript('https://www.googletagmanager.com/gtag/js?id=GA_ID', {
 *   trigger: 'idle',
 *   partytown: true,
 *   attrs: { 'data-ga-id': 'GA_ID' }
 * });
 * ```
 */
import { ref, markRaw, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import type { Ref } from 'vue';

// --- Partytown config ---

export interface PartyTownConfig {
  /** Enable Partytown for third-party scripts (default: false, opt-in). */
  enabled: boolean;
  /**
   * Path where Partytown lib files are served (default: '~partytown').
   * The Vite plugin copies partytown lib files to `public/<libPath>/`.
   */
  libPath: string;
  /**
   * Forward calls to main thread (e.g. `['dataLayer.push']`).
   * These are global functions/objects that Partytown should forward
   * from the Web Worker to the main thread.
   */
  forward: string[];
  /** Main thread accessors (e.g. `['document.cookie']`). */
  mainAccess?: string[];
  /** Enable debug mode (default: false). */
  debug: boolean;
  /** Log script execution errors (default: false). */
  logScriptExecution: boolean;
  /** Whether to load scripts in a non-blocking way (default: true). */
  nonBlocking: boolean;
}

const DEFAULT_CONFIG: PartyTownConfig = {
  enabled: false,
  libPath: '~partytown',
  forward: [],
  debug: false,
  logScriptExecution: false,
  nonBlocking: true
};

/** Merge user config with defaults. */
export function resolvePartyTownConfig(config?: Partial<PartyTownConfig>): PartyTownConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/**
 * Generate the inline Partytown config script for `<head>`.
 *
 * This script configures `window.partytown` **before** the Partytown lib
 * snippet loads. The Partytown lib is loaded via a separate `<script>`
 * tag that reads `window.partytown` for configuration.
 *
 * Returns an empty string if Partytown is not enabled.
 */
export function getPartyTownScript(config: PartyTownConfig): string {
  if (!config.enabled) return '';

  const settings: string[] = [];
  if (config.libPath !== DEFAULT_CONFIG.libPath) {
    settings.push(`lib: ${JSON.stringify(`${config.libPath}/`)}`);
  }
  if (config.forward.length > 0) {
    settings.push(`forward: ${JSON.stringify(config.forward)}`);
  }
  if (config.mainAccess && config.mainAccess.length > 0) {
    settings.push(`mainAccess: ${JSON.stringify(config.mainAccess)}`);
  }
  if (config.debug) {
    settings.push(`debug: true`);
  }
  if (config.logScriptExecution) {
    settings.push(`logScriptExecution: true`);
  }
  if (!config.nonBlocking) {
    settings.push(`nonBlocking: false`);
  }

  const configStr = settings.length > 0 ? `{ ${settings.join(', ')} }` : '{}';

  // The Partytown snippet: sets window.partytown config, then loads the lib.
  // The lib path resolves to `/<libPath>/partytown.js` (served from public/).
  const libUrl = `${config.libPath}/partytown.js`;

  return `<script>partytown = ${configStr};</script>
    <script src="${libUrl}" defer></script>`;
}

/**
 * Generate the full HTML for Partytown initialization.
 * Used by the Vite plugin to inject into `<head>`.
 */
export function getPartyTownHeadContent(config: PartyTownConfig): string {
  return getPartyTownScript(config);
}

// --- useScript composable ---

export type ScriptTrigger = 'load' | 'idle' | 'visible' | 'manual';

export interface UseScriptOptions {
  /** When to load the script (default: 'load'). */
  trigger?: ScriptTrigger;
  /**
   * Run the script in Partytown (Web Worker).
   * When `true`, sets `type="text/partytown"` on the script tag.
   * (default: false)
   */
  partytown?: boolean;
  /** Script `async` attribute (default: true for non-module scripts). */
  async?: boolean;
  /** Script `defer` attribute (default: false). */
  defer?: boolean;
  /** Script `type` attribute (e.g. 'module', 'application/json'). */
  type?: string;
  /** Additional HTML attributes for the `<script>` tag. */
  attrs?: Record<string, string>;
  /** Element ref to observe for `trigger: 'visible'`. Required when trigger is 'visible'. */
  target?: Ref<HTMLElement | null | undefined>;
  /** Root element for IntersectionObserver (default: viewport). */
  rootMargin?: string;
  /** Threshold for IntersectionObserver (default: 0). */
  threshold?: number;
  /** Crossorigin attribute. */
  crossorigin?: 'anonymous' | 'use-credentials';
  /** Referrer policy. */
  referrerPolicy?: ReferrerPolicy;
  /** Whether to remove the script when the component unmounts (default: false). */
  removeOnUnmount?: boolean;
}

export interface UseScriptReturn {
  /** The script element (null until loaded). */
  script: Ref<HTMLScriptElement | null>;
  /** Whether the script has been loaded. */
  loaded: Ref<boolean>;
  /** Whether the script failed to load. */
  error: Ref<boolean>;
  /** Manually trigger loading (for `trigger: 'manual'`). */
  load: () => void;
  /** Remove the script from the DOM. */
  remove: () => void;
  /** Wait for the script to load. Returns a promise that resolves on load. */
  waitForLoad: () => Promise<void>;
}

/** Create a script element with the given src and options. */
function createScriptElement(src: string, options: UseScriptOptions): HTMLScriptElement {
  const script = document.createElement('script');

  script.src = src;

  // Partytown: set type="text/partytown" instead of regular script
  if (options.partytown) {
    script.type = 'text/partytown';
  } else if (options.type) {
    script.type = options.type;
  }

  // Default async=true for non-module, non-partytown scripts
  if (options.async !== undefined) {
    script.async = options.async;
  } else if (!options.partytown && options.type !== 'module') {
    script.async = true;
  }

  if (options.defer) script.defer = true;
  if (options.crossorigin) script.crossOrigin = options.crossorigin;
  if (options.referrerPolicy) script.referrerPolicy = options.referrerPolicy;

  // Custom attributes
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      script.setAttribute(key, value);
    }
  }

  return script;
}

/** Load a script element and return a promise that resolves on load. */
function loadScriptElement(script: HTMLScriptElement, container: HTMLElement | HTMLHeadElement): Promise<void> {
  return new Promise((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', e => reject(e), { once: true });
    container.appendChild(script);
  });
}

/**
 * Load a third-party script with a loading strategy.
 *
 * @param src - The script URL
 * @param options - Loading options
 * @returns Script control object with `load()`, `remove()`, and reactive state
 *
 * @example
 * ```typescript
 * // Load immediately with Partytown
 * useScript('https://www.googletagmanager.com/gtag/js?id=GA_ID', {
 *   partytown: true,
 *   trigger: 'load'
 * });
 *
 * // Load when browser is idle
 * const { load } = useScript('/heavy-script.js', { trigger: 'idle' });
 *
 * // Load when element is visible
 * const targetRef = ref<HTMLElement | null>(null);
 * useScript('/analytics.js', { trigger: 'visible', target: targetRef });
 * ```
 */
export function useScript(src: string, options: UseScriptOptions = {}): UseScriptReturn {
  const script = ref<HTMLScriptElement | null>(null);
  const loaded = ref(false);
  const error = ref(false);
  const trigger = options.trigger || 'load';

  let observer: IntersectionObserver | null = null;
  let idleCallbackId: number | null = null;
  let loadPromise: Promise<void> | null = null;
  let isRemoved = false;

  function doLoad(): void {
    if (script.value || loaded.value || error.value || isRemoved) return;
    if (typeof document === 'undefined') return;

    const el = createScriptElement(src, options);
    // markRaw prevents Vue from wrapping the DOM element in a reactive proxy,
    // which would break identity checks (e.g. parentNode.removeChild).
    script.value = markRaw(el);

    loadPromise = loadScriptElement(el, document.head)
      .then(() => {
        if (isRemoved) return;
        loaded.value = true;
      })
      .catch(() => {
        if (isRemoved) return;
        error.value = true;
      });
  }

  function load(): void {
    doLoad();
  }

  function remove(): void {
    isRemoved = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (idleCallbackId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }
    if (script.value && script.value.parentNode) {
      script.value.parentNode.removeChild(script.value);
    }
    script.value = null;
    loaded.value = false;
    error.value = false;
    loadPromise = null;
  }

  function waitForLoad(): Promise<void> {
    if (!loadPromise) doLoad();
    return loadPromise || Promise.resolve();
  }

  // Auto-load based on trigger
  if (typeof window !== 'undefined') {
    if (trigger === 'load') {
      // Load immediately on mount
      if (getCurrentInstance()) {
        onMounted(() => doLoad());
      } else {
        // Outside component setup — load immediately
        doLoad();
      }
    } else if (trigger === 'idle') {
      const scheduleLoad = () => {
        if (typeof requestIdleCallback === 'function') {
          idleCallbackId = requestIdleCallback(() => {
            idleCallbackId = null;
            doLoad();
          });
        } else {
          // Fallback: setTimeout
          setTimeout(() => doLoad(), 1);
        }
      };

      if (getCurrentInstance()) {
        onMounted(() => scheduleLoad());
      } else {
        scheduleLoad();
      }
    } else if (trigger === 'visible') {
      const targetRef = options.target;
      if (!targetRef) {
        // No target ref — fall back to 'load'
        if (getCurrentInstance()) {
          onMounted(() => doLoad());
        } else {
          doLoad();
        }
      } else {
        const setupObserver = () => {
          const el = targetRef.value;
          if (!el) return;
          observer = new IntersectionObserver(
            entries => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  doLoad();
                  observer?.disconnect();
                  observer = null;
                  break;
                }
              }
            },
            {
              rootMargin: options.rootMargin || '0px',
              threshold: options.threshold ?? 0
            }
          );
          observer.observe(el);
        };

        if (getCurrentInstance()) {
          onMounted(() => {
            // Watch for the target ref to become available
            if (targetRef.value) {
              setupObserver();
            } else {
              // Try again on next tick
              setTimeout(setupObserver, 0);
            }
          });
        } else {
          setupObserver();
        }
      }
    }
    // 'manual' — do nothing, user calls load() explicitly
  }

  // Cleanup on unmount
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (options.removeOnUnmount) {
        remove();
      } else {
        // Just disconnect observers
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (idleCallbackId !== null && typeof cancelIdleCallback === 'function') {
          cancelIdleCallback(idleCallbackId);
          idleCallbackId = null;
        }
      }
    });
  }

  return {
    script,
    loaded,
    error,
    load,
    remove,
    waitForLoad
  };
}

/**
 * Global Partytown configuration state.
 * Set by `configurePartyTown()` during app initialization.
 */
let _config: PartyTownConfig = DEFAULT_CONFIG;

/** Configure the Partytown module globally. */
export function configurePartyTown(config?: Partial<PartyTownConfig>): PartyTownConfig {
  _config = resolvePartyTownConfig(config);
  return _config;
}

/** Get the current Partytown config. */
export function getPartyTownConfig(): PartyTownConfig {
  return _config;
}

/** Check if Partytown is enabled. */
export function isPartyTownEnabled(): boolean {
  return _config.enabled;
}

/** Reset Partytown module state (for testing). @internal */
export function _resetPartyTown(): void {
  _config = DEFAULT_CONFIG;
}
