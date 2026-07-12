import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createCorsMiddleware } from '../src/runtime/cors';

async function makeRequest(
  app: Hono,
  method: string,
  url: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const h = new Headers(headers);
  const req = new Request(`http://localhost${url}`, { method, headers: h });
  return app.fetch(req);
}

describe('CORS middleware', () => {
  it('sets Access-Control-Allow-Origin to * by default', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware());
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://example.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('reflects specific origin when configured', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: 'http://example.com' }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://example.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');
  });

  it('matches origin from array', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: ['http://a.com', 'http://b.com'] }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://b.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://b.com');
  });

  it('returns null origin for non-matching array origin', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: ['http://a.com'] }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://other.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('blocks when origin is false', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: false }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://example.com' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('handles preflight OPTIONS requests', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: '*', maxAge: 86400 }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'OPTIONS', '/test', {
      origin: 'http://example.com',
      'access-control-request-method': 'POST'
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('supports credentials mode', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ origin: 'http://example.com', credentials: true }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://example.com' });
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('sets exposed headers', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ exposeHeaders: ['X-Custom', 'X-Request-Id'] }));
    app.get('/test', c => c.json({ ok: true }));
    const res = await makeRequest(app, 'GET', '/test', { origin: 'http://example.com' });
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('X-Custom, X-Request-Id');
  });

  it('supports custom allow methods', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware({ allowMethods: ['GET', 'POST'] }));
    const res = await makeRequest(app, 'OPTIONS', '/test', {
      origin: 'http://example.com',
      'access-control-request-method': 'POST'
    });
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
  });

  it('supports function origin', async () => {
    const app = new Hono();
    app.use(
      '*',
      createCorsMiddleware({
        origin: origin => origin.endsWith('.trusted.com')
      })
    );
    app.get('/test', c => c.json({ ok: true }));
    const res1 = await makeRequest(app, 'GET', '/test', { origin: 'https://app.trusted.com' });
    expect(res1.headers.get('Access-Control-Allow-Origin')).toBe('https://app.trusted.com');
    const res2 = await makeRequest(app, 'GET', '/test', { origin: 'http://evil.com' });
    expect(res2.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
