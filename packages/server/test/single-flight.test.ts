/**
 * P9-16 Single-flight mutations —— 单元测试
 *
 * 覆盖:
 * - 注册表 (defineRevalidation / unregisterRevalidation / getRevalidationEntries / clearRevalidationRegistry)
 * - invalidate / invalidateKey / getInvalidatedKeys
 * - 中间件:打包 revalidation 进 JSON 响应
 * - 中间件:skip 选项 / 自定义 header / 自定义 field
 * - 中间件:非 JSON 响应(仅 header)
 * - 中间件:并行 vs 顺序执行
 * - runRevalidation 手动执行
 * - fetcher 错误处理
 * - 多 fetcher 结果合并
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  createSingleFlightMiddleware,
  defineSingleFlight,
  defineRevalidation,
  unregisterRevalidation,
  getRevalidationEntries,
  clearRevalidationRegistry,
  invalidate,
  invalidateKey,
  getInvalidatedKeys,
  runRevalidation
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* 测试辅助                                                                     */
/* -------------------------------------------------------------------------- */

function createApp(middleware?: any) {
  const app = new Hono();
  app.use('*', middleware || createSingleFlightMiddleware());
  return app;
}

beforeEach(() => {
  clearRevalidationRegistry();
});

afterEach(() => {
  clearRevalidationRegistry();
});

/* -------------------------------------------------------------------------- */
/* 注册表                                                                       */
/* -------------------------------------------------------------------------- */

describe('P9-16: Revalidation registry', () => {
  it('defineRevalidation registers an entry', () => {
    const fetcher = vi.fn(async () => ({ users: [] }));
    const entry = defineRevalidation(['users'], fetcher, 'users-handler');
    expect(entry.keys).toEqual(['users']);
    expect(entry.fetcher).toBe(fetcher);
    expect(entry.name).toBe('users-handler');
    expect(getRevalidationEntries()).toHaveLength(1);
  });

  it('getRevalidationEntries returns a copy (not the internal array)', () => {
    defineRevalidation(['a'], async () => ({ a: 1 }));
    const entries = getRevalidationEntries();
    entries.push({ keys: ['b'], fetcher: async () => ({ b: 2 }) });
    expect(getRevalidationEntries()).toHaveLength(1);
  });

  it('unregisterRevalidation removes the entry', () => {
    const entry = defineRevalidation(['posts'], async () => ({ posts: [] }));
    expect(getRevalidationEntries()).toHaveLength(1);
    const removed = unregisterRevalidation(entry);
    expect(removed).toBe(true);
    expect(getRevalidationEntries()).toHaveLength(0);
  });

  it('unregisterRevalidation returns false for unknown entry', () => {
    const removed = unregisterRevalidation({ keys: ['x'], fetcher: async () => ({}) });
    expect(removed).toBe(false);
  });

  it('clearRevalidationRegistry removes all entries', () => {
    defineRevalidation(['a'], async () => ({ a: 1 }));
    defineRevalidation(['b'], async () => ({ b: 2 }));
    defineRevalidation(['c'], async () => ({ c: 3 }));
    expect(getRevalidationEntries()).toHaveLength(3);
    clearRevalidationRegistry();
    expect(getRevalidationEntries()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* invalidate / getInvalidatedKeys                                              */
/* -------------------------------------------------------------------------- */

describe('P9-16: invalidate()', () => {
  it('invalidate marks keys within middleware scope', async () => {
    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/mutate', { method: 'POST' });
    // 键被消费后不会留在 context 中(请求结束)
    expect(getInvalidatedKeys()).toHaveLength(0);
  });

  it('invalidateKey marks a single key', async () => {
    let captured: string[] = [];
    const app = createApp();
    app.post('/mutate', c => {
      invalidateKey('posts');
      captured = getInvalidatedKeys(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/mutate', { method: 'POST' });
    expect(captured).toEqual(['posts']);
  });

  it('invalidate with multiple keys', async () => {
    let captured: string[] = [];
    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['users', 'posts', 'comments']);
      captured = getInvalidatedKeys(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/mutate', { method: 'POST' });
    expect(captured).toHaveLength(3);
    expect(captured).toContain('users');
    expect(captured).toContain('posts');
    expect(captured).toContain('comments');
  });

  it('getInvalidatedKeys returns empty outside middleware scope', () => {
    invalidate(['users']);
    expect(getInvalidatedKeys()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 中间件:打包 revalidation 进响应                                              */
/* -------------------------------------------------------------------------- */

describe('P9-16: createSingleFlightMiddleware', () => {
  it('bundles revalidation data into JSON response', async () => {
    defineRevalidation(['users'], async () => ({ users: [{ id: 1, name: 'alice' }] }));

    const app = createApp();
    app.post('/create-user', c => {
      invalidate(['users']);
      return c.json({ ok: true, created: true });
    });

    const res = await app.request('http://example.com/create-user', { method: 'POST' });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.__ubean_revalidation__).toBeDefined();
    expect(body.__ubean_revalidation__.data.users).toEqual([{ id: 1, name: 'alice' }]);
    expect(body.__ubean_revalidation__.keys).toContain('users');
  });

  it('does not modify response when no keys are invalidated', async () => {
    defineRevalidation(['users'], async () => ({ users: [] }));

    const app = createApp();
    app.post('/noop', c => {
      // 不调用 invalidate
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/noop', { method: 'POST' });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.__ubean_revalidation__).toBeUndefined();
    expect(res.headers.get('X-Ubean-Revalidated')).toBeNull();
  });

  it('sets revalidation header with invalidated keys', async () => {
    defineRevalidation(['users', 'posts'], async () => ({ users: [], posts: [] }));

    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['users', 'posts']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const header = res.headers.get('X-Ubean-Revalidated');
    expect(header).toBeTruthy();
    const headerKeys = header!.split(',');
    expect(headerKeys).toContain('users');
    expect(headerKeys).toContain('posts');
  });

  it('supports custom revalidation field name', async () => {
    defineRevalidation(['users'], async () => ({ users: [{ id: 1 }] }));

    const app = new Hono();
    app.use('*', createSingleFlightMiddleware({ revalidationField: '__revalidated__' }));
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const body = await res.json();
    expect(body.__revalidated__).toBeDefined();
    expect(body.__ubean_revalidation__).toBeUndefined();
  });

  it('supports custom revalidation header name', async () => {
    defineRevalidation(['users'], async () => ({ users: [] }));

    const app = new Hono();
    app.use('*', createSingleFlightMiddleware({ revalidationHeader: 'X-My-Revalidation' }));
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    expect(res.headers.get('X-My-Revalidation')).toContain('users');
    expect(res.headers.get('X-Ubean-Revalidated')).toBeNull();
  });

  it('only sets header for non-JSON responses', async () => {
    defineRevalidation(['users'], async () => ({ users: [] }));

    const app = createApp();
    app.post('/text', c => {
      invalidate(['users']);
      return c.text('hello world');
    });

    const res = await app.request('http://example.com/text', { method: 'POST' });
    expect(res.headers.get('X-Ubean-Revalidated')).toContain('users');
    const body = await res.text();
    expect(body).toBe('hello world');
  });

  it('skip option bypasses middleware', async () => {
    const fetcher = vi.fn(async () => ({ users: [] }));
    defineRevalidation(['users'], fetcher);

    const app = new Hono();
    app.use('*', createSingleFlightMiddleware({ skip: c => c.req.path === '/skip' }));
    app.post('/skip', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/skip', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('runs multiple matching fetchers and merges results', async () => {
    defineRevalidation(['users'], async () => ({ users: [{ id: 1 }] }));
    defineRevalidation(['posts'], async () => ({ posts: [{ id: 10 }] }));
    defineRevalidation(['comments'], async () => ({ comments: [{ id: 100 }] }));

    const app = createApp();
    app.post('/mutate-all', c => {
      invalidate(['users', 'posts', 'comments']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate-all', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__.data.users).toEqual([{ id: 1 }]);
    expect(body.__ubean_revalidation__.data.posts).toEqual([{ id: 10 }]);
    expect(body.__ubean_revalidation__.data.comments).toEqual([{ id: 100 }]);
  });

  it('a single fetcher can handle multiple keys', async () => {
    defineRevalidation(['users', 'user-count'], async ctx => {
      expect(ctx.keys).toContain('users');
      return { users: [{ id: 1 }], 'user-count': 1 };
    });

    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__.data.users).toEqual([{ id: 1 }]);
    expect(body.__ubean_revalidation__.data['user-count']).toBe(1);
  });

  it('catches fetcher errors and reports them', async () => {
    defineRevalidation(['users'], async () => {
      throw new Error('fetch failed');
    });

    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__).toBeDefined();
    expect(body.__ubean_revalidation__.errors).toHaveLength(1);
    expect(body.__ubean_revalidation__.errors[0].message).toBe('fetch failed');
  });

  it('continues other fetchers when one fails', async () => {
    defineRevalidation(['failing'], async () => {
      throw new Error('boom');
    });
    defineRevalidation(['ok'], async () => ({ ok: 'data' }));

    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['failing', 'ok']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__.data.ok).toBe('data');
    expect(body.__ubean_revalidation__.errors).toHaveLength(1);
  });

  it('runs fetchers in parallel by default', async () => {
    const order: string[] = [];
    defineRevalidation(['a'], async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push('a-done');
      return { a: 1 };
    });
    defineRevalidation(['b'], async () => {
      order.push('b-done');
      return { b: 2 };
    });

    const app = createApp();
    app.post('/mutate', c => {
      invalidate(['a', 'b']);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/mutate', { method: 'POST' });
    // 并行时 b 先完成(因为 a 有延迟)
    expect(order[0]).toBe('b-done');
    expect(order[1]).toBe('a-done');
  });

  it('runs fetchers sequentially when parallel=false', async () => {
    const order: string[] = [];
    defineRevalidation(['a'], async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push('a-done');
      return { a: 1 };
    });
    defineRevalidation(['b'], async () => {
      order.push('b-done');
      return { b: 2 };
    });

    const app = new Hono();
    app.use('*', createSingleFlightMiddleware({ parallel: false }));
    app.post('/mutate', c => {
      invalidate(['a', 'b']);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/mutate', { method: 'POST' });
    // 顺序执行时 a 先完成(注册顺序)
    expect(order[0]).toBe('a-done');
    expect(order[1]).toBe('b-done');
  });
});

/* -------------------------------------------------------------------------- */
/* runRevalidation (手动执行)                                                  */
/* -------------------------------------------------------------------------- */

describe('P9-16: runRevalidation()', () => {
  it('executes fetchers for given keys and returns result', async () => {
    defineRevalidation(['users'], async () => ({ users: [{ id: 1, name: 'alice' }] }));

    const app = new Hono();
    app.get('/', c => c.json({ ok: true }));

    const res = await app.request('http://example.com/');
    // runRevalidation 需要一个 context —— 借用 Hono 的请求
    const result = await runRevalidation(['users'], res as any);
    expect(result.data.users).toEqual([{ id: 1, name: 'alice' }]);
    expect(result.keys).toContain('users');
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty data when no matching entries', async () => {
    const app = new Hono();
    app.get('/', c => c.json({ ok: true }));

    const res = await app.request('http://example.com/');
    const result = await runRevalidation(['nonexistent'], res as any);
    expect(result.data).toEqual({});
    expect(result.keys).toHaveLength(0);
  });

  it('collects errors from failing fetchers', async () => {
    defineRevalidation(['bad'], async () => {
      throw new Error('kaboom');
    });

    const app = new Hono();
    app.get('/', c => c.json({ ok: true }));

    const res = await app.request('http://example.com/');
    const result = await runRevalidation(['bad'], res as any);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('kaboom');
    expect(result.keys).toContain('bad');
  });
});

/* -------------------------------------------------------------------------- */
/* defineSingleFlight 别名                                                      */
/* -------------------------------------------------------------------------- */

describe('P9-16: defineSingleFlight alias', () => {
  it('returns a middleware handler equivalent to createSingleFlightMiddleware', async () => {
    defineRevalidation(['users'], async () => ({ users: [{ id: 1 }] }));

    const app = new Hono();
    app.use('*', defineSingleFlight());
    app.post('/mutate', c => {
      invalidate(['users']);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/mutate', { method: 'POST' });
    const body = await res.json();
    expect(body.__ubean_revalidation__).toBeDefined();
    expect(body.__ubean_revalidation__.data.users).toEqual([{ id: 1 }]);
  });
});
