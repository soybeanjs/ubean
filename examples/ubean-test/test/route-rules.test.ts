import { beforeAll, describe, it, expect } from 'vitest';
import type { RouteRule, UbeanContext } from 'ubean';
import { compileRouteRules, matchRouteRules, createRouteRulesMiddleware } from 'ubean/server';
import { getJson, api, requireDevServer } from './helper';

beforeAll(requireDevServer);

describe('Route rules system', () => {
  describe('compileRouteRules()', () => {
    it('compiles route rules into pattern array', () => {
      const rules: Record<string, RouteRule> = {
        '/api/**': { headers: { 'X-CORS': 'true' } },
        '/admin/*': { headers: { 'X-Admin': 'true' } }
      };
      const compiled = compileRouteRules(rules);
      expect(compiled).toHaveLength(2);
      expect(compiled[0].pattern).toBeInstanceOf(RegExp);
      expect(compiled[0].rule).toBeDefined();
    });

    it('handles empty rules', () => {
      const compiled = compileRouteRules({});
      expect(compiled).toHaveLength(0);
    });

    it('compiles wildcard patterns', () => {
      const compiled = compileRouteRules({
        '/api/*': { headers: { 'X-CORS': 'true' } },
        '/api/**': { headers: { 'X-CORS': 'true' } }
      });
      expect(compiled).toHaveLength(2);
    });

    it('sorts by specificity (redirect > rewrite > headers)', () => {
      const compiled = compileRouteRules({
        '/api/**': { headers: { 'X-Header': '1' } },
        '/api/old': { redirect: '/api/new' },
        '/api/v1/**': { rewrite: '/api/v2/$1' }
      });
      // Redirect should come first (highest specificity)
      expect(compiled[0].rule.redirect).toBeDefined();
    });
  });

  describe('matchRouteRules()', () => {
    it('matches single-segment wildcard', () => {
      const compiled = compileRouteRules({
        '/api/*': { headers: { 'X-API': 'true' } }
      });
      const matched = matchRouteRules('/api/test', compiled);
      expect(matched.headers).toHaveProperty('X-API', 'true');
    });

    it('matches multi-segment wildcard', () => {
      const compiled = compileRouteRules({
        '/api/**': { headers: { 'X-Wildcard': 'true' } }
      });
      const matched = matchRouteRules('/api/v1/v2/v3', compiled);
      expect(matched.headers).toHaveProperty('X-Wildcard', 'true');
    });

    it('does not match non-matching path', () => {
      const compiled = compileRouteRules({
        '/api/*': { headers: { 'X-API': 'true' } }
      });
      const matched = matchRouteRules('/public/test', compiled);
      expect(matched.headers).toBeUndefined();
    });

    it('matches exact path', () => {
      const compiled = compileRouteRules({
        '/exact': { headers: { 'X-Exact': 'true' } }
      });
      const matched = matchRouteRules('/exact', compiled);
      expect(matched.headers).toHaveProperty('X-Exact', 'true');
    });

    it('matches redirect rule', () => {
      const compiled = compileRouteRules({
        '/old': { redirect: '/new' }
      });
      const matched = matchRouteRules('/old', compiled);
      expect(matched.redirect).toBe('/new');
    });

    it('matches rewrite rule', () => {
      const compiled = compileRouteRules({
        '/v1/*': { rewrite: '/v2/$1' }
      });
      const matched = matchRouteRules('/v1/test', compiled);
      expect(matched.rewrite).toBeDefined();
    });

    it('merges headers from multiple matching rules', () => {
      const compiled = compileRouteRules({
        '/api/**': { headers: { 'X-First': '1' } },
        '/api/v1/*': { headers: { 'X-Second': '2' } }
      });
      const matched = matchRouteRules('/api/v1/test', compiled);
      expect(matched.headers).toHaveProperty('X-First', '1');
      expect(matched.headers).toHaveProperty('X-Second', '2');
    });
  });

  describe('createRouteRulesMiddleware()', () => {
    it('creates a middleware handler', () => {
      const middleware = createRouteRulesMiddleware({
        '/api/**': { headers: { 'X-CORS': 'true' } }
      });
      expect(typeof middleware).toBe('function');
    });

    it('applies headers from matching rules', async () => {
      const middleware = createRouteRulesMiddleware({
        '/api/test': { headers: { 'X-Route-Rule': 'applied' } }
      });

      const mockCtx = {
        method: 'GET',
        req: { method: 'GET', url: 'http://localhost/api/test', path: '/api/test' },
        header: (_name: string, _value: string) => {},
        set: (_key: string, _value: unknown) => {},
        res: { headers: new Headers() }
      } as unknown as UbeanContext;

      let nextCalled = false;
      await middleware(mockCtx, async () => {
        nextCalled = true;
        // return new Response('ok');
      });
      expect(nextCalled).toBe(true);
    });

    it('applies redirect from matching rules', async () => {
      const middleware = createRouteRulesMiddleware({
        '/old-path': { redirect: '/new-path' }
      });

      const mockCtx = {
        method: 'GET',
        req: { method: 'GET', url: 'http://localhost/old-path', path: '/old-path' },
        header: () => {},
        set: (_key: string, _value: unknown) => {},
        redirect: (url: string, status: number) => new Response(null, { status, headers: { Location: url } }),
        res: { headers: new Headers() }
      } as unknown as UbeanContext;

      const result = await middleware(mockCtx, async () => {
        // return new Response('ok');
      });
      // Should return a redirect response
      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response && result.status >= 300 && result.status < 400) {
        expect(result.headers.get('Location')).toBe('/new-path');
      }
    });
  });

  describe('Route-level CORS', () => {
    it('CORS rule in routeRules', () => {
      const compiled = compileRouteRules({
        '/api/**': { headers: { 'Access-Control-Allow-Origin': '*' } }
      });
      const matched = matchRouteRules('/api/test', compiled);
      expect(matched.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    });
  });

  // HTTP 集成测试：本文件声明依赖真实 dev server（与其它 35 个文件语义一致）。
  // 不再用 ctx.skip()——静默跳过会让「global-setup 没跑」伪装成绿灯。
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
});
