/**
 * fetch Data Cache (Task 4) —— HTTP 集成测试入口
 *
 * 通过自包含的 Hono 子应用 + mock fetch 验证 `createDataCacheMiddleware` 端到端行为,
 * 无需修改 dev server 主中间件栈,不发起真实网络请求。
 */
import { Hono } from 'hono';
import {
  defineHandler,
  createDataCacheMiddleware,
  clearDataCache,
  getDataCacheSize,
  revalidateTag,
  revalidatePath
} from 'ubean';
import type { FetchInitWithNext } from 'ubean';

/**
 * 调用带 `next` 选项的 fetch。
 * `next` 是 Next.js 风格扩展字段,不在标准 `RequestInit` 类型中,
 * 通过 `FetchInitWithNext` 类型让 TypeScript 接受该字段。
 */
function cachedFetch(input: string, init: FetchInitWithNext): Promise<Response> {
  return fetch(input, init as RequestInit);
}

/** 安装计数 mock fetch,返回 { fetch, getCount, restore }。 */
function installMockFetch() {
  let count = 0;
  const original = globalThis.fetch;
  const mock = async () => {
    count++;
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  globalThis.fetch = mock as typeof globalThis.fetch;
  return {
    getCount: () => count,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

/** 安装返回固定错误状态的 mock fetch。 */
function installErrorMockFetch(status: number) {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count++;
    return new Response('error', { status });
  }) as typeof globalThis.fetch;
  return {
    getCount: () => count,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';

  // 每个 action 开始前清空 Data Cache,保证测试隔离
  clearDataCache();

  switch (action) {
    // 验证 next: { revalidate: 60 } 跨请求缓存命中
    case 'cacheHit': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          const res = await cachedFetch('https://api.example.com/data', {
            next: { revalidate: 60 }
          });
          const data = await res.json();
          return sc.json({ count: data.count, fetchCount: mock.getCount() });
        });

        const r1 = await subApp.request('http://test/');
        const b1 = await r1.json();
        const r2 = await subApp.request('http://test/');
        const b2 = await r2.json();

        return c.json({
          firstFetchCount: b1.fetchCount,
          secondFetchCount: b2.fetchCount,
          cacheHit: b1.fetchCount === 1 && b2.fetchCount === 1,
          sameCount: b1.count === b2.count,
          cacheSize: getDataCacheSize()
        });
      } finally {
        mock.restore();
      }
    }

    // 验证无 next 选项不缓存(默认行为不变)
    case 'noNextNoCache': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          await fetch('https://api.example.com/data');
          await fetch('https://api.example.com/data');
          return sc.json({ fetchCount: mock.getCount() });
        });

        const res = await subApp.request('http://test/');
        const body = await res.json();
        return c.json({
          fetchCount: body.fetchCount,
          notCached: body.fetchCount === 2,
          cacheSize: getDataCacheSize()
        });
      } finally {
        mock.restore();
      }
    }

    // 验证 noStore: true 退出缓存
    case 'noStore': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          await cachedFetch('https://api.example.com/data', { next: { noStore: true } });
          await cachedFetch('https://api.example.com/data', { next: { noStore: true } });
          return sc.json({ fetchCount: mock.getCount() });
        });

        const res = await subApp.request('http://test/');
        const body = await res.json();
        return c.json({
          fetchCount: body.fetchCount,
          notCached: body.fetchCount === 2
        });
      } finally {
        mock.restore();
      }
    }

    // 验证 revalidateTag 失效
    case 'revalidateTag': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          await cachedFetch('https://api.example.com/users/1', {
            next: { revalidate: 60, tags: ['users'] }
          });
          return sc.json({ fetchCount: mock.getCount() });
        });

        // 第一次:发起 fetch
        await subApp.request('http://test/');
        // 第二次:命中缓存
        await subApp.request('http://test/');
        // 失效标签
        const deleted = await revalidateTag('users');
        // 第三次:缓存失效,重新 fetch
        const r3 = await subApp.request('http://test/');
        const b3 = await r3.json();

        return c.json({
          totalFetches: b3.fetchCount,
          invalidatedCount: deleted,
          cacheWorked: b3.fetchCount === 2
        });
      } finally {
        mock.restore();
      }
    }

    // 验证 revalidatePath 失效(正则)
    case 'revalidatePath': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          await cachedFetch('https://api.example.com/users/1', { next: { tags: ['x'] } });
          await cachedFetch('https://api.example.com/posts/1', { next: { tags: ['x'] } });
          return sc.json({ fetchCount: mock.getCount() });
        });

        await subApp.request('http://test/');
        const deleted = await revalidatePath(/\/users\//);
        const sizeAfter = getDataCacheSize();

        return c.json({
          invalidatedCount: deleted,
          remainingSize: sizeAfter,
          pathInvalidationWorked: deleted === 1 && sizeAfter === 1
        });
      } finally {
        mock.restore();
      }
    }

    // 验证 4xx 不缓存
    case 'errorNotCached': {
      const mock = installErrorMockFetch(404);
      try {
        const subApp = new Hono();
        subApp.use('*', createDataCacheMiddleware({ dev: false }));
        subApp.get('/', async sc => {
          await cachedFetch('https://api.example.com/missing', { next: { revalidate: 60 } }).catch(() => {});
          await cachedFetch('https://api.example.com/missing', { next: { revalidate: 60 } }).catch(() => {});
          return sc.json({ fetchCount: mock.getCount() });
        });

        const res = await subApp.request('http://test/');
        const body = await res.json();

        return c.json({
          fetchCount: body.fetchCount,
          errorNotCached: body.fetchCount === 2,
          cacheSize: getDataCacheSize()
        });
      } finally {
        mock.restore();
      }
    }

    // 验证 dev 模式默认 no-cache
    case 'devNoCache': {
      const mock = installMockFetch();
      try {
        const subApp = new Hono();
        // 不传 dev 选项,默认读 NODE_ENV(dev server 非 production)
        subApp.use('*', createDataCacheMiddleware());
        subApp.get('/', async sc => {
          await cachedFetch('https://api.example.com/data', { next: { revalidate: 60 } });
          await cachedFetch('https://api.example.com/data', { next: { revalidate: 60 } });
          return sc.json({ fetchCount: mock.getCount() });
        });

        const res = await subApp.request('http://test/');
        const body = await res.json();
        return c.json({
          fetchCount: body.fetchCount,
          devNotCached: body.fetchCount === 2
        });
      } finally {
        mock.restore();
      }
    }

    default:
      return c.json({
        actions: [
          'cacheHit',
          'noNextNoCache',
          'noStore',
          'revalidateTag',
          'revalidatePath',
          'errorNotCached',
          'devNoCache'
        ]
      });
  }
});
