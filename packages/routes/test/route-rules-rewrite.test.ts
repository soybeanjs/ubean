import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createRouteRulesMiddleware, matchRouteRules, compileRouteRules } from '../src/route-rules';

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
});
