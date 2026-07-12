import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMemoryStore,
  resolveRouteCacheRules,
  invalidateRouteCache,
  useCacheStore,
  clearCacheStore
} from '../src/runtime/cache';

describe('memory cache store', () => {
  beforeEach(() => {
    clearCacheStore();
  });

  it('stores and retrieves entries', async () => {
    const store = createMemoryStore();
    await store.set(
      'key1',
      {
        body: new TextEncoder().encode('hello').buffer,
        headers: { 'Content-Type': 'text/plain' },
        status: 200,
        statusText: 'OK'
      },
      60
    );

    const entry = await store.get('key1');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe(200);
    expect(new TextDecoder().decode(entry!.body)).toBe('hello');
    expect(entry!.headers['Content-Type']).toBe('text/plain');
  });

  it('returns undefined for non-existent keys', async () => {
    const store = createMemoryStore();
    const entry = await store.get('missing');
    expect(entry).toBeUndefined();
  });

  it('expires entries after ttl', async () => {
    const store = createMemoryStore();
    await store.set(
      'key1',
      {
        body: new TextEncoder().encode('hello').buffer,
        headers: {},
        status: 200,
        statusText: 'OK'
      },
      0.001
    );

    let entry = await store.get('key1');
    expect(entry).toBeDefined();

    await new Promise(r => setTimeout(r, 5));
    entry = await store.get('key1');
    expect(entry).toBeUndefined();
  });

  it('deletes entries', async () => {
    const store = createMemoryStore();
    await store.set(
      'key1',
      {
        body: new ArrayBuffer(0),
        headers: {},
        status: 200,
        statusText: 'OK'
      },
      60
    );

    const deleted = await store.delete('key1');
    expect(deleted).toBe(true);
    const entry = await store.get('key1');
    expect(entry).toBeUndefined();
  });

  it('clears all entries', async () => {
    const store = createMemoryStore();
    await store.set('a', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
    await store.set('b', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
    await store.clear();
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('b')).toBeUndefined();
  });

  it('evicts oldest entries when max size exceeded', async () => {
    const store = createMemoryStore(5);
    for (let i = 0; i < 10; i++) {
      await store.set(
        `key${i}`,
        {
          body: new TextEncoder().encode(String(i)).buffer,
          headers: {},
          status: 200,
          statusText: 'OK'
        },
        60
      );
    }

    expect(await store.get('key0')).toBeUndefined();
    expect(await store.get('key9')).toBeDefined();
  });
});

describe('resolveRouteCacheRules', () => {
  it('extracts cache rules from route rules', () => {
    const rules = resolveRouteCacheRules({
      '/api/**': { cache: { ttl: 300 } },
      '/static/**': { cache: { ttl: 86400, swr: true } },
      '/about': { headers: { 'X-About': 'true' } },
      '/': { redirect: '/home' }
    });

    expect(Object.keys(rules)).toHaveLength(2);
    expect(rules['/api/**'].ttl).toBe(300);
    expect(rules['/static/**'].ttl).toBe(86400);
    expect(rules['/static/**'].swr).toBe(true);
  });

  it('returns empty object when no cache rules defined', () => {
    const rules = resolveRouteCacheRules({
      '/about': { headers: { 'X-Custom': 'true' } }
    });
    expect(Object.keys(rules)).toHaveLength(0);
  });
});

describe('cache key invalidation', () => {
  beforeEach(() => {
    clearCacheStore();
  });

  it('invalidates by exact key', async () => {
    const store = useCacheStore();
    await store.set(
      'GET:/page',
      {
        body: new ArrayBuffer(0),
        headers: {},
        status: 200,
        statusText: 'OK'
      },
      60
    );
    await store.set(
      'GET:/other',
      {
        body: new ArrayBuffer(0),
        headers: {},
        status: 200,
        statusText: 'OK'
      },
      60
    );

    await invalidateRouteCache('GET:/page');
    expect(await store.get('GET:/page')).toBeUndefined();
    expect(await store.get('GET:/other')).toBeDefined();
  });

  it('invalidates all when no pattern given', async () => {
    const store = useCacheStore();
    await store.set('GET:/a', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
    await store.set('GET:/b', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
    await invalidateRouteCache();
    expect(await store.get('GET:/a')).toBeUndefined();
    expect(await store.get('GET:/b')).toBeUndefined();
  });
});

describe('cache middleware', () => {
  beforeEach(() => {
    clearCacheStore();
  });

  it('creates a middleware function', async () => {
    const { createCacheMiddleware } = await import('../src/runtime/cache');
    const mw = createCacheMiddleware({
      rules: { '/page': { ttl: 60 } }
    });
    expect(typeof mw).toBe('function');
  });

  it('caches GET responses', async () => {
    const { createCacheMiddleware } = await import('../src/runtime/cache');
    const store = createMemoryStore();
    let callCount = 0;

    const mw = createCacheMiddleware({
      store,
      rules: { '/data': { ttl: 60 } }
    });

    const c = {
      req: {
        url: 'http://localhost/data',
        method: 'GET',
        header: () => null
      }
    } as any;

    let responseBody = 'response-1';
    const makeRes = (body: string) =>
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });

    c.res = makeRes(responseBody);
    await mw(c, async () => {
      callCount++;
      c.res = makeRes(responseBody);
    });
    expect(callCount).toBe(1);

    c.res = undefined as any;
    const secondRes = await mw(c, async () => {
      callCount++;
      c.res = makeRes('response-2');
      return;
    });

    expect(callCount).toBe(1);
    expect(secondRes).toBeInstanceOf(Response);
    const text = await (secondRes as Response).text();
    expect(text).toBe('response-1');
  });

  it('does not cache POST requests', async () => {
    const { createCacheMiddleware } = await import('../src/runtime/cache');
    const store = createMemoryStore();
    let callCount = 0;

    const mw = createCacheMiddleware({
      store,
      rules: { '/submit': { ttl: 60 } }
    });

    for (let i = 0; i < 3; i++) {
      const c = {
        req: {
          url: 'http://localhost/submit',
          method: 'POST',
          header: () => null
        },
        res: undefined as any
      } as any;
      await mw(c, async () => {
        callCount++;
        c.res = new Response('ok', { status: 200 });
      });
    }

    expect(callCount).toBe(3);
  });
});
