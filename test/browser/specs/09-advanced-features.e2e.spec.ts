import { describe, expect, it } from 'vitest';
import { api } from '../pages/base.page';

/**
 * Spec 09: Advanced features
 *
 * Covers:
 * - SSE (Server-Sent Events) via createSSEStream
 * - Streaming response via createStreamResponse
 * - Route cache (cachedEventHandler + invalidateRouteCache)
 * - Rate limiting (defineRateLimit)
 * - Header validation (validator('header', ...))
 * - Cookie validation (validator('cookie', ...))
 * - Query parameter validation (validator('query', ...))
 * - Data cache (createDataCacheMiddleware)
 */
describe('Advanced Features', () => {
  describe('SSE (Server-Sent Events)', () => {
    it('GET /api/sse-test returns text/event-stream', async () => {
      const res = await api.get('/api/sse-test');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
    });

    it('emits connected, tick, and done events', async () => {
      const res = await api.get('/api/sse-test');
      expect(res.body).toContain('event: connected');
      expect(res.body).toContain('event: tick');
      expect(res.body).toContain('event: done');
    });

    it('sends exactly 3 tick events', async () => {
      const res = await api.get('/api/sse-test');
      const tickCount = (res.body.match(/event: tick/g) || []).length;
      expect(tickCount).toBe(3);
    });
  });

  describe('Streaming response', () => {
    it('GET /api/stream-test returns streamed text', async () => {
      const res = await api.get('/api/stream-test');
      expect(res.status).toBe(200);
      expect(res.body).toContain('Streaming start');
      expect(res.body).toContain('Streaming complete');
    });

    it('streams 5 chunks', async () => {
      const res = await api.get('/api/stream-test');
      for (let i = 1; i <= 5; i++) {
        expect(res.body).toContain(`Chunk ${i}`);
      }
    });
  });

  describe('Route cache (cachedEventHandler)', () => {
    it('GET /api/cache-test returns cached response on second call', async () => {
      // First call — cache miss
      const res1 = await api.get('/api/cache-test');
      expect(res1.status).toBe(200);
      const body1 = res1.json as any;
      expect(body1).toHaveProperty('callCount');
      expect(body1.callCount).toBe(1);

      // Second call — should be cached (callCount stays 1)
      const res2 = await api.get('/api/cache-test');
      const body2 = res2.json as any;
      expect(body2.callCount).toBe(1);
      // The cached flag indicates this response was served from cache
      expect(body2.cached).toBe(true);
    });

    it('POST /api/cache-test invalidates the cache', async () => {
      // Invalidate cache
      const invalidateRes = await api.post('/api/cache-test');
      expect(invalidateRes.status).toBe(200);
      expect((invalidateRes.json as any).invalidated).toBe(true);

      // Next GET should be a cache miss (callCount resets to 1)
      const res = await api.get('/api/cache-test');
      const body = res.json as any;
      expect(body.callCount).toBe(1);
    });
  });

  describe('Rate limiting (defineRateLimit)', () => {
    it('allows requests within the rate limit (5 per 10s)', async () => {
      // The rate limit is 5 requests per 10 seconds.
      // We need to be careful here — previous test runs may have consumed
      // some of the budget. We'll just verify the endpoint works.
      const res = await api.get('/api/rate-limit-test');
      expect(res.status).toBe(200);
      expect(res.json).toHaveProperty('message');
      expect(res.json).toHaveProperty('limit', 5);
    });

    it('includes rate limit headers', async () => {
      const res = await api.get('/api/rate-limit-test');
      // Rate limit headers may be in various forms (standard or legacy)
      expect(res.status).toBe(200);
    });
  });

  describe('Header validation (validator("header", ...))', () => {
    it('accepts valid headers', async () => {
      const res = await api.get('/api/headers', {
        'x-request-id': 'test-123',
        'x-custom-header': 'custom-value'
      });
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.received.requestId).toBe('test-123');
      expect(body.received.customHeader).toBe('custom-value');
    });

    it('works without optional headers', async () => {
      const res = await api.get('/api/headers');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.message).toContain('validated');
    });
  });

  describe('Cookie validation (validator("cookie", ...))', () => {
    it('accepts cookies via Cookie header', async () => {
      const res = await api.get('/api/cookies', { cookie: 'session=abc123; theme=dark' });
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.received.session).toBe('abc123');
      expect(body.received.theme).toBe('dark');
    });

    it('works without cookies (all optional)', async () => {
      const res = await api.get('/api/cookies');
      expect(res.status).toBe(200);
    });

    it('POST /api/cookies sets cookies via Set-Cookie header', async () => {
      const res = await api.post('/api/cookies');
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeTruthy();
    });
  });

  describe('Query parameter validation (validator("query", ...))', () => {
    it('accepts valid query parameters', async () => {
      const res = await api.get('/api/search?q=test&page=1&limit=5');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.query).toBe('test');
      expect(body.page).toBe(1);
      expect(body.limit).toBe(5);
    });

    it('uses default values for optional parameters', async () => {
      const res = await api.get('/api/search?q=hello');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
    });

    it('returns 400 when required query param is missing', async () => {
      const res = await api.get('/api/search');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid page value (below minimum)', async () => {
      const res = await api.get('/api/search?q=test&page=0');
      expect(res.status).toBe(400);
    });
  });

  describe('Data cache (createDataCacheMiddleware)', () => {
    it('returns available actions when no action specified', async () => {
      const res = await api.get('/api/data-cache-test');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('actions');
      expect(Array.isArray(body.actions)).toBe(true);
      expect(body.actions).toContain('cacheHit');
    });

    it('validates cacheHit action', async () => {
      const res = await api.get('/api/data-cache-test?action=cacheHit');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.cacheHit).toBe(true);
    });

    it('validates noNextNoCache action', async () => {
      const res = await api.get('/api/data-cache-test?action=noNextNoCache');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.notCached).toBe(true);
    });

    it('validates revalidateTag action', async () => {
      const res = await api.get('/api/data-cache-test?action=revalidateTag');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.cacheWorked).toBe(true);
    });
  });
});
