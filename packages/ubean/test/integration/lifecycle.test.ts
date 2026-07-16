import { describe, it, expect } from 'vitest';
import { registerRoutes } from '../../src/runtime/router';
import { createUbeanApp } from '../../src/runtime/app';
import { createError } from '../../src/runtime/error';
import { defineHandler } from '../../src/runtime/handler';

describe('Integration: Full request lifecycle', () => {
  it('processes GET API requests through full middleware chain in correct order', async () => {
    const order: string[] = [];
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/hello.get.ts',
          relativePath: 'api/hello.get.ts',
          dirname: 'api',
          basename: 'hello.get.ts',
          route: '/api/hello',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [
        {
          fullPath: '/src/routes/middleware.ts',
          relativePath: 'middleware.ts',
          path: '/',
          global: true
        }
      ],
      pages: [],
      routeLoaders: {
        'api/hello.get.ts': async () => ({
          GET: defineHandler(() => {
            order.push('handler');
            return { message: 'hello' };
          }) as unknown
        })
      },
      middlewareLoaders: {
        'middleware.ts': async () => ({
          default: async (_c: any, next: any) => {
            order.push('middleware-before');
            const res = await next();
            order.push('middleware-after');
            return res;
          }
        })
      }
    });

    const res = await app.fetch(new Request('http://localhost/api/hello'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('hello');
    expect(order).toEqual(['middleware-before', 'handler', 'middleware-after']);
  });

  it('handles POST with JSON body and returns 201 with location header via Response return', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/users.post.ts',
          relativePath: 'api/users.post.ts',
          dirname: 'api',
          basename: 'users.post.ts',
          route: '/api/users',
          method: 'POST',
          exports: ['POST'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/users.post.ts': async () => ({
          POST: defineHandler(async c => {
            const body = await c.req.json();
            c.header('Location', `/api/users/${body.id}`);
            return c.json({ id: body.id, name: body.name }, 201);
          }) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '42', name: 'Alice' })
      })
    );

    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toBe('/api/users/42');
    const body = await res.json();
    expect(body.id).toBe('42');
    expect(body.name).toBe('Alice');
  });

  it('handles UbeanError thrown in handlers and returns proper status code', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/fail.get.ts',
          relativePath: 'api/fail.get.ts',
          dirname: 'api',
          basename: 'fail.get.ts',
          route: '/api/fail',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/fail.get.ts': async () => ({
          GET: defineHandler(() => {
            throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: { field: 'email' } });
          }) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(new Request('http://localhost/api/fail'));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.statusCode).toBe(422);
    expect(body.error).toBe('Validation failed');
  });

  it('handles dynamic route params correctly across multiple segments', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/orgs/[orgId]/users/[userId].get.ts',
          relativePath: 'api/orgs/[orgId]/users/[userId].get.ts',
          dirname: 'api/orgs/[orgId]/users',
          basename: '[userId].get.ts',
          route: '/api/orgs/[orgId]/users/[userId]',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/orgs/[orgId]/users/[userId].get.ts': async () => ({
          GET: defineHandler(c => ({
            orgId: c.req.param('orgId'),
            userId: c.req.param('userId')
          })) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(new Request('http://localhost/api/orgs/acme/users/42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe('acme');
    expect(body.userId).toBe('42');
  });

  it('supports multiple HTTP methods on the same path', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/posts.get.ts',
          relativePath: 'api/posts.get.ts',
          dirname: 'api',
          basename: 'posts.get.ts',
          route: '/api/posts',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        },
        {
          fullPath: '/src/routes/api/posts.post.ts',
          relativePath: 'api/posts.post.ts',
          dirname: 'api',
          basename: 'posts.post.ts',
          route: '/api/posts',
          method: 'POST',
          exports: ['POST'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/posts.get.ts': async () => ({
          GET: defineHandler(() => ({ posts: ['a', 'b'] })) as unknown
        }),
        'api/posts.post.ts': async () => ({
          POST: defineHandler(async c => {
            const body = await c.req.json();
            return c.json({ created: true, title: body.title }, 201);
          }) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const getRes = await app.fetch(new Request('http://localhost/api/posts'));
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.posts).toEqual(['a', 'b']);

    const postRes = await app.fetch(
      new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hello' })
      })
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.created).toBe(true);
    expect(postBody.title).toBe('Hello');
  });
});

describe('Integration: Redirects and response helpers', () => {
  it('returns permanent redirect response (301)', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/old.get.ts',
          relativePath: 'api/old.get.ts',
          dirname: 'api',
          basename: 'old.get.ts',
          route: '/api/old',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/old.get.ts': async () => ({
          GET: defineHandler(c => c.redirect('/api/new', 301)) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(new Request('http://localhost/api/old', { redirect: 'manual' }));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/api/new');
  });

  it('returns HTML response with correct content-type', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/page.get.ts',
          relativePath: 'api/page.get.ts',
          dirname: 'api',
          basename: 'page.get.ts',
          route: '/api/page',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/page.get.ts': async () => ({
          GET: defineHandler(c => c.html('<h1>Hello</h1>')) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(new Request('http://localhost/api/page'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toBe('<h1>Hello</h1>');
  });

  it('returns JSON response with custom status via json() helper', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/created.post.ts',
          relativePath: 'api/created.post.ts',
          dirname: 'api',
          basename: 'created.post.ts',
          route: '/api/created',
          method: 'POST',
          exports: ['POST'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/created.post.ts': async () => ({
          POST: defineHandler(async c => {
            const body = await c.req.json();
            return c.json({ ok: true, id: body.id }, 201);
          }) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(
      new Request('http://localhost/api/created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'abc' })
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe('abc');
  });
});

describe('Integration: Plugin hooks with routes', () => {
  it('plugins can register routes directly on app.hono', async () => {
    const app = createUbeanApp({
      plugins: [
        {
          name: 'test-plugin',
          setup(a: any) {
            a.hono.get('/plugin/route', (c: any) => c.json({ fromPlugin: true }));
          }
        }
      ]
    });

    await app.init();
    const res = await app.fetch(new Request('http://localhost/plugin/route'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fromPlugin).toBe(true);
  });

  it('plugin ready hook fires after all routes are registered', async () => {
    let readyCalled = false;
    const app = createUbeanApp({
      plugins: [
        {
          name: 'test-plugin',
          ready() {
            readyCalled = true;
          }
        }
      ]
    });

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/ping.get.ts',
          relativePath: 'api/ping.get.ts',
          dirname: 'api',
          basename: 'ping.get.ts',
          route: '/api/ping',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/ping.get.ts': async () => ({
          GET: defineHandler(() => ({ pong: true })) as unknown
        })
      },
      middlewareLoaders: {}
    });

    await app.init();
    expect(readyCalled).toBe(true);

    const res = await app.fetch(new Request('http://localhost/api/ping'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pong).toBe(true);
  });
});

describe('Integration: Health and metadata endpoints', () => {
  it('health endpoint works alongside registered routes', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/data.get.ts',
          relativePath: 'api/data.get.ts',
          dirname: 'api',
          basename: 'data.get.ts',
          route: '/api/data',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/data.get.ts': async () => ({
          GET: defineHandler(() => ({ data: 'yes' })) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const healthRes = await app.fetch(new Request('http://localhost/_health'));
    expect(healthRes.status).toBe(200);
    const healthBody = await healthRes.json();
    expect(healthBody.status).toBe('ok');

    const apiRes = await app.fetch(new Request('http://localhost/api/data'));
    expect(apiRes.status).toBe(200);
    const apiBody = await apiRes.json();
    expect(apiBody.data).toBe('yes');
  });
});

describe('Integration: Query parameters', () => {
  it('handles query parameters in GET requests', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/search.get.ts',
          relativePath: 'api/search.get.ts',
          dirname: 'api',
          basename: 'search.get.ts',
          route: '/api/search',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/search.get.ts': async () => ({
          GET: defineHandler(c => ({
            q: c.req.query('q'),
            page: c.req.query('page') || '1'
          })) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(new Request('http://localhost/api/search?q=hello&page=2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.q).toBe('hello');
    expect(body.page).toBe('2');
  });
});

describe('Integration: Request headers via Response return', () => {
  it('sets custom response headers using json() helper', async () => {
    const app = createUbeanApp();

    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/echo.get.ts',
          relativePath: 'api/echo.get.ts',
          dirname: 'api',
          basename: 'echo.get.ts',
          route: '/api/echo',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/echo.get.ts': async () => ({
          GET: defineHandler(c => {
            c.header('X-Echo', c.req.header('x-send') || 'none');
            return c.json({ received: c.req.header('x-send') });
          }) as unknown
        })
      },
      middlewareLoaders: {}
    });

    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        headers: { 'x-send': 'ping' }
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-echo')).toBe('ping');
    const body = await res.json();
    expect(body.received).toBe('ping');
  });
});
