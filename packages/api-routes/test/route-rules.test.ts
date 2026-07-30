/**
 * P9-03 per-route 渲染规则单元测试
 *
 * 验证 `RouteRule` 的新字段 `ssr` / `prerender` / `isr` 在
 * `compileRouteRules` / `matchRouteRules` / `normalizeIsrRule` 中的行为:
 * - 首次匹配胜出(按 specificity 排序后)
 * - 多规则合并时 ssr/prerender/isr 不被覆盖
 * - `isr` 规范化为 `IsrRule` 对象
 */
import { describe, it, expect } from 'vitest';
import { compileRouteRules, matchRouteRules, normalizeIsrRule } from '../src/index';
import type { RouteRule } from '@ubean/types';

describe('P9-03 per-route rendering rules', () => {
  describe('matchRouteRules - ssr field', () => {
    it('matches ssr: true on specific path', () => {
      const compiled = compileRouteRules({
        '/admin/**': { ssr: false },
        '/admin/profile': { ssr: true }
      });
      const matched = matchRouteRules('/admin/profile', compiled);
      // More specific rule wins (ssr: true)
      expect(matched.ssr).toBe(true);
    });

    it('matches ssr: false on wildcard', () => {
      const compiled = compileRouteRules({
        '/admin/**': { ssr: false }
      });
      const matched = matchRouteRules('/admin/dashboard', compiled);
      expect(matched.ssr).toBe(false);
    });

    it('matches ssr: "streaming"', () => {
      const compiled = compileRouteRules({
        '/stream/**': { ssr: 'streaming' }
      });
      const matched = matchRouteRules('/stream/page', compiled);
      expect(matched.ssr).toBe('streaming');
    });

    it('first match wins when specificity ties', () => {
      const compiled = compileRouteRules({
        '/a/*': { ssr: false },
        '/b/*': { ssr: true }
      });
      // /a/foo only matches first rule
      const matchedA = matchRouteRules('/a/foo', compiled);
      expect(matchedA.ssr).toBe(false);
      const matchedB = matchRouteRules('/b/foo', compiled);
      expect(matchedB.ssr).toBe(true);
    });

    it('does not set ssr when no rule matches', () => {
      const compiled = compileRouteRules({
        '/api/**': { ssr: false }
      });
      const matched = matchRouteRules('/public/foo', compiled);
      expect(matched.ssr).toBeUndefined();
    });
  });

  describe('matchRouteRules - prerender field', () => {
    it('matches prerender: true', () => {
      const compiled = compileRouteRules({
        '/about': { prerender: true }
      });
      const matched = matchRouteRules('/about', compiled);
      expect(matched.prerender).toBe(true);
    });

    it('matches prerender via wildcard', () => {
      const compiled = compileRouteRules({
        '/blog/**': { prerender: true }
      });
      const matched = matchRouteRules('/blog/post-1', compiled);
      expect(matched.prerender).toBe(true);
    });
  });

  describe('matchRouteRules - isr field', () => {
    it('matches isr as number', () => {
      const compiled = compileRouteRules({
        '/news/**': { isr: 60 }
      });
      const matched = matchRouteRules('/news/today', compiled);
      expect(matched.isr).toBe(60);
    });

    it('matches isr as object', () => {
      const compiled = compileRouteRules({
        '/news/**': { isr: { ttl: 120, swr: true } }
      });
      const matched = matchRouteRules('/news/today', compiled);
      expect(matched.isr).toEqual({ ttl: 120, swr: true });
    });

    it('first isr match wins (specificity ordering)', () => {
      const compiled = compileRouteRules({
        '/news/**': { isr: 60 },
        '/news/breaking': { isr: { ttl: 10, swr: true } }
      });
      const matched = matchRouteRules('/news/breaking', compiled);
      expect(matched.isr).toEqual({ ttl: 10, swr: true });
    });
  });

  describe('matchRouteRules - combined fields', () => {
    it('merges ssr + isr + headers from different rules', () => {
      const compiled = compileRouteRules({
        '/api/**': { headers: { 'X-API': '1' } },
        '/api/v1/*': { ssr: false, isr: 30 }
      });
      const matched = matchRouteRules('/api/v1/foo', compiled);
      expect(matched.headers).toHaveProperty('X-API', '1');
      expect(matched.ssr).toBe(false);
      expect(matched.isr).toBe(30);
    });
  });

  describe('normalizeIsrRule', () => {
    it('returns undefined for undefined input', () => {
      expect(normalizeIsrRule(undefined)).toBeUndefined();
    });

    it('converts number to { ttl: number }', () => {
      expect(normalizeIsrRule(60)).toEqual({ ttl: 60 });
      expect(normalizeIsrRule(0)).toEqual({ ttl: 0 });
    });

    it('passes through object form', () => {
      const rule = { ttl: 120, swr: true };
      expect(normalizeIsrRule(rule)).toBe(rule);
    });
  });

  describe('compileRouteRules - specificity sorting', () => {
    it('sorts rules with ssr/isr/prerender fields higher than plain headers', () => {
      const compiled = compileRouteRules({
        '/**': { headers: { 'X-Default': '1' } },
        '/admin/**': { ssr: false }
      });
      // /admin/** should be more specific due to ssr field
      // (rule.ssr contributes +1 specificity)
      expect(compiled[0].rule.ssr).toBe(false);
    });

    it('redirect still has highest specificity', () => {
      const compiled = compileRouteRules({
        '/admin/**': { ssr: false, isr: 60 },
        '/old': { redirect: '/new' }
      });
      // redirect contributes +3, ssr+isr = +2
      expect(compiled[0].rule.redirect).toBe('/new');
    });
  });

  describe('RouteRule type compatibility', () => {
    it('accepts all new fields together', () => {
      const rule: RouteRule = {
        cache: { ttl: 60, swr: true },
        headers: { 'X-Custom': 'yes' },
        ssr: 'streaming',
        prerender: true,
        isr: { ttl: 30, swr: false }
      };
      const compiled = compileRouteRules({ '/combined': rule });
      const matched = matchRouteRules('/combined', compiled);
      expect(matched.ssr).toBe('streaming');
      expect(matched.prerender).toBe(true);
      expect(matched.isr).toEqual({ ttl: 30, swr: false });
      expect(matched.cache).toEqual({ ttl: 60, swr: true });
      expect(matched.headers).toHaveProperty('X-Custom', 'yes');
    });
  });
});
