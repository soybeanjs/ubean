/**
 * P9-22: Third-party script optimization (Partytown integration) — unit tests
 *
 * Tests:
 * - Config resolution with defaults
 * - Partytown script generation
 * - configurePartyTown / isPartyTownEnabled
 * - useScript composable (trigger strategies, partytown mode, attrs, load/remove)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import {
  resolvePartyTownConfig,
  getPartyTownScript,
  getPartyTownHeadContent,
  configurePartyTown,
  getPartyTownConfig,
  isPartyTownEnabled,
  _resetPartyTown,
  useScript
} from '../src/party-town';

// --- Mock DOM helpers ---

interface MockScriptElement {
  src: string;
  type: string;
  async: boolean;
  defer: boolean;
  crossOrigin: string | null;
  referrerPolicy: string;
  _attrs: Map<string, string>;
  _listeners: Map<string, ((event: Event) => void)[]>;
  parentNode: { removeChild: (child: MockScriptElement) => void } | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
}

function createMockScriptElement(): MockScriptElement {
  const el: MockScriptElement = {
    src: '',
    type: '',
    async: false,
    defer: false,
    crossOrigin: null,
    referrerPolicy: '',
    _attrs: new Map(),
    _listeners: new Map(),
    parentNode: null,
    setAttribute(name: string, value: string) {
      el._attrs.set(name, value);
    },
    getAttribute(name: string) {
      return el._attrs.get(name) ?? null;
    },
    addEventListener(type: string, listener: (event: Event) => void) {
      if (!el._listeners.has(type)) el._listeners.set(type, []);
      el._listeners.get(type)!.push(listener);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      const arr = el._listeners.get(type);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
    dispatchEvent(event: Event) {
      const type = event.type;
      const arr = el._listeners.get(type);
      if (arr) {
        for (const listener of arr) listener(event);
      }
      return true;
    }
  };
  return el;
}

interface MockHead {
  children: MockScriptElement[];
  appendChild(child: MockScriptElement): MockScriptElement;
  querySelectorAll(selector: string): MockScriptElement[];
  removeChild(child: MockScriptElement): MockScriptElement;
}

function createMockHead(): MockHead {
  const head: MockHead = {
    children: [],
    appendChild(child: MockScriptElement) {
      child.parentNode = head;
      head.children.push(child);
      return child;
    },
    querySelectorAll(selector: string) {
      if (selector === 'script') return [...head.children];
      return [];
    },
    removeChild(child: MockScriptElement) {
      const idx = head.children.indexOf(child);
      if (idx >= 0) head.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
  };
  return head;
}

let mockHead: MockHead;
let idleCallbacks: Map<number, () => void>;
let idleCounter: number;
let savedDoc: any;
let savedWindow: any;

function setupBrowserEnv() {
  mockHead = createMockHead();
  idleCallbacks = new Map();
  idleCounter = 0;

  savedDoc = (globalThis as any).document;
  savedWindow = (globalThis as any).window;

  (globalThis as any).document = {
    head: mockHead,
    documentElement: {},
    createElement(tag: string) {
      if (tag === 'script') return createMockScriptElement();
      return {} as any;
    }
  };

  (globalThis as any).window = {
    matchMedia: undefined,
    requestIdleCallback: (cb: () => void): number => {
      const id = ++idleCounter;
      idleCallbacks.set(id, cb);
      return id;
    },
    cancelIdleCallback: (id: number) => {
      idleCallbacks.delete(id);
    }
  };
  // Also set on globalThis since the source code checks `typeof requestIdleCallback === 'function'`
  // which refers to the global, not window.requestIdleCallback
  (globalThis as any).requestIdleCallback = (globalThis as any).window.requestIdleCallback;
  (globalThis as any).cancelIdleCallback = (globalThis as any).window.cancelIdleCallback;
}

function teardownBrowserEnv() {
  (globalThis as any).document = savedDoc;
  (globalThis as any).window = savedWindow;
  delete (globalThis as any).requestIdleCallback;
  delete (globalThis as any).cancelIdleCallback;
}

function flushIdle() {
  for (const cb of idleCallbacks.values()) cb();
  idleCallbacks.clear();
}

function triggerScriptLoad(script: MockScriptElement) {
  const event = new Event('load');
  Object.defineProperty(event, 'target', { value: script });
  script.dispatchEvent(event);
}

// --- Tests ---

describe('P9-22: resolvePartyTownConfig', () => {
  it('returns default config when no input', () => {
    const config = resolvePartyTownConfig();
    expect(config.enabled).toBe(false);
    expect(config.libPath).toBe('~partytown');
    expect(config.forward).toEqual([]);
    expect(config.debug).toBe(false);
    expect(config.logScriptExecution).toBe(false);
    expect(config.nonBlocking).toBe(true);
  });

  it('merges user config with defaults', () => {
    const config = resolvePartyTownConfig({
      enabled: true,
      forward: ['dataLayer.push'],
      debug: true
    });
    expect(config.enabled).toBe(true);
    expect(config.forward).toEqual(['dataLayer.push']);
    expect(config.debug).toBe(true);
    expect(config.libPath).toBe('~partytown');
  });

  it('handles mainAccess', () => {
    const config = resolvePartyTownConfig({
      enabled: true,
      mainAccess: ['document.cookie']
    });
    expect(config.mainAccess).toEqual(['document.cookie']);
  });
});

describe('P9-22: getPartyTownScript', () => {
  it('returns empty string when not enabled', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: false }));
    expect(script).toBe('');
  });

  it('returns config script when enabled', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, forward: ['dataLayer.push'] }));
    expect(script).toContain('<script>partytown = ');
    expect(script).toContain('forward: ["dataLayer.push"]');
    expect(script).toContain('src="~partytown/partytown.js"');
    expect(script).toContain('defer');
  });

  it('includes debug flag', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, debug: true }));
    expect(script).toContain('debug: true');
  });

  it('includes logScriptExecution flag', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, logScriptExecution: true }));
    expect(script).toContain('logScriptExecution: true');
  });

  it('includes nonBlocking: false', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, nonBlocking: false }));
    expect(script).toContain('nonBlocking: false');
  });

  it('includes custom libPath', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, libPath: '/pt' }));
    expect(script).toContain('lib: "/pt/"');
    expect(script).toContain('src="/pt/partytown.js"');
  });

  it('includes mainAccess', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true, mainAccess: ['document.cookie'] }));
    expect(script).toContain('mainAccess: ["document.cookie"]');
  });

  it('returns empty config object when no extra options', () => {
    const script = getPartyTownScript(resolvePartyTownConfig({ enabled: true }));
    expect(script).toContain('partytown = {}');
  });
});

describe('P9-22: getPartyTownHeadContent', () => {
  it('returns same as getPartyTownScript', () => {
    const config = resolvePartyTownConfig({ enabled: true });
    expect(getPartyTownHeadContent(config)).toBe(getPartyTownScript(config));
  });
});

describe('P9-22: configurePartyTown / getPartyTownConfig / isPartyTownEnabled', () => {
  beforeEach(() => {
    _resetPartyTown();
  });

  it('configurePartyTown sets global config', () => {
    const config = configurePartyTown({ enabled: true, forward: ['dataLayer.push'] });
    expect(config.enabled).toBe(true);
    expect(getPartyTownConfig().enabled).toBe(true);
    expect(isPartyTownEnabled()).toBe(true);
  });

  it('isPartyTownEnabled returns false by default', () => {
    expect(isPartyTownEnabled()).toBe(false);
  });

  it('_resetPartyTown resets to defaults', () => {
    configurePartyTown({ enabled: true });
    expect(isPartyTownEnabled()).toBe(true);
    _resetPartyTown();
    expect(isPartyTownEnabled()).toBe(false);
    expect(getPartyTownConfig().libPath).toBe('~partytown');
  });
});

describe('P9-22: useScript', () => {
  beforeEach(() => {
    setupBrowserEnv();
    _resetPartyTown();
  });

  afterEach(() => {
    teardownBrowserEnv();
  });

  it('returns a UseScriptReturn object', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    expect(result).toHaveProperty('script');
    expect(result).toHaveProperty('loaded');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('load');
    expect(result).toHaveProperty('remove');
    expect(result).toHaveProperty('waitForLoad');
    expect(typeof result.load).toBe('function');
    expect(typeof result.remove).toBe('function');
    expect(typeof result.waitForLoad).toBe('function');
  });

  it('trigger: manual does not load script until load() is called', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    expect(result.script.value).toBeNull();
    expect(result.loaded.value).toBe(false);
    result.load();
    expect(result.script.value).not.toBeNull();
    expect((result.script.value as any).src).toContain('/test.js');
  });

  it('load() creates a script element in document.head', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    const scripts = mockHead.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0].src).toContain('/test.js');
  });

  it('remove() removes the script from the DOM', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    expect(mockHead.querySelectorAll('script').length).toBe(1);
    result.remove();
    expect(mockHead.querySelectorAll('script').length).toBe(0);
    expect(result.script.value).toBeNull();
    expect(result.loaded.value).toBe(false);
  });

  it('partyTown: true sets type="text/partytown"', () => {
    const result = useScript('/test.js', { trigger: 'manual', partytown: true });
    result.load();
    expect((result.script.value as any).type).toBe('text/partytown');
  });

  it('partyTown: false does not set text/partytown', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    expect((result.script.value as any).type).not.toBe('text/partytown');
  });

  it('sets custom type attribute', () => {
    const result = useScript('/test.js', { trigger: 'manual', type: 'module' });
    result.load();
    expect((result.script.value as any).type).toBe('module');
  });

  it('sets async attribute by default for non-module scripts', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    expect((result.script.value as any).async).toBe(true);
  });

  it('does not set async for partytown scripts', () => {
    const result = useScript('/test.js', { trigger: 'manual', partytown: true });
    result.load();
    expect((result.script.value as any).async).toBe(false);
  });

  it('sets custom attrs', () => {
    const result = useScript('/test.js', {
      trigger: 'manual',
      attrs: { 'data-test': 'value', id: 'my-script' }
    });
    result.load();
    expect(result.script.value?.getAttribute('data-test')).toBe('value');
    expect(result.script.value?.getAttribute('id')).toBe('my-script');
  });

  it('sets defer attribute', () => {
    const result = useScript('/test.js', { trigger: 'manual', defer: true });
    result.load();
    expect((result.script.value as any).defer).toBe(true);
  });

  it('sets crossorigin attribute', () => {
    const result = useScript('/test.js', { trigger: 'manual', crossorigin: 'anonymous' });
    result.load();
    expect((result.script.value as any).crossOrigin).toBe('anonymous');
  });

  it('loaded becomes true after script loads', async () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    expect(result.loaded.value).toBe(false);
    triggerScriptLoad(result.script.value as unknown as MockScriptElement);
    // Wait for promise microtask to resolve
    await Promise.resolve();
    await Promise.resolve();
    expect(result.loaded.value).toBe(true);
  });

  it('load() is idempotent (does not create duplicate scripts)', () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    result.load();
    result.load();
    expect(mockHead.querySelectorAll('script').length).toBe(1);
  });

  it('waitForLoad() returns a promise that resolves on load', async () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    let resolved = false;
    result.waitForLoad().then(() => {
      resolved = true;
    });
    expect(result.script.value).not.toBeNull();
    triggerScriptLoad(result.script.value as unknown as MockScriptElement);
    // Need multiple microtask flushes: loadScriptElement resolve → .then(loaded=true) → waitForLoad().then()
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('trigger: idle schedules load via requestIdleCallback', () => {
    const scope = effectScope();
    const result = scope.run(() => useScript('/idle.js', { trigger: 'idle' }))!;
    expect(result.script.value).toBeNull();
    flushIdle();
    expect(result.script.value).not.toBeNull();
    expect((result.script.value as any).src).toContain('/idle.js');
    scope.stop();
  });

  it('trigger: visible without target falls back to load', () => {
    const scope = effectScope();
    const result = scope.run(() => useScript('/visible.js', { trigger: 'visible' }))!;
    expect(result.script.value).not.toBeNull();
    scope.stop();
  });

  it('remove() clears loaded and error state', async () => {
    const result = useScript('/test.js', { trigger: 'manual' });
    result.load();
    triggerScriptLoad(result.script.value as unknown as MockScriptElement);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.loaded.value).toBe(true);
    result.remove();
    expect(result.loaded.value).toBe(false);
    expect(result.error.value).toBe(false);
  });

  it('does not load in SSR (no document)', () => {
    const origDoc = (globalThis as any).document;
    const origWindow = (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).window;

    const result = useScript('/test.js', { trigger: 'load' });
    expect(result.script.value).toBeNull();

    (globalThis as any).document = origDoc;
    (globalThis as any).window = origWindow;
  });

  it('trigger: load loads immediately outside component setup', () => {
    const result = useScript('/immediate.js', { trigger: 'load' });
    expect(result.script.value).not.toBeNull();
    expect((result.script.value as any).src).toContain('/immediate.js');
  });

  it('trigger: manual does not auto-load', () => {
    const result = useScript('/manual.js', { trigger: 'manual' });
    expect(result.script.value).toBeNull();
    expect(mockHead.querySelectorAll('script').length).toBe(0);
  });

  it('multiple useScript calls create separate scripts', () => {
    const r1 = useScript('/a.js', { trigger: 'manual' });
    const r2 = useScript('/b.js', { trigger: 'manual' });
    r1.load();
    r2.load();
    expect(mockHead.querySelectorAll('script').length).toBe(2);
    expect(r1.script.value).not.toBe(r2.script.value);
  });

  it('waitForLoad() triggers load if not already loaded', () => {
    const result = useScript('/then.js', { trigger: 'manual' });
    result.waitForLoad();
    expect(result.script.value).not.toBeNull();
  });

  it('referrerPolicy is set', () => {
    const result = useScript('/test.js', { trigger: 'manual', referrerPolicy: 'no-referrer' });
    result.load();
    expect((result.script.value as any).referrerPolicy).toBe('no-referrer');
  });
});
