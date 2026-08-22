import type { Context, Next } from 'hono';
import type { RouteRule, IsrRule } from '@ubean/shared';
import { applyPathTransform } from './path-transform';

export type { RouteRule, IsrRule } from '@ubean/shared';
export { applyPathTransform } from './path-transform';

export interface CompiledRouteRule {
  pattern: RegExp;
  rule: RouteRule;
  /** 原始路径模式(用于路径特异性计算) */
  path: string;
}

export interface RouteRulesMiddlewareOptions {
  /**
   * Internal dispatch used to rematch Hono routes after a rewrite.
   * Typically `req => app.fetch(req)` from `createUbeanApp`.
   */
  dispatch?: (request: Request) => Promise<Response>;
}

const REWRITE_GUARD = 'x-ubean-rewrite';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host'
]);

function compileRulePath(pattern: string): RegExp {
  const DOUBLE = '__DWC__';
  const SINGLE = '__SWC__';

  let s = pattern;
  s = s.replace(/\/\*\*/g, `/${DOUBLE}`);
  s = s.replace(/\*/g, SINGLE);
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(SINGLE, 'g'), '[^/]*');
  s = s.replace(new RegExp(`/${DOUBLE}`, 'g'), '(?:/.*)?');

  return new RegExp(`^${s}$`);
}

/**
 * 排序权重计算:提升更"具体"的规则优先匹配。
 *
 * P9-03 引入 `ssr`/`prerender`/`isr` 字段后,具体路径(如 `/admin/*`)应优先于
 * 通配路径(如 `/**`)被匹配,以便 per-route 字段优先级正确。
 *
 * P9-04 扩展:`ppr` 字段同样参与 specificity 计算。
 */
function ruleSpecificity(rule: RouteRule): number {
  return (
    (rule.redirect ? 3 : 0) +
    (rule.rewrite ? 2 : 0) +
    (rule.proxy ? 2 : 0) +
    (rule.headers ? 1 : 0) +
    (rule.ssr !== undefined ? 1 : 0) +
    (rule.isr !== undefined ? 1 : 0) +
    (rule.prerender !== undefined ? 1 : 0) +
    (rule.ppr !== undefined ? 1 : 0)
  );
}

/**
 * 路径特异性计算:作为 rule specificity 的 tiebreaker。
 *
 * - 字面段越多越具体(`/a/b/c` > `/a/b` > `/a`)
 * - 通配符降低特异性(`**` 比 `*` 更不具体)
 * - 用于在 rule specificity 相同时,让更具体的路径优先匹配
 *   (如 `/admin/profile` 优先于 `/admin/**`)
 */
function pathSpecificity(pattern: string): number {
  const segments = pattern.split('/').filter(s => s.length > 0);
  let score = 0;
  for (const seg of segments) {
    if (seg === '**') {
      score -= 10;
    } else if (seg.includes('*')) {
      score -= 1;
    } else {
      score += 1;
    }
  }
  return score;
}

export function compileRouteRules(rules: Record<string, RouteRule>): CompiledRouteRule[] {
  return Object.entries(rules)
    .map(([path, rule]) => ({
      path,
      pattern: compileRulePath(path),
      rule
    }))
    .sort((a, b) => {
      const ruleDiff = ruleSpecificity(b.rule) - ruleSpecificity(a.rule);
      if (ruleDiff !== 0) return ruleDiff;
      return pathSpecificity(b.path) - pathSpecificity(a.path);
    });
}

/**
 * 规范化 `isr` 字段为 `IsrRule` 对象形式。
 * `number` → `{ ttl: n }`,`undefined` → `undefined`。
 */
export function normalizeIsrRule(isr: RouteRule['isr']): IsrRule | undefined {
  if (isr === undefined) return undefined;
  if (typeof isr === 'number') return { ttl: isr };
  return isr;
}

export function matchRouteRules(path: string, compiledRules: CompiledRouteRule[]): RouteRule {
  const matched: RouteRule = {};

  for (const { pattern, rule } of compiledRules) {
    if (pattern.test(path)) {
      if (rule.headers) {
        matched.headers = { ...matched.headers, ...rule.headers };
      }
      if (rule.redirect && !matched.redirect) {
        matched.redirect = rule.redirect;
      }
      if (rule.rewrite && !matched.rewrite) {
        matched.rewrite = rule.rewrite;
      }
      if (rule.proxy && !matched.proxy) {
        matched.proxy = rule.proxy;
      }
      if (rule.cache) {
        matched.cache = { ...matched.cache, ...rule.cache };
      }
      if (rule.ssr !== undefined && matched.ssr === undefined) {
        matched.ssr = rule.ssr;
      }
      if (rule.prerender !== undefined && matched.prerender === undefined) {
        matched.prerender = rule.prerender;
      }
      if (rule.isr !== undefined && matched.isr === undefined) {
        matched.isr = rule.isr;
      }
      if (rule.ppr !== undefined && matched.ppr === undefined) {
        matched.ppr = rule.ppr;
      }
    }
  }

  return matched;
}

function findFirstRulePath(
  path: string,
  compiledRules: CompiledRouteRule[],
  field: 'rewrite' | 'proxy'
): string | undefined {
  for (const { pattern, rule, path: rulePath } of compiledRules) {
    if (pattern.test(path) && rule[field]) {
      return rulePath;
    }
  }
  return undefined;
}

function resolveRedirectUrl(
  redirect: string | { to: string; statusCode?: number },
  currentPath: string
): { url: string; statusCode: number } {
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

function cloneForwardHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function buildForwardRequest(c: Context, dest: string, extraHeaders?: HeadersInit): Request {
  const headers = cloneForwardHeaders(c.req.raw.headers);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  const init: RequestInit = {
    method: c.req.method,
    headers,
    redirect: 'manual'
  };
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.raw.body) {
    init.body = c.req.raw.body;
    (init as RequestInit & { duplex: 'half' }).duplex = 'half';
  }
  return new Request(dest, init);
}

export function createRouteRulesMiddleware(
  rules: Record<string, RouteRule>,
  options: RouteRulesMiddlewareOptions = {}
) {
  const compiled = compileRouteRules(rules);

  return async function routeRulesMiddleware(c: Context, next: Next) {
    const path = c.req.path;
    const matched = matchRouteRules(path, compiled);

    if (Object.keys(matched).length > 0) {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('routeRule', matched);
    }

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

    if (matched.proxy) {
      const from = findFirstRulePath(path, compiled, 'proxy') ?? path;
      const dest = applyPathTransform(path, from, matched.proxy);
      const upstream = await fetch(buildForwardRequest(c, dest));
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    }

    if (matched.rewrite && options.dispatch && !c.req.header(REWRITE_GUARD)) {
      const from = findFirstRulePath(path, compiled, 'rewrite') ?? path;
      const dest = applyPathTransform(path, from, matched.rewrite);
      if (dest !== path) {
        const url = new URL(c.req.url);
        url.pathname = dest;
        return options.dispatch(buildForwardRequest(c, url.toString(), { [REWRITE_GUARD]: '1' }));
      }
    }

    await next();
  };
}
