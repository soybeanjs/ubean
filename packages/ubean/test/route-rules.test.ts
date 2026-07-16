import { describe, it, expect } from 'vitest';
import type { Context } from 'hono';
import { compileRouteRules, matchRouteRules, createRouteRulesMiddleware } from '../src/runtime/route-rules';

describe('route rules compiler', () => {
  it('compiles exact path patterns', () => {
    const compiled = compileRouteRules({
      '/about': { headers: { 'X-Custom': 'test' } }
    });
    expect(compiled).toHaveLength(1);
    expect(compiled[0].pattern.test('/about')).toBe(true);
    expect(compiled[0].pattern.test('/about/us')).toBe(false);
    expect(compiled[0].pattern.test('/')).toBe(false);
  });

  it('compiles wildcard patterns (* matches single segment)', () => {
    const compiled = compileRouteRules({
      '/api/*': { headers: { 'X-API': 'true' } }
    });
    expect(compiled[0].pattern.test('/api/users')).toBe(true);
    expect(compiled[0].pattern.test('/api/users/123')).toBe(false);
    expect(compiled[0].pattern.test('/api')).toBe(false);
  });

  it('compiles double wildcard patterns (** matches multiple segments)', () => {
    const compiled = compileRouteRules({
      '/assets/**': { headers: { 'Cache-Control': 'public, max-age=31536000' } }
    });
    expect(compiled[0].pattern.test('/assets/js/app.js')).toBe(true);
    expect(compiled[0].pattern.test('/assets/css/style.css')).toBe(true);
    expect(compiled[0].pattern.test('/assets/img/sub/logo.png')).toBe(true);
    expect(compiled[0].pattern.test('/assets')).toBe(true);
  });
});

describe('route rules matching', () => {
  it('matches exact paths', () => {
    const compiled = compileRouteRules({
      '/': { headers: { 'X-Home': 'true' } },
      '/about': { headers: { 'X-About': 'true' } }
    });

    const homeMatch = matchRouteRules('/', compiled);
    expect(homeMatch.headers?.['X-Home']).toBe('true');
    expect(homeMatch.headers?.['X-About']).toBeUndefined();

    const aboutMatch = matchRouteRules('/about', compiled);
    expect(aboutMatch.headers?.['X-About']).toBe('true');
  });

  it('merges headers from multiple matching rules', () => {
    const compiled = compileRouteRules({
      '/**': { headers: { 'X-Global': 'true' } },
      '/api/**': { headers: { 'X-API': 'v1' } },
      '/api/users': { headers: { 'X-Users': 'true' } }
    });

    const match = matchRouteRules('/api/users', compiled);
    expect(match.headers?.['X-Global']).toBe('true');
    expect(match.headers?.['X-API']).toBe('v1');
    expect(match.headers?.['X-Users']).toBe('true');
  });

  it('first matching redirect wins (specificity ordering)', () => {
    const compiled = compileRouteRules({
      '/old': { redirect: '/new' },
      '/old/**': { redirect: '/new-all' }
    });

    const exactMatch = matchRouteRules('/old', compiled);
    expect(exactMatch.redirect).toBe('/new');

    const deepMatch = matchRouteRules('/old/page', compiled);
    expect(deepMatch.redirect).toBe('/new-all');
  });

  it('matches cache rules', () => {
    const compiled = compileRouteRules({
      '/static/**': { cache: { ttl: 3600, swr: true } }
    });

    const match = matchRouteRules('/static/img.png', compiled);
    expect(match.cache?.ttl).toBe(3600);
    expect(match.cache?.swr).toBe(true);
  });

  it('returns empty rule when no patterns match', () => {
    const compiled = compileRouteRules({
      '/api/**': { headers: { 'X-API': 'true' } }
    });

    const match = matchRouteRules('/about', compiled);
    expect(Object.keys(match)).toHaveLength(0);
  });
});

describe('route rules middleware', () => {
  it('creates a middleware function', () => {
    const mw = createRouteRulesMiddleware({
      '/**': { headers: { 'X-Powered-By': 'ubean' } }
    });
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(2);
  });

  it('middleware sets response headers', async () => {
    const mw = createRouteRulesMiddleware({
      '/**': { headers: { 'X-Test': 'passed' } }
    });

    const headers: Record<string, string> = {};
    let nextCalled = false;

    const c = {
      req: { path: '/test' },
      header: (key: string, value: string) => {
        headers[key] = value;
      },
      redirect: () => {
        throw new Error('should not redirect');
      }
    } as unknown as Context;

    const next = async () => {
      nextCalled = true;
    };

    await mw(c, next);

    expect(nextCalled).toBe(true);
    expect(headers['X-Test']).toBe('passed');
  });

  it('middleware returns redirect response', async () => {
    const mw = createRouteRulesMiddleware({
      '/old-page': { redirect: '/new-page' }
    });

    const c = {
      req: { path: '/old-page' },
      header: () => {},
      redirect: (url: string, status: number) => {
        return { url, status, __redirected: true };
      }
    } as unknown as Context;

    const next = async () => {
      throw new Error('should not call next');
    };

    const result = await mw(c, next);
    expect((result as { url: string }).url).toBe('/new-page');
    expect((result as { status: number }).status).toBe(307);
  });

  it('middleware sets Cache-Control header from cache rules', async () => {
    const mw = createRouteRulesMiddleware({
      '/img/**': { cache: { ttl: 86400 } }
    });

    const headers: Record<string, string> = {};
    const c = {
      req: { path: '/img/logo.png' },
      header: (key: string, value: string) => {
        headers[key] = value;
      },
      redirect: () => {
        throw new Error('should not redirect');
      }
    } as unknown as Context;

    await mw(c, async () => {});

    expect(headers['Cache-Control']).toContain('max-age=86400');
    expect(headers['Cache-Control']).toContain('public');
  });

  it('middleware passes through when no rules match', async () => {
    const mw = createRouteRulesMiddleware({
      '/api/**': { headers: { 'X-API': 'true' } }
    });

    const headers: Record<string, string> = {};
    let nextCalled = false;

    const c = {
      req: { path: '/page' },
      header: (key: string, value: string) => {
        headers[key] = value;
      },
      redirect: () => {
        throw new Error('should not redirect');
      }
    } as unknown as Context;

    await mw(c, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(headers['X-API']).toBeUndefined();
  });
});
