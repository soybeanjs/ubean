/**
 * fetch Data Cache (Task 4) —— HTTP 集成测试
 *
 * 通过 /api/data-cache-test?action=xxx 端点验证 `createDataCacheMiddleware` 端到端行为。
 * 测试需 dev server 运行(global-setup 启动)。
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { getJson, requireDevServer } from './helper';
import { isBuildMode } from './mode';

beforeAll(requireDevServer);

describe('fetch Data Cache (Task 4)', () => {
  it('cacheHit: next: { revalidate: 60 } 跨请求缓存命中', async () => {
    const res = await getJson('/api/data-cache-test?action=cacheHit');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      cacheHit: true,
      sameCount: true,
      cacheSize: 1
    });
  });

  it('noNextNoCache: 无 next 选项不缓存(默认行为不变)', async () => {
    const res = await getJson('/api/data-cache-test?action=noNextNoCache');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      notCached: true,
      cacheSize: 0
    });
  });

  it('noStore: next: { noStore: true } 退出缓存', async () => {
    const res = await getJson('/api/data-cache-test?action=noStore');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      notCached: true
    });
  });

  it('revalidateTag: 失效后重新发起 fetch', async () => {
    const res = await getJson('/api/data-cache-test?action=revalidateTag');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      invalidatedCount: 1,
      cacheWorked: true
    });
  });

  it('revalidatePath: 正则失效匹配的缓存条目', async () => {
    const res = await getJson('/api/data-cache-test?action=revalidatePath');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      invalidatedCount: 1,
      pathInvalidationWorked: true
    });
  });

  it('errorNotCached: 4xx 响应不缓存', async () => {
    const res = await getJson('/api/data-cache-test?action=errorNotCached');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      errorNotCached: true,
      cacheSize: 0
    });
  });

  it('devNoCache: 数据缓存按 NODE_ENV 开关（dev 轨关 / build 轨开）', async () => {
    const res = await getJson('/api/data-cache-test?action=devNoCache');
    expect(res.status).toBe(200);
    // 该 action 在服务端 `new Hono()` + `createDataCacheMiddleware()`（不传 `dev` 选项，
    // 于是按 `NODE_ENV` 决定）：
    // · dev 轨：dev server 的 NODE_ENV 不是 production ⇒ 数据缓存关闭 ⇒ 两次 fetch 真的都发出；
    // · build 轨：`test/global-setup.ts` 以 `NODE_ENV=production` 启动 preview ⇒ 缓存开启 ⇒ 只发一次。
    // 这是 TS-33 双轨**实测发现的差异之一**，两端的期望值都钉住（而不是整条跳过）。
    expect(res.data).toMatchObject(
      isBuildMode ? { devNotCached: false, fetchCount: 1 } : { devNotCached: true, fetchCount: 2 }
    );
  });
});
