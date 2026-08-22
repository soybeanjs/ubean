import { describe, it, expect } from 'vitest';
import {
  createMemoryStore,
  useCacheStore,
  clearCacheStore,
  createCacheMiddleware,
  cachedEventHandler,
  invalidateRouteCache,
  resolveRouteCacheRules
} from 'ubean';
import type { UbeanContext } from 'ubean';
import { getJson, postJson } from './helper';

describe('Cache system', () => {
  describe('createMemoryStore() - memory storage', () => {
    it('creates a store with get/set/delete/clear methods', () => {
      const store = createMemoryStore(100);
      expect(store).toBeDefined();
      expect(typeof store.get).toBe('function');
      expect(typeof store.set).toBe('function');
      expect(typeof store.delete).toBe('function');
      expect(typeof store.clear).toBe('function');
    });

    it('set/get stores and retrieves cache entries', async () => {
      const store = createMemoryStore(100);
      await store.set(
        'key1',
        {
          body: new ArrayBuffer(0),
          headers: { 'Content-Type': 'application/json' },
          status: 200,
          statusText: 'OK'
        },
        60
      );
      const entry = await store.get('key1');
      expect(entry).toBeDefined();
      expect(entry?.status).toBe(200);
      expect(entry?.headers['Content-Type']).toBe('application/json');
    });

    it('get returns undefined for missing key', async () => {
      const store = createMemoryStore(100);
      const entry = await store.get('nonexistent');
      expect(entry).toBeUndefined();
    });

    it('delete removes a key', async () => {
      const store = createMemoryStore(100);
      await store.set(
        'todelete',
        {
          body: new ArrayBuffer(0),
          headers: {},
          status: 200,
          statusText: 'OK'
        },
        60
      );
      const deleted = await store.delete('todelete');
      expect(deleted).toBe(true);
      const entry = await store.get('todelete');
      expect(entry).toBeUndefined();
    });

    it('clear removes all keys', async () => {
      const store = createMemoryStore(100);
      await store.set('a', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
      await store.set('b', { body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' }, 60);
      await store.clear();
      expect(await store.get('a')).toBeUndefined();
      expect(await store.get('b')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts entries when max exceeded', async () => {
      const store = createMemoryStore(3);
      const mkEntry = () => ({ body: new ArrayBuffer(0), headers: {}, status: 200, statusText: 'OK' });
      await store.set('k1', mkEntry(), 600);
      await store.set('k2', mkEntry(), 600);
      await store.set('k3', mkEntry(), 600);
      await store.set('k4', mkEntry(), 600);
      // After eviction, at least one of k1-k3 should be evicted
      const k1 = await store.get('k1');
      const k2 = await store.get('k2');
      const k3 = await store.get('k3');
      const k4 = await store.get('k4');
      // k4 should exist (most recently added)
      expect(k4).toBeDefined();
      // At least one of the older entries should be evicted
      const evicted = [k1, k2, k3].filter(e => e === undefined).length;
      expect(evicted).toBeGreaterThan(0);
    });
  });

  describe('TTL expiration', () => {
    it('expires entries after TTL', async () => {
      const store = createMemoryStore(100);
      await store.set(
        'temp',
        {
          body: new ArrayBuffer(0),
          headers: {},
          status: 200,
          statusText: 'OK'
        },
        1
      );
      expect(await store.get('temp')).toBeDefined();
      await new Promise(r => setTimeout(r, 1100));
      expect(await store.get('temp')).toBeUndefined();
    });

    it('keeps entries with long TTL', async () => {
      const store = createMemoryStore(100);
      await store.set(
        'persistent',
        {
          body: new ArrayBuffer(0),
          headers: {},
          status: 200,
          statusText: 'OK'
        },
        3600
      );
      await new Promise(r => setTimeout(r, 100));
      expect(await store.get('persistent')).toBeDefined();
    });
  });

  describe('useCacheStore() / clearCacheStore()', () => {
    it('useCacheStore returns a store (creates default if none set)', () => {
      clearCacheStore();
      const store = useCacheStore();
      expect(store).toBeDefined();
      expect(typeof store.get).toBe('function');
    });

    it('clearCacheStore resets the store', () => {
      useCacheStore();
      clearCacheStore();
      const store2 = useCacheStore();
      // After clear, a new store is created
      expect(store2).toBeDefined();
    });
  });

  describe('resolveRouteCacheRules()', () => {
    it('extracts cache rules from route rules', () => {
      const cacheRules = resolveRouteCacheRules({
        '/api/**': { cache: { ttl: 60 } }
      });
      expect(Object.keys(cacheRules).length).toBeGreaterThan(0);
    });

    it('returns empty object when no cache rules', () => {
      const cacheRules = resolveRouteCacheRules({
        '/api/**': { headers: {} }
      });
      expect(Object.keys(cacheRules).length).toBe(0);
    });
  });

  describe('createCacheMiddleware()', () => {
    it('creates a middleware handler', () => {
      const middleware = createCacheMiddleware({ rules: { '/api/**': { ttl: 60 } } });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('cachedEventHandler() / invalidateRouteCache()', () => {
    it('cachedEventHandler creates a cached handler', () => {
      const handler = cachedEventHandler(
        (async () => ({ time: Date.now() })) as unknown as (c: UbeanContext) => Promise<Response>,
        { ttl: 60 }
      );
      expect(typeof handler).toBe('function');
    });

    it('invalidateRouteCache does not throw', () => {
      expect(() => invalidateRouteCache('/test-path')).not.toThrow();
    });
  });

  describe('HTTP integration - /api/cache-test (cachedEventHandler)', () => {
    it('returns cached result on second call', async () => {
      await postJson('/api/cache-test');
      const res1 = await getJson('/api/cache-test');
      const res2 = await getJson('/api/cache-test');
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect((res1.data as { timestamp: number }).timestamp).toBe((res2.data as { timestamp: number }).timestamp);
      expect(res2.headers.get('x-cache')).toBe('HIT');
    });
  });
});
