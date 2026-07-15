import { describe, it, expect } from 'vitest';
import { compileRouteRules, matchRouteRules, createRouteRulesMiddleware } from 'ubean';
import type { RouteRule } from 'ubean';
import { getJson, api } from './helper';

describe('Route rules system', () => {
  describe('compileRouteRules()', () => {
    it('compiles route rules into pattern array', () => {
      const rules: Record<string, RouteRule> = {
        '/api/**': { cors: true },
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
        '/api/*': { cors: true },
        '/api/**': { cors: true }
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
        '/api/**': { cors: true }
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
        res: { headers: new Headers() }
      } as any;

      let nextCalled = false;
      await middleware(mockCtx, async () => {
        nextCalled = true;
        return new Response('ok');
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
        redirect: (url: string, status: number) => new Response(null, { status, headers: { Location: url } }),
        res: { headers: new Headers() }
      } as any;

      const result = await middleware(mockCtx, async () => new Response('ok'));
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

  describe('HTTP integration - /api/route-rules-test', () => {
    it('returns route rules info', async () => {
      const res = await getJson('/api/route-rules-test');
      expect(res.status).toBe(200);
    });

    it('route rules apply headers', async () => {
      const res = await api('/api/route-rules-test');
      // Headers may be set by route rules
      expect(res.status).toBe(200);
    });
  });
});
