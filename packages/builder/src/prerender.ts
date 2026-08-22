import { mkdir, writeFile } from 'node:fs/promises';
import { resolvePrerenderConfig } from '@ubean/config';
import type { PrerenderConfig, PrerenderRoute, PrerenderResult, ResolvedPrerenderConfig } from '@ubean/config';
import { DATA_PAYLOAD_ID } from '@ubean/pages';
import type { ScannedPageRoute } from '@ubean/scan';
import { matchGlob } from '@ubean/shared';
import type { RouteRule } from '@ubean/shared';
import { join, dirname } from 'pathe';

const LINK_REGEX = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;

/**
 * 匹配 `__UBEAN_DATA__` 内联 script 的正则。
 *
 * 预渲染时从中提取 JSON payload,替换为 `<link rel="preload">` + 引导脚本
 * (引导脚本通过 fetch 加载 `__data.json`,设置全局 `__UBEAN_DATA_PAYLOAD__`)。
 *
 * 使用 `[\s\S]*?` 非贪婪匹配,避免多个 script 之间的过度匹配。
 */
const DATA_PAYLOAD_REGEX = new RegExp(`<script id="${DATA_PAYLOAD_ID}" type="application/json">([\\s\\S]*?)</script>`);

export interface PrerendererOptions {
  cwd: string;
  outputDir: string;
  pages: ScannedPageRoute[];
  /**
   * 预渲染配置。可直接传用户配置对象(由 `resolvePrerenderConfig` 解析默认值)。
   * 未设置或 `enabled: false` 时直接返回空结果。
   */
  prerender?: PrerenderConfig;
  /**
   * 路由规则(P9-03)。用于自动发现标记了 `prerender: true` 的路由。
   * 与 `PrerenderConfig.include` / `all` 合并:
   *   - `all: true` 时 routeRules 中的 prerender 标记被忽略(已包含全部)
   *   - 否则 prerender 标记的路由加入 include 列表
   * 受 `PrerenderConfig.exclude` 过滤。
   */
  routeRules?: Record<string, RouteRule>;
  /** Content collection URLs merged into `include` (see `extractContentPageRoutes`). */
  contentRoutes?: string[];
  fetcher?: (url: string) => Promise<{ html: string; statusCode: number }>;
}

function isDynamicPath(path: string): boolean {
  return /\[.*?\]/.test(path) || path.includes(':');
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
 * 从 routeRules 中提取标记了 `prerender: true` 或 `ppr: true` 的路由模式
 * (P9-03 + P9-04)。
 *
 * P9-04:`ppr: true` 隐含 `prerender: true` —— PPR 路由的静态壳需要通过
 * 预渲染生成(`server:defer` 组件在预渲染时仅渲染 fallback)。
 *
 * 返回的路径列表会进一步与 `pages` 候选池匹配(glob 模式)或直接加入(具体路径)。
 * 动态路由的具象值(如 `/blog/hello-world`)可通过具体路径直接加入。
 */
export function extractPrerenderRoutesFromRules(routeRules: Record<string, RouteRule> | undefined): string[] {
  if (!routeRules) return [];
  const result: string[] = [];
  for (const [pattern, rule] of Object.entries(routeRules)) {
    if (rule?.prerender === true || rule?.ppr === true) {
      result.push(pattern);
    }
  }
  return result;
}

/**
 * 收集需要预渲染的路由列表。
 *
 * 行为:
 * 1. 扫描 `pages` 得到所有非动态页面作为候选池
 * 2. 若 `options.all === true`:加入候选池所有路由(`include` 被忽略)
 * 3. 否则遍历 `options.include` + `options.routeRules` 中 `prerender: true` 的模式:
 *    - 含通配符的模式 → 与候选池匹配
 *    - 不含通配符的具体路径 → 直接加入(用于动态路由的具象值)
 * 4. 应用 `options.exclude` 过滤
 *
 * 返回的 `skipped` 为被 `exclude` 命中的路由集合。
 */
export function collectPrerenderRoutes(
  pages: ScannedPageRoute[],
  options: {
    all?: boolean;
    include?: string[];
    exclude?: string[];
    /** P9-03: routeRules 中 `prerender: true` 的模式会合并到 include 列表 */
    routeRules?: Record<string, RouteRule>;
    /** Content collection URLs (`extractContentPageRoutes`) merged into include */
    contentRoutes?: string[];
  } = {}
): { routes: string[]; skipped: string[] } {
  const all = options.all === true;
  const exclude = options.exclude ?? [];
  // 合并显式 include 与 routeRules 中 prerender: true 的模式
  const include = [
    ...(options.include ?? []),
    ...extractPrerenderRoutesFromRules(options.routeRules),
    ...(options.contentRoutes ?? [])
  ];

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
    // 指定模式:遍历 include(含 routeRules 中 prerender: true 的模式)
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

/**
 * 将路由路径映射到对应的 `__data.json` 文件路径。
 *
 * 规则(与 `routeToFilePath` 对应,但产物是 JSON payload 而非 HTML):
 * - `/` → `outputDir/__data.json`
 * - `/about` → `outputDir/about/__data.json`
 * - `/dashboard/settings` → `outputDir/dashboard/settings/__data.json`
 *
 * 与 HTML 不同,这里不需要处理扩展名路由(`.html`/`.txt` 等)—— payload
 * 仅对页面路由有意义,扩展名路由(如 `/robots.txt`)不参与 payload 提取。
 */
export function routeToDataFilePath(route: string, outputDir: string): string {
  if (route === '/' || route === '') {
    return join(outputDir, '__data.json');
  }
  return join(outputDir, route, '__data.json');
}

/**
 * `extractDataPayload` 的返回结构。
 */
export interface ExtractedPayload {
  /** 从 `__UBEAN_DATA__` 解析出的 payload 数据。 */
  data: Record<string, unknown>;
  /** 替换内联 script 后的 HTML(包含 preload link + 引导脚本)。 */
  html: string;
  /** `__data.json` 的 URL(用于 preload + fetch)。 */
  dataUrl: string;
}

/**
 * 从预渲染 HTML 中提取 `__UBEAN_DATA__` payload,替换为外部引用。
 *
 * 流程:
 * 1. 用正则匹配 `<script id="__UBEAN_DATA__">JSON</script>`
 * 2. JSON.parse 提取的数据(解析失败/为空 → 返回 null)
 * 3. 计算 `dataUrl`(根路由 → `/__data.json`,其他 → `<route>/__data.json`)
 * 4. 用 `<link rel="preload">` + 引导脚本替换内联 script
 *    (引导脚本通过 `fetch(dataUrl)` 加载 payload,设置全局 `__UBEAN_DATA_PAYLOAD__`)
 *
 * 返回 `null` 表示不进行提取(无 script / JSON 解析失败 / payload 为空对象)。
 *
 * @param html 预渲染后的完整 HTML
 * @param route 当前路由路径(用于计算 dataUrl)
 */
export function extractDataPayload(html: string, route: string): ExtractedPayload | null {
  const match = DATA_PAYLOAD_REGEX.exec(html);
  if (!match) return null;

  const jsonText = match[1];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }

  // 空对象 payload 不提取(无意义,徒增一次请求)
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return null;
  }

  const dataUrl = route === '/' || route === '' ? '/__data.json' : `${route}/__data.json`;

  // 替换内联 script 为 preload + 引导脚本:
  // - `<link rel="preload">` 让浏览器尽早开始下载 __data.json
  // - 引导脚本通过 fetch 加载 payload,设置全局 `__UBEAN_DATA_PAYLOAD__`
  //   (客户端 useData 会优先读这个全局变量,降级到 DOM 读取)
  // - `crossorigin="anonymous"` 因为 __data.json 通常无需凭据
  //   (引导脚本的 fetch 仍带 `credentials:"include"` 以支持 cookie-based 页面)
  const replacement =
    `<link rel="preload" href="${dataUrl}" as="fetch" crossorigin="anonymous">` +
    `<script>window.__UBEAN_DATA_PAYLOAD__=fetch(${JSON.stringify(dataUrl)},{credentials:"include"}).then(r=>r.ok?r.json():null).catch(()=>null)</script>`;

  const modifiedHtml = html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);

  return { data, html: modifiedHtml, dataUrl };
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

  // P9-03 + P9-04: routeRules 中 `prerender: true` 或 `ppr: true` 的路由也启用预渲染,
  // 即使 `PrerenderConfig` 未显式配置 `all` 或 `include`。
  // PPR 路由的预渲染产物作为静态壳(`server:defer` 组件仅渲染 fallback)。
  const ruleDiscoveredRoutes = extractPrerenderRoutesFromRules(options.routeRules);
  const enabledByRules = ruleDiscoveredRoutes.length > 0;

  if (!config.enabled && !enabledByRules) {
    return { routes: [], generated: [], errors: [], skipped: [], duration: 0 };
  }

  const outputDir = join(options.cwd, config.staticDir);
  const { routes: initialRoutes, skipped: initiallySkipped } = collectPrerenderRoutes(options.pages, {
    all: config.all,
    include: config.include,
    exclude: config.exclude,
    routeRules: options.routeRules,
    contentRoutes: options.contentRoutes
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

        // SSG payload 提取(roadmap Task 3):仅对 200 OK 的 HTML 提取,
        // 将内联 `__UBEAN_DATA__` script 拆分为独立的 `__data.json` 文件,
        // HTML 中替换为 `<link rel="preload">` + 引导脚本。
        // 失败(无 script / JSON 解析失败 / 空数据)静默降级,保留原 HTML。
        let htmlToWrite = resp.html;
        if (config.extractDataPayload && resp.statusCode === 200 && resp.html) {
          const extracted = extractDataPayload(resp.html, route);
          if (extracted) {
            const dataFilePath = routeToDataFilePath(route, outputDir);
            await writePrerenderedFile(dataFilePath, JSON.stringify(extracted.data));
            htmlToWrite = extracted.html;
          }
        }

        const filePath = routeToFilePath(route, outputDir);
        await writePrerenderedFile(filePath, htmlToWrite);
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
