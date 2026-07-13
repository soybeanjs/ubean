import { describe, it, expect } from 'vitest';
import { getIslandsBootstrapScript } from '../../src/core/islands';
import { createUbeanApp } from '../../src/runtime/app';
import { defineCors } from '../../src/runtime/cors';

describe('Integration: CORS middleware', () => {
  it('adds CORS headers to responses with defineCors', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const cors = defineCors({
      origin: 'https://example.com',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type']
    });

    app.hono.use('/api/*', cors);
    app.hono.get('/api/data', c => c.json({ data: 'ok' }));

    const res = await app.fetch(
      new Request('http://localhost/api/data', {
        headers: { Origin: 'https://example.com' }
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });

  it('handles OPTIONS preflight requests', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const cors = defineCors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxAge: 86400
    });

    app.hono.use('/api/*', cors);
    app.hono.get('/api/data', c => c.json({ data: 'ok' }));

    const res = await app.fetch(
      new Request('http://localhost/api/data', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST'
        }
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('supports credentials with specific origin', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const cors = defineCors({
      origin: 'https://app.example.com',
      credentials: true,
      allowMethods: ['GET']
    });

    app.hono.use('/api/*', cors);
    app.hono.get('/api/user', c => c.json({ user: 'alice' }));

    const res = await app.fetch(
      new Request('http://localhost/api/user', {
        headers: { Origin: 'https://app.example.com' }
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

describe('Integration: Islands bootstrap script', () => {
  it('generates bootstrap script with hydration strategies', () => {
    const script = getIslandsBootstrapScript();
    expect(script).toContain('<script>');
    expect(script).toContain('ubean-island');
    expect(script).toContain('data-island-id');
    expect(script).toContain('data-hydrating');
    expect(script).toContain('client:load');
    expect(script).toContain('client:idle');
    expect(script).toContain('client:visible');
    expect(script).toContain('client:only');
    expect(script).toContain('IntersectionObserver');
    expect(script).toContain('requestIdleCallback');
    expect(script).toContain('DOMContentLoaded');
  });

  it('bootstrap script is self-contained IIFE', () => {
    const script = getIslandsBootstrapScript();
    expect(script.startsWith('<script>(function(){')).toBe(true);
    expect(script.endsWith('</script>')).toBe(true);
  });
});

describe('Integration: Route guards and middleware chaining', () => {
  it('protects routes with auth guard middleware', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const authGuard = async (c: any, next: () => Promise<void>) => {
      const auth = c.req.header('Authorization');
      if (!auth) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      await next();
    };

    app.hono.use('/admin/*', authGuard);
    app.hono.get('/admin/dashboard', c => c.json({ admin: true }));
    app.hono.get('/public', c => c.json({ public: true }));

    const unauthRes = await app.fetch(new Request('http://localhost/admin/dashboard'));
    expect(unauthRes.status).toBe(401);
    expect(await unauthRes.json()).toEqual({ error: 'Unauthorized' });

    const authRes = await app.fetch(
      new Request('http://localhost/admin/dashboard', {
        headers: { Authorization: 'Bearer token123' }
      })
    );
    expect(authRes.status).toBe(200);
    expect(await authRes.json()).toEqual({ admin: true });

    const publicRes = await app.fetch(new Request('http://localhost/public'));
    expect(publicRes.status).toBe(200);
  });

  it('executes middleware in registration order', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const order: string[] = [];

    app.hono.use('*', async (_c, next) => {
      order.push('first');
      await next();
    });
    app.hono.use('*', async (_c, next) => {
      order.push('second');
      await next();
    });
    app.hono.get('/order', c => {
      order.push('handler');
      return c.json({ order });
    });

    const res = await app.fetch(new Request('http://localhost/order'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order).toEqual(['first', 'second', 'handler']);
  });

  it('supports multiple route-specific middleware', async () => {
    const app = createUbeanApp({
      preset: 'node',
      dev: false
    });

    const headerMw = async (c: any, next: () => Promise<void>) => {
      c.header('X-Framework', 'ubean');
      await next();
    };

    const timingMw = async (c: any, next: () => Promise<void>) => {
      const start = Date.now();
      await next();
      c.header('X-Response-Time', String(Date.now() - start));
    };

    app.hono.get('/api/info', headerMw, timingMw, c => {
      return c.json({ version: '1.0.0' });
    });

    const res = await app.fetch(new Request('http://localhost/api/info'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Framework')).toBe('ubean');
    expect(res.headers.get('X-Response-Time')).toBeTruthy();
    expect(await res.json()).toEqual({ version: '1.0.0' });
  });
});

describe('Integration: Response helpers in real app context', () => {
  it('html() sets correct content-type and includes body', async () => {
    const app = createUbeanApp({ preset: 'node', dev: false });

    app.hono.get('/page', c => c.html('<h1>Hello</h1>'));

    const res = await app.fetch(new Request('http://localhost/page'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toBe('<h1>Hello</h1>');
  });

  it('redirect() sets Location header and status', async () => {
    const app = createUbeanApp({ preset: 'node', dev: false });

    app.hono.get('/old', c => c.redirect('/new'));
    app.hono.get('/legacy', c => c.redirect('/current', 301));

    const tempRes = await app.fetch(new Request('http://localhost/old', { redirect: 'manual' }));
    expect(tempRes.status).toBe(302);
    expect(tempRes.headers.get('Location')).toBe('/new');

    const permRes = await app.fetch(new Request('http://localhost/legacy', { redirect: 'manual' }));
    expect(permRes.status).toBe(301);
    expect(permRes.headers.get('Location')).toBe('/current');
  });

  it('setHeader and setHeaders work correctly', async () => {
    const app = createUbeanApp({ preset: 'node', dev: false });

    app.hono.get('/headers', c => {
      c.header('X-Custom', 'value1');
      c.header('X-Multi', 'value2');
      c.header('Cache-Control', 'no-cache');
      return c.json({ ok: true });
    });

    const res = await app.fetch(new Request('http://localhost/headers'));
    expect(res.headers.get('X-Custom')).toBe('value1');
    expect(res.headers.get('X-Multi')).toBe('value2');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});
