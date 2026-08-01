/**
 * fetch Data Cache (Task 4) —— HTTP 集成测试
 *
 * 通过 /api/data-cache-test?action=xxx 端点验证 `createDataCacheMiddleware` 端到端行为。
 * 测试需 dev server 运行(global-setup 启动)。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)('fetch Data Cache (Task 4)', () => {
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

  it('devNoCache: dev 模式默认不缓存', async () => {
    const res = await getJson('/api/data-cache-test?action=devNoCache');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      devNotCached: true
    });
  });
});
