/**
 * TS-07 回归：短路型中间件的 Response 必须被保留
 *
 * `withStep()` 外壳把「13 步链」的步骤名记进请求级序列，但 Hono 的 `compose()` 只在中间件
 * **返回** Response 时才把它写回 `context.res`：
 *
 *   hono/dist/compose.js: `if (res && (context.finalized === false || isError)) context.res = res;`
 *
 * 所以外壳必须转发返回值。丢弃返回值会让所有「靠 `return Response` 结束请求、不写 `c.res`」
 * 的中间件变成 500 `Context is not finalized`：
 *
 *   - ⑩ routeCache：缓存命中（`packages/server/src/cache.ts` 的 `return entryToResponse(entry)`）
 *   - ⑧ i18n：语言重定向（`return c.redirect(...)`）
 *   - ⑤ csrf：拒绝（`return handler(c)` → 403 body）
 *   - ① handle：`applyHandleHook` 短路
 *
 * 这三个用例是真实缺陷逼出来的：既有套件全绿，因为 `examples/ubean-test` 的 routeRules 只有
 * `isr`/`ppr`（无 `cache.ttl`，`routeCache` 根本不注册），测试客户端也从不发
 * `Accept-Language: zh`。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearInternalFetcher } from '@ubean/routes';
import { clearGlobalHooks } from '../src/hooks';
import { UbeanApp } from '../src/app';

describe('TS-07 短路中间件不得丢失 Response', () => {
  beforeEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });

  afterEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });

  it('⑩ routeCache：第二次 GET 命中缓存，返回 200 + X-Cache: HIT（而非 500）', async () => {
    const app = new UbeanApp({ routeRules: { '/cached/item': { cache: { ttl: 60 } } } });
    let hits = 0;
    app.hono.get('/cached/item', c => {
      hits += 1;
      return c.json({ hits });
    });

    const first = await app.hono.fetch(new Request('http://localhost/cached/item'));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ hits: 1 });

    const second = await app.hono.fetch(new Request('http://localhost/cached/item'));
    expect(second.status).toBe(200);
    expect(second.headers.get('x-cache')).toBe('HIT');
    // 命中即「不再执行处理器」：这是缓存真正生效的证据，而非仅仅是又跑了一遍
    expect(await second.json()).toEqual({ hits: 1 });
    expect(hits).toBe(1);
  });

  it('⑧ i18n：根路径按 Accept-Language 重定向，返回 302 + Location（而非 500）', async () => {
    const app = new UbeanApp({
      i18nConfig: { defaultLocale: 'en', locales: ['en', 'zh'] }
    });

    const res = await app.hono.fetch(
      new Request('http://localhost/', { headers: { 'accept-language': 'zh-CN,zh;q=0.9' } })
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/zh');
  });

  it('⑤ csrf：token 模式下缺 token 返回 403（而非 500），带 token 返回 200', async () => {
    const app = new UbeanApp({ csrf: { mode: 'token' }, i18nConfig: { defaultLocale: 'en', locales: ['en'] } });
    app.hono.post('/api/echo', c => c.json({ ok: true }));

    const seed = await app.hono.fetch(new Request('http://localhost/api/echo', { method: 'GET' }));
    const cookie = (seed.headers.get('set-cookie') ?? '').split(';')[0];

    const rejected = await app.hono.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}'
      })
    );
    expect(rejected.status).toBe(403);

    const token = cookie.split('=').slice(1).join('=');
    const accepted = await app.hono.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': token, 'content-type': 'application/json' },
        body: '{}'
      })
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true });
  });
});
