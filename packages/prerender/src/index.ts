import { mkdir, writeFile } from 'node:fs/promises';
import { resolvePrerenderConfig } from '@ubean/config';
import type { PrerenderConfig, PrerenderRoute, PrerenderResult, ResolvedPrerenderConfig } from '@ubean/config';
import type { ScannedPageRoute } from '@ubean/routing';
import { join, dirname } from 'pathe';

const LINK_REGEX = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;

export interface PrerendererOptions {
  cwd: string;
  outputDir: string;
  pages: ScannedPageRoute[];
  /**
   * 预渲染配置。可直接传用户配置对象(由 `resolvePrerenderConfig` 解析默认值)。
   * 未设置或 `enabled: false` 时直接返回空结果。
   */
  prerender?: PrerenderConfig;
  fetcher?: (url: string) => Promise<{ html: string; statusCode: number }>;
}

function isDynamicPath(path: string): boolean {
  return /\[.*?\]/.test(path) || path.includes(':');
}

/**
 * 通配符匹配,支持:
 * - `**` 多段递归  ('/blog/**' 匹配 '/blog/a/b/c' 与 '/blog')
 * - `*`  单段     ('/blog/*' 匹配 '/blog/a' 不匹配 '/blog/a/b')
 * - 字面量         ('/about' 仅匹配 '/about')
 *
 * 此函数统一了此前 `shouldIgnoreRoute` 与 `routePatternMatches` 的逻辑。
 */
export function matchGlob(route: string, pattern: string): boolean {
  if (pattern === route) return true;
  if (pattern === '**') return true;

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return route === prefix || route.startsWith(`${prefix}/`);
  }

  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return route.startsWith(`${prefix}/`) && !route.slice(prefix.length + 1).includes('/');
  }

  if (pattern === '/**') {
    return true;
  }

  // 一般 glob:转正则(* → [^/]*, ** → .*)
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(route);
}

/**
 * 检查 route 是否匹配任意一个 patterns。
 * 保留旧 API 名称以避免破坏外部调用,内部改用 `matchGlob`。
 */
export function shouldIgnoreRoute(route: string, patterns: string[]): boolean {
  return patterns.some(p => matchGlob(route, p));
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

/**
 * 收集需要预渲染的路由列表。
 *
 * 行为:
 * 1. 扫描 `pages` 得到所有非动态页面作为候选池
 * 2. 若 `options.all === true`:加入候选池所有路由(`include` 被忽略)
 * 3. 否则遍历 `options.include`:
 *    - 含通配符的模式 → 与候选池匹配
 *    - 不含通配符的具体路径 → 直接加入(用于动态路由的具象值)
 * 4. 应用 `options.exclude` 过滤
 *
 * 返回的 `skipped` 为被 `exclude` 命中的路由集合。
 */
export function collectPrerenderRoutes(
  pages: ScannedPageRoute[],
  options: { all?: boolean; include?: string[]; exclude?: string[] } = {}
): { routes: string[]; skipped: string[] } {
  const all = options.all === true;
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];

  // 候选池:文件系统扫描出的非动态页面
  const allPageRoutes: string[] = [];
  for (const page of pages) {
    const path = normalizePagePath(page.path);
    if (!isDynamicPath(path)) {
      allPageRoutes.push(path);
    }
  }

  const matched = new Set<string>();

  if (all) {
    // 全部模式:`include` 静默忽略
    for (const r of allPageRoutes) matched.add(r);
  } else {
    // 指定模式:遍历 include
    for (const pattern of include) {
      if (pattern.includes('*')) {
        // glob 模式 - 仅匹配文件系统已有页面
        for (const r of allPageRoutes) {
          if (matchGlob(r, pattern)) matched.add(r);
        }
      } else {
        // 具体路径 - 直接加入(可能是动态路由的具象值,如 /blog/hello-world)
        matched.add(pattern.startsWith('/') ? pattern : `/${pattern}`);
      }
    }
  }

  // 应用 exclude
  const skipped: string[] = [];
  for (const r of matched) {
    if (exclude.some(p => matchGlob(r, p))) {
      skipped.push(r);
    }
  }
  for (const r of skipped) matched.delete(r);

  return { routes: Array.from(matched), skipped };
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

/**
 * 将路由路径映射到磁盘文件路径。
 *
 * 规则:
 * - `/` 或空 → `outputDir/index.html`
 * - 含文件扩展名(`.html`/`.txt`/`.xml`/`.json`/`.webmanifest`/`.svg`/`.ico` 等)
 *   的路由 → 保留原文件名,例如 `/robots.txt` → `outputDir/robots.txt`(文件,不是目录)
 * - 其他路由 → `outputDir/<route>/index.html`
 *
 * 处理带扩展名路由是为了避免 `/robots.txt/index.html`、`/sitemap.xml/index.html`
 * 这种被错误转成目录的产物。
 */
export function routeToFilePath(route: string, outputDir: string): string {
  if (route === '/' || route === '') {
    return join(outputDir, 'index.html');
  }
  if (route.endsWith('.html')) {
    return join(outputDir, route);
  }
  // 检测最后一段是否含扩展名(避免把 /api/v1/foo 当成扩展名场景)
  const lastSegment = route.slice(route.lastIndexOf('/') + 1);
  const dotIdx = lastSegment.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < lastSegment.length - 1) {
    // 保留原文件名:/robots.txt → outputDir/robots.txt
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
  const config: ResolvedPrerenderConfig = resolvePrerenderConfig(options.prerender);

  if (!config.enabled) {
    return { routes: [], generated: [], errors: [], skipped: [], duration: 0 };
  }

  const outputDir = join(options.cwd, config.staticDir);
  const { routes: initialRoutes, skipped: initiallySkipped } = collectPrerenderRoutes(options.pages, {
    all: config.all,
    include: config.include,
    exclude: config.exclude
  });

  const queue = [...initialRoutes];
  const visited = new Set<string>();
  const results: PrerenderRoute[] = [];
  const generated: string[] = [];
  const errors: PrerenderRoute[] = [];
  const skipped: string[] = [...initiallySkipped];

  _logger.info(`Prerendering ${queue.length} initial routes...`);

  async function processRoute(route: string): Promise<void> {
    if (visited.has(route)) return;
    visited.add(route);

    // exclude 二次过滤(对 crawlLinks 发现的链接也生效)
    if (config.exclude.some(p => matchGlob(route, p))) {
      if (!skipped.includes(route)) skipped.push(route);
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
            if (!visited.has(link) && !config.exclude.some(p => matchGlob(link, p))) {
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

/**
 * @deprecated 仅保留为兼容别名,新 API 直接使用 `prerender.include` 字段。
 * 原功能:声明额外预渲染路由。
 */
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

// 重新导出 RouteRule 类型,保持外部 import 兼容
export type { RouteRule } from '@ubean/config';
