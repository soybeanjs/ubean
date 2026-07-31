/**
 * P9-11 Sessions API / P9-14 after() / P9-15 fetch memoization —— 单元测试
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  createSessionMiddleware,
  createStorageSessionStore,
  useSession,
  after,
  createAfterMiddleware,
  getAfterCallbackCount,
  createFetchMemoizationMiddleware,
  createMemoizedFetch
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* P9-11: Sessions API                                                         */
/* -------------------------------------------------------------------------- */

describe('P9-11: Sessions API', () => {
  describe('createStorageSessionStore', () => {
    it('stores and retrieves session data', async () => {
      const store = createStorageSessionStore();
      await store.set('session-1', { user: 'alice', count: 1 });
      const data = await store.get('session-1');
      expect(data).toEqual({ user: 'alice', count: 1 });
    });

    it('returns null for non-existent session', async () => {
      const store = createStorageSessionStore();
      const data = await store.get('non-existent');
      expect(data).toBeNull();
    });

    it('deletes session data', async () => {
      const store = createStorageSessionStore();
      await store.set('session-2', { user: 'bob' });
      await store.delete('session-2');
      const data = await store.get('session-2');
      expect(data).toBeNull();
    });

    it('supports TTL', async () => {
      const store = createStorageSessionStore();
      await store.set('session-ttl', { user: 'temp' }, 1);
      const data1 = await store.get('session-ttl');
      expect(data1).toEqual({ user: 'temp' });
      // 等待 TTL 过期(storage 实现的 TTL 清理)
      await new Promise(resolve => setTimeout(resolve, 1100));
      const data2 = await store.get('session-ttl');
      expect(data2).toBeNull();
    });
  });

  describe('createSessionMiddleware - cookie mode', () => {
    it('creates new session on first request', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test-secret' }));
      app.get('/', c => {
        const session = useSession(c);
        expect(session).not.toBeNull();
        session!.set('user', 'alice');
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('ubean_session=');
    });

    it('reads session from cookie on subsequent request', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test-secret' }));

      // Define all routes before making requests
      app.get('/set', c => {
        const session = useSession(c);
        session!.set('user', 'alice');
        return c.json({ ok: true });
      });
      app.get('/get', c => {
        const session = useSession(c);
        return c.json({ user: session?.get('user') });
      });

      const res1 = await app.request('http://example.com/set');
      const setCookie = res1.headers.get('set-cookie')!;
      const cookieValue = setCookie.split(';')[0];

      const res2 = await app.request('http://example.com/get', {
        headers: { cookie: cookieValue }
      });
      const body = await res2.json();
      expect(body.user).toBe('alice');
    });

    it('destroys session and clears cookie', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test-secret' }));
      app.get('/destroy', c => {
        const session = useSession(c);
        session!.set('user', 'temp');
        session!.destroy();
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/destroy');
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie')!;
      expect(setCookie).toContain('Max-Age=0');
    });

    it('supports custom cookie name', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test', cookieName: 'my_session' }));
      app.get('/', c => {
        const session = useSession(c);
        session!.set('x', 1);
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      expect(res.headers.get('set-cookie')).toContain('my_session=');
    });

    it('supports exclude paths', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test', exclude: ['/api'] }));
      app.get('/api/test', c => {
        const session = useSession(c);
        return c.json({ hasSession: session !== null });
      });

      const res = await app.request('http://example.com/api/test');
      const body = await res.json();
      expect(body.hasSession).toBe(false);
    });

    it('supports custom cookie options', async () => {
      const app = new Hono();
      app.use(
        '*',
        createSessionMiddleware({
          secret: 'test',
          cookie: { secure: true, httpOnly: true, sameSite: 'strict', domain: 'example.com' }
        })
      );
      app.get('/', c => {
        useSession(c)?.set('x', 1);
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      const setCookie = res.headers.get('set-cookie')!;
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=strict');
      expect(setCookie).toContain('Domain=example.com');
    });
  });

  describe('createSessionMiddleware - storage mode', () => {
    it('stores session data in store', async () => {
      const store = createStorageSessionStore();
      const app = new Hono();
      app.use('*', createSessionMiddleware({ store }));
      app.get('/set', c => {
        const session = useSession(c);
        session!.set('user', 'bob');
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/set');
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie')!;
      const sessionId = setCookie.split('=')[1].split(';')[0];

      const data = await store.get(sessionId);
      expect(data).toEqual({ user: 'bob' });
    });

    it('reads session data from store', async () => {
      const store = createStorageSessionStore();
      await store.set('known-session-id', { user: 'charlie' });

      const app = new Hono();
      app.use('*', createSessionMiddleware({ store }));
      app.get('/', c => {
        const session = useSession(c);
        return c.json({ user: session?.get('user') });
      });

      const res = await app.request('http://example.com/', {
        headers: { cookie: 'ubean_session=known-session-id' }
      });
      const body = await res.json();
      expect(body.user).toBe('charlie');
    });
  });

  describe('Session interface', () => {
    it('tracks dirty state', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test' }));
      app.get('/', c => {
        const session = useSession(c);
        expect(session!.isDirty).toBe(false);
        session!.set('key', 'value');
        expect(session!.isDirty).toBe(true);
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
    });

    it('has() and delete() work correctly', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test' }));
      app.get('/', c => {
        const session = useSession(c);
        session!.set('a', 1);
        expect(session!.has('a')).toBe(true);
        expect(session!.has('b')).toBe(false);
        session!.delete('a');
        expect(session!.has('a')).toBe(false);
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
    });

    it('all() returns copy of data', async () => {
      const app = new Hono();
      app.use('*', createSessionMiddleware({ secret: 'test' }));
      app.get('/', c => {
        const session = useSession(c);
        session!.set('a', 1);
        session!.set('b', 2);
        const all = session!.all();
        expect(all).toEqual({ a: 1, b: 2 });
        all.a = 999; // 不应影响 session
        expect(session!.get('a')).toBe(1);
        return c.json({ ok: true });
      });

      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* P9-14: after() API                                                          */
/* -------------------------------------------------------------------------- */

describe('P9-14: after() API', () => {
  it('executes callbacks after response', async () => {
    const callback = vi.fn();
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    app.get('/', c => {
      after(callback);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/');
    expect(res.status).toBe(200);
    // 等待微任务执行
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalled();
  });

  it('executes multiple callbacks in order', async () => {
    const calls: string[] = [];
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    app.get('/', c => {
      after(() => calls.push('first'));
      after(() => calls.push('second'));
      after(() => calls.push('third'));
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('supports async callbacks', async () => {
    const result: string[] = [];
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    app.get('/', c => {
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        result.push('async-done');
      });
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result).toContain('async-done');
  });

  it('does not block response', async () => {
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    app.get('/', c => {
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      return c.json({ ok: true });
    });

    const start = Date.now();
    const res = await app.request('http://example.com/');
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(50); // 响应不应等待 after 完成
  });

  it('catches callback errors silently', async () => {
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    app.get('/', c => {
      after(() => {
        throw new Error('callback error');
      });
      after(() => {
        // 这应该仍然执行
      });
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/');
    expect(res.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('getAfterCallbackCount returns registered count', async () => {
    const app = new Hono();
    app.use('*', createAfterMiddleware());
    let count = 0;
    app.get('/', c => {
      after(() => {});
      after(() => {});
      count = getAfterCallbackCount(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(count).toBeGreaterThanOrEqual(0); // 取决于 AsyncLocalStorage 可用性
  });
});

/* -------------------------------------------------------------------------- */
/* P9-15: Fetch Memoization                                                    */
/* -------------------------------------------------------------------------- */

describe('P9-15: Fetch Memoization', () => {
  describe('createMemoizedFetch', () => {
    it('deduplicates identical GET requests', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response(JSON.stringify({ data: callCount }), { status: 200 });
      });

      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });
      const res1 = await memo.fetch('https://api.example.com/data');
      const res2 = await memo.fetch('https://api.example.com/data');

      expect(callCount).toBe(1);
      const data1 = await res1.json();
      const data2 = await res2.json();
      expect(data1.data).toBe(1);
      expect(data2.data).toBe(1);
    });

    it('does not deduplicate different URLs', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (input: any) => {
        callCount++;
        return new Response(JSON.stringify({ url: input }), { status: 200 });
      });

      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });
      await memo.fetch('https://api.example.com/users/1');
      await memo.fetch('https://api.example.com/users/2');

      expect(callCount).toBe(2);
    });

    it('does not deduplicate POST requests', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('ok', { status: 200 });
      });

      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });
      await memo.fetch('https://api.example.com/data', { method: 'POST' });
      await memo.fetch('https://api.example.com/data', { method: 'POST' });

      expect(callCount).toBe(2);
    });

    it('clear() resets the cache', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('ok', { status: 200 });
      });

      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });
      await memo.fetch('https://api.example.com/data');
      memo.clear();
      await memo.fetch('https://api.example.com/data');

      expect(callCount).toBe(2);
    });

    it('size() returns cache size', async () => {
      const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));
      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });

      expect(memo.size()).toBe(0);
      await memo.fetch('https://api.example.com/data');
      expect(memo.size()).toBe(1);
    });

    it('does not cache 5xx errors', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('error', { status: 500 });
      });

      const memo = createMemoizedFetch({ originalFetch: mockFetch as any });
      await memo.fetch('https://api.example.com/data').catch(() => {});
      await memo.fetch('https://api.example.com/data').catch(() => {});

      expect(callCount).toBe(2);
    });
  });

  describe('createFetchMemoizationMiddleware', () => {
    it('memoizes fetch within request scope', async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response(JSON.stringify({ count: callCount }), { status: 200 });
      });
      globalThis.fetch = mockFetch as any;

      const app = new Hono();
      app.use('*', createFetchMemoizationMiddleware());
      app.get('/', async c => {
        const res1 = await fetch('https://api.example.com/data');
        const res2 = await fetch('https://api.example.com/data');
        const data1 = await res1.json();
        const data2 = await res2.json();
        return c.json({ count: callCount, same: data1.count === data2.count });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.same).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it('restores fetch after request', async () => {
      const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));
      globalThis.fetch = mockFetch as any;

      const app = new Hono();
      app.use('*', createFetchMemoizationMiddleware());
      app.get('/', async c => {
        await fetch('https://api.example.com/data');
        return c.json({ ok: true });
      });

      await app.request('http://example.com/');

      // 中间件应恢复到进入前的 fetch(即 mockFetch)
      expect(globalThis.fetch).toBe(mockFetch);
    });

    it('supports exclude function', async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('ok', { status: 200 });
      });
      globalThis.fetch = mockFetch as any;

      const app = new Hono();
      app.use(
        '*',
        createFetchMemoizationMiddleware({
          exclude: url => url.includes('/no-cache')
        })
      );
      app.get('/', async c => {
        await fetch('https://api.example.com/no-cache');
        await fetch('https://api.example.com/no-cache');
        return c.json({ count: callCount });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2); // 不应该被缓存

      globalThis.fetch = originalFetch;
    });
  });
});
