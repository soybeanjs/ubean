import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineDataKey,
  useData,
  invalidateData,
  invalidateAll,
  clearDataCache,
  hasData,
  declareDependencies,
  withDependencies,
  getInvalidatedKeysForAction,
  createInternalFetch
} from '../src/runtime/pages/data';

describe('data cache', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('defines data keys', () => {
    const key1 = defineDataKey('users');
    const key2 = defineDataKey('users');
    expect(typeof key1).toBe('symbol');
    expect(key1).toBe(key2);
  });

  it('fetches and caches data', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { id: 1, name: 'Test' };
    };

    const result1 = await useData({ key: defineDataKey('test'), fetcher });
    const result2 = await useData({ key: defineDataKey('test'), fetcher });

    expect(result1.data).toEqual({ id: 1, name: 'Test' });
    expect(callCount).toBe(1);
    expect(result2.data).toEqual({ id: 1, name: 'Test' });
  });

  it('invalidates data by key', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { count: callCount };
    };

    const key = defineDataKey('counter');
    await useData({ key, fetcher });
    expect(callCount).toBe(1);

    invalidateData(key);
    expect(hasData(key)).toBe(false);

    await useData({ key, fetcher });
    expect(callCount).toBe(2);
  });

  it('invalidates data by tag', async () => {
    const key1 = defineDataKey('list');
    const key2 = defineDataKey('detail');
    let count1 = 0,
      count2 = 0;

    await useData({ key: key1, tags: ['users'], fetcher: async () => ({ n: ++count1 }) });
    await useData({ key: key2, tags: ['users', 'posts'], fetcher: async () => ({ n: ++count2 }) });

    expect(hasData(key1)).toBe(true);
    expect(hasData(key2)).toBe(true);

    const invalidated = invalidateData('users');
    expect(invalidated).toBe(2);
    expect(hasData(key1)).toBe(false);
    expect(hasData(key2)).toBe(false);
  });

  it('invalidateAll clears all cache', async () => {
    const key1 = defineDataKey('a');
    const key2 = defineDataKey('b');

    await useData({ key: key1, fetcher: async () => 1 });
    await useData({ key: key2, fetcher: async () => 2 });

    expect(hasData(key1)).toBe(true);
    expect(hasData(key2)).toBe(true);

    invalidateAll();

    expect(hasData(key1)).toBe(false);
    expect(hasData(key2)).toBe(false);
  });

  it('returns error when fetcher throws', async () => {
    const result = await useData({
      key: defineDataKey('error'),
      fetcher: async () => {
        throw new Error('Fetch failed');
      }
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Fetch failed');
  });

  it('provides invalidate function in result', async () => {
    let callCount = 0;
    const key = defineDataKey('invalidate-test');
    const result = await useData({
      key,
      fetcher: async () => ({ n: ++callCount })
    });

    expect(callCount).toBe(1);
    result.invalidate();
    expect(hasData(key)).toBe(false);
  });

  it('supports TTL expiration', async () => {
    let callCount = 0;
    const key = defineDataKey('ttl');
    const fetcher = async () => ({ n: ++callCount });

    await useData({ key, fetcher, ttl: 50 });
    expect(callCount).toBe(1);

    await new Promise(r => setTimeout(r, 60));

    await useData({ key, fetcher, ttl: 50 });
    expect(callCount).toBe(2);
  });

  it('supports context-scoped caches', async () => {
    const ctx1 = {};
    const ctx2 = {};
    const key = defineDataKey('scoped');
    let callCount = 0;
    const fetcher = async () => ({ n: ++callCount });

    await useData({ key, fetcher }, ctx1);
    await useData({ key, fetcher }, ctx2);

    expect(callCount).toBe(2);
  });

  it('hasData returns false for non-existent keys', () => {
    expect(hasData(defineDataKey('nonexistent'))).toBe(false);
  });
});

describe('dependencies', () => {
  beforeEach(() => {
    clearDataCache();
  });

  it('declareDependencies returns declaration', () => {
    const deps = declareDependencies({ keys: [defineDataKey('users')], tags: ['user-data'] });
    expect(deps.keys).toHaveLength(1);
    expect(deps.tags).toEqual(['user-data']);
  });

  it('withDependencies wraps a function', async () => {
    const fn = withDependencies(async () => 'result', { keys: [defineDataKey('test')] });
    expect(await fn()).toBe('result');
  });

  it('getInvalidatedKeysForAction invalidates mapped keys/tags', async () => {
    const key1 = defineDataKey('users-list');
    const key2 = defineDataKey('posts-list');

    await useData({ key: key1, tags: ['users'], fetcher: async () => [1, 2, 3] });
    await useData({ key: key2, tags: ['posts'], fetcher: async () => [4, 5] });

    const count = getInvalidatedKeysForAction('createUser', {
      createUser: ['users'],
      createPost: ['posts']
    });

    expect(count).toBe(1);
    expect(hasData(key1)).toBe(false);
    expect(hasData(key2)).toBe(true);
  });

  it('getInvalidatedKeysForAction returns 0 for unmapped actions', () => {
    const count = getInvalidatedKeysForAction('unknownAction', { createUser: ['users'] });
    expect(count).toBe(0);
  });
});

describe('createInternalFetch', () => {
  it('forwards specified headers from incoming request', () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response('ok');
    };

    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;

    try {
      const c = {
        req: {
          header: (name: string) => {
            if (name === 'cookie') return 'session=abc123';
            if (name === 'authorization') return 'Bearer token123';
            if (name === 'x-request-id') return 'req-456';
            return undefined;
          }
        }
      };

      const internalFetch = createInternalFetch(c);
      internalFetch('/api/test');

      expect(capturedHeaders).toBeDefined();
      const headers = new Headers(capturedHeaders as HeadersInit);
      expect(headers.get('cookie')).toBe('session=abc123');
      expect(headers.get('authorization')).toBe('Bearer token123');
      expect(headers.get('x-request-id')).toBe('req-456');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it('supports custom additional headers', () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response('ok');
    };

    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;

    try {
      const c = {
        req: {
          header: () => undefined
        }
      };

      const internalFetch = createInternalFetch(c, {
        headers: { 'x-internal': 'true' }
      });
      internalFetch('/test');

      const headers = new Headers(capturedHeaders as HeadersInit);
      expect(headers.get('x-internal')).toBe('true');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it('supports custom forwardHeaders list', () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response('ok');
    };

    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;

    try {
      const c = {
        req: {
          header: (name: string) => {
            if (name === 'x-custom') return 'custom-value';
            if (name === 'cookie') return 'session=xyz';
            return undefined;
          }
        }
      };

      const internalFetch = createInternalFetch(c, {
        forwardHeaders: ['x-custom']
      });
      internalFetch('/test');

      const headers = new Headers(capturedHeaders as HeadersInit);
      expect(headers.get('x-custom')).toBe('custom-value');
      expect(headers.get('cookie')).toBeNull();
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it('prepends baseURL to relative paths', () => {
    let capturedUrl: string | undefined;
    const mockFetch = async (url: string) => {
      capturedUrl = url;
      return new Response('ok');
    };

    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;

    try {
      const c = { req: { header: () => undefined } };
      const internalFetch = createInternalFetch(c, { baseURL: 'http://localhost:9527' });
      internalFetch('/api/users');

      expect(capturedUrl).toBe('http://localhost:9527/api/users');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
