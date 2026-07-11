import type { Context, Next } from 'hono';

export interface RouteRule {
  cache?: { ttl?: number; swr?: boolean };
  headers?: Record<string, string>;
  redirect?: string | { to: string; statusCode?: number };
  rewrite?: string;
  proxy?: string;
  prerender?: boolean;
}

export interface CompiledRouteRule {
  pattern: RegExp;
  rule: RouteRule;
}

function compileRulePath(pattern: string): RegExp {
  const DOUBLE = '__DWC__';
  const SINGLE = '__SWC__';

  let s = pattern;
  s = s.replace(/\/\*\*/g, '/' + DOUBLE);
  s = s.replace(/\*/g, SINGLE);
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(SINGLE, 'g'), '[^/]*');
  s = s.replace(new RegExp('/' + DOUBLE, 'g'), '(?:/.*)?');

  return new RegExp(`^${s}$`);
}

export function compileRouteRules(rules: Record<string, RouteRule>): CompiledRouteRule[] {
  return Object.entries(rules)
    .map(([path, rule]) => ({
      pattern: compileRulePath(path),
      rule
    }))
    .sort((a, b) => {
      const aSpecificity = (a.rule.redirect ? 3 : 0) + (a.rule.headers ? 1 : 0) + (a.rule.rewrite ? 2 : 0);
      const bSpecificity = (b.rule.redirect ? 3 : 0) + (b.rule.headers ? 1 : 0) + (b.rule.rewrite ? 2 : 0);
      return bSpecificity - aSpecificity;
    });
}

export function matchRouteRules(path: string, compiledRules: CompiledRouteRule[]): RouteRule {
  const matched: RouteRule = {};

  for (const { pattern, rule } of compiledRules) {
    if (pattern.test(path)) {
      if (rule.headers) {
        matched.headers = { ...(matched.headers || {}), ...rule.headers };
      }
      if (rule.redirect && !matched.redirect) {
        matched.redirect = rule.redirect;
      }
      if (rule.rewrite && !matched.rewrite) {
        matched.rewrite = rule.rewrite;
      }
      if (rule.cache) {
        matched.cache = { ...(matched.cache || {}), ...rule.cache };
      }
      if (rule.prerender !== undefined) {
        matched.prerender = rule.prerender;
      }
    }
  }

  return matched;
}

function resolveRedirectUrl(redirect: string | { to: string; statusCode?: number }, currentPath: string): { url: string; statusCode: number } {
  if (typeof redirect === 'string') {
    return { url: redirect, statusCode: 307 };
  }
  let url = redirect.to;
  if (url.startsWith('./') || url.startsWith('../')) {
    const base = currentPath.replace(/\/[^/]*$/, '/');
    url = new URL(url, `http://localhost${base}`).pathname;
  }
  return { url, statusCode: redirect.statusCode || 307 };
}

function buildCacheControlHeader(cache: RouteRule['cache']): string | null {
  if (!cache) return null;
  const parts: string[] = [];
  if (cache.ttl !== undefined) {
    parts.push(`public, max-age=${cache.ttl}`);
    if (cache.swr) {
      parts.push(`stale-while-revalidate=${cache.ttl}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

export function createRouteRulesMiddleware(rules: Record<string, RouteRule>) {
  const compiled = compileRouteRules(rules);

  return async function routeRulesMiddleware(c: Context, next: Next) {
    const path = c.req.path;
    const matched = matchRouteRules(path, compiled);

    if (Object.keys(matched).length === 0) {
      await next();
      return;
    }

    if (matched.redirect) {
      const { url, statusCode } = resolveRedirectUrl(matched.redirect, path);
      return c.redirect(url, statusCode as 301 | 302 | 303 | 307 | 308);
    }

    if (matched.headers) {
      for (const [key, value] of Object.entries(matched.headers)) {
        c.header(key, value);
      }
    }

    const cacheHeader = buildCacheControlHeader(matched.cache);
    if (cacheHeader) {
      c.header('Cache-Control', cacheHeader);
    }

    await next();
  };
}
