import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { join } from 'pathe';
import { registerRoutes } from '../src/runtime/router';
import { resetVirtualRegistry, useVirtualRegistry } from '../src/core/build/virtual/registry';
import { generateTypes } from '../src/core/codegen';
import { startDevServer } from '../src/core/dev/server';
import { standardPreset, nodePreset, registerBuiltinPresets, resolvePresetByName } from '../src/core/preset';
import { createVuePagesVirtualModule, createVueAppEntryVirtualModule } from '../src/core/vue/virtual-modules';
import { createUbeanApp, UbeanApp } from '../src/runtime/app';
import { createApiClient } from '../src/runtime/client';
import { defineEnv, setRuntimeEnv, useRuntimeEnv } from '../src/runtime/env';
import { defineHandler } from '../src/runtime/handler';
import {
  buildClientOnlyShell,
  buildPageShell,
  insertSsrContent,
  safeJsonStringify,
  PAGE_DATA_ID,
  SSR_CONTENT_MARKER,
  renderPage,
  pageJsonResponse,
  isPagesRequest
} from '../src/runtime/pages';

describe('codegen', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ubean-codegen-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates route types d.ts', async () => {
    const result = await generateTypes(
      {
        apiRoutes: [
          {
            fullPath: '/project/routes/users.get.ts',
            relativePath: 'users.get.ts',
            dirname: '.',
            basename: 'users.get.ts',
            route: '/users',
            method: 'GET',
            exports: ['GET'],
            hasMeta: false,
            hasValidator: false
          },
          {
            fullPath: '/project/routes/users.post.ts',
            relativePath: 'users.post.ts',
            dirname: '.',
            basename: 'users.post.ts',
            route: '/users',
            method: 'POST',
            exports: ['POST'],
            hasMeta: true,
            hasValidator: false
          }
        ],
        pages: [
          {
            fullPath: '/project/pages/index.vue',
            relativePath: 'index.vue',
            dirname: '.',
            basename: 'index.vue',
            name: 'index',
            route: '/',
            path: '/',
            isReuse: false
          }
        ],
        layouts: [
          {
            fullPath: '/project/layouts/default.vue',
            relativePath: 'default.vue',
            dirname: '.',
            basename: 'default.vue',
            name: 'default',
            path: 'default.vue',
            isDefault: true
          }
        ],
        middlewares: [],
        plugins: []
      },
      {
        cwd: tmpDir,
        buildDir: '.ubean'
      }
    );

    expect(result.generated).toHaveLength(2);
    expect(existsSync(result.routeTypesPath)).toBe(true);
    expect(existsSync(result.pageTypesPath)).toBe(true);

    const routeTypes = readFileSync(result.routeTypesPath, 'utf-8');
    expect(routeTypes).toContain('ApiRoutePath');
    expect(routeTypes).toContain('"/users"');
    expect(routeTypes).toContain('"GET"');
    expect(routeTypes).toContain('"POST"');

    const pageTypes = readFileSync(result.pageTypesPath, 'utf-8');
    expect(pageTypes).toContain('RouteName');
    expect(pageTypes).toContain('LayoutName');
    expect(pageTypes).toContain('"index"');
    expect(pageTypes).toContain('"default"');
  });

  it('handles empty scan result', async () => {
    const result = await generateTypes(
      {
        apiRoutes: [],
        pages: [],
        layouts: [],
        middlewares: [],
        plugins: []
      },
      {
        cwd: tmpDir,
        buildDir: '.ubean-empty'
      }
    );

    expect(result.generated).toHaveLength(2);
    const pageTypes = readFileSync(result.pageTypesPath, 'utf-8');
    expect(pageTypes).toContain('type RouteName = string');
  });
});

describe('createUbeanApp', () => {
  it('creates a Hono app', () => {
    const app = createUbeanApp();
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe('function');
  });

  it('returns 404 for unknown routes', async () => {
    const app = createUbeanApp();
    const req = new Request('http://localhost/nonexistent');
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });

  it('returns health endpoint', async () => {
    const app = createUbeanApp();
    const req = new Request('http://localhost/_health');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

describe('presets', () => {
  it('standard preset exists', () => {
    expect(standardPreset.name).toBe('standard');
  });

  it('node preset exists', () => {
    expect(nodePreset.name).toBe('node');
  });

  it('registerBuiltinPresets registers presets', () => {
    registerBuiltinPresets();
    const resolved = resolvePresetByName('node');
    expect(resolved.name).toBe('node');
    const standardResolved = resolvePresetByName('standard');
    expect(standardResolved.name).toBe('standard');
  });

  it('falls back to standard preset for unknown names', () => {
    registerBuiltinPresets();
    const resolved = resolvePresetByName('unknown-preset');
    expect(resolved.name).toBe('standard');
  });
});

describe('UbeanApp lifecycle', () => {
  it('returns a UbeanApp instance', () => {
    const app = createUbeanApp();
    expect(app).toBeInstanceOf(UbeanApp);
    expect(app.hono).toBeDefined();
    expect(app.hooks).toBeDefined();
  });

  it('supports plugin setup hook', async () => {
    const setupFn = vi.fn();
    const app = createUbeanApp({
      plugins: [{ name: 'test', setup: setupFn }]
    });
    await app.init();
    expect(setupFn).toHaveBeenCalledTimes(1);
    expect(setupFn).toHaveBeenCalledWith(app);
  });

  it('supports plugin ready hook', async () => {
    const readyFn = vi.fn();
    const app = createUbeanApp({
      plugins: [{ name: 'test', ready: readyFn }]
    });
    await app.init();
    expect(readyFn).toHaveBeenCalledTimes(1);
    expect(readyFn).toHaveBeenCalledWith(app);
  });

  it('calls lifecycle hooks in order', async () => {
    const calls: string[] = [];
    const app = createUbeanApp({
      plugins: [
        {
          name: 'test',
          setup: () => calls.push('setup'),
          ready: () => calls.push('ready')
        }
      ]
    });
    app.hooks.hook('app:created', () => calls.push('created'));
    app.hooks.hook('app:before:register', () => calls.push('before-register'));
    app.hooks.hook('app:after:register', () => calls.push('after-register'));
    await app.init();
    expect(calls).toEqual(['created', 'setup', 'before-register', 'after-register', 'ready']);
  });

  it('triggers request:start and request:end hooks', async () => {
    const startFn = vi.fn();
    const endFn = vi.fn();
    const app = createUbeanApp();
    app.hooks.hook('request:start', startFn);
    app.hooks.hook('request:end', endFn);
    await app.init();
    const req = new Request('http://localhost/_health');
    await app.fetch(req);
    expect(startFn).toHaveBeenCalledTimes(1);
    expect(endFn).toHaveBeenCalledTimes(1);
  });

  it('auto lazy-init on fetch', async () => {
    const app = createUbeanApp();
    const req = new Request('http://localhost/_health');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
  });
});

describe('registerRoutes', () => {
  it('registers API routes from scan results', async () => {
    const app = createUbeanApp();
    const usersHandler = defineHandler(() => ({ users: [] }));
    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/users.get.ts',
          relativePath: 'api/users.get.ts',
          dirname: 'api',
          basename: 'users.get.ts',
          route: '/api/users',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false,
          hasValidator: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/users.get.ts': async () => ({ GET: usersHandler as any })
      },
      middlewareLoaders: {}
    });
    const req = new Request('http://localhost/api/users');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: [] });
  });

  it('registers routes with dynamic params', async () => {
    const app = createUbeanApp();
    const detailHandler = defineHandler((c: any) => ({ id: c.req.param('id') }));
    await registerRoutes(app, {
      routes: [
        {
          fullPath: '/src/routes/api/users/[id].get.ts',
          relativePath: 'api/users/[id].get.ts',
          dirname: 'api/users',
          basename: '[id].get.ts',
          route: '/api/users/[id]',
          method: 'GET',
          exports: ['GET'],
          hasMeta: false,
          hasValidator: false
        }
      ],
      middleware: [],
      pages: [],
      routeLoaders: {
        'api/users/[id].get.ts': async () => ({ GET: detailHandler as any })
      },
      middlewareLoaders: {}
    });
    const req = new Request('http://localhost/api/users/123');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('123');
  });

  it('registers global middleware in order', async () => {
    const order: number[] = [];
    const app = createUbeanApp();
    await registerRoutes(app, {
      routes: [],
      middleware: [
        {
          fullPath: '/src/middleware/10-second.ts',
          relativePath: '10-second.ts',
          dirname: '.',
          basename: '10-second.ts',
          order: 10,
          global: true
        },
        {
          fullPath: '/src/middleware/1-first.ts',
          relativePath: '1-first.ts',
          dirname: '.',
          basename: '1-first.ts',
          order: 1,
          global: true
        }
      ],
      pages: [],
      routeLoaders: {},
      middlewareLoaders: {
        '10-second.ts': async () => ({
          default: (async (_c: any, next: any) => {
            order.push(10);
            return next();
          }) as any
        }),
        '1-first.ts': async () => ({
          default: (async (_c: any, next: any) => {
            order.push(1);
            return next();
          }) as any
        })
      }
    });
    app.get('/mw-test', () => 'ok');
    const req = new Request('http://localhost/mw-test');
    await app.fetch(req);
    expect(order).toEqual([1, 10]);
  });

  it('registers page routes returning HTML for browser requests', async () => {
    const app = createUbeanApp();
    await registerRoutes(app, {
      routes: [],
      middleware: [],
      pages: [
        {
          fullPath: '/src/pages/about.vue',
          relativePath: 'about.vue',
          dirname: '.',
          basename: 'about.vue',
          name: 'about',
          route: '/about',
          path: '/about',
          isReuse: false
        }
      ],
      routeLoaders: {},
      middlewareLoaders: {}
    });
    const req = new Request('http://localhost/about');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('__UBEAN_PAGE_DATA__');
    expect(html).toContain('"component":"about"');
  });

  it('returns JSON page data for client navigation requests', async () => {
    const app = createUbeanApp();
    await registerRoutes(app, {
      routes: [],
      middleware: [],
      pages: [
        {
          fullPath: '/src/pages/about.vue',
          relativePath: 'about.vue',
          dirname: '.',
          basename: 'about.vue',
          name: 'about',
          route: '/about',
          path: '/about',
          isReuse: false
        }
      ],
      routeLoaders: {},
      middlewareLoaders: {}
    });
    const req = new Request('http://localhost/about', {
      headers: { 'x-ubeanpages': 'true' }
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.component).toBe('about');
    expect(body.layout).toBe('default');
  });
});

describe('defineEnv', () => {
  it('validates and parses env values', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, TEST_STRING: 'hello', TEST_NUMBER: '42', TEST_BOOL: 'true' };
    const { env } = defineEnv({
      server: {
        TEST_STRING: { type: String },
        TEST_NUMBER: { type: Number },
        TEST_BOOL: { type: Boolean }
      }
    });
    expect(env.TEST_STRING).toBe('hello');
    expect(env.TEST_NUMBER).toBe(42);
    expect(env.TEST_BOOL).toBe(true);
    process.env = originalEnv;
  });

  it('uses default values when env not set', () => {
    const { env } = defineEnv({
      mode: 'warn',
      server: {
        PORT: { type: Number, default: 3000, required: false }
      }
    });
    expect(env.PORT).toBe(3000);
  });

  it('returns validation errors via validate()', () => {
    const { validate } = defineEnv({
      server: {
        REQUIRED_KEY: { type: String }
      },
      mode: 'warn'
    });
    const result = validate({});
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('REQUIRED_KEY');
  });
});

describe('useRuntimeEnv', () => {
  it('stores and retrieves runtime env values', () => {
    setRuntimeEnv({ MY_KEY: 'my-value' });
    expect(useRuntimeEnv('MY_KEY')).toBe('my-value');
    expect(useRuntimeEnv('NONEXISTENT', 'default')).toBe('default');
  });
});

describe('createApiClient', () => {
  it('creates a client with http methods', () => {
    const client = createApiClient({ baseURL: 'http://localhost:3000' });
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
    expect(typeof client.raw).toBe('function');
  });

  it('builds URLs with baseURL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    const client = createApiClient({ baseURL: 'http://api.example.com' });
    await client.get('/users');
    expect(fetchSpy).toHaveBeenCalledWith('http://api.example.com/users', expect.objectContaining({ method: 'GET' }));
    fetchSpy.mockRestore();
  });

  it('builds URLs with path params', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    const client = createApiClient({ baseURL: 'http://api.example.com' });
    await client.get('/users/:id', { params: { id: '42' } });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.example.com/users/42',
      expect.objectContaining({ method: 'GET' })
    );
    fetchSpy.mockRestore();
  });

  it('appends query string', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    const client = createApiClient({ baseURL: 'http://api.example.com' });
    await client.get('/users', { query: { page: '2', limit: '10' } });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('?'), expect.anything());
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    fetchSpy.mockRestore();
  });

  it('sends JSON body on POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const client = createApiClient({ baseURL: 'http://api.example.com' });
    await client.post('/users', { json: { name: 'Test' } });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test' })
      })
    );
    fetchSpy.mockRestore();
  });
});

describe('startDevServer', () => {
  it('starts and serves requests', async () => {
    const app = createUbeanApp();
    await app.init();
    const server = await startDevServer({ port: 0, host: '127.0.0.1', app });
    const res = await fetch(`http://127.0.0.1:${server.port}/_health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    await server.close();
  });
});

describe('pages protocol', () => {
  const samplePage: any = {
    component: 'home',
    props: { title: 'Hello' },
    params: {},
    url: '/',
    layout: 'default',
    errors: null
  };

  it('safeJsonStringify escapes XSS characters', () => {
    const out = safeJsonStringify({ x: '<script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c');
  });

  it('buildClientOnlyShell produces a complete HTML document', () => {
    const html = buildClientOnlyShell(samplePage, {});
    expect(html).toContain('<!doctype html>');
    expect(html).toContain(`id="${PAGE_DATA_ID}"`);
    expect(html).toContain('"component":"home"');
    expect(html).toContain('data-ubean-ssr="false"');
  });

  it('buildPageShell contains SSR marker', () => {
    const html = buildPageShell(samplePage, {});
    expect(html).toContain(SSR_CONTENT_MARKER);
    expect(html).toContain('<!doctype html>');
  });

  it('insertSsrContent replaces the marker with SSR HTML', () => {
    const shell = buildPageShell(samplePage, {});
    const out = insertSsrContent(shell, '<div>rendered</div>');
    expect(out).not.toContain(SSR_CONTENT_MARKER);
    expect(out).toContain('<div>rendered</div>');
  });

  it('renderPage returns client-only shell when renderer is null', async () => {
    const html = await renderPage(samplePage, {}, null);
    expect(html).toContain('data-ubean-ssr="false"');
  });

  it('renderPage uses renderer for SSR content', async () => {
    const html = await renderPage(
      samplePage,
      {},
      {
        render: (_pageObj, shell) => insertSsrContent(shell, '<div id="ssr">SSR Content</div>')
      }
    );
    expect(html).toContain('<div id="ssr">SSR Content</div>');
    expect(html).not.toContain(SSR_CONTENT_MARKER);
  });

  it('pageJsonResponse returns JSON with X-UbeanPages header', async () => {
    const res = pageJsonResponse(samplePage);
    expect(res.headers.get('X-UbeanPages')).toBe('true');
    expect(res.headers.get('Vary')).toBe('X-UbeanPages');
    const data = await res.json();
    expect(data.component).toBe('home');
  });

  it('isPagesRequest detects client navigation header', () => {
    expect(isPagesRequest({ req: { header: () => undefined } } as any)).toBe(false);
    expect(isPagesRequest({ req: { header: () => 'true' } } as any)).toBe(true);
  });

  it('renders head tags (title, meta, htmlAttrs)', () => {
    const pageWithHead: any = {
      ...samplePage,
      head: {
        title: 'My Site',
        htmlAttrs: { lang: 'en' },
        meta: [{ name: 'description', content: 'desc' }]
      }
    };
    const html = buildClientOnlyShell(pageWithHead, {});
    expect(html).toContain('<title>My Site</title>');
    expect(html).toContain('lang="en"');
    expect(html).toContain('name="description"');
  });
});

describe('vue virtual modules', () => {
  beforeEach(() => {
    resetVirtualRegistry();
  });

  it('createVuePagesVirtualModule generates component resolution map', async () => {
    const pages = [
      {
        name: 'home',
        route: '/',
        path: '/',
        relativePath: 'home.vue',
        fullPath: '/src/pages/home.vue',
        dirname: '.',
        basename: 'home.vue',
        isReuse: false
      } as any,
      {
        name: 'about',
        route: '/about',
        path: '/about',
        relativePath: 'about.vue',
        fullPath: '/src/pages/about.vue',
        dirname: '.',
        basename: 'about.vue',
        isReuse: false,
        layout: 'blank'
      } as any
    ];
    const layouts = [
      {
        name: 'default',
        relativePath: 'default.vue',
        fullPath: '/src/layouts/default.vue',
        dirname: '.',
        basename: 'default.vue',
        path: '/',
        isDefault: true
      } as any,
      {
        name: 'blank',
        relativePath: 'blank.vue',
        fullPath: '/src/layouts/blank.vue',
        dirname: '.',
        basename: 'blank.vue',
        path: '/blank',
        isDefault: false
      } as any
    ];

    const mod = createVuePagesVirtualModule(pages, layouts);
    const code = await mod.load();

    expect(code).toContain('resolvePageComponent');
    expect(code).toContain('resolveLayoutComponent');
    expect(code).toContain('defaultLayout = "default"');
    expect(code).toContain('/src/pages/home.vue');
    expect(code).toContain('/src/pages/about.vue');
    expect(code).toContain('/src/layouts/default.vue');
    expect(code).toContain('/src/layouts/blank.vue');
    expect(code).toContain('Page component not found');
    expect(code).toContain('Layout component not found');
  });

  it('createVuePagesVirtualModule handles empty pages/layouts', async () => {
    const mod = createVuePagesVirtualModule([], []);
    const code = await mod.load();

    expect(code).toContain('defaultLayout = null');
    expect(code).toContain('RouteName = string');
  });

  it('createVueAppEntryVirtualModule re-exports from ubean packages', async () => {
    const mod = createVueAppEntryVirtualModule();
    const code = await mod.load();

    expect(code).toContain('createUbeanApp');
    expect(code).toContain('createUbeanSSRApp');
    expect(code).toContain('ubean/vue-runtime/app');
    expect(code).toContain('#ubean-pages');
  });

  it('virtual modules register and load through registry', async () => {
    const registry = useVirtualRegistry();
    const pages = [
      {
        name: 'home',
        route: '/',
        path: '/',
        relativePath: 'home.vue',
        fullPath: '/src/pages/home.vue',
        dirname: '.',
        basename: 'home.vue',
        isReuse: false
      } as any
    ];
    const layouts = [
      {
        name: 'default',
        relativePath: 'default.vue',
        fullPath: '/src/layouts/default.vue',
        dirname: '.',
        basename: 'default.vue',
        path: '/',
        isDefault: true
      } as any
    ];
    registry.register(createVuePagesVirtualModule(pages, layouts));
    registry.register(createVueAppEntryVirtualModule());

    const pagesMod = registry.getModules().find(m => m.id === '#ubean-pages');
    expect(pagesMod).toBeTruthy();
    const pagesCode = await pagesMod!.load();
    expect(pagesCode).toContain('"home"');

    const appMod = registry.getModules().find(m => m.id === '#ubean-app');
    expect(appMod).toBeTruthy();
  });
});
