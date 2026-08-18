/**
 * P9-21: Color mode (dark/light) support.
 *
 * Aligns with Nuxt `@nuxtjs/color-mode`. Provides:
 * - A no-FOUC inline script injected into `<head>` that resolves the color
 *   mode (from cookie / localStorage / system preference) and sets the
 *   `<html>` class or `data-*` attribute **before** the page renders.
 * - A `useColorMode()` composable for reactive access and toggling.
 *
 * The script runs synchronously in `<head>` so the correct class is set
 * before the browser paints, preventing a flash of unstyled content.
 *
 * Usage (composable):
 * ```typescript
 * import { useColorMode } from 'ubean/runtime/color-mode';
 *
 * const colorMode = useColorMode();
 * colorMode.value;     // 'light' | 'dark' | ...
 * colorMode.preference; // 'system' | 'light' | 'dark' | ...
 * colorMode.toggle();   // cycle through modes
 * ```
 */
import { ref, computed, watch, onScopeDispose } from 'vue';
import type { Ref, ComputedRef } from 'vue';

export interface ColorModeConfig {
  /** Default preference: 'system' | 'light' | 'dark' | string (default: 'system'). */
  preference: string;
  /** Fallback when system preference can't be determined (default: 'light'). */
  fallback: string;
  /** Class prefix for the html element (default: ''). */
  classPrefix: string;
  /** Class suffix (default: '-mode' → 'light-mode', 'dark-mode'). */
  classSuffix: string;
  /** localStorage key for persisting user preference (default: 'ubean-color-mode'). */
  storageKey: string;
  /** Cookie name for SSR (default: 'ubean-color-mode'). */
  cookieName: string;
  /**
   * Use a `data-color-mode` attribute on `<html>` instead of a class.
   * When `true`, no class is added; instead `data-color-mode="<value>"` is set.
   * (default: `false`)
   */
  dataValue: boolean;
  /** List of all possible color mode values (default: ['light', 'dark']). */
  modes: string[];
}

export interface ColorMode {
  /** User's preference ('system', 'light', 'dark', or custom). */
  preference: Ref<string>;
  /** Resolved mode ('light', 'dark', or custom — never 'system'). */
  value: ComputedRef<string>;
  /** Whether the system preference is unknown (e.g. no `prefers-color-scheme`). */
  unknown: Ref<boolean>;
  /** Whether the color mode is forced (e.g. by route meta). */
  forced: Ref<boolean>;
  /** Set the preference and persist it. */
  set: (mode: string) => void;
  /** Cycle to the next mode in the modes list. */
  toggle: () => void;
}

const DEFAULT_CONFIG: ColorModeConfig = {
  preference: 'system',
  fallback: 'light',
  classPrefix: '',
  classSuffix: '-mode',
  storageKey: 'ubean-color-mode',
  cookieName: 'ubean-color-mode',
  dataValue: false,
  modes: ['light', 'dark']
};

/** Merge user config with defaults. */
export function resolveColorModeConfig(config?: Partial<ColorModeConfig>): ColorModeConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/**
 * Generate the no-FOUC inline script that resolves the color mode and sets
 * the `<html>` class/attribute **before** the page renders.
 *
 * The script:
 * 1. Reads the user's preference from a cookie (SSR-friendly) or localStorage.
 * 2. If preference is 'system', checks `prefers-color-scheme`.
 * 3. Falls back to `config.fallback` if system preference is unknown.
 * 4. Sets the class or `data-*` attribute on `<html>`.
 *
 * This script is injected into `<head>` and runs synchronously.
 */
export function getColorModeScript(config: ColorModeConfig): string {
  const modes = JSON.stringify(config.modes);
  const fallback = JSON.stringify(config.fallback);
  const storageKey = JSON.stringify(config.storageKey);
  const cookieName = JSON.stringify(config.cookieName);
  const classPrefix = JSON.stringify(config.classPrefix);
  const classSuffix = JSON.stringify(config.classSuffix);
  const dataValue = config.dataValue;

  // The script is wrapped in an IIFE to avoid leaking variables.
  // It uses `document` and `window` APIs available in the browser.
  const setAttr = dataValue
    ? `el.setAttribute('data-color-mode', value);`
    : `var className = ${classPrefix} + value + ${classSuffix};
       el.classList.add(className);`;

  return `<script>(() => {
  const modes = ${modes};
  const fallback = ${fallback};
  const storageKey = ${storageKey};
  const cookieName = ${cookieName};
  const classPrefix = ${classPrefix};
  const classSuffix = ${classSuffix};
  const el = document.documentElement;

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^|;\\\\s*)' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // 1. Read preference: cookie first (SSR), then localStorage
  let preference = getCookie(cookieName) || localStorage.getItem(storageKey) || ${JSON.stringify(config.preference)};

  // 2. Resolve the actual mode
  let value;
  if (preference === 'system') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    value = media.matches ? 'dark' : (media.media !== '(prefers-color-scheme: dark)' ? 'light' : fallback);
  } else {
    value = modes.includes(preference) ? preference : fallback;
  }

  // 3. Set the class or data attribute on <html>
  ${setAttr}
})();</script>`;
}

// --- Client-side composable ---

let _config: ColorModeConfig = DEFAULT_CONFIG;
let _preference: Ref<string> | null = null;
let _value: Ref<string> | null = null;
let _unknown: Ref<boolean> | null = null;
let _forced: Ref<boolean> | null = null;
let _initialized = false;

/** Configure the color mode module (called once during app initialization). */
export function configureColorMode(config?: Partial<ColorModeConfig>): ColorModeConfig {
  _config = resolveColorModeConfig(config);
  return _config;
}

/** Get the current color mode config. */
export function getColorModeConfig(): ColorModeConfig {
  return _config;
}

/**
 * Read the current color mode from the DOM (set by the no-FOUC script).
 * Returns `null` if not running in a browser or the mode can't be determined.
 */
function readModeFromDom(): string | null {
  if (typeof document === 'undefined') return null;

  if (_config.dataValue) {
    return document.documentElement.getAttribute('data-color-mode');
  }

  for (const mode of _config.modes) {
    const className = `${_config.classPrefix}${mode}${_config.classSuffix}`;
    if (document.documentElement.classList.contains(className)) {
      return mode;
    }
  }
  return null;
}

/**
 * Apply a color mode to the DOM (set class or data attribute on `<html>`).
 */
function applyModeToDom(mode: string): void {
  if (typeof document === 'undefined') return;

  const el = document.documentElement;

  if (_config.dataValue) {
    el.setAttribute('data-color-mode', mode);
    return;
  }

  // Remove all mode classes, then add the current one
  for (const m of _config.modes) {
    const className = `${_config.classPrefix}${m}${_config.classSuffix}`;
    el.classList.remove(className);
  }
  const className = `${_config.classPrefix}${mode}${_config.classSuffix}`;
  el.classList.add(className);
}

/**
 * Detect system color preference via `prefers-color-scheme`.
 * Returns the mode string or `null` if unknown.
 */
function detectSystemMode(): string | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  if (media.matches) return 'dark';
  // `media.media` is the query string; if it's not the dark query,
  // the browser supports the feature and the answer is 'light'.
  if (media.media === '(prefers-color-scheme: dark)') return 'light';
  return null;
}

/**
 * Persist the user's preference to localStorage and cookie.
 */
function persistPreference(preference: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(_config.storageKey, preference);
  } catch {
    // localStorage may be unavailable (private mode, etc.)
  }

  // Cookie for SSR (expires in 1 year)
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${_config.cookieName}=${encodeURIComponent(preference)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Initialize the color mode state. Called on first `useColorMode()` invocation.
 * Reads the initial mode from the DOM (set by the no-FOUC script).
 */
function initColorMode(): void {
  if (_initialized) return;
  _initialized = true;

  // Read preference from localStorage (the no-FOUC script already used it,
  // but we need the reactive ref to start with the correct value)
  let preference = _config.preference;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(_config.storageKey);
      if (stored) preference = stored;
    } catch {
      // localStorage unavailable
    }
  }

  _preference = ref(preference);
  _forced = ref(false);

  // Read the actual mode from the DOM (set by the no-FOUC script)
  const domMode = readModeFromDom();
  _value = ref(domMode || _config.fallback);

  // Determine if the system mode is unknown
  _unknown = ref(false);
  if (preference === 'system') {
    _unknown.value = detectSystemMode() === null;
  }

  // If the DOM doesn't have a mode set (e.g. no no-FOUC script ran, as in
  // SPA dev mode without SSR), apply the resolved mode to the DOM now.
  if (!domMode) {
    if (preference === 'system') {
      const system = detectSystemMode();
      if (system) {
        _value.value = system;
        applyModeToDom(system);
      } else {
        applyModeToDom(_config.fallback);
      }
    } else {
      applyModeToDom(preference);
    }
  }
}

/**
 * Reactively access and control the color mode.
 *
 * Returns a `ColorMode` object with reactive refs and methods:
 * - `preference` — the user's preference ('system', 'light', 'dark', ...)
 * - `value` — the resolved mode (never 'system')
 * - `unknown` — whether the system preference is unknown
 * - `forced` — whether the mode is forced (e.g. by route meta)
 * - `set(mode)` — set the preference and persist it
 * - `toggle()` — cycle to the next mode
 *
 * @example
 * ```typescript
 * const colorMode = useColorMode();
 * console.log(colorMode.value); // 'dark'
 * colorMode.set('light');
 * colorMode.toggle(); // cycles: light → dark → light
 * ```
 */
export function useColorMode(): ColorMode {
  initColorMode();

  const preference = _preference!;
  const forced = _forced!;
  const unknown = _unknown!;
  const valueRef = _value!;

  const value = computed(() => {
    if (forced.value) return valueRef.value;
    if (preference.value === 'system') {
      const system = detectSystemMode();
      return system || _config.fallback;
    }
    return preference.value;
  });

  // Watch preference changes and update DOM + persistence.
  // Use flush:'sync' so the DOM updates immediately (no flash when toggling).
  const stopWatch = watch(
    preference,
    newPref => {
      if (forced.value) return;
      persistPreference(newPref);
      if (newPref === 'system') {
        const system = detectSystemMode();
        unknown.value = system === null;
        if (system) applyModeToDom(system);
      } else {
        unknown.value = false;
        applyModeToDom(newPref);
      }
    },
    { flush: 'sync' }
  );

  // Listen for system preference changes when preference is 'system'
  let mediaQuery: MediaQueryList | null = null;
  const handleMediaChange = (e: MediaQueryListEvent) => {
    if (preference.value !== 'system' || forced.value) return;
    const mode = e.matches ? 'dark' : 'light';
    applyModeToDom(mode);
    valueRef.value = mode;
  };

  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleMediaChange);
  }

  onScopeDispose(() => {
    stopWatch();
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleMediaChange);
    }
  });

  function set(mode: string): void {
    preference.value = mode;
  }

  function toggle(): void {
    const current = value.value;
    const modes = _config.modes;
    const idx = modes.indexOf(current);
    const nextIdx = (idx + 1) % modes.length;
    set(modes[nextIdx]);
  }

  return {
    preference,
    value,
    unknown,
    forced,
    set,
    toggle
  };
}

/**
 * Force a color mode (e.g. from route meta `colorMode: 'dark'`).
 * When forced, user changes are ignored until `unforceColorMode()` is called.
 */
export function forceColorMode(mode: string): void {
  if (!_initialized) initColorMode();
  if (_value) _value.value = mode;
  if (_forced) _forced.value = true;
  applyModeToDom(mode);
}

/**
 * Remove the forced color mode, returning to user preference.
 */
export function unforceColorMode(): void {
  if (!_initialized) return;
  if (_forced) _forced.value = false;
  // Re-apply the user's preference
  if (_preference) {
    const pref = _preference.value;
    if (pref === 'system') {
      const system = detectSystemMode();
      if (system) applyModeToDom(system);
    } else {
      applyModeToDom(pref);
    }
  }
}

/**
 * Reset the color mode module state (for testing).
 * @internal
 */
export function _resetColorMode(): void {
  _config = DEFAULT_CONFIG;
  _preference = null;
  _value = null;
  _unknown = null;
  _forced = null;
  _initialized = false;
}
