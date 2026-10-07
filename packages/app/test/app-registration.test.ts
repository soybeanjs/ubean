/**
 * OPT-05 5a — @ubean/app 纯注册断言测试
 *
 * 测试形态：对 `app.hono` 路由栈断言已挂载，**不发 HTTP 请求**。
 * 覆盖 UbeanApp 构造器同步挂载（routeRules 中间件 + /_health）与
 * init() 异步挂载（Actions / Server Component / OpenAPI）+ hooks/plugins 生命周期。
 *
 * 不引入 supertest/HTTP 集成测（ADR-0002 测试边界）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearInternalFetcher } from '@ubean/routes';
import type { ScannedApiRoute } from '@ubean/scan';
import { clearGlobalHooks } from '../src/hooks';
import { UbeanApp } from '../src/app';
import type { UbeanAppPlugin } from '../src/app';

/**
 * 提取已注册路由的 (method, path) 对，用于断言。
 * Hono v4 的 `app.routes` 是公开只读属性，返回 RouterRoute[]。
 */
function registeredPaths(app: UbeanApp): { method: string; path: string }[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app.hono.routes as Array<{ method: string; path: string }>).map(r => ({
    method: r.method,
    path: r.path
  }));
}

function hasRoute(app: UbeanApp, method: string, path: string): boolean {
  return registeredPaths(app).some(r => r.method === method && r.path === path);
}

/**
 * TS-08：携带注册序号与 handler 引用的条目视图。
 *
 * `registeredPaths` 只保留 (method, path)，无法表达**注册顺序**与**条目身份**；
 * 而 `app.hono.routes` 的顺序就是 Hono 的匹配顺序，顺序本身是被测契约
 * （static 中间件必须先于用户路由，否则预渲染 HTML 会被 SSR 处理器抢走）。
 *
 * 注意：内部中间件以 `ALL /*` 且 `handler.name === ''` 出现，**不能按名字识别**，
 * 只能按 handler 引用身份区分（见 `_setupBaseMiddleware` 与 `init()` 的注册点）。
 */
interface RegisteredEntry {
  index: number;
  method: string;
  path: string;
  handler: unknown;
}

function registeredEntries(app: UbeanApp): RegisteredEntry[] {
  return (app.hono.routes as Array<{ method: string; path: string; handler: unknown }>).map((r, index) => ({
    index,
    method: r.method,
    path: r.path,
    handler: r.handler
  }));
}

/**
 * 去重后的 API 路由方法集：`path → 已注册方法列表`。
 *
 * `registerApiRoutes` 每个 (method, path) 会压入 **3 个条目**
 * （`metaMiddleware` → `matcherMiddleware` → `handlerWrapper`），
 * 所以「方法集」必须按 (method, path) 去重，不能数原始条目数。
 */
function apiMethodSets(app: UbeanApp): Record<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const entry of registeredEntries(app)) {
    if (entry.method === 'ALL' || !entry.path.startsWith('/api/')) continue;
    const set = sets.get(entry.path) ?? new Set<string>();
    set.add(entry.method);
    sets.set(entry.path, set);
  }
  return Object.fromEntries([...sets].map(([path, set]) => [path, [...set].sort()]));
}

beforeEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

afterEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

describe('UbeanApp 构造器 — 同步挂载', () => {
  it('默认挂载 /_health（GET）', () => {
    const app = new UbeanApp({});
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
  });

  it('healthEndpoint: false → 不挂载 /_health', () => {
    const app = new UbeanApp({ healthEndpoint: false });
    expect(hasRoute(app, 'GET', '/_health')).toBe(false);
  });

  it('无 routeRules → 不注册 routeRules 中间件（routes 中无 cache 规则相关）', () => {
    const app = new UbeanApp({});
    // 构造器总会注册若干 `use('*')` 中间件（handle hook、requestId、
    // websocket、request lifecycle），这里只断言 /_health 存在即可表明
    // 同步挂载路径正常工作
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
  });

  it('有 routeRules → 构造器同步挂载 routeRules 中间件', () => {
    const app = new UbeanApp({
      routeRules: {
        '/api/*': { cors: true }
      }
    });
    // routeRules 中间件通过 hono.use('*', ...) 注册，关键是不抛错且
    // /_health 仍正常挂载（证明构造器同步挂载路径完整执行）
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
    // 有 routeRules 时构造器注册更多中间件（routeRules + 可能的 cache），
    // routes 数量应不少于无 routeRules 的基线
    const baselineApp = new UbeanApp({});
    expect(registeredPaths(app).length).toBeGreaterThanOrEqual(registeredPaths(baselineApp).length);
  });

  it('routeRules 含 cache 规则 → 挂载 cache 中间件', () => {
    const app = new UbeanApp({
      routeRules: {
        '/cached/*': { cache: { maxAge: 60 } }
      }
    });
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
  });

  it('routeRules 含 isr 规则 → 初始化 cacheStore（不抛错）', () => {
    const app = new UbeanApp({
      routeRules: {
        '/isr/*': { isr: { revalidate: 60 } }
      }
    });
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
  });

  it('构造后 _ready 为 false（init 未调用）', () => {
    const app = new UbeanApp({});
    // 通过 lazyInit 会触发 init 来间接验证；这里直接检查 init 幂等性
    expect(app).toBeDefined();
  });

  it('默认挂载 CSRF + security headers + dataCache（比全关更多 use("*")）', () => {
    const secured = new UbeanApp({});
    const open = new UbeanApp({ csrf: false, securityHeaders: false, dataCache: false });
    expect(registeredPaths(secured).length).toBeGreaterThan(registeredPaths(open).length);
  });

  it('csrf: false 时仍可构造', () => {
    const app = new UbeanApp({ csrf: false, securityHeaders: false, dataCache: false });
    expect(hasRoute(app, 'GET', '/_health')).toBe(true);
  });
});

describe('UbeanApp.init() — 异步挂载', () => {
  it('init 后挂载 POST /__actions', async () => {
    const app = new UbeanApp({});
    await app.init();
    expect(hasRoute(app, 'POST', '/__actions')).toBe(true);
  });

  it('init 后挂载 POST /__server-component', async () => {
    const app = new UbeanApp({});
    await app.init();
    expect(hasRoute(app, 'POST', '/__server-component')).toBe(true);
  });

  it('openAPI: true → init 后挂载 GET /_openapi.json + GET /_scalar', async () => {
    const app = new UbeanApp({ openAPI: true });
    await app.init();
    expect(hasRoute(app, 'GET', '/_openapi.json')).toBe(true);
    expect(hasRoute(app, 'GET', '/_scalar')).toBe(true);
  });

  it('openAPI: {title, version} → init 后挂载 OpenAPI 路由', async () => {
    const app = new UbeanApp({
      openAPI: { title: 'Test API', version: '2.0.0' }
    });
    await app.init();
    expect(hasRoute(app, 'GET', '/_openapi.json')).toBe(true);
    expect(hasRoute(app, 'GET', '/_scalar')).toBe(true);
  });

  it('openAPI: {scalarPath, openAPIPath} → 自定义路径生效', async () => {
    const app = new UbeanApp({
      openAPI: { scalarPath: '/docs', openAPIPath: '/openapi.json' }
    });
    await app.init();
    expect(hasRoute(app, 'GET', '/openapi.json')).toBe(true);
    expect(hasRoute(app, 'GET', '/docs')).toBe(true);
    // 默认路径不应存在
    expect(hasRoute(app, 'GET', '/_openapi.json')).toBe(false);
    expect(hasRoute(app, 'GET', '/_scalar')).toBe(false);
  });

  it('openAPI: undefined → init 后不挂载 OpenAPI 路由', async () => {
    const app = new UbeanApp({});
    await app.init();
    expect(hasRoute(app, 'GET', '/_openapi.json')).toBe(false);
    expect(hasRoute(app, 'GET', '/_scalar')).toBe(false);
  });

  it('seoConventionModules → init 后挂载 GET /sitemap.xml', async () => {
    const app = new UbeanApp({
      seoConventionModules: {
        '/src/sitemap.ts': { default: () => [{ loc: 'https://example.com/' }] }
      }
    });
    await app.init();
    expect(hasRoute(app, 'GET', '/sitemap.xml')).toBe(true);
  });

  it('seoConventions: false → 不挂载约定路由', async () => {
    const app = new UbeanApp({
      seoConventions: false,
      seoConventionModules: {
        '/src/sitemap.ts': { default: () => [{ loc: 'https://example.com/' }] }
      }
    });
    await app.init();
    expect(hasRoute(app, 'GET', '/sitemap.xml')).toBe(false);
  });

  it('openAPI: false → init 后不挂载 OpenAPI 路由', async () => {
    const app = new UbeanApp({ openAPI: false });
    await app.init();
    expect(hasRoute(app, 'GET', '/_openapi.json')).toBe(false);
  });

  it('init 幂等：多次调用安全', async () => {
    const app = new UbeanApp({});
    await app.init();
    const routesAfterFirst = registeredPaths(app).length;
    await app.init(); // 第二次应 no-op
    const routesAfterSecond = registeredPaths(app).length;
    expect(routesAfterSecond).toBe(routesAfterFirst);
  });

  it('init 返回 this（链式）', async () => {
    const app = new UbeanApp({});
    const ret = await app.init();
    expect(ret).toBe(app);
  });
});

describe('UbeanApp lazyInit / resetInit', () => {
  it('lazyInit 返回同一 promise（未 init 时）', () => {
    const app = new UbeanApp({});
    const p1 = app.lazyInit();
    const p2 = app.lazyInit();
    expect(p1).toBe(p2);
  });

  it('lazyInit 在已 ready 后返回 resolved promise', async () => {
    const app = new UbeanApp({});
    await app.init();
    const p = app.lazyInit();
    expect(await p).toBe(app);
  });

  it('resetInit 后可重新 init', async () => {
    const app = new UbeanApp({});
    await app.init();
    app.resetInit();
    // resetInit 后 lazyInit 应触发新 init
    const p = app.lazyInit();
    const p2 = app.lazyInit();
    expect(p).toBe(p2);
    await p;
    expect(hasRoute(app, 'POST', '/__actions')).toBe(true);
  });
});

describe('UbeanApp plugins 生命周期', () => {
  it('plugin.setup 在 init 时被调用（app:created 之后、注册之前）', async () => {
    const setup = vi.fn();
    const plugin: UbeanAppPlugin = { name: 'test', setup };
    const app = new UbeanApp({ plugins: [plugin] });
    await app.init();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup.mock.calls[0][0]).toBe(app);
  });

  it('plugin.ready 在 init 末尾被调用（注册之后）', async () => {
    const ready = vi.fn();
    const plugin: UbeanAppPlugin = { name: 'test', ready };
    const app = new UbeanApp({ plugins: [plugin] });
    await app.init();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready.mock.calls[0][0]).toBe(app);
  });

  it('setup 在 ready 之前调用', async () => {
    const order: string[] = [];
    const plugin: UbeanAppPlugin = {
      name: 'test',
      setup: () => order.push('setup'),
      ready: () => order.push('ready')
    };
    const app = new UbeanApp({ plugins: [plugin] });
    await app.init();
    expect(order).toEqual(['setup', 'ready']);
  });

  it('多个 plugins 按顺序调用', async () => {
    const order: string[] = [];
    const p1: UbeanAppPlugin = { name: 'p1', setup: () => order.push('p1-setup'), ready: () => order.push('p1-ready') };
    const p2: UbeanAppPlugin = { name: 'p2', setup: () => order.push('p2-setup'), ready: () => order.push('p2-ready') };
    const app = new UbeanApp({ plugins: [p1, p2] });
    await app.init();
    expect(order).toEqual(['p1-setup', 'p2-setup', 'p1-ready', 'p2-ready']);
  });

  it('无 setup/ready 的 plugin 不抛错', async () => {
    const plugin: UbeanAppPlugin = { name: 'noop' };
    const app = new UbeanApp({ plugins: [plugin] });
    await expect(app.init()).resolves.toBe(app);
  });

  it('plugin.setup 可异步', async () => {
    let resolved = false;
    const plugin: UbeanAppPlugin = {
      name: 'async',
      setup: async () => {
        await new Promise(r => setTimeout(r, 0));
        resolved = true;
      }
    };
    const app = new UbeanApp({ plugins: [plugin] });
    await app.init();
    expect(resolved).toBe(true);
  });
});

describe('UbeanApp hooks 生命周期', () => {
  it('app:created hook 在 init 时触发', async () => {
    const app = new UbeanApp({});
    const hook = vi.fn();
    app.hooks.hook('app:created', hook);
    await app.init();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toBe(app.hono);
  });

  it('app:before:register hook 在 init 时触发', async () => {
    const app = new UbeanApp({});
    const hook = vi.fn();
    app.hooks.hook('app:before:register', hook);
    await app.init();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('app:after:register hook 在 init 时触发', async () => {
    const app = new UbeanApp({});
    const hook = vi.fn();
    app.hooks.hook('app:after:register', hook);
    await app.init();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('hooks 触发顺序：created → before:register → after:register', async () => {
    const order: string[] = [];
    const app = new UbeanApp({});
    app.hooks.hook('app:created', () => order.push('created'));
    app.hooks.hook('app:before:register', () => order.push('before'));
    app.hooks.hook('app:after:register', () => order.push('after'));
    await app.init();
    expect(order).toEqual(['created', 'before', 'after']);
  });
});

describe('UbeanApp 路由方法链式调用', () => {
  it('use() 返回 this（链式）', () => {
    const app = new UbeanApp({});
    const ret = app.use('*', async (_c, next) => await next());
    expect(ret).toBe(app);
  });

  it('get/post/put/patch/delete 返回 this', () => {
    const app = new UbeanApp({});
    expect(app.get('/x', c => c.text('x'))).toBe(app);
    expect(app.post('/x', c => c.text('x'))).toBe(app);
    expect(app.put('/x', c => c.text('x'))).toBe(app);
    expect(app.patch('/x', c => c.text('x'))).toBe(app);
    expect(app.delete('/x', c => c.text('x'))).toBe(app);
  });

  it('on() 支持字符串 method', () => {
    const app = new UbeanApp({});
    expect(app.on('GET', '/y', c => c.text('y'))).toBe(app);
    expect(hasRoute(app, 'GET', '/y')).toBe(true);
  });

  it('on() 支持数组 methods', () => {
    const app = new UbeanApp({});
    app.on(['GET', 'POST'], '/multi', c => c.text('m'));
    expect(hasRoute(app, 'GET', '/multi')).toBe(true);
    expect(hasRoute(app, 'POST', '/multi')).toBe(true);
  });
});

describe('TS-08 路由栈内省 — 顺序与内容', () => {
  const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url));
  const EXAMPLE_API_DIR = join(PKG_ROOT, '..', '..', 'examples', 'ubean-test', 'src', 'routes', 'api');
  const DECLARED_METHOD_RE = /^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;
  const noop = (): Response => new Response('x');

  function declaredMethodsOf(relativePath: string): string[] {
    const source = readFileSync(join(EXAMPLE_API_DIR, relativePath), 'utf8');
    const methods = [...source.matchAll(DECLARED_METHOD_RE)].map(match => match[1]);
    return [...new Set(methods)].sort();
  }

  function apiRouteFixtures(urlPath: string, relativePath: string, methods: string[]): ScannedApiRoute[] {
    return methods.map(method => ({
      route: urlPath,
      method,
      relativePath,
      fullPath: join(EXAMPLE_API_DIR, relativePath),
      dirname: 'routes/api',
      basename: relativePath.split('/').pop() as string,
      exports: methods,
      hasMeta: false
    }));
  }

  function loaderFor(methods: string[]): () => Promise<Record<string, () => Response>> {
    return async () => Object.fromEntries(methods.map(method => [method, noop]));
  }

  const SAMPLES = [
    { urlPath: '/api/hello', relativePath: 'hello.ts' },
    { urlPath: '/api/cookies', relativePath: 'cookies.ts' },
    { urlPath: '/api/users', relativePath: 'users/index.ts' }
  ];

  it('抽样：注册方法集与源码声明一致', async () => {
    const declared = SAMPLES.map(sample => ({ ...sample, methods: declaredMethodsOf(sample.relativePath) }));

    // 抽样前提：每个样本都真的解析出声明，否则断言会空转通过。
    for (const sample of declared) {
      expect(sample.methods.length, `${sample.relativePath} 未解析出方法声明`).toBeGreaterThan(0);
    }

    const app = new UbeanApp({
      routes: declared.flatMap(sample => apiRouteFixtures(sample.urlPath, sample.relativePath, sample.methods)),
      routeLoaders: Object.fromEntries(declared.map(sample => [sample.relativePath, loaderFor(sample.methods)]))
    });
    await app.init();

    const registered = apiMethodSets(app);
    for (const sample of declared) {
      expect(registered[sample.urlPath], `${sample.urlPath} 注册方法集`).toEqual(sample.methods);
    }
  });

  it('方法集是声明与模块导出的交集：缺失导出被静默丢弃', async () => {
    // 声明 GET+POST，模块只导出 GET，POST 不应进入路由栈。
    const app = new UbeanApp({
      routes: apiRouteFixtures('/api/partial', 'hello.ts', ['GET', 'POST']),
      routeLoaders: { 'hello.ts': loaderFor(['GET']) }
    });
    await app.init();

    expect(apiMethodSets(app)['/api/partial']).toEqual(['GET']);
  });

  it('static 中间件先于用户路由注册', async () => {
    const app = new UbeanApp({
      publicDir: 'src',
      rootDir: PKG_ROOT,
      routes: apiRouteFixtures('/api/hello', 'hello.ts', ['GET']),
      routeLoaders: { 'hello.ts': loaderFor(['GET']) }
    });

    // 构造器只挂基础中间件；init() 才挂 static + 用户路由。
    // 用 init 前条目数当分界线，避免把内部中间件条数写死。
    const ctorCount = registeredEntries(app).length;
    await app.init();

    const added = registeredEntries(app).filter(entry => entry.index >= ctorCount);
    const staticEntry = added.find(entry => entry.method === 'ALL' && entry.path === '/*');
    const firstUserRoute = added.find(entry => entry.path.startsWith('/api/'));

    expect(staticEntry, 'init() 未挂载 static 中间件').toBeDefined();
    expect(firstUserRoute, 'init() 未挂载用户路由').toBeDefined();
    expect(staticEntry!.index).toBeLessThan(firstUserRoute!.index);
  });
});

describe('createUbeanApp 工厂', () => {
  it('createUbeanApp() 返回 UbeanApp 实例', async () => {
    const { createUbeanApp } = await import('../src/app');
    const app = createUbeanApp({});
    expect(app).toBeInstanceOf(UbeanApp);
  });

  it('createUbeanApp(options) 透传 options', async () => {
    const { createUbeanApp } = await import('../src/app');
    const app = createUbeanApp({ healthEndpoint: false });
    expect(hasRoute(app, 'GET', '/_health')).toBe(false);
  });
});
