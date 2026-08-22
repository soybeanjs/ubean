import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { cachedEventHandler, clearCacheStore, createMemoryStore, useCacheStore } from '../src/cache';

afterEach(() => {
  clearCacheStore();
});

describe('cachedEventHandler', () => {
  it('caches JSON even when the live response sets a cookie', async () => {
    useCacheStore(createMemoryStore());
    let n = 0;
    const app = new Hono();
    app.get(
      '/x',
      cachedEventHandler(
        c => {
          n += 1;
          c.header('Set-Cookie', 'ubean_locale=en; Path=/; SameSite=Lax');
          return c.json({ n });
        },
        { ttl: 60, name: 'cookie-ok' }
      )
    );

    const miss = await app.request('/x');
    const hit = await app.request('/x');
    expect(miss.status).toBe(200);
    expect((await miss.json()) as { n: number }).toEqual({ n: 1 });
    expect((await hit.json()) as { n: number }).toEqual({ n: 1 });
    expect(hit.headers.get('x-cache')).toBe('HIT');
    expect(n).toBe(1);
  });
});
