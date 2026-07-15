/**
 * request-demo 路由集成测试
 *
 * 验证 src/request/internal.ts 的 createServerApi 在 API 路由中
 * 能正确进行进程内类型化调度。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe('request-demo route (src/request/internal.ts)', () => {
  it('returns 200 with aggregated internal fetch results', async () => {
    const res = await getJson('/api/request-demo');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it('returns source field indicating internal-fetch', async () => {
    const res = await getJson('/api/request-demo');
    const data = res.data as Record<string, unknown>;

    expect(data.source).toBe('internal-fetch');
  });

  it('includes /api/hello result (JSON)', async () => {
    const res = await getJson('/api/request-demo');
    const data = res.data as { hello: { message: string; timestamp: string } };

    expect(data.hello).toBeDefined();
    expect(typeof data.hello.message).toBe('string');
    expect(data.hello.message).toBe('Hello from ubean API!');
  });

  it('includes /api/users/{id} result (JSON with path param)', async () => {
    const res = await getJson('/api/request-demo');
    const data = res.data as { user: { id?: string | number; name?: string } };

    expect(data.user).toBeDefined();
    // id 通过 HTTP 传输后可能为字符串
    expect(Number(data.user.id)).toBe(1);
    // name 可能不存在(若其他测试已删除 id=1 的用户)
    if (data.user.name !== undefined) {
      expect(typeof data.user.name).toBe('string');
    }
  });

  it('includes /api/text result (responseType: "text")', async () => {
    const res = await getJson('/api/request-demo');
    const data = res.data as { textPreview: string };

    expect(typeof data.textPreview).toBe('string');
    expect(data.textPreview.length).toBeGreaterThan(0);
    // text.slice(0, 60) 应不超过 60 字符
    expect(data.textPreview.length).toBeLessThanOrEqual(60);
  });
});
