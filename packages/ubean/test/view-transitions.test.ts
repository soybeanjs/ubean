import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type MockGlobal = { document?: Record<string, unknown>; navigation?: Record<string, unknown> };

describe('View Transitions', () => {
  let supportsViewTransitions: typeof import('../src/runtime/vue/view-transitions').supportsViewTransitions;
  let withViewTransition: typeof import('../src/runtime/vue/view-transitions').withViewTransition;
  let getNavigationType: typeof import('../src/runtime/vue/view-transitions').getNavigationType;

  beforeEach(async () => {
    vi.resetModules();
    delete (globalThis as unknown as MockGlobal).document;
    delete (globalThis as unknown as MockGlobal).navigation;
    const mod = await import('../src/runtime/vue/view-transitions');
    supportsViewTransitions = mod.supportsViewTransitions;
    withViewTransition = mod.withViewTransition;
    getNavigationType = mod.getNavigationType;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('supportsViewTransitions', () => {
    it('returns false when document is undefined (SSR)', () => {
      delete (globalThis as unknown as MockGlobal).document;
      expect(supportsViewTransitions()).toBe(false);
    });

    it('returns false when startViewTransition is not available', () => {
      (globalThis as unknown as MockGlobal).document = {};
      expect(supportsViewTransitions()).toBe(false);
    });

    it('returns true when startViewTransition is available', () => {
      (globalThis as unknown as MockGlobal).document = {
        startViewTransition: vi.fn()
      };
      expect(supportsViewTransitions()).toBe(true);
    });
  });

  describe('withViewTransition', () => {
    it('runs callback directly when disabled', async () => {
      delete (globalThis as unknown as MockGlobal).document;
      const callback = vi.fn().mockResolvedValue('result');
      const result = await withViewTransition(callback, { enabled: false });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('runs callback directly when View Transitions not supported', async () => {
      (globalThis as unknown as MockGlobal).document = {};
      const callback = vi.fn().mockResolvedValue(42);
      const result = await withViewTransition(callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(42);
    });

    it('uses startViewTransition when supported', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      };
      const startVT = vi.fn((cb: () => Promise<void>) => {
        cb();
        return mockTransition;
      });
      (globalThis as unknown as MockGlobal).document = { startViewTransition: startVT };

      const callback = vi.fn().mockResolvedValue('hello');
      const result = await withViewTransition(callback);

      expect(startVT).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe('hello');
    });

    it('returns callback result through transition', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      };
      (globalThis as unknown as MockGlobal).document = {
        startViewTransition: (cb: () => Promise<void>) => {
          cb();
          return mockTransition;
        }
      };

      const result = await withViewTransition(async () => ({ foo: 'bar' }));
      expect(result).toEqual({ foo: 'bar' });
    });

    it('propagates callback errors', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      };
      (globalThis as unknown as MockGlobal).document = {
        startViewTransition: (cb: () => Promise<void>) => {
          cb().catch(() => {});
          return mockTransition;
        }
      };

      const error = new Error('test error');
      await expect(
        withViewTransition(async () => {
          throw error;
        })
      ).rejects.toThrow('test error');
    });

    it('propagates transition.finished errors not from callback', async () => {
      const mockTransition = {
        finished: Promise.reject(new Error('transition failed')),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      };
      (globalThis as unknown as MockGlobal).document = {
        startViewTransition: () => mockTransition
      };

      await expect(withViewTransition(async () => 'ok')).rejects.toThrow('transition failed');
    });

    it('handles synchronous callback return', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      };
      (globalThis as unknown as MockGlobal).document = {
        startViewTransition: (cb: () => void) => {
          cb();
          return mockTransition;
        }
      };

      const result = await withViewTransition(() => 'sync-result');
      expect(result).toBe('sync-result');
    });
  });

  describe('getNavigationType', () => {
    it('returns push when navigation API is not available', () => {
      delete (globalThis as unknown as MockGlobal).navigation;
      expect(getNavigationType()).toBe('push');
    });

    it('returns push when navigation has no currentEntry', () => {
      (globalThis as unknown as MockGlobal).navigation = { transitionType: 'traverse' };
      expect(getNavigationType()).toBe('push');
    });

    it('returns transitionType when navigation API is available', () => {
      (globalThis as unknown as MockGlobal).navigation = {
        currentEntry: {},
        transitionType: 'traverse'
      };
      expect(getNavigationType()).toBe('traverse');

      (globalThis as unknown as MockGlobal).navigation!.transitionType = 'replace';
      expect(getNavigationType()).toBe('replace');

      (globalThis as unknown as MockGlobal).navigation!.transitionType = 'reload';
      expect(getNavigationType()).toBe('reload');
    });

    it('defaults to push on error', () => {
      Object.defineProperty(globalThis, 'navigation', {
        get() {
          throw new Error('access denied');
        },
        configurable: true
      });
      expect(getNavigationType()).toBe('push');
    });
  });
});
