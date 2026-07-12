import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { join } from 'pathe';
import {
  defineLocale,
  useI18n,
  t,
  setLocale,
  getLocale,
  clearLocales,
  getRegisteredLocales
} from '../src/runtime/i18n';
import { registerRoutes } from '../src/runtime/router';
import { resetVirtualRegistry, useVirtualRegistry } from '../src/core/build/virtual/registry';
import { generateTypes } from '../src/core/codegen';
import { startDevServer } from '../src/core/dev/server';
import { standardPreset, nodePreset, registerBuiltinPresets, resolvePresetByName } from '../src/core/preset';
import { createVuePagesVirtualModule, createVueAppEntryVirtualModule } from '../src/core/vue/virtual-modules';
import { createUbeanApp, UbeanApp } from '../src/runtime/app';
import { createClient } from '../src/runtime/client';
import { defineEnv, setRuntimeEnv, useRuntimeEnv } from '../src/runtime/env';
import { defineHandler } from '../src/runtime/handler';
import {
  createRequestIdMiddleware,
  getRequestId,
  generateRequestId,
  createObservabilityTracer,
  createSpan,
  createOpenTelemetryExporter,
  createConsoleExporter,
  setGlobalTracer,
  withSpan,
  createTracingMiddleware
} from '../src/runtime/observability';
import {
  buildClientOnlyShell,
  buildPageShell,
  insertSsrContent,
  safeJsonStringify,
  PAGE_DATA_ID,
  LOCALE_DATA_ID,
  SSR_CONTENT_MARKER,
  renderPage,
  pageJsonResponse,
  isPagesRequest
} from '../src/runtime/pages';
import {
  localizePath,
  setI18nConfig,
  getI18nConfig,
  getDefaultLocale,
  extractLocaleFromPath,
  getLocaleDir
} from '../src/runtime/i18n';
import {
  createRobotsResponse,
  createSitemapResponse,
  formatRobotsTxt,
  formatSitemapXml,
  mergeMetadata,
  buildMetaTags,
  buildLinkTags,
  buildTitle,
  renderHeadTags,
  createManifestResponse,
  defineManifest,
  useSeoMeta
} from '../src/runtime/seo';

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
        plugins: [],
        crons: [],
        queues: [],
        locales: [],
        defaultLocale: 'en',
        appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } }
      },
      {
        cwd: tmpDir,
        srcDir: tmpDir,
        buildDir: '.ubean',
        imports: { autoImport: false },
        components: { autoImport: false }
      }
    );

    expect(result.generated).toHaveLength(4);
    expect(existsSync(result.routeTypesPath)).toBe(true);
    expect(existsSync(result.pageTypesPath)).toBe(true);
    expect(existsSync(result.autoImportsDtsPath!)).toBe(true);
    expect(existsSync(result.componentsDtsPath!)).toBe(true);

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
        plugins: [],
        crons: [],
        queues: [],
        locales: [],
        defaultLocale: 'en',
        appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } }
      },
      {
        cwd: tmpDir,
        srcDir: tmpDir,
        buildDir: '.ubean-empty',
        imports: { autoImport: false },
        components: { autoImport: false }
      }
    );

    expect(result.generated).toHaveLength(4);
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

  it('throws on validation failure when mode is throw', () => {
    const originalEnv = process.env;
    process.env = {};
    expect(() =>
      defineEnv({
        mode: 'throw',
        server: {
          REQUIRED_VAR: { type: String }
        }
      })
    ).toThrow(/Environment validation failed/);
    process.env = originalEnv;
  });

  it('parses boolean "1" as true and "false"/"0" as false', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, BOOL_1: '1', BOOL_0: '0', BOOL_FALSE: 'false', BOOL_TRUE: 'true' };
    const { env } = defineEnv({
      server: {
        BOOL_1: { type: Boolean },
        BOOL_0: { type: Boolean, required: false },
        BOOL_FALSE: { type: Boolean, required: false },
        BOOL_TRUE: { type: Boolean, required: false }
      }
    });
    expect(env.BOOL_1).toBe(true);
    expect(env.BOOL_0).toBe(false);
    expect(env.BOOL_FALSE).toBe(false);
    expect(env.BOOL_TRUE).toBe(true);
    process.env = originalEnv;
  });

  it('returns error for invalid number values', () => {
    const { validate } = defineEnv({
      mode: 'warn',
      server: {
        BAD_NUMBER: { type: Number }
      }
    });
    const result = validate({ BAD_NUMBER: 'not-a-number' });
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('must be a number');
  });

  it('merges public and server schemas', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, PUB_VAR: 'public-val', SRV_VAR: 'server-val' };
    const { env } = defineEnv({
      public: { PUB_VAR: { type: String } },
      server: { SRV_VAR: { type: String } }
    });
    expect(env.PUB_VAR).toBe('public-val');
    expect(env.SRV_VAR).toBe('server-val');
    process.env = originalEnv;
  });

  it('proxy returns undefined for non-string symbol access', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, MY_VAR: 'val' };
    const { env } = defineEnv({ server: { MY_VAR: { type: String } } });
    expect((env as any)[Symbol('test')]).toBeUndefined();
    process.env = originalEnv;
  });
});

describe('useRuntimeEnv', () => {
  it('stores and retrieves runtime env values', () => {
    setRuntimeEnv({ MY_KEY: 'my-value' });
    expect(useRuntimeEnv('MY_KEY')).toBe('my-value');
    expect(useRuntimeEnv('NONEXISTENT', 'default')).toBe('default');
  });

  it('merges new env with existing', () => {
    setRuntimeEnv({ A: '1' });
    setRuntimeEnv({ B: '2' });
    expect(useRuntimeEnv('A')).toBe('1');
    expect(useRuntimeEnv('B')).toBe('2');
  });

  it('overrides existing keys with later values', () => {
    setRuntimeEnv({ OVERRIDE: 'first' });
    setRuntimeEnv({ OVERRIDE: 'second' });
    expect(useRuntimeEnv('OVERRIDE')).toBe('second');
  });

  it('returns undefined for missing keys without default', () => {
    setRuntimeEnv({});
    expect(useRuntimeEnv('MISSING')).toBeUndefined();
  });
});

describe('createClient', () => {
  it('creates a client with http methods', () => {
    const client = createClient({ baseURL: 'http://localhost:3000' });
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
    expect(typeof client.raw).toBe('function');
    expect(typeof client.$get).toBe('function');
    expect(typeof client.$post).toBe('function');
    expect(client.runtime).toBeDefined();
  });

  it('builds URLs with baseURL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    const client = createClient({ baseURL: 'http://api.example.com' });
    await client.get('/users');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('http://api.example.com/users'),
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
    const client = createClient({ baseURL: 'http://api.example.com' });
    await client.get('/users', { query: { page: '2', limit: '10' } });
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
    const client = createClient({ baseURL: 'http://api.example.com' });
    await client.post('/users', { name: 'Test' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test' })
      })
    );
    fetchSpy.mockRestore();
  });

  it('supports flat client mode with $get/$post', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const client = createClient({ baseURL: 'http://api.example.com' });
    const result = await client.$get('/users/1');
    expect(result.data).toEqual({ id: 1 });
    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
    fetchSpy.mockRestore();
  });

  it('flat client returns error on failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const client = createClient({ baseURL: 'http://api.example.com' });
    const result = await client.$get('/users/999');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.status).toBe(404);
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
    expect(code).toContain('defineApp');
    expect(code).toContain('createApp()');
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

describe('i18n runtime', () => {
  beforeEach(() => {
    clearLocales();
  });

  it('defines a locale with defineLocale', () => {
    defineLocale({
      code: 'en',
      messages: { hello: 'Hello', welcome: 'Welcome' },
      isDefault: true
    });

    expect(getRegisteredLocales()).toContain('en');
    expect(getLocale()).toBe('en');
  });

  it('translates keys with t()', () => {
    defineLocale({
      code: 'en',
      messages: { hello: 'Hello', greeting: 'Hello {name}' },
      isDefault: true
    });

    expect(t('hello')).toBe('Hello');
    expect(t('greeting', { name: 'World' })).toBe('Hello World');
    expect(t('nonexistent')).toBe('nonexistent');
  });

  it('supports nested message keys', () => {
    defineLocale({
      code: 'en',
      messages: {
        nav: { home: 'Home', about: 'About' }
      },
      isDefault: true
    });

    expect(t('nav.home')).toBe('Home');
    expect(t('nav.about')).toBe('About');
  });

  it('switches locales with setLocale', () => {
    defineLocale({
      code: 'en',
      messages: { hello: 'Hello' },
      isDefault: true
    });
    defineLocale({
      code: 'zh',
      messages: { hello: '你好' }
    });

    expect(t('hello')).toBe('Hello');
    setLocale('zh');
    expect(t('hello')).toBe('你好');
    expect(getLocale()).toBe('zh');
  });

  it('falls back to default locale when key missing', () => {
    defineLocale({
      code: 'en',
      messages: { hello: 'Hello', goodbye: 'Goodbye' },
      isDefault: true
    });
    defineLocale({
      code: 'zh',
      messages: { hello: '你好' }
    });

    setLocale('zh');
    expect(t('hello')).toBe('你好');
    expect(t('goodbye')).toBe('Goodbye');
  });

  it('useI18n returns working instance', () => {
    defineLocale({
      code: 'en',
      messages: { test: 'Test' },
      isDefault: true
    });

    const i18n = useI18n();
    expect(i18n.locale).toBe('en');
    expect(i18n.fallbackLocale).toBe('en');
    expect(i18n.availableLocales).toContain('en');
    expect(i18n.t('test')).toBe('Test');
  });

  it('detects locale from Accept-Language header', () => {
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });
    defineLocale({ code: 'ja', messages: {} });

    const i18n = useI18n();

    expect(i18n.detectLocale('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh');
    expect(i18n.detectLocale('ja-JP;q=1.0,en;q=0.5')).toBe('ja');
    expect(i18n.detectLocale('fr-FR,fr;q=0.9')).toBe('en');
    expect(i18n.detectLocale(undefined)).toBe('en');
  });

  it('addLocale adds or merges messages', () => {
    defineLocale({ code: 'en', messages: { a: 'A' }, isDefault: true });

    const i18n = useI18n();
    i18n.addLocale('en', { b: 'B' });
    expect(i18n.t('a')).toBe('A');
    expect(i18n.t('b')).toBe('B');

    i18n.addLocale('fr', { c: 'C' });
    expect(i18n.availableLocales).toContain('fr');
    expect(i18n.t('a')).toBe('A');
    expect(i18n.t('c')).toBe('c');
    setLocale('fr');
    expect(i18n.t('c')).toBe('C');
    expect(i18n.t('a')).toBe('A');
  });

  it('mergeLocale merges into existing locale', () => {
    defineLocale({ code: 'en', messages: { a: 'A' }, isDefault: true });

    const i18n = useI18n();
    i18n.mergeLocale('en', { b: 'B' });
    expect(i18n.t('a')).toBe('A');
    expect(i18n.t('b')).toBe('B');

    i18n.mergeLocale('de', { d: 'D' });
    expect(i18n.availableLocales).toContain('de');
  });

  it('handles RTL locale direction', () => {
    defineLocale({
      code: 'ar',
      messages: { hello: 'مرحبا' },
      dir: 'rtl',
      isDefault: true
    });

    expect(t('hello')).toBe('مرحبا');
  });

  it('setI18nConfig updates config', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });

    setI18nConfig({ strategy: 'prefix' });
    const config = getI18nConfig();
    expect(config.strategy).toBe('prefix');
    expect(config.locales).toContain('en');
    expect(config.locales).toContain('zh');
  });

  it('getDefaultLocale returns the default locale', () => {
    clearLocales();
    defineLocale({ code: 'zh', messages: {}, isDefault: true });
    defineLocale({ code: 'en', messages: {} });

    expect(getDefaultLocale()).toBe('zh');
  });

  it('localizePath adds locale prefix for prefix_except_default strategy', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });
    setI18nConfig({ strategy: 'prefix_except_default' });

    setLocale('en');
    expect(localizePath('/about')).toBe('/about');
    expect(localizePath('/')).toBe('/');

    setLocale('zh');
    expect(localizePath('/about')).toBe('/zh/about');
    expect(localizePath('/')).toBe('/zh');
  });

  it('localizePath adds locale prefix for prefix strategy', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });
    setI18nConfig({ strategy: 'prefix' });

    setLocale('en');
    expect(localizePath('/about')).toBe('/en/about');
    expect(localizePath('/')).toBe('/en');

    setLocale('zh');
    expect(localizePath('/about')).toBe('/zh/about');
  });

  it('localizePath does not add prefix for no_prefix strategy', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });
    setI18nConfig({ strategy: 'no_prefix' });

    setLocale('zh');
    expect(localizePath('/about')).toBe('/about');
    expect(localizePath('/')).toBe('/');
  });

  it('localizePath can accept explicit locale parameter', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });
    setI18nConfig({ strategy: 'prefix_except_default' });

    expect(localizePath('/about', 'zh')).toBe('/zh/about');
    expect(localizePath('/about', 'en')).toBe('/about');
  });

  it('extractLocaleFromPath extracts locale and remaining path', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'zh', messages: {} });

    let result = extractLocaleFromPath('/zh/about');
    expect(result.locale).toBe('zh');
    expect(result.pathWithoutLocale).toBe('/about');

    result = extractLocaleFromPath('/about');
    expect(result.locale).toBeNull();
    expect(result.pathWithoutLocale).toBe('/about');

    result = extractLocaleFromPath('/');
    expect(result.locale).toBeNull();
    expect(result.pathWithoutLocale).toBe('/');
  });

  it('buildPageShell injects locale data script and html lang/dir attributes', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'ar', messages: {}, dir: 'rtl' });

    const pageObj: any = {
      component: 'pages/index',
      props: {},
      params: {},
      url: '/',
      head: { title: 'Test' }
    };

    const htmlEn = buildPageShell(pageObj, {}, '', 'app', { locale: 'en', localeDir: 'ltr' });
    expect(htmlEn).toContain('<html lang="en" dir="ltr"');
    expect(htmlEn).toContain(`id="${LOCALE_DATA_ID}"`);
    expect(htmlEn).toContain('"locale":"en"');

    const htmlAr = buildPageShell(pageObj, {}, '', 'app', { locale: 'ar', localeDir: 'rtl' });
    expect(htmlAr).toContain('<html lang="ar" dir="rtl"');
    expect(htmlAr).toContain('"locale":"ar"');
    expect(htmlAr).toContain('"dir":"rtl"');
  });

  it('buildPageShell without renderContext does not inject locale script', () => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });

    const pageObj: any = {
      component: 'pages/index',
      props: {},
      params: {},
      url: '/'
    };

    const html = buildPageShell(pageObj, {});
    expect(html).not.toContain(LOCALE_DATA_ID);
  });
});

describe('observability', () => {
  it('generateRequestId produces unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('uses crypto.randomUUID when available', () => {
    const id = generateRequestId();
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it('createRequestIdMiddleware generates ID when no incoming header', async () => {
    const mw = createRequestIdMiddleware();
    let capturedId: string | undefined;
    const c: any = {
      req: { header: () => undefined },
      set: (_k: string, v: string) => {
        capturedId = v;
      },
      get: (k: string) => (k === 'requestId' ? capturedId : undefined),
      header: vi.fn()
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(c, next);

    expect(capturedId).toBeTruthy();
    expect(next).toHaveBeenCalled();
    expect(c.header).toHaveBeenCalledWith('x-request-id', capturedId);
  });

  it('createRequestIdMiddleware reuses incoming X-Request-Id', async () => {
    const mw = createRequestIdMiddleware();
    let capturedId: string | undefined;
    const incomingId = 'my-trace-id-123';
    const c: any = {
      req: { header: (name: string) => (name === 'x-request-id' ? incomingId : undefined) },
      set: (_k: string, v: string) => {
        capturedId = v;
      },
      get: (k: string) => (k === 'requestId' ? capturedId : undefined),
      header: vi.fn()
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(c, next);

    expect(capturedId).toBe(incomingId);
    expect(c.header).toHaveBeenCalledWith('x-request-id', incomingId);
  });

  it('createRequestIdMiddleware supports custom header name', async () => {
    const mw = createRequestIdMiddleware({ headerName: 'x-trace-id' });
    let capturedId: string | undefined;
    const incomingId = 'custom-trace';
    const c: any = {
      req: { header: (name: string) => (name === 'x-trace-id' ? incomingId : undefined) },
      set: (_k: string, v: string) => {
        capturedId = v;
      },
      get: (k: string) => (k === 'requestId' ? capturedId : undefined),
      header: vi.fn()
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(c, next);

    expect(capturedId).toBe(incomingId);
    expect(c.header).toHaveBeenCalledWith('x-trace-id', incomingId);
  });

  it('createRequestIdMiddleware can skip response header', async () => {
    const mw = createRequestIdMiddleware({ setResponseHeader: false });
    const c: any = {
      req: { header: () => undefined },
      set: vi.fn(),
      get: vi.fn(),
      header: vi.fn()
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(c, next);

    expect(c.header).not.toHaveBeenCalled();
  });

  it('getRequestId retrieves ID from context', () => {
    const c: any = { get: (k: string) => (k === 'requestId' ? 'test-id-123' : undefined) };
    expect(getRequestId(c)).toBe('test-id-123');
  });

  it('app automatically includes x-request-id response header', async () => {
    const app = createUbeanApp();
    await app.init();
    const res = await app.hono.request('/_health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.status).toBe(200);
  });

  it('createSpan creates span with name and context', () => {
    const span = createSpan({ name: 'test-span' });
    expect(span.name).toBe('test-span');
    expect(span.context.traceId).toBeTruthy();
    expect(span.context.spanId).toBeTruthy();
    expect(span.context.spanId).toHaveLength(16);
    expect(span.startTime).toBeGreaterThan(0);
    expect(span.status).toBe('ok');
    expect(span.isRecording()).toBe(true);
  });

  it('createSpan supports parent span context inheritance', () => {
    const parent = createSpan({ name: 'parent' });
    const child = createSpan({ name: 'child', parent });
    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
  });

  it('span.end() records end time and duration', () => {
    const span = createSpan({ name: 'test' });
    expect(span.duration()).toBeUndefined();
    span.end();
    expect(span.endTime).toBeGreaterThanOrEqual(span.startTime);
    expect(span.duration()).toBeGreaterThanOrEqual(0);
    expect(span.isRecording()).toBe(false);
  });

  it('span.end({status,error}) sets status and error', () => {
    const err = new Error('fail');
    const span = createSpan({ name: 'test' });
    span.end({ status: 'error', error: err });
    expect(span.status).toBe('error');
    expect(span.error).toBe(err);
  });

  it('span.setAttribute/setAttributes only work while recording', () => {
    const span = createSpan({ name: 'test', attributes: { a: 1 } });
    span.setAttribute('b', 2);
    expect(span.attributes.b).toBe(2);
    span.end();
    span.setAttribute('c', 3);
    expect(span.attributes.c).toBeUndefined();
  });

  it('span.addEvent records events with timestamp', () => {
    const span = createSpan({ name: 'test' });
    span.addEvent('cache-miss', { key: 'user:1' });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('cache-miss');
    expect(span.events[0].timestamp).toBeGreaterThan(0);
  });

  it('createObservabilityTracer.startSpan calls hooks on start and end', async () => {
    const tracer = createObservabilityTracer();
    const startFn = vi.fn();
    const endFn = vi.fn();
    tracer.hooks.hook('span:start', startFn);
    tracer.hooks.hook('span:end', endFn);
    const span = tracer.startSpan({ name: 'hooked' });
    expect(startFn).toHaveBeenCalledWith(span);
    span.end();
    await new Promise(r => setTimeout(r, 10));
    expect(endFn).toHaveBeenCalledWith(span);
  });

  it('tracer.redactAttributes redacts sensitive keys', () => {
    const tracer = createObservabilityTracer();
    const redacted = tracer.redactAttributes({
      username: 'john',
      password: 'secret123',
      token: 'abc123',
      Authorization: 'Bearer xyz',
      normal: 'visible'
    });
    expect(redacted.username).toBe('john');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.Authorization).toBe('[REDACTED]');
    expect(redacted.normal).toBe('visible');
  });

  it('tracer.redactAttributes truncates long strings', () => {
    const tracer = createObservabilityTracer();
    const long = 'x'.repeat(3000);
    const redacted = tracer.redactAttributes({ long });
    expect((redacted.long as string).length).toBeLessThan(3000);
    expect(redacted.long as string).toContain('...[truncated]');
  });

  it('tracer exports spans to registered exporters', async () => {
    const exported: any[] = [];
    const exporter = { name: 'test', exportSpan: vi.fn((s: any) => exported.push(s)) };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const span = tracer.startSpan({ name: 'exp' });
    span.end();
    await new Promise(r => setTimeout(r, 10));
    expect(exporter.exportSpan).toHaveBeenCalled();
    expect(exported[0].name).toBe('exp');
  });

  it('tracer.addExporter/removeExporter manages exporters', () => {
    const tracer = createObservabilityTracer();
    const ex = { name: 'custom', exportSpan: vi.fn() };
    tracer.addExporter(ex);
    tracer.removeExporter('custom');
    const span = tracer.startSpan({ name: 'x' });
    span.end();
    expect(ex.exportSpan).not.toHaveBeenCalled();
  });

  it('tracer.withSpan wraps function and ends span on success or error', async () => {
    const tracer = createObservabilityTracer({ enabled: false });
    let capturedSpan: any;
    const result = await tracer.withSpan('wrap', span => {
      capturedSpan = span;
      return 42;
    });
    expect(result).toBe(42);
    expect(capturedSpan.isRecording()).toBe(false);

    await expect(
      tracer.withSpan('fail', () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('withSpan global convenience function works', async () => {
    const tracer = createObservabilityTracer();
    setGlobalTracer(tracer);
    const result = await withSpan('global-test', () => 'ok');
    expect(result).toBe('ok');
  });

  it('createConsoleExporter creates an exporter', () => {
    const ex = createConsoleExporter({ slowThreshold: 100 });
    expect(ex.name).toBe('console');
    const span = createSpan({ name: 'con' });
    span.end();
    expect(() => ex.exportSpan(span)).not.toThrow();
  });

  it('createOpenTelemetryExporter batches spans and supports custom fetch', async () => {
    let capturedBody: string | undefined;
    const fakeFetch = vi.fn(async (_url: string, init: any) => {
      capturedBody = init.body;
      return { ok: true } as Response;
    });
    const ex = createOpenTelemetryExporter({
      url: 'http://localhost:4318/v1/traces',
      serviceName: 'test-svc',
      serviceVersion: '1.0.0',
      fetchImpl: fakeFetch as any
    });
    expect(ex.name).toBe('opentelemetry');

    const span = createSpan({ name: 'otel-test', attributes: { 'http.method': 'GET' } });
    span.end();
    ex.exportSpan(span);

    await (ex as any).flush();
    expect(fakeFetch).toHaveBeenCalled();
    const body = JSON.parse(capturedBody!);
    expect(body.resourceSpans[0].resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'test-svc' }
    });
    expect(body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
    expect(body.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('otel-test');
  });

  it('createTracingMiddleware creates span for request lifecycle', async () => {
    const tracer = createObservabilityTracer();
    let capturedSpan: any;
    const store = new Map<string, unknown>();
    const c: any = {
      req: { method: 'GET', path: '/api/test', header: () => undefined },
      set: (k: string, v: unknown) => store.set(k, v),
      get: (k: string) => store.get(k),
      header: vi.fn(),
      res: { status: 200 }
    };
    const next = vi.fn(async () => {
      capturedSpan = store.get('span');
      expect(capturedSpan).toBeTruthy();
      expect(capturedSpan.name).toBe('GET /api/test');
      expect(capturedSpan.attributes['http.method']).toBe('GET');
    });

    const mw = createTracingMiddleware({ tracer });
    await mw(c, next);
    expect(next).toHaveBeenCalled();
    expect(capturedSpan.status).toBe('ok');
    expect(capturedSpan.attributes['http.status_code']).toBe(200);
  });

  it('createTracingMiddleware marks error status on thrown errors', async () => {
    const tracer = createObservabilityTracer();
    const store = new Map<string, unknown>();
    const c: any = {
      req: { method: 'POST', path: '/fail', header: () => undefined },
      set: (k: string, v: unknown) => store.set(k, v),
      get: (k: string) => store.get(k),
      header: vi.fn(),
      res: { status: 500 }
    };
    const err = new Error('server error');
    const next = vi.fn(async () => {
      throw err;
    });
    const mw = createTracingMiddleware({ tracer });
    await expect(mw(c, next)).rejects.toThrow(err);
    const span = store.get('span') as any;
    expect(span.status).toBe('error');
    expect(span.error).toBe(err);
  });
});

describe('seo', () => {
  it('formatRobotsTxt generates correct robots.txt for single group', () => {
    const txt = formatRobotsTxt({
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/private'],
      sitemap: 'https://example.com/sitemap.xml'
    });

    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api/private');
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('formatRobotsTxt supports multiple user agents and crawl-delay', () => {
    const txt = formatRobotsTxt([
      { userAgent: 'Googlebot', allow: '/', disallow: '/search', crawlDelay: 1 },
      { userAgent: '*', disallow: '/admin' }
    ]);

    expect(txt).toContain('User-agent: Googlebot');
    expect(txt).toContain('Crawl-delay: 1');
    expect(txt).toContain('User-agent: *');
  });

  it('createRobotsResponse returns text/plain response', async () => {
    const res = createRobotsResponse({ disallow: '/admin' });
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('Disallow: /admin');
  });

  it('formatSitemapXml generates valid XML sitemap', () => {
    const xml = formatSitemapXml([
      { loc: 'https://example.com/', lastmod: '2024-01-01', changefreq: 'daily', priority: 1.0 },
      { loc: 'https://example.com/about', changefreq: 'monthly', priority: 0.8 }
    ]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<lastmod>2024-01-01</lastmod>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<loc>https://example.com/about</loc>');
    expect(xml).toContain('</urlset>');
  });

  it('formatSitemapXml supports Date objects for lastmod', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const xml = formatSitemapXml([{ loc: 'https://example.com/', lastmod: date }]);
    expect(xml).toContain('<lastmod>2024-06-15</lastmod>');
  });

  it('formatSitemapXml escapes special XML characters in URLs', () => {
    const xml = formatSitemapXml([{ loc: 'https://example.com/search?q=test&lang=en' }]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('&lang');
  });

  it('createSitemapResponse returns application/xml response', async () => {
    const res = createSitemapResponse([{ loc: 'https://example.com/' }]);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const body = await res.text();
    expect(body).toContain('<urlset');
  });

  it('useSeoMeta returns metadata as-is', () => {
    const meta = { title: 'Test', description: 'Desc' };
    expect(useSeoMeta(meta)).toBe(meta);
  });

  it('mergeMetadata merges basic fields with later overriding earlier', () => {
    const merged = mergeMetadata({ title: 'Default', description: 'Default desc' }, { title: 'Page Title' });
    expect(merged.title).toBe('Page Title');
    expect(merged.description).toBe('Default desc');
  });

  it('mergeMetadata handles null/undefined inputs gracefully', () => {
    const merged = mergeMetadata(null, undefined, { title: 'Test' }, null);
    expect(merged.title).toBe('Test');
  });

  it('mergeMetadata merges openGraph and twitter objects', () => {
    const merged = mergeMetadata(
      { openGraph: { title: 'OG Title', type: 'website' } },
      { openGraph: { description: 'OG Desc' }, twitter: { card: 'summary' } }
    );
    expect(merged.openGraph?.title).toBe('OG Title');
    expect(merged.openGraph?.type).toBe('website');
    expect(merged.openGraph?.description).toBe('OG Desc');
    expect(merged.twitter?.card).toBe('summary');
  });

  it('mergeMetadata concatenates meta and link arrays', () => {
    const merged = mergeMetadata(
      { meta: [{ name: 'foo', content: 'bar' }], link: [{ rel: 'icon', href: '/a.ico' }] },
      { meta: [{ name: 'baz', content: 'qux' }], link: [{ rel: 'icon', href: '/b.ico' }] }
    );
    expect(merged.meta).toHaveLength(2);
    expect(merged.meta?.[0].name).toBe('foo');
    expect(merged.meta?.[1].name).toBe('baz');
    expect(merged.link).toHaveLength(2);
  });

  it('mergeMetadata merges htmlAttrs and bodyAttrs', () => {
    const merged = mergeMetadata(
      { htmlAttrs: { lang: 'en' }, bodyAttrs: { class: 'light' } },
      { htmlAttrs: { dir: 'ltr' }, bodyAttrs: { class: 'dark' } }
    );
    expect(merged.htmlAttrs?.lang).toBe('en');
    expect(merged.htmlAttrs?.dir).toBe('ltr');
    expect(merged.bodyAttrs?.class).toBe('dark');
  });

  it('buildMetaTags generates description, keywords, author tags', () => {
    const tags = buildMetaTags({
      description: 'My site',
      keywords: ['a', 'b', 'c'],
      author: 'John'
    });
    const names = tags.map(tag => tag.name);
    expect(names).toContain('description');
    expect(names).toContain('keywords');
    expect(names).toContain('author');
    const kwTag = tags.find(tag => tag.name === 'keywords');
    expect(kwTag?.content).toBe('a, b, c');
  });

  it('buildMetaTags supports string keywords', () => {
    const tags = buildMetaTags({ keywords: 'x, y, z' });
    expect(tags.find(tag => tag.name === 'keywords')?.content).toBe('x, y, z');
  });

  it('buildMetaTags handles robots as string', () => {
    const tags = buildMetaTags({ robots: 'noindex, nofollow' });
    expect(tags.find(tag => tag.name === 'robots')?.content).toBe('noindex, nofollow');
  });

  it('buildMetaTags handles robots as object with index/follow', () => {
    const tags = buildMetaTags({ robots: { index: false, follow: true } });
    expect(tags.find(tag => tag.name === 'robots')?.content).toBe('noindex, follow');
  });

  it('buildMetaTags generates OpenGraph tags', () => {
    const tags = buildMetaTags({
      openGraph: {
        title: 'OG Title',
        description: 'OG Desc',
        type: 'website',
        url: 'https://example.com',
        siteName: 'My Site',
        locale: 'en_US',
        localeAlternate: ['fr_FR', 'de_DE'],
        image: {
          url: 'https://example.com/og.png',
          width: 1200,
          height: 630,
          alt: 'OG Image',
          type: 'image/png'
        }
      }
    });
    const props = Object.fromEntries(
      tags
        .filter(tag => tag.property && !tag.property.startsWith('og:locale:alternate'))
        .map(tag => [tag.property, tag.content])
    );
    const altLocales = tags.filter(tag => tag.property === 'og:locale:alternate').map(tag => tag.content);
    expect(props['og:title']).toBe('OG Title');
    expect(props['og:description']).toBe('OG Desc');
    expect(props['og:type']).toBe('website');
    expect(props['og:image']).toBe('https://example.com/og.png');
    expect(props['og:image:width']).toBe('1200');
    expect(props['og:image:alt']).toBe('OG Image');
    expect(altLocales).toContain('fr_FR');
    expect(altLocales).toContain('de_DE');
  });

  it('buildMetaTags supports string image URL for og:image', () => {
    const tags = buildMetaTags({ openGraph: { image: 'https://example.com/img.jpg' } });
    const ogImg = tags.find(tag => tag.property === 'og:image');
    expect(ogImg?.content).toBe('https://example.com/img.jpg');
  });

  it('buildMetaTags generates Twitter card tags', () => {
    const tags = buildMetaTags({
      twitter: {
        card: 'summary_large_image',
        site: '@example',
        creator: '@author',
        title: 'Tw Title',
        description: 'Tw Desc',
        image: 'https://example.com/tw.png'
      }
    });
    const names = Object.fromEntries(
      tags.filter(tag => tag.name?.startsWith('twitter:')).map(tag => [tag.name, tag.content])
    );
    expect(names['twitter:card']).toBe('summary_large_image');
    expect(names['twitter:title']).toBe('Tw Title');
    expect(names['twitter:image']).toBe('https://example.com/tw.png');
  });

  it('buildMetaTags appends custom meta tags', () => {
    const tags = buildMetaTags({
      meta: [
        { name: 'custom', content: 'value' },
        { property: 'fb:app_id', content: '123' }
      ]
    });
    expect(tags.find(tag => tag.name === 'custom')?.content).toBe('value');
    expect(tags.find(tag => tag.property === 'fb:app_id')?.content).toBe('123');
  });

  it('buildLinkTags includes canonical and custom links', () => {
    const links = buildLinkTags({
      canonical: 'https://example.com/page',
      link: [
        { rel: 'alternate', hreflang: 'fr', href: 'https://example.com/fr' },
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' }
      ]
    });
    const rels = links.map(l => l.rel);
    expect(rels).toContain('canonical');
    expect(rels).toContain('alternate');
    expect(links.find(l => l.rel === 'canonical')?.href).toBe('https://example.com/page');
    expect(links.find(l => l.hreflang === 'fr')?.href).toBe('https://example.com/fr');
  });

  it('buildTitle uses title as-is without template', () => {
    expect(buildTitle({ title: 'Hello' })).toBe('Hello');
  });

  it('buildTitle applies string titleTemplate with %s placeholder', () => {
    expect(buildTitle({ title: 'Home', titleTemplate: '%s | My App' })).toBe('Home | My App');
  });

  it('buildTitle applies function titleTemplate', () => {
    const title = buildTitle({ title: 'About', titleTemplate: titleChunk => `${titleChunk} — Example` });
    expect(title).toBe('About — Example');
  });

  it('buildTitle falls back to fallbackTitle when no title', () => {
    expect(buildTitle({}, 'Fallback')).toBe('Fallback');
  });

  it('buildTitle does not apply template when no title and fallback is used', () => {
    expect(buildTitle({ titleTemplate: '%s | App' }, 'Fallback')).toBe('Fallback | App');
  });

  it('renderHeadTags renders title, meta tags, and link tags', () => {
    const html = renderHeadTags(
      {
        title: 'Test Page',
        titleTemplate: '%s | Site',
        description: 'A test page',
        canonical: 'https://example.com/test'
      },
      'Default'
    );
    expect(html).toContain('<title>Test Page | Site</title>');
    expect(html).toContain('<meta name="description" content="A test page">');
    expect(html).toContain('<link rel="canonical" href="https://example.com/test">');
  });

  it('renderHeadTags escapes HTML special characters', () => {
    const html = renderHeadTags({
      title: 'A & B <C> "D" \'E\'',
      description: 'Test & <test> "test"'
    });
    expect(html).toContain('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
    expect(html).toContain('Test &amp; &lt;test&gt; &quot;test&quot;');
  });

  it('createManifestResponse returns correct Content-Type and Cache-Control', async () => {
    const manifest = defineManifest({
      name: 'My App',
      short_name: 'App',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#000000',
      icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }]
    });
    const res = createManifestResponse(manifest);
    expect(res.headers.get('Content-Type')).toContain('application/manifest+json');
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');
    const body = await res.json();
    expect(body.name).toBe('My App');
    expect(body.display).toBe('standalone');
    expect(body.icons).toHaveLength(1);
    expect(body.icons[0].sizes).toBe('192x192');
  });
});
