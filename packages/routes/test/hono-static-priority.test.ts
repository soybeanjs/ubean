import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

/**
 * Documents Hono's catch-all routing: `*` wins by **registration order**
 * (first-match-wins), not by static-over-wildcard priority. That is why
 * registerPageRoutes sorts the `[...slug]` catch-all to the END so a request
 * like `/zh/playground` reaches the Playground page on the server instead of
 * being swallowed by the catch-all.
 *
 * Not part of the SSR hydration mismatch fix itself (that was the vue-router
 * route table lacking the locale param) — this locks in the Hono-side ordering
 * contract that makes the SSR page pre-selection correct.
 */
describe('Hono: static locale path vs catch-all', () => {
  it('matches static locale path when registered before the catch-all', async () => {
    const app = new Hono();
    app.on('GET', '/playground', c => c.text('static-en'));
    app.on('GET', '/zh/playground', c => c.text('static-zh'));
    app.on('GET', '/zh', c => c.text('zh-index'));
    app.on('GET', '/', c => c.text('index'));
    app.on('GET', '*', c => c.text('CATCHALL'));

    const res = await app.request('/zh/playground');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('static-zh');
  });

  it('is first-match-wins: a catch-all registered first swallows static paths', async () => {
    const app = new Hono();
    app.on('GET', '*', c => c.text('CATCHALL'));
    app.on('GET', '/zh/playground', c => c.text('static-zh'));
    const res = await app.request('/zh/playground');
    expect(await res.text()).toBe('CATCHALL');
  });
});
