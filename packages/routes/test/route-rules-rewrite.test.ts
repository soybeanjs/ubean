import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createRouteRulesMiddleware, matchRouteRules, compileRouteRules } from '../src/route-rules';

// TS-34（docs/test.md）把 L2 `examples/ubean-test/test/route-rules.test.ts` 里的
// `createRouteRulesMiddleware()` 三例下沉到这里，但 L2 那三例只断言了 `nextCalled`，
// 没断言 header / redirect 真被写进响应（等于没测）—— 于是顺手升级成**真 Hono + 真 ctx**
// 的端到端断言（见文件末 6 例）。
describe('routeRules rewrite and proxy', () => {
  it('merges proxy on first match', () => {
    const compiled = compileRouteRules({
      '/api/**': { proxy: 'https://upstream.example/**' }
    });
    expect(matchRouteRules('/api/users', compiled).proxy).toBe('https://upstream.example/**');
  });

  it('rewrites internally and rematches Hono routes', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/old': { rewrite: '/new' } }, { dispatch: req => app.fetch(req) }));
    app.get('/new', c => c.text('rewritten'));

    const res = await app.request('/old');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('rewritten');
  });

  it('does not loop when rewrite target matches again', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/**': { rewrite: '/new' } }, { dispatch: req => app.fetch(req) }));
    app.get('/new', c => c.text('ok'));

    const res = await app.request('/anything');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('proxies to an upstream URL', async () => {
    const app = new Hono();
    app.use(
      '*',
      createRouteRulesMiddleware({
        '/proxy/**': { proxy: 'https://example.invalid/**' }
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return new Response(`proxied:${new URL(url).pathname}`, { status: 200 });
    }) as typeof fetch;

    try {
      const res = await app.request('/proxy/hello');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('proxied:/hello');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // TS-34：以下 4 例补的是 L1 此前只被 L2「mock ctx」弱断言覆盖的部分
  // （`examples/ubean-test/test/route-rules.test.ts` 的 `createRouteRulesMiddleware()`
  // 只断言 `nextCalled`，没断言 header 真被写进响应 —— 等于没测）。用真 Hono 与真 ctx。

  it('applies matched headers onto the response', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/api/**': { headers: { 'X-Rule': 'applied' } } }));
    app.get('/api/thing', c => c.text('ok'));

    const res = await app.request('/api/thing');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Rule')).toBe('applied');
  });

  it('composes Cache-Control from the cache rule', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/cached/**': { cache: { ttl: 60, swr: true } } }));
    app.get('/cached/items', c => c.text('ok'));

    const res = await app.request('/cached/items');
    expect(res.status).toBe(200);
    // 实测形态（buildCacheControlHeader）：`public, max-age=<ttl>` +（swr 时）`stale-while-revalidate=<ttl>`。
    // 注意：*不是* `s-maxage` —— 共享缓存语义靠上层 CDN 配置，不在这里发。
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=60');
  });

  it('redirects with the rule status code (default 307 for string form)', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/old': { redirect: '/new' } }));
    app.get('/new', c => c.text('ok'));

    const res = await app.request('/old', { redirect: 'manual' });
    // 实测（resolveRedirectUrl）：字符串形式默认 307；对象形式 `{ to, statusCode }` 才可指定。
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBe('/new');
  });

  it('honours an explicit redirect statusCode', async () => {
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/moved': { redirect: { to: '/new', statusCode: 301 } } }));
    app.get('/new', c => c.text('ok'));

    const res = await app.request('/moved', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('/new');
  });

  it('exposes the matched rule via c.get("routeRule")', async () => {
    const app = new Hono<{ Variables: { routeRule: { headers?: Record<string, string> } } }>();
    app.use('*', createRouteRulesMiddleware({ '/api/**': { headers: { 'X-Seen': '1' } } }));
    app.get('/api/seen', c => c.json(c.get('routeRule') ?? null));

    const res = await app.request('/api/seen');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ headers: { 'X-Seen': '1' } });
  });

  it('applies headers only to matching paths (同 app 内的差分对照)', async () => {
    // 差分对照：同一个 app 里请求命中路径与不命中路径，断言两者**不同**。
    // 只断言「不命中时没有 header」对「无条件写 header」这类退化无感
    // （因为未匹配时 matched.headers 本就 undefined）。
    const app = new Hono();
    app.use('*', createRouteRulesMiddleware({ '/api/**': { headers: { 'X-Rule': 'applied' } } }));
    app.get('/api/thing', c => c.text('ok'));
    app.get('/public/thing', c => c.text('ok'));

    const hit = await app.request('/api/thing');
    const miss = await app.request('/public/thing');
    expect(hit.status).toBe(200);
    expect(miss.status).toBe(200);
    expect(hit.headers.get('X-Rule')).toBe('applied');
    expect(miss.headers.get('X-Rule')).toBeNull();
  });
});
