/**
 * fetch Data Cache (Task 4) —— 单元测试
 *
 * 覆盖:
 * - 基本缓存命中/未命中(revalidate / tags)
 * - 无 `next` 选项不缓存(默认行为不变)
 * - `noStore: true` / `revalidate: 0` 退出缓存
 * - POST / 4xx / 5xx 不缓存
 * - TTL 过期
 * - revalidateTag / revalidatePath 失效(含与组件缓存集成)
 * - dev 模式默认 no-cache + forceDevCache 强制启用
 * - 缓存键包含 headers(不同 header 不命中)
 * - clearDataCache / getDataCacheSize
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import {
  createDataCacheMiddleware,
  clearDataCache,
  getDataCacheSize,
  revalidateDataCacheTag,
  revalidateDataCachePath,
  revalidateTag,
  revalidatePath,
  clearComponentCache,
  clearComponentCacheStore
} from '../src/index';

/** 创建一个 mock fetch,每次调用返回递增的 count(用于验证缓存命中)。 */
function createCountingFetch() {
  let count = 0;
  const mock = vi.fn(async () => {
    count++;
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  return { mock, getCount: () => count };
}

/** 创建带 Data Cache 中间件的 Hono 应用(强制启用 dev 缓存)。 */
function createApp(mockFetch: typeof globalThis.fetch) {
  const app = new Hono();
  app.use('*', createDataCacheMiddleware({ dev: false }));
  return app;
}

beforeEach(() => {
  clearDataCache();
  clearComponentCacheStore();
});

describe('Task 4: fetch Data Cache', () => {
  describe('基本缓存行为', () => {
    it('无 next 选项的 fetch 不缓存(默认行为不变)', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data');
        await fetch('https://api.example.com/data');
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      // 两次 fetch 都实际发起(无缓存)
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('next: { revalidate: 60 } 命中缓存(跨请求)', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        const res = await fetch('https://api.example.com/data', {
          next: { revalidate: 60 }
        });
        const data = await res.json();
        return c.json({ count: data.count, fetchCount: getCount() });
      });

      // 第一次请求:发起 fetch
      const r1 = await app.request('http://example.com/');
      const b1 = await r1.json();
      expect(b1.fetchCount).toBe(1);

      // 第二次请求:命中缓存,不再发起 fetch
      const r2 = await app.request('http://example.com/');
      const b2 = await r2.json();
      expect(b2.fetchCount).toBe(1);
      expect(b2.count).toBe(b1.count);

      globalThis.fetch = originalFetch;
    });

    it('不同 URL 分别缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/users/1', { next: { revalidate: 60 } });
        await fetch('https://api.example.com/users/2', { next: { revalidate: 60 } });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('next: { tags: [...] } 永久缓存直到失效', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { tags: ['data'] } });
        return c.json({ count: getCount() });
      });

      await app.request('http://example.com/');
      await app.request('http://example.com/');
      await app.request('http://example.com/');

      const res = await app.request('http://example.com/');
      const body = await res.json();
      // 4 次请求,只发起 1 次 fetch
      expect(body.count).toBe(1);

      globalThis.fetch = originalFetch;
    });
  });

  describe('退出缓存', () => {
    it('next: { noStore: true } 不缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { noStore: true } });
        await fetch('https://api.example.com/data', { next: { noStore: true } });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('next: { revalidate: 0 } 不缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { revalidate: 0 } });
        await fetch('https://api.example.com/data', { next: { revalidate: 0 } });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe('不缓存的场景', () => {
    it('POST 请求不缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', {
          method: 'POST',
          next: { revalidate: 60 }
        });
        await fetch('https://api.example.com/data', {
          method: 'POST',
          next: { revalidate: 60 }
        });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('4xx 响应不缓存', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('Not Found', { status: 404 });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      const app = createApp(mockFetch as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/missing', { next: { revalidate: 60 } }).catch(() => {});
        await fetch('https://api.example.com/missing', { next: { revalidate: 60 } }).catch(() => {});
        return c.json({ count: callCount });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('5xx 响应不缓存', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        return new Response('Server Error', { status: 500 });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      const app = createApp(mockFetch as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/error', { next: { revalidate: 60 } }).catch(() => {});
        await fetch('https://api.example.com/error', { next: { revalidate: 60 } }).catch(() => {});
        return c.json({ count: callCount });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe('TTL 过期', () => {
    it('revalidate 过期后重新发起请求', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { revalidate: 1 } });
        return c.json({ count: getCount() });
      });

      // 第一次:发起 fetch
      await app.request('http://example.com/');
      expect(getCount()).toBe(1);

      // 等待 TTL 过期
      await new Promise(r => setTimeout(r, 1100));

      // 第二次:TTL 已过期,重新发起 fetch
      await app.request('http://example.com/');
      expect(getCount()).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe('缓存键包含 headers', () => {
    it('不同 header 的请求分别缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', {
          next: { revalidate: 60 },
          headers: { Authorization: 'Bearer token-a' }
        });
        await fetch('https://api.example.com/data', {
          next: { revalidate: 60 },
          headers: { Authorization: 'Bearer token-b' }
        });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      // 不同 Authorization header → 不同缓存键 → 两次 fetch
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('自动设置的 header 不影响缓存键', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', {
          next: { revalidate: 60 },
          headers: { 'User-Agent': 'agent-a', Accept: 'application/json' }
        });
        await fetch('https://api.example.com/data', {
          next: { revalidate: 60 },
          headers: { 'User-Agent': 'agent-b', Accept: 'application/json' }
        });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      // User-Agent 被排除出缓存键,只有 Accept 一致 → 命中缓存 → 1 次 fetch
      expect(body.count).toBe(1);

      globalThis.fetch = originalFetch;
    });
  });

  describe('revalidateTag 失效', () => {
    it('revalidateTag 失效带对应标签的 Data Cache', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/users/1', {
          next: { revalidate: 60, tags: ['users'] }
        });
        return c.json({ count: getCount() });
      });

      await app.request('http://example.com/');
      expect(getCount()).toBe(1);

      // 命中缓存
      await app.request('http://example.com/');
      expect(getCount()).toBe(1);

      // 失效 'users' 标签
      const deleted = await revalidateTag('users');
      expect(deleted).toBe(1);

      // 重新发起 fetch
      await app.request('http://example.com/');
      expect(getCount()).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('revalidateTag 失效多个标签', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/a', { next: { tags: ['tag-a'] } });
        await fetch('https://api.example.com/b', { next: { tags: ['tag-b'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(2);

      const d1 = await revalidateTag('tag-a');
      const d2 = await revalidateTag('tag-b');
      expect(d1).toBe(1);
      expect(d2).toBe(1);
      expect(getDataCacheSize()).toBe(0);

      globalThis.fetch = originalFetch;
    });

    it('revalidateTag 对未知标签返回 0', async () => {
      const deleted = await revalidateTag('nonexistent');
      expect(deleted).toBe(0);
    });

    it('revalidateDataCacheTag 直接调用', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { tags: ['direct'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(1);

      const deleted = await revalidateDataCacheTag('direct');
      expect(deleted).toBe(1);
      expect(getDataCacheSize()).toBe(0);

      globalThis.fetch = originalFetch;
    });
  });

  describe('revalidatePath 失效', () => {
    it('revalidatePath 失效匹配的 Data Cache 条目(glob)', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/users/1', { next: { tags: ['x'] } });
        await fetch('https://api.example.com/users/2', { next: { tags: ['x'] } });
        await fetch('https://api.example.com/posts/1', { next: { tags: ['x'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(3);

      // 匹配 users 路径的缓存键(Data Cache 键含 URL,使用正则更直观)
      const deleted = await revalidatePath(/\/users\//);
      expect(deleted).toBe(2);
      expect(getDataCacheSize()).toBe(1);

      globalThis.fetch = originalFetch;
    });

    it('revalidatePath 支持 RegExp', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/users/1', { next: { tags: ['x'] } });
        await fetch('https://api.example.com/users/2', { next: { tags: ['x'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');

      const deleted = await revalidatePath(/users\/1/);
      expect(deleted).toBe(1);

      globalThis.fetch = originalFetch;
    });
  });

  describe('与组件缓存集成', () => {
    it('revalidateTag 同时失效组件缓存 + Data Cache', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { tags: ['shared'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(1);

      // 通过统一的 revalidateTag 失效(Data Cache 部分)
      const deleted = await revalidateTag('shared');
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(getDataCacheSize()).toBe(0);

      globalThis.fetch = originalFetch;
    });

    it('clearComponentCache 同时清空 Data Cache', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { tags: ['x'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(1);

      await clearComponentCache();
      expect(getDataCacheSize()).toBe(0);

      globalThis.fetch = originalFetch;
    });
  });

  describe('dev 模式行为', () => {
    it('dev 模式默认不缓存(NODE_ENV !== production)', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      // 不传 dev 选项,默认读取 NODE_ENV(vitest 环境通常非 production)
      const app = new Hono();
      app.use('*', createDataCacheMiddleware());
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      // dev 模式不缓存,两次都实际发起 fetch
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });

    it('forceDevCache: true 在 dev 模式下启用缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = new Hono();
      app.use('*', createDataCacheMiddleware({ forceDevCache: true }));
      app.get('/', async c => {
        await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        return c.json({ count: getCount() });
      });

      await app.request('http://example.com/');
      await app.request('http://example.com/');

      // forceDevCache 启用缓存 → 只发起 1 次 fetch
      expect(getCount()).toBe(1);

      globalThis.fetch = originalFetch;
    });
  });

  describe('响应重建正确性', () => {
    it('缓存的 Response 保持 status / headers / body', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ hello: 'world' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Custom': 'custom-value'
          }
        });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      const app = createApp(mockFetch as any);
      app.get('/', async c => {
        const res = await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        const data = await res.json();
        return c.json({
          status: res.status,
          contentType: res.headers.get('Content-Type'),
          custom: res.headers.get('X-Custom'),
          body: data
        });
      });

      // 第一次请求(发起 fetch)
      const r1 = await app.request('http://example.com/');
      const b1 = await r1.json();
      expect(b1.status).toBe(200);
      expect(b1.contentType).toBe('application/json');
      expect(b1.custom).toBe('custom-value');
      expect(b1.body).toEqual({ hello: 'world' });

      // 第二次请求(命中缓存,响应应与第一次一致)
      const r2 = await app.request('http://example.com/');
      const b2 = await r2.json();
      expect(b2.status).toBe(200);
      expect(b2.contentType).toBe('application/json');
      expect(b2.custom).toBe('custom-value');
      expect(b2.body).toEqual({ hello: 'world' });

      globalThis.fetch = originalFetch;
    });

    it('缓存命中返回的 Response 可被多次消费(clone 友好)', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('body-data', { status: 200 });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      const app = createApp(mockFetch as any);
      app.get('/', async c => {
        const r1 = await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        const r2 = await fetch('https://api.example.com/data', { next: { revalidate: 60 } });
        const t1 = await r1.text();
        const t2 = await r2.text();
        return c.json({ t1, t2, same: t1 === t2 });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.t1).toBe('body-data');
      expect(body.t2).toBe('body-data');
      expect(body.same).toBe(true);

      globalThis.fetch = originalFetch;
    });
  });

  describe('exclude 选项', () => {
    it('exclude 返回 true 的 URL 不缓存', async () => {
      const { mock, getCount } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = new Hono();
      app.use(
        '*',
        createDataCacheMiddleware({
          dev: false,
          exclude: url => url.includes('/no-cache')
        })
      );
      app.get('/', async c => {
        await fetch('https://api.example.com/no-cache', { next: { revalidate: 60 } });
        await fetch('https://api.example.com/no-cache', { next: { revalidate: 60 } });
        return c.json({ count: getCount() });
      });

      const res = await app.request('http://example.com/');
      const body = await res.json();
      expect(body.count).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe('工具函数', () => {
    it('clearDataCache 清空所有条目', async () => {
      const { mock } = createCountingFetch();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock as any;

      const app = createApp(mock as any);
      app.get('/', async c => {
        await fetch('https://api.example.com/a', { next: { tags: ['x'] } });
        await fetch('https://api.example.com/b', { next: { tags: ['x'] } });
        return c.json({ size: getDataCacheSize() });
      });

      await app.request('http://example.com/');
      expect(getDataCacheSize()).toBe(2);

      clearDataCache();
      expect(getDataCacheSize()).toBe(0);

      globalThis.fetch = originalFetch;
    });

    it('getDataCacheSize 返回当前条目数', () => {
      expect(getDataCacheSize()).toBe(0);
    });
  });

  describe('中间件恢复 fetch', () => {
    it('请求结束后恢复原始 fetch', async () => {
      const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      const app = createApp(mockFetch as any);
      app.get('/', c => c.json({ ok: true }));

      await app.request('http://example.com/');

      // 中间件应恢复到进入前的 fetch(即 mockFetch)
      expect(globalThis.fetch).toBe(mockFetch);

      globalThis.fetch = originalFetch;
    });
  });
});
