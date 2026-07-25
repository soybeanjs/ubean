import { mkdir, writeFile } from 'node:fs/promises';
import type { RouteRule, PrerenderConfig, PrerenderRoute, PrerenderResult } from '@ubean/config';
import type { ScannedPageRoute } from '@ubean/routing';
import { join, dirname } from 'pathe';

const LINK_REGEX = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;

export interface PrerendererOptions {
  cwd: string;
  outputDir: string;
  pages: ScannedPageRoute[];
  routeRules?: Record<string, RouteRule>;
  prerender?: PrerenderConfig;
  fetcher?: (url: string) => Promise<{ html: string; statusCode: number }>;
}

const DEFAULT_PRERENDER_CONFIG: Required<PrerenderConfig> = {
  enabled: false,
  routes: [],
  ignore: [],
  crawlLinks: true,
  concurrency: 4,
  failOnError: false,
  staticDir: 'dist/public'
};

export function resolvePrerenderConfig(config?: PrerenderConfig): Required<PrerenderConfig> {
  if (!config) return DEFAULT_PRERENDER_CONFIG;
  return {
    enabled: config.enabled ?? DEFAULT_PRERENDER_CONFIG.enabled,
    routes: config.routes ?? DEFAULT_PRERENDER_CONFIG.routes,
    ignore: config.ignore ?? DEFAULT_PRERENDER_CONFIG.ignore,
    crawlLinks: config.crawlLinks ?? DEFAULT_PRERENDER_CONFIG.crawlLinks,
    concurrency: config.concurrency ?? DEFAULT_PRERENDER_CONFIG.concurrency,
    failOnError: config.failOnError ?? DEFAULT_PRERENDER_CONFIG.failOnError,
    staticDir: config.staticDir ?? DEFAULT_PRERENDER_CONFIG.staticDir
  };
}

function isDynamicPath(path: string): boolean {
  return /\[.*?\]/.test(path) || path.includes(':');
}

export function collectPrerenderRoutes(
  pages: ScannedPageRoute[],
  routeRules: Record<string, RouteRule> = {},
  extraRoutes: string[] = []
): { routes: string[]; ignoredRoutes: Set<string> } {
  const routes = new Set<string>();
  const ignoredRoutes = new Set<string>();

  for (const page of pages) {
    const path = normalizePagePath(page.path);
    if (!isDynamicPath(path)) {
      routes.add(path);
    }
  }

  for (const [pattern, rule] of Object.entries(routeRules)) {
    if (rule.prerender === true) {
      const routePath = pattern.replace(/\/\*\*?$/, '');
      if (routePath && !isDynamicPath(routePath)) {
        routes.add(routePath === '' ? '/' : routePath);
      }
    } else if (rule.prerender === false) {
      const basePattern = pattern.replace(/\/\*\*?$/, '');
      if (basePattern) {
        for (const existing of routes) {
          if (routePatternMatches(existing, pattern, basePattern)) {
            ignoredRoutes.add(existing);
          }
        }
      }
    }
  }

  for (const route of extraRoutes) {
    routes.add(route.startsWith('/') ? route : `/${route}`);
  }

  if (routes.size === 0 || !routes.has('/')) {
    routes.add('/');
  }

  for (const ignored of ignoredRoutes) {
    routes.delete(ignored);
  }

  return { routes: Array.from(routes), ignoredRoutes };
}

function routePatternMatches(route: string, pattern: string, basePattern: string): boolean {
  if (route === basePattern) return true;
  if (pattern.endsWith('/**') && route.startsWith(`${basePattern}/`)) return true;
  if (
    pattern.endsWith('/*') &&
    route.startsWith(`${basePattern}/`) &&
    !route.slice(basePattern.length + 1).includes('/')
  )
    return true;
  if (pattern === route) return true;
  return false;
}

function normalizePagePath(filePath: string): string {
  let path = filePath.replace(/\.(vue|ts|js|tsx|jsx|md|mdx)$/, '');

  if (path === 'index' || path.endsWith('/index')) {
    path = path.slice(0, -'index'.length);
  }

  path = path.replace(/\\/g, '/');

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path || '/';
}

export function extractLinks(html: string, baseUrl: string = ''): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;

  const anchorRe = new RegExp(LINK_REGEX.source, LINK_REGEX.flags);
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1];
    if (isInternalLink(href, baseUrl)) {
      const path = normalizeHref(href, baseUrl);
      if (path) links.add(path);
    }
  }

  return Array.from(links);
}

function isInternalLink(href: string, baseUrl: string): boolean {
  if (!href) return false;
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:'))
    return false;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return baseUrl ? href.startsWith(baseUrl) : false;
  }
  if (href.startsWith('//')) return false;
  return true;
}

function normalizeHref(href: string, baseUrl: string): string | null {
  let path = href;

  if (baseUrl && path.startsWith(baseUrl)) {
    path = path.slice(baseUrl.length);
  }

  const hashIdx = path.indexOf('#');
  if (hashIdx !== -1) {
    path = path.slice(0, hashIdx);
  }

  const queryIdx = path.indexOf('?');
  if (queryIdx !== -1) {
    path = path.slice(0, queryIdx);
  }

  if (path.includes(':')) return null;
  if (path.includes('//')) return null;

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path || '/';
}

export function shouldIgnoreRoute(route: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    if (pattern === route) return true;

    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -2);
      if (route === prefix.slice(0, -1) || route.startsWith(prefix)) return true;
      continue;
    }

    if (pattern.endsWith('**')) {
      const prefix = pattern.slice(0, -2);
      if (route.startsWith(prefix)) return true;
      continue;
    }

    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      if (route.startsWith(prefix) && !route.slice(prefix.length).includes('/')) return true;
      continue;
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (route.startsWith(prefix) && !route.slice(prefix.length).includes('/')) return true;
      continue;
    }

    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\*\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    if (regex.test(route)) return true;
  }
  return false;
}

export function routeToFilePath(route: string, outputDir: string): string {
  if (route === '/' || route === '') {
    return join(outputDir, 'index.html');
  }
  if (route.endsWith('.html')) {
    return join(outputDir, route);
  }
  return join(outputDir, route, 'index.html');
}

export async function writePrerenderedFile(filePath: string, html: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, 'utf-8');
}

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  debug(msg: string): void;
}

const _logger: Logger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
  success: (msg: string) => console.log(msg),
  debug: (_msg: string) => {}
};

export async function prerender(options: PrerendererOptions): Promise<PrerenderResult> {
  const startTime = Date.now();
  const config = resolvePrerenderConfig(options.prerender);

  if (!config.enabled) {
    return { routes: [], generated: [], errors: [], skipped: [], duration: 0 };
  }

  const outputDir = join(options.cwd, config.staticDir);
  const { routes: initialRoutes } = collectPrerenderRoutes(options.pages, options.routeRules, config.routes);

  const queue = [...initialRoutes];
  const visited = new Set<string>();
  const results: PrerenderRoute[] = [];
  const generated: string[] = [];
  const errors: PrerenderRoute[] = [];
  const skipped: string[] = [];

  _logger.info(`Prerendering ${queue.length} initial routes...`);

  async function processRoute(route: string): Promise<void> {
    if (visited.has(route)) return;
    visited.add(route);

    if (shouldIgnoreRoute(route, config.ignore)) {
      skipped.push(route);
      return;
    }

    const result: PrerenderRoute = { route };

    try {
      if (options.fetcher) {
        const resp = await options.fetcher(route);
        result.statusCode = resp.statusCode;
        result.html = resp.html;

        if (resp.statusCode >= 400) {
          result.error = new Error(`HTTP ${resp.statusCode}`);
          errors.push(result);
          if (config.failOnError) {
            throw result.error;
          }
          _logger.warn(`  ⚠ ${route} → ${resp.statusCode}`);
          return;
        }

        if (config.crawlLinks && resp.html) {
          const links = extractLinks(resp.html);
          for (const link of links) {
            if (!visited.has(link) && !shouldIgnoreRoute(link, config.ignore)) {
              queue.push(link);
            }
          }
        }

        const filePath = routeToFilePath(route, outputDir);
        await writePrerenderedFile(filePath, resp.html);
        generated.push(route);
        result.html = undefined;
      } else {
        const placeholderHtml = `<!DOCTYPE html>
<html>
<head><title>ubean</title></head>
<body>
<div id="app"><!-- Prerendered content placeholder for ${route} --></div>
</body>
</html>`;
        const filePath = routeToFilePath(route, outputDir);
        await writePrerenderedFile(filePath, placeholderHtml);
        generated.push(route);
        result.statusCode = 200;
      }
    } catch (err) {
      result.error = err instanceof Error ? err : new Error(String(err));
      errors.push(result);
      if (config.failOnError) {
        throw result.error;
      }
      _logger.warn(`  ⚠ ${route} → ${result.error.message}`);
    }

    results.push(result);
  }

  while (queue.length > 0) {
    const batch: string[] = [];
    while (batch.length < config.concurrency && queue.length > 0) {
      const r = queue.shift();
      if (r && !visited.has(r)) batch.push(r);
    }

    if (batch.length === 0) break;
    await Promise.all(batch.map(r => processRoute(r)));
  }

  const duration = Date.now() - startTime;

  _logger.success(
    `Prerendered ${generated.length} routes${errors.length > 0 ? ` (${errors.length} errors)` : ''}${
      skipped.length > 0 ? `, skipped ${skipped.length}` : ''
    } in ${duration}ms`
  );

  return { routes: results, generated, errors, skipped, duration };
}

export function definePrerenderRoutes(routes: string[]): string[] {
  return routes;
}

export function generatePrerenderManifest(
  result: PrerenderResult,
  baseUrl: string = '/'
): { routes: string[]; generatedAt: string; errors: Array<{ route: string; message: string }> } {
  return {
    routes: result.generated.map(r => baseUrl + r.replace(/^\//, '')),
    generatedAt: new Date().toISOString(),
    errors: result.errors.map(e => ({ route: e.route, message: e.error?.message || 'Unknown error' }))
  };
}
