/**
 * Route rules 测试（L2 · 只保留 HTTP 集成层）
 *
 * 原先放在这里的**函数级**用例已下沉到
 * `packages/routes/test/route-rules.test.ts`（compileRouteRules / matchRouteRules /
 * createRouteRulesMiddleware / specificity 排序 / `normalizeIsrRule` / P9-03/P9-04 字段）
 * 与 `packages/routes/test/route-rules-rewrite.test.ts`（proxy / rewrite 内部重派发 /
 * 防死循环 / 上游 fetch）。本文件现在只保留「只有 HTTP 层能证明的东西」：
 * `/api/route-rules-test` 端点可路由、状态码、响应形状。
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { getJson, api, requireDevServer } from './helper';

beforeAll(requireDevServer);

describe('HTTP integration - /api/route-rules-test', () => {
  it('returns route rules info', async () => {
    const res = await getJson('/api/route-rules-test');
    expect(res.status).toBe(200);

    const data = res.data as {
      action: string;
      testPath: string;
      matched: { cache?: unknown; headers?: Record<string, string>; redirect?: unknown } | null;
      availableRules: string[];
      ruleCount: number;
    };
    expect(data.action).toBe('route-rules-test');
    // 默认探测路径 /api/cached/items 命中第一条规则
    expect(data.testPath).toBe('/api/cached/items');
    expect(data.ruleCount).toBe(3);
    expect(data.availableRules).toEqual(
      expect.arrayContaining(['/api/cached/**', '/api/secure/**', '/api/redirect-old/**'])
    );
    expect(data.matched).not.toBeNull();
    expect(data.matched?.cache).toEqual({ ttl: 60, swr: true });
    expect(data.matched?.headers).toEqual({ 'X-Cache-Rule': 'enabled' });

    // 命中不同规则时返回该规则自身的 headers，且不泄漏其它规则的字段
    const secure = await api('/api/route-rules-test?path=/api/secure/data');
    expect(secure.status).toBe(200);
    const secureData = secure.data as {
      matched: { headers?: Record<string, string>; cache?: unknown } | null;
    };
    expect(secureData.matched?.headers).toEqual({ 'X-Security-Rule': 'enforced' });
    expect(secureData.matched?.cache).toBeUndefined();
  });

  it('不匹配的路径必须返回 matched: null（负向断言）', async () => {
    // 这是原先 ctx.skip() 想表达的「条件不满足」分支：不留静默出口，
    // 而是直接断言「不该匹配时确实没有匹配」——否则规则匹配退化成恒真也没人发现。
    const res = await api('/api/route-rules-test?path=/api/nonexistent/thing');
    expect(res.status).toBe(200);

    const data = res.data as { testPath: string; matched: unknown };
    expect(data.testPath).toBe('/api/nonexistent/thing');
    expect(data.matched).toBeNull();
  });
});
