/**
 * API route registration ordering — static vs dynamic segments.
 *
 * Hono's default `SmartRouter` falls back to `TrieRouter` as soon as a
 * `:param` and a literal sibling exist (`RegExpRouter` throws
 * `UnsupportedPathError` for that shape), and `TrieRouter` is
 * **first-match-wins**. So a route table where `/api/user/:id` is registered
 * before `/api/user/list` serves `id === "list"` for `/api/user/list`.
 *
 * `sortPagesForRegistration` already fixes this for pages, but API routes
 * used to depend on the scan order — which is a plain sort of absolute file
 * paths. `(` (0x28) sorts before `[` (0x5b), which is why the apps carry a
 * `(r)/` route group: a naming accident, not a guarantee. These tests pin the
 * guarantee inside `registerApiRoutes` instead.
 */
import { describe, it, expect } from 'vitest';
import type { ScannedApiRoute, ScannedMiddleware } from '@ubean/scan';
import { Hono } from 'hono';
import { registerApiRoutes, apiPathSpecificity } from '../src/index';
import type { RouteRegistrar } from '../src/index';

function createRegistrar() {
  const app = new Hono();
  return Object.assign(app, { hooks: { callHook: async () => {} } });
}

interface ApiRouteFixture {
  /** File path relative to `routes/` — only its order and loader key matter. */
  relativePath: string;
  /** Hono path shape as produced by the scan/transform step. */
  route: string;
  method: string;
  body: string;
}

function toScannedApiRoutes(fixtures: readonly ApiRouteFixture[]): ScannedApiRoute[] {
  return fixtures.map(fixture => ({
    fullPath: `/app/routes/${fixture.relativePath}`,
    relativePath: fixture.relativePath,
    dirname: fixture.relativePath.split('/').slice(0, -1).join('/'),
    basename: fixture.relativePath.split('/').pop() ?? '',
    exports: [fixture.method],
    hasMeta: false,
    route: fixture.route,
    method: fixture.method
  }));
}

function toLoaders(fixtures: readonly ApiRouteFixture[]): Record<string, () => Promise<Record<string, unknown>>> {
  return Object.fromEntries(
    fixtures.map(fixture => [
      fixture.relativePath,
      async () => ({ [fixture.method]: (c: { text: (value: string) => Response }) => c.text(fixture.body) })
    ])
  );
}

const NO_MIDDLEWARE: ScannedMiddleware[] = [];

async function register(fixtures: readonly ApiRouteFixture[]) {
  const app = createRegistrar();
  await registerApiRoutes(app as unknown as RouteRegistrar, {
    routes: toScannedApiRoutes(fixtures),
    middleware: NO_MIDDLEWARE,
    pages: [],
    routeLoaders: toLoaders(fixtures),
    middlewareLoaders: {}
  });
  return app;
}

describe('apiPathSpecificity', () => {
  it('ranks literal segments above dynamic ones and wildcards last', () => {
    expect(apiPathSpecificity('/api/user/list')).toBeGreaterThan(apiPathSpecificity('/api/user/:id'));
    expect(apiPathSpecificity('/api/user/:id')).toBeGreaterThan(apiPathSpecificity('/api/user/*'));
    expect(apiPathSpecificity('/api/user/42')).toBe(apiPathSpecificity('/api/user/list'));
  });

  it('counts deeper dynamic paths as more specific than their parent', () => {
    expect(apiPathSpecificity('/api/user/:id/roles')).toBeGreaterThan(apiPathSpecificity('/api/user/:id'));
  });
});

describe('registerApiRoutes ordering', () => {
  it('serves the static sibling even when the dynamic route is scanned first', async () => {
    // Scan order deliberately wrong: `[id].ts` before `(r)/list.ts`.
    const app = await register([
      { relativePath: 'api/user/[id].ts', route: '/api/user/:id', method: 'GET', body: 'dynamic' },
      { relativePath: 'api/user/(r)/list.ts', route: '/api/user/list', method: 'GET', body: 'static' }
    ]);

    const staticResponse = await app.request('/api/user/list');
    expect(await staticResponse.text()).toBe('static');

    const dynamicResponse = await app.request('/api/user/42');
    expect(await dynamicResponse.text()).toBe('dynamic');
  });

  it('keeps the dynamic route reachable when the static sibling is scanned first', async () => {
    const app = await register([
      { relativePath: 'api/user/(r)/list.ts', route: '/api/user/list', method: 'GET', body: 'static' },
      { relativePath: 'api/user/[id].ts', route: '/api/user/:id', method: 'GET', body: 'dynamic' }
    ]);

    expect(await (await app.request('/api/user/list')).text()).toBe('static');
    expect(await (await app.request('/api/user/42')).text()).toBe('dynamic');
  });

  it('orders the full CRUD table so every static endpoint wins', async () => {
    const app = await register([
      { relativePath: 'api/user/[id].ts', route: '/api/user/:id', method: 'GET', body: 'detail' },
      { relativePath: 'api/user/[id]/roles.ts', route: '/api/user/:id/roles', method: 'GET', body: 'roles' },
      { relativePath: 'api/user/(r)/batch-delete.ts', route: '/api/user/batch-delete', method: 'POST', body: 'batch' },
      { relativePath: 'api/user/(r)/list.ts', route: '/api/user/list', method: 'GET', body: 'list' },
      { relativePath: 'api/user/(r)/index.ts', route: '/api/user', method: 'POST', body: 'create' }
    ]);

    expect(await (await app.request('/api/user/list')).text()).toBe('list');
    expect(await (await app.request('/api/user/batch-delete', { method: 'POST' })).text()).toBe('batch');
    expect(await (await app.request('/api/user', { method: 'POST' })).text()).toBe('create');
    expect(await (await app.request('/api/user/42')).text()).toBe('detail');
    expect(await (await app.request('/api/user/42/roles')).text()).toBe('roles');
  });
});
