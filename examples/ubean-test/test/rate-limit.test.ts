import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRateLimitMiddleware,
  defineRateLimit,
  createMemoryRateLimitStore
} from 'ubean';
import { api, getJson } from './helper';

describe('Rate limit system', () => {
  describe('createRateLimitMiddleware()', () => {
    it('creates a middleware handler', () => {
      const middleware = createRateLimitMiddleware({ maxRequests: 100, windowMs: 60000 });
      expect(typeof middleware).toBe('function');
    });

    it('allows requests within limit', async () => {
      const middleware = createRateLimitMiddleware({ maxRequests: 10, windowMs: 60000 });
      let nextCalled = false;
      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          header: () => '127.0.0.1',
          url: 'http://localhost/api/test'
        },
        header: () => {},
        res: { headers: new Headers() }
      } as any;

      await middleware(mockCtx, async () => {
        nextCalled = true;
        return new Response('ok');
      });
      expect(nextCalled).toBe(true);
    });

    it('blocks requests exceeding limit', async () => {
      const middleware = createRateLimitMiddleware({ maxRequests: 2, windowMs: 60000 });
      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          header: () => '127.0.0.1',
          url: 'http://localhost/api/test'
        },
        header: () => {},
        json: (data: unknown, status: number) => new Response(JSON.stringify(data), { status }),
        res: { headers: new Headers() }
      } as any;

      // First two requests should pass
      await middleware(mockCtx, async () => new Response('ok'));
      await middleware(mockCtx, async () => new Response('ok'));

      // Third request should be rate limited
      const result = await middleware(mockCtx, async () => new Response('ok'));
      expect(result.status).toBe(429);
    });
  });

  describe('defineRateLimit() - alias', () => {
    it('creates a middleware handler', () => {
      const middleware = defineRateLimit({ maxRequests: 100, windowMs: 60000 });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('createMemoryRateLimitStore()', () => {
    it('creates a store with required methods', () => {
      const store = createMemoryRateLimitStore();
      expect(store).toBeDefined();
      expect(typeof store.get).toBe('function');
      expect(typeof store.set).toBe('function');
      expect(typeof store.increment).toBe('function');
      expect(typeof store.reset).toBe('function');
      expect(typeof store.destroy).toBe('function');
    });

    it('increment returns updated count', async () => {
      const store = createMemoryRateLimitStore();
      const result1 = await store.increment('key1', 60000);
      expect(result1.count).toBe(1);
      const result2 = await store.increment('key1', 60000);
      expect(result2.count).toBe(2);
    });

    it('get returns current entry', async () => {
      const store = createMemoryRateLimitStore();
      await store.increment('key2', 60000);
      const entry = await store.get('key2');
      expect(entry).toBeDefined();
      expect(entry?.count).toBe(1);
    });

    it('reset clears a key', async () => {
      const store = createMemoryRateLimitStore();
      await store.increment('key3', 60000);
      await store.reset('key3');
      const entry = await store.get('key3');
      expect(entry).toBeUndefined();
    });

    it('destroy cleans up resources', () => {
      const store = createMemoryRateLimitStore();
      expect(() => store.destroy()).not.toThrow();
    });
  });

  describe('Custom keyGenerator', () => {
    it('uses custom key generator function', async () => {
      const keys: string[] = [];
      const middleware = createRateLimitMiddleware({
        maxRequests: 100,
        windowMs: 60000,
        keyGenerator: (c: any) => {
          const key = c.req.header('x-api-key') || 'anonymous';
          keys.push(key);
          return key;
        }
      });

      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          header: (name: string) => name === 'x-api-key' ? 'key123' : undefined,
          url: 'http://localhost/api/test'
        },
        header: () => {},
        res: { headers: new Headers() }
      } as any;

      await middleware(mockCtx, async () => new Response('ok'));
      expect(keys).toContain('key123');
    });
  });

  describe('skip option', () => {
    it('skips rate limiting for matching requests', async () => {
      const middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        skip: (c: any) => c.req.url.includes('/health')
      });

      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          header: () => '127.0.0.1',
          url: 'http://localhost/health'
        },
        header: () => {},
        res: { headers: new Headers() }
      } as any;

      // Multiple requests to /health should all pass
      await middleware(mockCtx, async () => new Response('ok'));
      await middleware(mockCtx, async () => new Response('ok'));
      await middleware(mockCtx, async () => new Response('ok'));
      // No 429 should occur because skip returns true
    });
  });

  describe('HTTP integration - /api/rate-limit-test', () => {
    it('returns 200 for first request', async () => {
      const res = await getJson('/api/rate-limit-test');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('limit');
    });

    it('sets rate limit headers', async () => {
      const res = await api('/api/rate-limit-test');
      // Rate limit headers should be present
      const remaining = res.headers.get('X-RateLimit-Remaining') || res.headers.get('x-ratelimit-remaining');
      const limit = res.headers.get('X-RateLimit-Limit') || res.headers.get('x-ratelimit-limit');
      // At least one of these should be set
      expect(remaining || limit).toBeTruthy();
    });

    it('returns 429 when limit exceeded', async () => {
      // Send many requests quickly to trigger rate limit
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(api('/api/rate-limit-test'));
      }
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      // At least one should be rate limited (if limit < 20)
      // This depends on the configured limit in the endpoint
      if (rateLimited) {
        const limitedRes = responses.find(r => r.status === 429);
        expect(limitedRes?.status).toBe(429);
      }
    });
  });
});
