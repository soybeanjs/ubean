/**
 * P9-27 Analytics —— 单元测试
 *
 * 覆盖:
 * - 内置 providers(log / memory / mock)
 * - 全局 registry(register / unregister / clear)
 * - 全局默认 provider(set / get)
 * - 上下文提取(path / method / referrer / userAgent / locale / ip / requestId)
 * - trackPageView / trackEvent / trackRaw
 * - defineAnalyticsProvider
 * - 中间件(自动跟踪 page view / 方法过滤 / 排除路径 / trackAllStatus)
 * - useAnalytics helper
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { UbeanEnv } from '@ubean/shared';
import {
  createLogAnalyticsProvider,
  createMemoryAnalyticsProvider,
  createMockAnalyticsProvider,
  defineAnalyticsProvider,
  registerAnalyticsProvider,
  unregisterAnalyticsProvider,
  getAnalyticsProvider,
  listAnalyticsProviders,
  clearAnalyticsProviders,
  setGlobalAnalyticsProvider,
  getGlobalAnalyticsProvider,
  extractAnalyticsContext,
  trackPageView,
  trackEvent,
  trackRaw,
  createAnalyticsMiddleware,
  defineAnalytics,
  useAnalytics
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* 工具:构造测试用 Context                                                       */
/* -------------------------------------------------------------------------- */

function makeContext(
  overrides: Partial<Request> & {
    headers?: Record<string, string>;
    vars?: Record<string, unknown>;
  } = {}
): Context<UbeanEnv> {
  const url = overrides.url || 'http://example.com/page';
  const method = overrides.method || 'GET';
  const headers = new Headers(overrides.headers || {});
  const vars: Record<string, unknown> = { requestId: 'req-123', locale: 'zh-CN', ...overrides.vars };
  return {
    req: {
      method,
      url,
      path: new URL(url).pathname,
      header: (name: string) => headers.get(name.toLowerCase()) || undefined,
      raw: { headers } as any
    } as any,
    res: { status: 200, headers: new Headers() } as any,
    header: ((name: string, value: string) => {
      headers.set(name, value);
    }) as any,
    get: ((key: string) => vars[key]) as any,
    set: ((key: string, value: unknown) => {
      vars[key] = value;
    }) as any,
    json: ((data: unknown, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'content-type': 'application/json' }
      })) as any
  } as unknown as Context<UbeanEnv>;
}

beforeEach(() => {
  clearAnalyticsProviders();
});

afterEach(() => {
  clearAnalyticsProviders();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* 内置 providers                                                              */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: built-in providers', () => {
  describe('createLogAnalyticsProvider', () => {
    it('returns a provider named "log"', () => {
      const provider = createLogAnalyticsProvider();
      expect(provider.name).toBe('log');
      expect(typeof provider.track).toBe('function');
    });

    it('logs to console', () => {
      const provider = createLogAnalyticsProvider();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      provider.track('page_view', { path: '/' }, { method: 'GET' });
      expect(spy).toHaveBeenCalled();
      const arg = spy.mock.calls[0][1];
      expect(arg).toContain('page_view');
      expect(arg).toContain('"method":"GET"');
    });
  });

  describe('createMemoryAnalyticsProvider', () => {
    it('stores records in memory', () => {
      const provider = createMemoryAnalyticsProvider();
      provider.track('page_view', { path: '/' }, { method: 'GET' });
      provider.track('click', { target: 'button' }, { path: '/' });
      expect(provider.records).toHaveLength(2);
      expect(provider.records[0].event).toBe('page_view');
      expect(provider.records[0].type).toBe('page_view');
      expect(provider.records[1].event).toBe('click');
      expect(provider.records[1].type).toBe('event');
    });

    it('clear() empties the records', () => {
      const provider = createMemoryAnalyticsProvider();
      provider.track('page_view', {}, {});
      expect(provider.records).toHaveLength(1);
      provider.clear();
      expect(provider.records).toHaveLength(0);
    });

    it('destroy() empties the records', () => {
      const provider = createMemoryAnalyticsProvider();
      provider.track('page_view', {}, {});
      provider.destroy!();
      expect(provider.records).toHaveLength(0);
    });
  });

  describe('createMockAnalyticsProvider', () => {
    it('records calls with arguments', () => {
      const provider = createMockAnalyticsProvider();
      provider.track('page_view', { path: '/' }, { method: 'GET' });
      expect(provider.callCount).toBe(1);
      expect(provider.calls[0]).toEqual({
        event: 'page_view',
        properties: { path: '/' },
        context: { method: 'GET' }
      });
    });

    it('resets calls with reset()', () => {
      const provider = createMockAnalyticsProvider();
      provider.track('event', {}, {});
      provider.reset();
      expect(provider.callCount).toBe(0);
      expect(provider.calls).toHaveLength(0);
    });

    it('accepts custom impl', () => {
      const customTrack = vi.fn();
      const provider = createMockAnalyticsProvider({ name: 'custom', track: customTrack });
      provider.track('e', { a: 1 }, {});
      expect(customTrack).toHaveBeenCalledWith('e', { a: 1 }, {});
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 全局 registry                                                                */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: global registry', () => {
  it('registerAnalyticsProvider adds to registry', () => {
    const provider = createMockAnalyticsProvider();
    provider.name = 'r1';
    registerAnalyticsProvider(provider);
    expect(getAnalyticsProvider('r1')).toBe(provider);
    expect(listAnalyticsProviders()).toContain(provider);
  });

  it('unregisterAnalyticsProvider removes from registry', () => {
    const provider = createMockAnalyticsProvider();
    provider.name = 'r2';
    registerAnalyticsProvider(provider);
    unregisterAnalyticsProvider('r2');
    expect(getAnalyticsProvider('r2')).toBeUndefined();
  });

  it('clearAnalyticsProviders empties registry and global provider', () => {
    const provider = createMockAnalyticsProvider();
    provider.name = 'r3';
    registerAnalyticsProvider(provider);
    setGlobalAnalyticsProvider(provider);
    clearAnalyticsProviders();
    expect(listAnalyticsProviders()).toHaveLength(0);
    // After clearing, getting global should produce a fresh log provider
    const next = getGlobalAnalyticsProvider();
    expect(next.name).toBe('log');
  });

  it('setGlobalAnalyticsProvider / getGlobalAnalyticsProvider', () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    expect(getGlobalAnalyticsProvider()).toBe(memory);
  });
});

/* -------------------------------------------------------------------------- */
/* defineAnalyticsProvider                                                      */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: defineAnalyticsProvider', () => {
  it('creates a provider and registers it', () => {
    const provider = defineAnalyticsProvider({
      name: 'my-provider',
      track: () => {}
    });
    expect(provider.name).toBe('my-provider');
    expect(getAnalyticsProvider('my-provider')).toBe(provider);
  });

  it('throws if name is missing', () => {
    expect(() =>
      defineAnalyticsProvider({
        // @ts-expect-error - testing missing name
        track: () => {}
      })
    ).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* 上下文提取                                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: extractAnalyticsContext', () => {
  it('extracts path and method', () => {
    const c = makeContext({ url: 'http://example.com/about' });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.path).toBe('/about');
    expect(ctx.method).toBe('GET');
  });

  it('extracts referrer (prefer "referer")', () => {
    const c = makeContext({ headers: { referer: 'http://google.com' } });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.referrer).toBe('http://google.com');
  });

  it('falls back to "referrer" header if no "referer"', () => {
    const c = makeContext({ headers: { referrer: 'http://bing.com' } });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.referrer).toBe('http://bing.com');
  });

  it('extracts user-agent', () => {
    const c = makeContext({ headers: { 'user-agent': 'Mozilla/5.0' } });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.userAgent).toBe('Mozilla/5.0');
  });

  it('extracts locale from accept-language', () => {
    const c = makeContext({
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      vars: { locale: undefined }
    });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.locale).toBe('en-US,en;q=0.9');
  });

  it('prefers c.get("locale") over accept-language header', () => {
    const c = makeContext({ headers: { 'accept-language': 'en-US' } });
    const ctx = extractAnalyticsContext(c);
    // makeContext 的 c.get('locale') 返回 'zh-CN'
    expect(ctx.locale).toBe('zh-CN');
  });

  it('extracts request id from c.get("requestId")', () => {
    const c = makeContext();
    const ctx = extractAnalyticsContext(c);
    expect(ctx.requestId).toBe('req-123');
  });

  it('extracts IP from x-forwarded-for', () => {
    const c = makeContext({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.ip).toBe('1.2.3.4');
  });

  it('extracts IP from x-real-ip when no x-forwarded-for', () => {
    const c = makeContext({ headers: { 'x-real-ip': '9.9.9.9' } });
    const ctx = extractAnalyticsContext(c);
    expect(ctx.ip).toBe('9.9.9.9');
  });

  it('extracts status from response', () => {
    const c = makeContext();
    (c.res as any).status = 201;
    const ctx = extractAnalyticsContext(c);
    expect(ctx.status).toBe(201);
  });
});

/* -------------------------------------------------------------------------- */
/* trackPageView / trackEvent / trackRaw                                       */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: tracking functions', () => {
  it('trackPageView uses global provider by default', async () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    await trackPageView(c);
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].event).toBe('page_view');
  });

  it('trackPageView supports custom event name', async () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    await trackPageView(c, { eventName: 'spa_navigation' });
    expect(memory.records[0].event).toBe('spa_navigation');
  });

  it('trackPageView autoContext can be disabled', async () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    await trackPageView(c, { autoContext: false });
    expect(memory.records[0].context).toEqual({});
  });

  it('trackPageView attaches properties', async () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    await trackPageView(c, { properties: { page_type: 'home' } });
    expect(memory.records[0].properties.page_type).toBe('home');
  });

  it('trackPageView awaitFlush waits for flush', async () => {
    let flushCalled = false;
    const provider = defineAnalyticsProvider({
      name: 'flush-provider',
      track: () => {},
      flush: async () => {
        flushCalled = true;
      }
    });
    setGlobalAnalyticsProvider(provider);
    const c = makeContext();
    await trackPageView(c, { awaitFlush: true });
    expect(flushCalled).toBe(true);
  });

  it('trackEvent tracks a custom event', async () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    await trackEvent(c, 'signup', { method: 'github' });
    expect(memory.records[0].event).toBe('signup');
    expect(memory.records[0].properties.method).toBe('github');
  });

  it('trackRaw tracks without a Hono context', async () => {
    const memory = createMemoryAnalyticsProvider();
    await trackRaw('conversion', { value: 99 }, { path: '/checkout' }, memory);
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].event).toBe('conversion');
    expect(memory.records[0].properties.value).toBe(99);
    expect(memory.records[0].context.path).toBe('/checkout');
  });

  it('tracking falls back to log provider when none set', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const c = makeContext();
    await trackPageView(c);
    expect(spy).toHaveBeenCalled();
  });

  it('multiple providers all receive events', async () => {
    const m1 = createMemoryAnalyticsProvider();
    const m2 = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider([m1, m2]);
    const c = makeContext();
    await trackPageView(c);
    expect(m1.records).toHaveLength(1);
    expect(m2.records).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: createAnalyticsMiddleware', () => {
  it('tracks page view automatically on GET', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory }));
    app.get('/', c => c.json({ ok: true }));

    const res = await app.request('http://example.com/');
    expect(res.status).toBe(200);
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].event).toBe('page_view');
    expect(memory.records[0].context.path).toBe('/');
    expect(memory.records[0].context.method).toBe('GET');
    expect(memory.records[0].context.status).toBe(200);
    expect(memory.records[0].context.duration).toBeGreaterThanOrEqual(0);
  });

  it('does not track non-GET methods by default', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory }));
    app.post('/', c => c.json({ ok: true }));

    await app.request('http://example.com/', { method: 'POST' });
    expect(memory.records).toHaveLength(0);
  });

  it('tracks specified methods', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, methods: ['POST'] }));
    app.post('/', c => c.json({ ok: true }));

    await app.request('http://example.com/', { method: 'POST' });
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context.method).toBe('POST');
  });

  it('skips excluded paths (exact match)', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, exclude: ['/health'] }));
    app.get('/health', c => c.json({ ok: true }));
    app.get('/', c => c.json({ ok: true }));

    await app.request('http://example.com/health');
    await app.request('http://example.com/');
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context.path).toBe('/');
  });

  it('skips excluded paths (glob /**)', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, exclude: ['/api/**'] }));
    app.get('/api/users', c => c.json({ ok: true }));
    app.get('/', c => c.json({ ok: true }));

    await app.request('http://example.com/api/users');
    await app.request('http://example.com/');
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context.path).toBe('/');
  });

  it('does not track error responses by default', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory }));
    app.get('/err', c => c.json({ err: true }, 500));

    await app.request('http://example.com/err');
    expect(memory.records).toHaveLength(0);
  });

  it('tracks error responses when trackAllStatus is true', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, trackAllStatus: true }));
    app.get('/err', c => c.json({ err: true }, 500));

    await app.request('http://example.com/err');
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context.status).toBe(500);
  });

  it('respects shouldTrack=false', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use(
      '*',
      createAnalyticsMiddleware({
        provider: memory,
        shouldTrack: c => c.req.path === '/track'
      })
    );
    app.get('/track', c => c.json({ ok: true }));
    app.get('/skip', c => c.json({ ok: true }));

    await app.request('http://example.com/track');
    await app.request('http://example.com/skip');
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context.path).toBe('/track');
  });

  it('uses getProperties to add custom properties', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use(
      '*',
      createAnalyticsMiddleware({
        provider: memory,
        getProperties: () => ({ theme: 'dark' })
      })
    );
    app.get('/', c => c.json({ ok: true }));

    await app.request('http://example.com/');
    expect(memory.records[0].properties.theme).toBe('dark');
  });

  it('uses custom eventName', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, eventName: 'spa_view' }));
    app.get('/', c => c.json({ ok: true }));

    await app.request('http://example.com/');
    expect(memory.records[0].event).toBe('spa_view');
  });

  it('still tracks even if handler throws', async () => {
    const memory = createMemoryAnalyticsProvider();
    const app = new Hono();
    app.use('*', createAnalyticsMiddleware({ provider: memory, trackAllStatus: true }));
    app.get('/throw', () => {
      throw new Error('boom');
    });

    await app.request('http://example.com/throw');
    expect(memory.records.length).toBeGreaterThanOrEqual(1);
  });
});

describe('P9-27 Analytics: defineAnalytics', () => {
  it('returns same middleware as createAnalyticsMiddleware', async () => {
    const memory = createMemoryAnalyticsProvider();
    const mw = defineAnalytics({ provider: memory });
    expect(typeof mw).toBe('function');

    const app = new Hono();
    app.use('*', mw);
    app.get('/', c => c.json({ ok: true }));
    await app.request('http://example.com/');
    expect(memory.records).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* useAnalytics helper                                                          */
/* -------------------------------------------------------------------------- */

describe('P9-27 Analytics: useAnalytics', () => {
  it('trackPageView and trackEvent via helper', () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const c = makeContext();
    const analytics = useAnalytics(c);
    analytics.trackPageView({ page: 1 });
    analytics.trackEvent('click', { target: 'button' });
    expect(memory.records).toHaveLength(2);
    expect(memory.records[0].event).toBe('page_view');
    expect(memory.records[1].event).toBe('click');
  });

  it('works without context', () => {
    const memory = createMemoryAnalyticsProvider();
    setGlobalAnalyticsProvider(memory);
    const analytics = useAnalytics();
    analytics.trackEvent('ping');
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].context).toEqual({});
  });
});
