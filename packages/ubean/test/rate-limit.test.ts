import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createRateLimitMiddleware, createMemoryRateLimitStore } from '../src/runtime/rate-limit';

describe('Rate limit middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it('allows requests within the limit', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 5, windowMs: 60000 });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test', { headers: { 'x-real-ip': '1.2.3.4' } });
      expect(res.status).toBe(200);
    }
  });

  it('blocks requests exceeding the limit', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 3, windowMs: 60000 });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      await app.request('/test', { headers: { 'x-real-ip': '5.6.7.8' } });
    }

    const res = await app.request('/test', { headers: { 'x-real-ip': '5.6.7.8' } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too Many Requests');
    expect(body.limit).toBe(3);
    expect(body.remaining).toBe(0);
  });

  it('sets standard rate limit headers', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 10, windowMs: 60000 });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', { headers: { 'x-real-ip': '10.0.0.1' } });
    expect(res.headers.get('RateLimit-Limit')).toBe('10');
    expect(res.headers.get('RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('RateLimit-Reset')).not.toBeNull();
  });

  it('sets legacy X-RateLimit headers when enabled', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 10, windowMs: 60000, legacyHeaders: true, standardHeaders: false });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', { headers: { 'x-real-ip': '10.0.0.2' } });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('tracks different IPs separately', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 2, windowMs: 60000 });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { headers: { 'x-real-ip': 'ip-a' } });
    await app.request('/test', { headers: { 'x-real-ip': 'ip-a' } });
    const blocked = await app.request('/test', { headers: { 'x-real-ip': 'ip-a' } });
    expect(blocked.status).toBe(429);

    const allowed = await app.request('/test', { headers: { 'x-real-ip': 'ip-b' } });
    expect(allowed.status).toBe(200);
  });

  it('skips rate limiting when skip returns true', async () => {
    const mw = createRateLimitMiddleware({
      maxRequests: 1,
      windowMs: 60000,
      skip: (c) => c.req.path === '/health'
    });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    await app.request('/test', { headers: { 'x-real-ip': 'ip-skip' } });
    const blocked = await app.request('/test', { headers: { 'x-real-ip': 'ip-skip' } });
    expect(blocked.status).toBe(429);

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/health', { headers: { 'x-real-ip': 'ip-skip' } });
      expect(res.status).toBe(200);
    }
  });

  it('uses custom key generator', async () => {
    const mw = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 60000,
      keyGenerator: (c) => c.req.header('x-api-key') || 'anonymous'
    });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { headers: { 'x-api-key': 'key1' } });
    await app.request('/test', { headers: { 'x-api-key': 'key1' } });
    const blockedKey1 = await app.request('/test', { headers: { 'x-api-key': 'key1' } });
    expect(blockedKey1.status).toBe(429);

    const allowedKey2 = await app.request('/test', { headers: { 'x-api-key': 'key2' } });
    expect(allowedKey2.status).toBe(200);
  });

  it('sets Retry-After header on 429 response', async () => {
    const mw = createRateLimitMiddleware({ maxRequests: 1, windowMs: 60000 });
    app.use('*', mw);
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { headers: { 'x-real-ip': 'retry-ip' } });
    const res = await app.request('/test', { headers: { 'x-real-ip': 'retry-ip' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});

describe('MemoryRateLimitStore', () => {
  it('increments counts and resets windows', async () => {
    const store = createMemoryRateLimitStore();
    try {
      const r1 = await store.increment('key1', 60000);
      expect(r1.count).toBe(1);
      const r2 = await store.increment('key1', 60000);
      expect(r2.count).toBe(2);

      await store.reset('key1');
      const r3 = await store.increment('key1', 60000);
      expect(r3.count).toBe(1);
    } finally {
      store.destroy();
    }
  });

  it('starts new window after expiration', async () => {
    const store = createMemoryRateLimitStore();
    try {
      const r1 = await store.increment('key2', 1);
      expect(r1.count).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 10));

      const r2 = await store.increment('key2', 1);
      expect(r2.count).toBe(1);
    } finally {
      store.destroy();
    }
  });
});
