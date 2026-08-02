/**
 * CDN / Edge Cache 集成 —— 单元测试
 *
 * 覆盖:
 * - Surrogate Key 管理 (defineSurrogateKeys / getSurrogateKeys)
 * - Mock Purge 适配器
 * - 全局适配器注册表 (setGlobalPurgeAdapter / getGlobalPurgeAdapter)
 * - Cache-Control 中间件
 * - Cloudflare Purge 适配器
 * - Fastly Purge 适配器
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  defineSurrogateKeys,
  getSurrogateKeys,
  setGlobalPurgeAdapter,
  getGlobalPurgeAdapter,
  purgeKeys,
  purgeUrls,
  createCacheControlMiddleware,
  createCloudflarePurgeAdapter,
  createFastlyPurgeAdapter,
  createMockPurgeAdapter,
  _resetCdnCache
} from '../src';

/* -------------------------------------------------------------------------- */
/* 测试辅助:Mock Hono Context                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 创建一个简易的 Hono Context mock,满足以下 API:
 * - c.req.path / c.req.header(name)
 * - c.res.headers.get(name) / c.res.status
 * - c.header(name, value)
 *
 * 通过 _getHeader(name) 可断言已设置的响应头(大小写不敏感)。
 * c.header() 与 c.res.headers.get() 共享同一个 Map,
 * 因此预先在 resHeaders 中设置的值也会被中间件读取到(模拟已有响应头)。
 */
function createMockContext(
  opts: {
    path?: string;
    status?: number;
    resHeaders?: Record<string, string>;
    reqHeaders?: Record<string, string>;
  } = {}
) {
  const headers = new Map<string, string>();
  for (const [k, v] of Object.entries(opts.resHeaders ?? {})) {
    headers.set(k.toLowerCase(), v);
  }
  const reqHeaders = opts.reqHeaders ?? {};

  return {
    req: {
      path: opts.path ?? '/',
      header: (name: string) => reqHeaders[name.toLowerCase()] ?? undefined
    },
    res: {
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null
      },
      status: opts.status ?? 200
    },
    header: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    },
    _getHeader: (name: string) => headers.get(name.toLowerCase()) ?? null
  };
}

/* -------------------------------------------------------------------------- */
/* 全局隔离:每个测试前后重置 CDN 缓存全局状态                                    */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  _resetCdnCache();
});

afterEach(() => {
  _resetCdnCache();
});

/* -------------------------------------------------------------------------- */
/* Surrogate Key 管理                                                           */
/* -------------------------------------------------------------------------- */

describe('Surrogate Key 管理', () => {
  it('defineSurrogateKeys 在上下文上设置 surrogate key 头', () => {
    const ctx = createMockContext();
    defineSurrogateKeys(ctx as any, ['product:1', 'product-list']);

    expect(ctx._getHeader('Cache-Tag')).toBe('product:1,product-list');
  });

  it('defineSurrogateKeys 支持自定义头部名称', () => {
    const ctx = createMockContext();
    defineSurrogateKeys(ctx as any, ['k1', 'k2'], 'Surrogate-Key');

    expect(ctx._getHeader('Surrogate-Key')).toBe('k1,k2');
  });

  it('getSurrogateKeys 从响应头读取 keys', () => {
    const ctx = createMockContext({
      resHeaders: { 'Cache-Tag': 'key1,key2' }
    });

    expect(getSurrogateKeys(ctx as any)).toEqual(['key1', 'key2']);
  });

  it('getSurrogateKeys 回退到请求头', () => {
    const ctx = createMockContext({
      reqHeaders: { 'cache-tag': 'key3, key4' }
    });

    expect(getSurrogateKeys(ctx as any)).toEqual(['key3', 'key4']);
  });

  it('getSurrogateKeys 在无值时返回空数组', () => {
    const ctx = createMockContext();

    expect(getSurrogateKeys(ctx as any)).toEqual([]);
  });

  it('getSurrogateKeys 处理空白与多余逗号', () => {
    const ctx = createMockContext({
      resHeaders: { 'Cache-Tag': ' a , , b ,  ' }
    });

    expect(getSurrogateKeys(ctx as any)).toEqual(['a', 'b']);
  });

  it('空 keys 数组是 no-op,不设置任何头', () => {
    const ctx = createMockContext();
    defineSurrogateKeys(ctx as any, []);

    expect(ctx._getHeader('Cache-Tag')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Mock Purge 适配器                                                            */
/* -------------------------------------------------------------------------- */

describe('Mock Purge 适配器', () => {
  it('适配器名称为 mock', () => {
    const adapter = createMockPurgeAdapter();
    expect(adapter.name).toBe('mock');
  });

  it('purgeKeys 记录 keys 并返回成功', async () => {
    const adapter = createMockPurgeAdapter();
    const result = await adapter.purgeKeys(['k1', 'k2']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(2);
    expect(adapter.purgedKeys).toEqual([['k1', 'k2']]);
  });

  it('purgeUrls 记录 urls 并返回成功', async () => {
    const adapter = createMockPurgeAdapter();
    const result = await adapter.purgeUrls(['https://a.com', 'https://b.com']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(2);
    expect(adapter.purgedUrls).toEqual([['https://a.com', 'https://b.com']]);
  });

  it('purgeAll 递增计数并返回成功', async () => {
    const adapter = createMockPurgeAdapter();
    const result = await adapter.purgeAll();

    expect(result.success).toBe(true);
    expect(result.purged).toBe(-1);
    expect(adapter.purgedAllCount).toBe(1);

    await adapter.purgeAll();
    expect(adapter.purgedAllCount).toBe(2);
  });

  it('reset 清除所有记录数据', async () => {
    const adapter = createMockPurgeAdapter();
    await adapter.purgeKeys(['k1']);
    await adapter.purgeUrls(['https://a.com']);
    await adapter.purgeAll();

    adapter.reset();

    expect(adapter.purgedKeys).toEqual([]);
    expect(adapter.purgedUrls).toEqual([]);
    expect(adapter.purgedAllCount).toBe(0);
  });

  it('多次 purgeKeys 调用均被记录', async () => {
    const adapter = createMockPurgeAdapter();
    await adapter.purgeKeys(['k1']);
    await adapter.purgeKeys(['k2', 'k3']);

    expect(adapter.purgedKeys).toEqual([['k1'], ['k2', 'k3']]);
  });
});

/* -------------------------------------------------------------------------- */
/* 全局适配器注册表                                                             */
/* -------------------------------------------------------------------------- */

describe('全局适配器注册表', () => {
  it('setGlobalPurgeAdapter / getGlobalPurgeAdapter 正确存取', () => {
    const adapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(adapter);

    expect(getGlobalPurgeAdapter()).toBe(adapter);
  });

  it('setGlobalPurgeAdapter(null) 清除全局适配器', () => {
    const adapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(adapter);
    setGlobalPurgeAdapter(null);

    expect(getGlobalPurgeAdapter()).toBeNull();
  });

  it('purgeKeys(["key1"]) 在无显式适配器时使用全局适配器', async () => {
    const adapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(adapter);

    const result = await purgeKeys(['key1']);

    expect(result.success).toBe(true);
    expect(adapter.purgedKeys).toEqual([['key1']]);
  });

  it('purgeKeys(adapter, ["key1"]) 使用显式传入的适配器', async () => {
    const globalAdapter = createMockPurgeAdapter();
    const explicitAdapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(globalAdapter);

    const result = await purgeKeys(explicitAdapter, ['key1']);

    expect(result.success).toBe(true);
    expect(explicitAdapter.purgedKeys).toEqual([['key1']]);
    // 全局适配器不应被调用
    expect(globalAdapter.purgedKeys).toEqual([]);
  });

  it('未配置适配器时 purgeKeys 返回错误结果', async () => {
    const result = await purgeKeys(['key1']);

    expect(result.success).toBe(false);
    expect(result.purged).toBe(0);
    expect(result.error).toContain('No CDN purge adapter');
  });

  it('未配置适配器时 purgeUrls 返回错误结果', async () => {
    const result = await purgeUrls(['https://a.com']);

    expect(result.success).toBe(false);
    expect(result.purged).toBe(0);
    expect(result.error).toContain('No CDN purge adapter');
  });

  it('purgeKeys 空数组返回成功但 purged=0', async () => {
    const adapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(adapter);

    const result = await purgeKeys([]);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(0);
    expect(adapter.purgedKeys).toEqual([]);
  });

  it('purgeUrls 使用全局适配器', async () => {
    const adapter = createMockPurgeAdapter();
    setGlobalPurgeAdapter(adapter);

    const result = await purgeUrls(['https://a.com']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(1);
    expect(adapter.purgedUrls).toEqual([['https://a.com']]);
  });
});

/* -------------------------------------------------------------------------- */
/* Cache-Control 中间件                                                         */
/* -------------------------------------------------------------------------- */

describe('Cache-Control 中间件', () => {
  it('使用 defaultMaxAge 和 sMaxAge 设置正确的 Cache-Control', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60, sMaxAge: 300 });
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=60, s-maxage=300');
  });

  it('maxAge=0 时设置 no-cache, no-store, must-revalidate', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 0 });
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('跳过排除路径(前缀匹配),不设置 Cache-Control', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      exclude: ['/api/health']
    });
    const ctx = createMockContext({ path: '/api/health' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBeNull();
  });

  it('不覆盖已存在的 Cache-Control 头', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60 });
    const ctx = createMockContext({
      path: '/',
      resHeaders: { 'cache-control': 'public, max-age=999' }
    });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=999');
  });

  it('404 错误响应设置 no-cache', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60 });
    const ctx = createMockContext({ path: '/', status: 404 });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('500 错误响应设置 no-cache', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60 });
    const ctx = createMockContext({ path: '/', status: 500 });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('规则覆盖默认 maxAge(字符串 glob 匹配)', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      rules: [{ pattern: '/api/**', maxAge: 999 }]
    });
    const ctx = createMockContext({ path: '/api/data' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=999');
  });

  it('规则覆盖默认 maxAge(正则匹配)', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      rules: [{ pattern: /^\/assets\//, maxAge: 31536000 }]
    });
    const ctx = createMockContext({ path: '/assets/app.js' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=31536000');
  });

  it('配置 immutable 时添加 immutable 指令', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60, immutable: true });
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=60, immutable');
  });

  it('规则中的 immutable 覆盖全局设置', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      immutable: false,
      rules: [{ pattern: '/assets/**', maxAge: 31536000, immutable: true }]
    });
    const ctx = createMockContext({ path: '/assets/app.js' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('未配置 maxAge 时不设置 Cache-Control', async () => {
    const middleware = createCacheControlMiddleware({});
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBeNull();
  });

  it('支持 stale-while-revalidate 与 stale-if-error 指令', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      sMaxAge: 300,
      staleWhileRevalidate: 120,
      staleIfError: 600
    });
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    const cc = ctx._getHeader('Cache-Control');
    expect(cc).toContain('max-age=60');
    expect(cc).toContain('s-maxage=300');
    expect(cc).toContain('stale-while-revalidate=120');
    expect(cc).toContain('stale-if-error=600');
  });

  it('private 模式设置 private 而非 public', async () => {
    const middleware = createCacheControlMiddleware({ defaultMaxAge: 60, public: false });
    const ctx = createMockContext({ path: '/' });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('private, max-age=60');
  });

  it('noCacheOnError=false 时不对错误响应设置 no-cache', async () => {
    const middleware = createCacheControlMiddleware({
      defaultMaxAge: 60,
      noCacheOnError: false
    });
    const ctx = createMockContext({ path: '/', status: 500 });

    await middleware(ctx as any, async () => {});

    expect(ctx._getHeader('Cache-Control')).toBe('public, max-age=60');
  });
});

/* -------------------------------------------------------------------------- */
/* Cloudflare Purge 适配器                                                      */
/* -------------------------------------------------------------------------- */

describe('Cloudflare Purge 适配器', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('适配器名称为 cloudflare', () => {
    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'token' });
    expect(adapter.name).toBe('cloudflare');
  });

  it('purgeKeys 使用正确的 URL 和请求体调用 fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'test-token' });
    await adapter.purgeKeys(['key1', 'key2']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone123/purge_cache');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ tags: ['key1', 'key2'] });
  });

  it('200 响应返回成功结果', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'token' });
    const result = await adapter.purgeKeys(['key1']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(1);
    expect(result.raw).toEqual({ success: true });
  });

  it('非 200 响应返回错误结果', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'unauthorized' }] }), {
        status: 401,
        statusText: 'Unauthorized'
      })
    );

    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'bad-token' });
    const result = await adapter.purgeKeys(['key1']);

    expect(result.success).toBe(false);
    expect(result.purged).toBe(0);
    expect(result.error).toContain('401');
  });

  it('支持自定义 endpoint', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const adapter = createCloudflarePurgeAdapter({
      zoneId: 'z',
      apiToken: 't',
      endpoint: 'https://custom.example.com/api'
    });
    await adapter.purgeKeys(['k1']);

    const [url] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe('https://custom.example.com/api/zones/z/purge_cache');
  });

  it('purgeUrls 使用 files 字段调用 fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'token' });
    const result = await adapter.purgeUrls!(['https://a.com/1']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(1);
    const [, init] = mockFetch.mock.calls[0] as [string, any];
    expect(JSON.parse(init.body)).toEqual({ files: ['https://a.com/1'] });
  });

  it('purgeAll 使用 purge_everything 字段', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const adapter = createCloudflarePurgeAdapter({ zoneId: 'zone123', apiToken: 'token' });
    const result = await adapter.purgeAll!();

    expect(result.success).toBe(true);
    expect(result.purged).toBe(-1);
    const [, init] = mockFetch.mock.calls[0] as [string, any];
    expect(JSON.parse(init.body)).toEqual({ purge_everything: true });
  });
});

/* -------------------------------------------------------------------------- */
/* Fastly Purge 适配器                                                          */
/* -------------------------------------------------------------------------- */

describe('Fastly Purge 适配器', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('适配器名称为 fastly', () => {
    const adapter = createFastlyPurgeAdapter({ serviceId: 'svc1', apiKey: 'key' });
    expect(adapter.name).toBe('fastly');
  });

  it('purgeKeys 使用 Surrogate-Key 头部调用 Fastly API', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    const adapter = createFastlyPurgeAdapter({ serviceId: 'svc1', apiKey: 'fastly-key' });
    const result = await adapter.purgeKeys(['k1', 'k2']);

    expect(result.success).toBe(true);
    expect(result.purged).toBe(2);
    const [url, init] = mockFetch.mock.calls[0] as [string, any];
    expect(url).toBe('https://api.fastly.com/service/svc1/purge');
    expect(init.method).toBe('POST');
    expect(init.headers['Fastly-Key']).toBe('fastly-key');
    expect(init.headers['Surrogate-Key']).toBe('k1 k2');
  });
});
