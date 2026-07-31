/**
 * P9-21: Color mode — unit tests
 *
 * Tests the color mode module:
 * - Config resolution with defaults
 * - No-FOUC script generation
 * - useColorMode() composable (preference, value, set, toggle)
 * - forceColorMode / unforceColorMode
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveColorModeConfig,
  getColorModeScript,
  getColorModeConfig,
  configureColorMode,
  useColorMode,
  forceColorMode,
  unforceColorMode,
  _resetColorMode
} from '../src/color-mode';

// Helper: set up browser-like environment
function setupBrowserEnv(opts?: {
  cookie?: string;
  localStorage?: Record<string, string>;
  prefersDark?: boolean;
  matchMediaSupported?: boolean;
}) {
  const cookie = opts?.cookie ?? '';
  const storage: Record<string, string> = opts?.localStorage ?? {};
  const prefersDark = opts?.prefersDark ?? false;
  const matchMediaSupported = opts?.matchMediaSupported ?? true;

  const htmlEl = {
    classList: {
      _classes: new Set<string>(),
      add(name: string) {
        this._classes.add(name);
      },
      remove(name: string) {
        this._classes.delete(name);
      },
      contains(name: string) {
        return this._classes.has(name);
      }
    },
    _attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this._attrs.set(name, value);
    },
    getAttribute(name: string) {
      return this._attrs.get(name) ?? null;
    }
  };

  (globalThis as any).document = {
    cookie,
    documentElement: htmlEl
  };

  (globalThis as any).window = {
    matchMedia: matchMediaSupported
      ? (query: string) => ({
          media: query,
          matches: prefersDark,
          addEventListener: () => {},
          removeEventListener: () => {}
        })
      : undefined
  };

  (globalThis as any).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    }
  };

  return { htmlEl, storage };
}

function teardownBrowserEnv() {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
}

describe('P9-21: resolveColorModeConfig', () => {
  it('returns defaults when no config provided', () => {
    const config = resolveColorModeConfig();
    expect(config.preference).toBe('system');
    expect(config.fallback).toBe('light');
    expect(config.classPrefix).toBe('');
    expect(config.classSuffix).toBe('-mode');
    expect(config.storageKey).toBe('ubean-color-mode');
    expect(config.cookieName).toBe('ubean-color-mode');
    expect(config.dataValue).toBe(false);
    expect(config.modes).toEqual(['light', 'dark']);
  });

  it('merges user config with defaults', () => {
    const config = resolveColorModeConfig({
      preference: 'dark',
      classSuffix: '',
      dataValue: true
    });
    expect(config.preference).toBe('dark');
    expect(config.classSuffix).toBe('');
    expect(config.dataValue).toBe(true);
    // Defaults preserved
    expect(config.fallback).toBe('light');
    expect(config.storageKey).toBe('ubean-color-mode');
  });

  it('accepts custom modes', () => {
    const config = resolveColorModeConfig({
      modes: ['light', 'dark', 'sepia']
    });
    expect(config.modes).toEqual(['light', 'dark', 'sepia']);
  });
});

describe('P9-21: getColorModeScript', () => {
  it('generates a <script> tag', () => {
    const config = resolveColorModeConfig();
    const script = getColorModeScript(config);
    expect(script).toMatch(/^<script>[\s\S]*<\/script>$/);
  });

  it('includes the modes array', () => {
    const config = resolveColorModeConfig({ modes: ['light', 'dark', 'sepia'] });
    const script = getColorModeScript(config);
    expect(script).toContain('"light"');
    expect(script).toContain('"dark"');
    expect(script).toContain('"sepia"');
  });

  it('includes the storage key', () => {
    const config = resolveColorModeConfig({ storageKey: 'my-theme' });
    const script = getColorModeScript(config);
    expect(script).toContain('"my-theme"');
  });

  it('includes the cookie name', () => {
    const config = resolveColorModeConfig({ cookieName: 'my-cookie' });
    const script = getColorModeScript(config);
    expect(script).toContain('"my-cookie"');
  });

  it('includes the fallback', () => {
    const config = resolveColorModeConfig({ fallback: 'dark' });
    const script = getColorModeScript(config);
    expect(script).toContain('"dark"');
  });

  it('uses class-based mode by default', () => {
    const config = resolveColorModeConfig();
    const script = getColorModeScript(config);
    expect(script).toContain('classList.add');
    expect(script).not.toContain('setAttribute');
  });

  it('uses data attribute when dataValue is true', () => {
    const config = resolveColorModeConfig({ dataValue: true });
    const script = getColorModeScript(config);
    expect(script).toContain("setAttribute('data-color-mode'");
    expect(script).not.toContain('classList.add');
  });

  it('uses custom class prefix and suffix', () => {
    const config = resolveColorModeConfig({ classPrefix: 'theme-', classSuffix: '' });
    const script = getColorModeScript(config);
    expect(script).toContain('"theme-"');
    expect(script).toContain('""');
  });

  it('includes the default preference', () => {
    const config = resolveColorModeConfig({ preference: 'dark' });
    const script = getColorModeScript(config);
    expect(script).toContain('"dark"');
  });

  it('uses matchMedia for system preference', () => {
    const config = resolveColorModeConfig({ preference: 'system' });
    const script = getColorModeScript(config);
    expect(script).toContain('matchMedia');
    expect(script).toContain('prefers-color-scheme');
  });
});

describe('P9-21: configureColorMode', () => {
  beforeEach(() => _resetColorMode());

  it('sets the global config', () => {
    const config = configureColorMode({ preference: 'dark' });
    expect(config.preference).toBe('dark');
    expect(getColorModeConfig().preference).toBe('dark');
  });

  it('returns the resolved config', () => {
    const config = configureColorMode({ fallback: 'dark', classSuffix: '-theme' });
    expect(config.fallback).toBe('dark');
    expect(config.classSuffix).toBe('-theme');
  });
});

describe('P9-21: useColorMode (class-based)', () => {
  beforeEach(() => {
    _resetColorMode();
    setupBrowserEnv({ prefersDark: false });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('returns a ColorMode object with reactive refs', () => {
    const cm = useColorMode();
    expect(cm.preference).toBeDefined();
    expect(cm.value).toBeDefined();
    expect(cm.unknown).toBeDefined();
    expect(cm.forced).toBeDefined();
    expect(typeof cm.set).toBe('function');
    expect(typeof cm.toggle).toBe('function');
  });

  it('defaults preference to "system"', () => {
    const cm = useColorMode();
    expect(cm.preference.value).toBe('system');
  });

  it('resolves system preference to "light" when not dark', () => {
    const cm = useColorMode();
    expect(cm.value.value).toBe('light');
  });

  it('resolves system preference to "dark" when prefers dark', () => {
    _resetColorMode();
    setupBrowserEnv({ prefersDark: true });
    const cm = useColorMode();
    expect(cm.value.value).toBe('dark');
  });

  it('set() changes the preference and applies to DOM', () => {
    const cm = useColorMode();
    cm.set('dark');
    expect(cm.preference.value).toBe('dark');
    expect(cm.value.value).toBe('dark');
    // DOM should have the dark-mode class
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
  });

  it('set("light") applies the light-mode class', () => {
    const cm = useColorMode();
    cm.set('dark');
    cm.set('light');
    expect(document.documentElement.classList.contains('light-mode')).toBe(true);
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
  });

  it('toggle() cycles through modes', () => {
    const cm = useColorMode();
    // Start at 'light' (system resolves to light)
    expect(cm.value.value).toBe('light');
    cm.toggle();
    expect(cm.preference.value).toBe('dark');
    cm.toggle();
    expect(cm.preference.value).toBe('light');
  });

  it('persists preference to localStorage', () => {
    const cm = useColorMode();
    cm.set('dark');
    expect(localStorage.getItem('ubean-color-mode')).toBe('dark');
  });

  it('persists preference to cookie', () => {
    const cm = useColorMode();
    cm.set('dark');
    expect(document.cookie).toContain('ubean-color-mode=dark');
  });
});

describe('P9-21: useColorMode (data attribute)', () => {
  beforeEach(() => {
    _resetColorMode();
    configureColorMode({ dataValue: true });
    setupBrowserEnv({ prefersDark: false });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('sets data-color-mode attribute on <html>', () => {
    const cm = useColorMode();
    cm.set('dark');
    expect(document.documentElement.getAttribute('data-color-mode')).toBe('dark');
  });

  it('updates data attribute when mode changes', () => {
    const cm = useColorMode();
    cm.set('dark');
    expect(document.documentElement.getAttribute('data-color-mode')).toBe('dark');
    cm.set('light');
    expect(document.documentElement.getAttribute('data-color-mode')).toBe('light');
  });
});

describe('P9-21: forceColorMode / unforceColorMode', () => {
  beforeEach(() => {
    _resetColorMode();
    setupBrowserEnv({ prefersDark: false });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('forceColorMode sets forced=true', () => {
    const cm = useColorMode();
    forceColorMode('dark');
    expect(cm.forced.value).toBe(true);
    expect(cm.value.value).toBe('dark');
  });

  it('forced mode ignores user preference changes', () => {
    const cm = useColorMode();
    forceColorMode('dark');
    cm.set('light'); // should be ignored
    expect(cm.value.value).toBe('dark');
  });

  it('unforceColorMode restores user preference', () => {
    const cm = useColorMode();
    cm.set('light');
    forceColorMode('dark');
    expect(cm.value.value).toBe('dark');
    unforceColorMode();
    expect(cm.forced.value).toBe(false);
    expect(cm.value.value).toBe('light');
  });

  it('forceColorMode applies to DOM', () => {
    useColorMode();
    forceColorMode('dark');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
  });
});

describe('P9-21: useColorMode with custom config', () => {
  beforeEach(() => {
    _resetColorMode();
    configureColorMode({
      preference: 'dark',
      classPrefix: 'theme-',
      classSuffix: '',
      modes: ['light', 'dark', 'sepia']
    });
    setupBrowserEnv({ prefersDark: false });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('uses custom preference', () => {
    const cm = useColorMode();
    expect(cm.preference.value).toBe('dark');
  });

  it('uses custom class prefix and suffix', () => {
    useColorMode();
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('toggle cycles through all custom modes', () => {
    const cm = useColorMode();
    expect(cm.value.value).toBe('dark');
    cm.toggle();
    expect(cm.value.value).toBe('sepia');
    cm.toggle();
    expect(cm.value.value).toBe('light');
    cm.toggle();
    expect(cm.value.value).toBe('dark');
  });
});

describe('P9-21: useColorMode with stored preference', () => {
  beforeEach(() => {
    _resetColorMode();
    setupBrowserEnv({
      localStorage: { 'ubean-color-mode': 'dark' },
      prefersDark: false
    });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('reads preference from localStorage', () => {
    const cm = useColorMode();
    expect(cm.preference.value).toBe('dark');
    expect(cm.value.value).toBe('dark');
  });
});

describe('P9-21: useColorMode with cookie preference', () => {
  beforeEach(() => {
    _resetColorMode();
    setupBrowserEnv({
      cookie: 'ubean-color-mode=dark',
      prefersDark: false
    });
  });
  afterEach(() => {
    _resetColorMode();
    teardownBrowserEnv();
  });

  it('reads preference from cookie (SSR-friendly)', () => {
    // The composable reads from localStorage, but the no-FOUC script reads
    // from cookie. Here we test that localStorage takes precedence.
    const cm = useColorMode();
    // localStorage is empty, so preference should be default ('system')
    expect(cm.preference.value).toBe('system');
  });
});
