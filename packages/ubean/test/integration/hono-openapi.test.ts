import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { describeRoute, validator, openAPIRouteHandler } from 'hono-openapi';
import { z } from 'zod';
import { registerRoutes } from '../../src/runtime/router';
import type { ScannedApiRoute } from '../../src/core/routing/types';
import { createUbeanApp } from '../../src/runtime/app';
import { defineHandler } from '../../src/runtime/handler';

describe('hono-openapi integration', () => {
  it('describeRoute and validator work directly with Hono', async () => {
    const app = new Hono();
    app.get(
      '/users/:id',
      describeRoute({ tags: ['Users'], summary: 'Get user by ID' }),
      validator('param', z.object({ id: z.string() })),
      c => {
        const { id } = c.req.valid('param');
        return c.json({ id, name: 'Test' });
      }
    );

    app.get('/_openapi', openAPIRouteHandler(app));

    const res = await app.request('http://localhost/_openapi');
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.paths['/users/{id}']).toBeDefined();
    expect(spec.paths['/users/{id}'].get).toBeDefined();
    expect(spec.paths['/users/{id}'].get.summary).toBe('Get user by ID');
    expect(spec.paths['/users/{id}'].get.tags).toContain('Users');
  });

  it('defineHandler with describeRoute and validator works with registerRoutes', async () => {
    const app = createUbeanApp({
      openAPI: { enabled: true, openAPIPath: '/_openapi.json', scalarPath: '/_scalar' }
    });

    const userSchema = z.object({ name: z.string() });

    const GET = defineHandler(
      describeRoute({ tags: ['API'], summary: 'Hello endpoint' }),
      validator('query', z.object({ name: z.string().optional() })),
      _c => {
        return { message: 'hello' };
      }
    );

    const POST = defineHandler(
      describeRoute({ tags: ['API'], summary: 'Create something' }),
      validator('json', userSchema),
      async c => {
        const body = c.req.valid('json');
        return c.json({ success: true, data: body }, 201);
      }
    );

    const routes: ScannedApiRoute[] = [
      {
        fullPath: '/routes/api/hello.get.ts',
        relativePath: 'api/hello.get.ts',
        dirname: 'api',
        basename: 'hello.get.ts',
        route: '/api/hello',
        method: 'get',
        httpMethods: ['GET'],
        exports: ['GET'],
        hasDefault: false,
        hasMeta: false,
        fileMeta: undefined
      },
      {
        fullPath: '/routes/api/hello.post.ts',
        relativePath: 'api/hello.post.ts',
        dirname: 'api',
        basename: 'hello.post.ts',
        route: '/api/hello',
        method: 'post',
        httpMethods: ['POST'],
        exports: ['POST'],
        hasDefault: false,
        hasMeta: false,
        fileMeta: undefined
      }
    ];

    await registerRoutes(app, {
      routes,
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/hello.get.ts': async () => ({ GET }),
        'api/hello.post.ts': async () => ({ POST })
      },
      middlewareLoaders: {}
    });

    const res = await app.request('/api/hello?name=world');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('hello');

    const openapiRes = await app.request('/_openapi.json');
    expect(openapiRes.status).toBe(200);
    const spec = await openapiRes.json();
    expect(spec.paths['/api/hello']).toBeDefined();
    expect(spec.paths['/api/hello'].get).toBeDefined();
    expect(spec.paths['/api/hello'].get.summary).toBe('Hello endpoint');
  });
});
