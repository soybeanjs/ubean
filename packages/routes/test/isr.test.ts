/**
 * P9-03 ISR (Incremental Static Regeneration) 单元测试
 *
 * 验证 `@ubean/routes` 的 ISR 缓存助手:
 * - `buildIsrCacheKey`: key 前缀 `isr:`
 * - `setIsrCache` / `getIsrCache`: 基本 TTL 缓存
 * - `getStaleIsrCache`: SWR 读取(过期仍返回)
 * - `isIsrEntryStale`: 过期判定
 * - `serveIsr`: 三种路径(HIT / STALE+SWR / MISS)
 * - `invalidateIsrCache` / `invalidateIsrCachePattern`: 失效
 *
 * 使用结构兼容的内存 store,不依赖 `@ubean/server`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildIsrCacheKey,
  setIsrCache,
  getIsrCache,
  getStaleIsrCache,
  isIsrEntryStale,
  serveIsr,
  invalidateIsrCache,
  invalidateIsrCachePattern
} from '../src/isr';
import type { IsrCacheStore } from '../src/isr';

/**
 * 构造一个内存 IsrCacheStore(与 @ubean/server 的 createMemoryStore 结构兼容)。
 * `peek` 返回 entry(无论是否过期);`get` 在过期时返回 undefined(不删除,保留供 peek/SWR 读取)。
 *
 * 注意:内部 Map 暴露为 `store` 属性(无下划线前缀),与 `isr.ts` 中
 * `invalidateIsrCachePattern` / `isIsrEntryStale` 访问的 `memStore.store` 一致。
 */
function createTestStore(): IsrCacheStore & { store: Map<string, any> } {
  const store = new Map<string, any>();
  return {
    store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        // 不删除过期 entry —— 保留供 peek() / SWR 读取旧内容。
        // 删除副作用会导致 getStaleIsrCache 无法获取 stale entry。
        return undefined;
      }
      return entry;
    },
    async peek(key) {
      return store.get(key);
    },
    async set(key, entry, ttl) {
      const now = Date.now();
      store.set(key, {
        ...entry,
        createdAt: now,
        expiresAt: now + ttl * 1000
      });
    },
    async delete(key) {
      return store.delete(key);
    },
    async clear() {
      store.clear();
    }
  };
}

/** 简化的 Context mock,仅用于 serveIsr 的第一个参数。 */
function mockCtx(): any {
  return { req: { url: 'http://localhost/' } };
}

describe('P9-03 ISR cache helpers', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('buildIsrCacheKey', () => {
    it('prefixes with "isr:"', () => {
      expect(buildIsrCacheKey('/foo')).toBe('isr:/foo');
      expect(buildIsrCacheKey('/')).toBe('isr:/');
    });
  });

  describe('setIsrCache / getIsrCache', () => {
    it('round-trips an HTML entry', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>hello</html>',
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        },
        60
      );
      const entry = await getIsrCache(store, '/page');
      expect(entry).toBeDefined();
      expect(entry!.html).toBe('<html>hello</html>');
      expect(entry!.status).toBe(200);
      expect(entry!.headers['Content-Type']).toBe('text/html');
    });

    it('returns undefined for missing key', async () => {
      const entry = await getIsrCache(store, '/missing');
      expect(entry).toBeUndefined();
    });

    it('returns undefined after TTL expires', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>expired</html>',
          status: 200,
          headers: {}
        },
        0
      ); // 0 second TTL → immediately expired
      // Tiny sleep to ensure Date.now() advances past expiresAt
      await new Promise(r => setTimeout(r, 5));
      const entry = await getIsrCache(store, '/page');
      expect(entry).toBeUndefined();
    });
  });

  describe('getStaleIsrCache', () => {
    it('returns entry even after TTL expires (with peek)', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>stale</html>',
          status: 200,
          headers: {}
        },
        0
      );
      await new Promise(r => setTimeout(r, 5));
      const fresh = await getIsrCache(store, '/page');
      expect(fresh).toBeUndefined();
      const stale = await getStaleIsrCache(store, '/page');
      expect(stale).toBeDefined();
      expect(stale!.html).toBe('<html>stale</html>');
    });

    it('falls back to get when peek is unavailable (no SWR)', async () => {
      const noPeekStore: IsrCacheStore = {
        get: store.get,
        set: store.set,
        delete: store.delete,
        clear: store.clear
        // no peek
      };
      await setIsrCache(
        noPeekStore,
        '/page',
        {
          html: '<html>x</html>',
          status: 200,
          headers: {}
        },
        0
      );
      await new Promise(r => setTimeout(r, 5));
      const stale = await getStaleIsrCache(noPeekStore, '/page');
      // Without peek, falls back to get which returns undefined for expired
      expect(stale).toBeUndefined();
    });
  });

  describe('isIsrEntryStale', () => {
    it('returns false for fresh entry', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: 'x',
          status: 200,
          headers: {}
        },
        60
      );
      expect(isIsrEntryStale('/page', store)).toBe(false);
    });

    it('returns true for expired entry', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: 'x',
          status: 200,
          headers: {}
        },
        0
      );
      await new Promise(r => setTimeout(r, 5));
      expect(isIsrEntryStale('/page', store)).toBe(true);
    });

    it('returns false for missing entry', () => {
      expect(isIsrEntryStale('/missing', store)).toBe(false);
    });
  });

  describe('serveIsr', () => {
    it('returns cached HTML with X-ISR: HIT on fresh hit', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>cached</html>',
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        },
        60
      );

      const render = vi.fn(async () => ({ html: '<html>fresh</html>' }));
      const response = await serveIsr(mockCtx(), {
        pathname: '/page',
        rule: { ttl: 60 },
        store,
        render
      });

      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(200);
      expect(await response!.text()).toBe('<html>cached</html>');
      expect(response!.headers.get('X-ISR')).toBe('HIT');
      expect(render).not.toHaveBeenCalled();
    });

    it('renders and caches on MISS (returns X-ISR: MISS)', async () => {
      const render = vi.fn(async () => ({
        html: '<html>rendered</html>',
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));
      const response = await serveIsr(mockCtx(), {
        pathname: '/page',
        rule: { ttl: 60 },
        store,
        render
      });

      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(200);
      expect(await response!.text()).toBe('<html>rendered</html>');
      expect(response!.headers.get('X-ISR')).toBe('MISS');
      expect(render).toHaveBeenCalledTimes(1);

      // Verify cached
      const cached = await getIsrCache(store, '/page');
      expect(cached).toBeDefined();
      expect(cached!.html).toBe('<html>rendered</html>');
    });

    it('does not cache non-2xx responses', async () => {
      const render = vi.fn(async () => ({
        html: '<html>error</html>',
        status: 500,
        headers: {}
      }));
      const response = await serveIsr(mockCtx(), {
        pathname: '/page',
        rule: { ttl: 60 },
        store,
        render
      });

      expect(response!.status).toBe(500);
      expect(response!.headers.get('X-ISR')).toBe('MISS');
      const cached = await getIsrCache(store, '/page');
      expect(cached).toBeUndefined();
    });

    it('returns stale HTML with X-ISR: STALE on swr + expired', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>old</html>',
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        },
        0
      );
      await new Promise(r => setTimeout(r, 5));

      const render = vi.fn(async () => ({ html: '<html>new</html>' }));
      const response = await serveIsr(mockCtx(), {
        pathname: '/page',
        rule: { ttl: 60, swr: true },
        store,
        render
      });

      expect(response).toBeInstanceOf(Response);
      expect(response!.headers.get('X-ISR')).toBe('STALE');
      expect(await response!.text()).toBe('<html>old</html>');
      // render should NOT be called synchronously (background regen)
      // Wait a tick for background regen
      await new Promise(r => setTimeout(r, 10));
      expect(render).toHaveBeenCalledTimes(1);

      // After background regen, cache should be updated
      const cached = await getIsrCache(store, '/page');
      expect(cached).toBeDefined();
      expect(cached!.html).toBe('<html>new</html>');
    });

    it('synchronously regenerates on expired + swr=false', async () => {
      await setIsrCache(
        store,
        '/page',
        {
          html: '<html>old</html>',
          status: 200,
          headers: {}
        },
        0
      );
      await new Promise(r => setTimeout(r, 5));

      const render = vi.fn(async () => ({
        html: '<html>regenerated</html>',
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));
      const response = await serveIsr(mockCtx(), {
        pathname: '/page',
        rule: { ttl: 60, swr: false },
        store,
        render
      });

      expect(response!.headers.get('X-ISR')).toBe('MISS');
      expect(await response!.text()).toBe('<html>regenerated</html>');
      expect(render).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateIsrCache', () => {
    it('deletes a single path', async () => {
      await setIsrCache(store, '/a', { html: 'a', status: 200, headers: {} }, 60);
      await setIsrCache(store, '/b', { html: 'b', status: 200, headers: {} }, 60);
      const deleted = await invalidateIsrCache(store, '/a');
      expect(deleted).toBe(true);
      expect(await getIsrCache(store, '/a')).toBeUndefined();
      expect(await getIsrCache(store, '/b')).toBeDefined();
    });
  });

  describe('invalidateIsrCachePattern', () => {
    it('deletes all matching paths', async () => {
      await setIsrCache(store, '/blog/a', { html: 'a', status: 200, headers: {} }, 60);
      await setIsrCache(store, '/blog/b', { html: 'b', status: 200, headers: {} }, 60);
      await setIsrCache(store, '/about', { html: 'about', status: 200, headers: {} }, 60);
      const count = await invalidateIsrCachePattern(store, /^\/blog\//);
      expect(count).toBe(2);
      expect(await getIsrCache(store, '/blog/a')).toBeUndefined();
      expect(await getIsrCache(store, '/blog/b')).toBeUndefined();
      expect(await getIsrCache(store, '/about')).toBeDefined();
    });

    it('returns 0 when underlying store has no internal Map', async () => {
      const opaqueStore: IsrCacheStore = {
        get: store.get,
        set: store.set,
        delete: store.delete,
        clear: store.clear
      };
      const count = await invalidateIsrCachePattern(opaqueStore, /.*/);
      expect(count).toBe(0);
    });
  });
});
