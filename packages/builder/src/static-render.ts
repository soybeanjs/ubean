/**
 * 静态 SSG 渲染器（mode: 'ssg' 专用，见 docs/adr/0011-lightweight-ssg-direct-render.md）。
 *
 * 职责：
 * 1. `compilePageRoute` / `matchRoutePattern`：把具象 URL 匹配到页面路由模式
 *    （`[param]` → `:param`、`[...slug]` → `**:slug`、`[[param]]` → `:param?`），
 *    提取路由参数 —— 替代 Hono 的路由匹配层
 * 2. `createStaticSsgRenderer`：加载构建产物中的静态 entry（renderStaticPage），
 *    暴露与 `prerender()` 的 fetcher 同构的契约，绕过 Hono 请求管道
 */
import { pathToFileURL } from 'node:url';
import { extractLocaleFromPath } from '@ubean/i18n';
import type { ScannedPageRoute } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import { resolve } from 'pathe';

const logger = getLogger('build');

/** 哨兵路由：prerender 队列中的 404 页标记，产物映射为 `404.html` */
export const STATIC_NOT_FOUND_ROUTE = '/__ubean_404__';

/* -------------------------------------------------------------------------- */
/* 路由模式匹配                                                                */
/* -------------------------------------------------------------------------- */

const CATCH_ALL_SEGMENT = /^\*\*:([A-Za-z_][\w-]*)$/;
/**
 * vue-router 参数段语法（`definePage({ path })` 覆盖时的 route 形态）：
 * - `:param` → 单段
 * - `:param?` → 可选单段
 * - `:param(regex)` → 自定义正则（如 `:id(\\d+)`）
 * - `:param(regex)*` / `:param*` → 可重复（0..n 段，如 `:slug(.*)*` catch-all）
 * - `:param(regex)+` / `:param+` → 可重复（1..n 段）
 */
const DYNAMIC_SEGMENT = /^:([A-Za-z_][\w-]*)(\(.+\))?([*+?])?$/;

export interface CompiledPageRoute {
  page: ScannedPageRoute;
  regex: RegExp;
  /** 捕获组顺序对应的参数名 */
  paramNames: string[];
  isCatchAll: boolean;
  /** 静态段数量（特异性排序用） */
  staticSegments: number;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 归一化 URL path：去尾部斜杠（根路由归一为空串便于匹配） */
function normalizeUrlPath(path: string): string {
  if (path === '/' || path === '') return '';
  let p = path;
  if (!p.startsWith('/')) p = `/${p}`;
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * 编译页面路由模式为正则。
 *
 * 输入 `page.route` 两种形态：
 * 1. scan 产物默认语法（route-path.ts）：
 *    - `/about`（静态）
 *    - `/blog/:slug`（动态）
 *    - `/docs/**:path`（catch-all，匹配剩余全部段，也匹配模式自身）
 *    - `/users/:id?`（可选段）
 * 2. `definePage({ path })` 覆盖的 vue-router 语法：
 *    - `/blog/:slug(.*)*`（自定义正则 + 可重复 = catch-all）
 *    - `/users/:id(\\d+)`（自定义正则）
 */
export function compilePageRoute(page: ScannedPageRoute): CompiledPageRoute {
  const segments = normalizeUrlPath(page.route).split('/').filter(Boolean);
  let source = '^';
  const paramNames: string[] = [];
  let isCatchAll = false;
  let staticSegments = 0;

  for (const seg of segments) {
    const catchAll = CATCH_ALL_SEGMENT.exec(seg);
    if (catchAll) {
      paramNames.push(catchAll[1]);
      isCatchAll = true;
      source += '(?:/(.+))?';
      continue;
    }
    const dynamic = DYNAMIC_SEGMENT.exec(seg);
    if (dynamic) {
      const [, name, custom, modifier] = dynamic;
      paramNames.push(name);
      const inner = custom ? custom.slice(1, -1) : '[^/]+';
      if (modifier === '*' || modifier === '+') {
        // 可重复参数（catch-all 语义）：参与特异性排序时靠后
        isCatchAll = true;
        source += modifier === '*' ? `(?:/(${inner}(?:/${inner})*))?` : `/(${inner}(?:/${inner})*)`;
      } else if (modifier === '?') {
        source += `(?:/(${inner}))?`;
      } else {
        source += `/(${inner})`;
      }
      continue;
    }
    staticSegments++;
    source += `/${escapeRegExp(seg)}`;
  }
  source += '/?$';

  return { page, regex: new RegExp(source), paramNames, isCatchAll, staticSegments };
}

export interface StaticRouteMatch {
  page: ScannedPageRoute;
  params: Record<string, string>;
}

/**
 * 将具象 URL path 匹配到页面路由模式，返回命中的页面与提取的参数。
 *
 * 匹配顺序（确定性）：静态段多者优先 → catch-all 最后 → 同分保持传入顺序。
 * 参数值经 `decodeURIComponent` 解码（对齐 Hono `c.req.param()` 行为）。
 */
export function matchRoutePattern(
  pages: Array<ScannedPageRoute | CompiledPageRoute>,
  path: string
): StaticRouteMatch | null {
  const compiled = pages.map(p => ('regex' in p ? (p as CompiledPageRoute) : compilePageRoute(p as ScannedPageRoute)));
  const ordered = compiled
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) => Number(a.c.isCatchAll) - Number(b.c.isCatchAll) || b.c.staticSegments - a.c.staticSegments || a.i - b.i
    )
    .map(({ c }) => c);

  const target = normalizeUrlPath(path);
  for (const c of ordered) {
    const m = c.regex.exec(target);
    if (!m) continue;
    const params: Record<string, string> = {};
    c.paramNames.forEach((name, idx) => {
      const raw = m[idx + 1];
      if (raw === undefined) return;
      try {
        params[name] = decodeURIComponent(raw);
      } catch {
        params[name] = raw;
      }
    });
    return { page: c.page, params };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* i18n 多语言路由展开（docs/adr/0011-lightweight-ssg-direct-render.md）                          */
/* -------------------------------------------------------------------------- */

function dedupeRoutes(routes: string[]): string[] {
  return [...new Set(routes)];
}

/**
 * 按路由策略将收集到的路由展开为全语言 URL 列表。
 *
 * | strategy | 展开规则 |
 * | --- | --- |
 * | `no_prefix` | 不展开（每 route 渲染 1 次） |
 * | `prefix_except_default` | default 无前缀 + 其余 locale 带前缀 |
 * | `prefix` | 全部 locale 带前缀（无前缀版本不生成——fetcher 对其 404） |
 * | `prefix_and_default` | 全部 locale 带前缀 + default 额外无前缀版本 |
 *
 * 特殊输入：
 * - 404 哨兵路由不展开（静态托管平台仅认单份 `404.html`）
 * - 已带 locale 前缀的 URL（crawlLinks 发现）保持原样，避免 `/zh/zh/about`
 */
export function expandRoutesForLocales(routes: string[], i18n: StaticSsgRendererI18nInit): string[] {
  const i18nEnabled = i18n != null && i18n.enabled !== false;
  const localeCodes = i18nEnabled ? (i18n.locales || []).map(l => (typeof l === 'string' ? l : l.code)) : [];
  if (!i18nEnabled || localeCodes.length === 0) return dedupeRoutes(routes);

  const strategy = i18n.strategy || 'prefix_except_default';
  if (strategy === 'no_prefix') return dedupeRoutes(routes);

  const defaultLocale = i18n.defaultLocale || localeCodes[0] || '';
  const expanded: string[] = [];

  for (const route of routes) {
    if (route === STATIC_NOT_FOUND_ROUTE) {
      expanded.push(route);
      continue;
    }
    // 已带 locale 前缀的 URL（crawlLinks 发现）保持原样
    const { locale } = extractLocaleFromPath(route, localeCodes);
    if (locale) {
      expanded.push(route);
      continue;
    }

    const suffix = route === '/' || route === '' ? '' : route;
    switch (strategy) {
      case 'prefix':
        for (const code of localeCodes) expanded.push(`/${code}${suffix}`);
        break;
      case 'prefix_and_default':
        expanded.push(route || '/');
        for (const code of localeCodes) expanded.push(`/${code}${suffix}`);
        break;
      case 'prefix_except_default':
      default:
        expanded.push(route || '/');
        for (const code of localeCodes) {
          if (code === defaultLocale) continue;
          expanded.push(`/${code}${suffix}`);
        }
        break;
    }
  }

  return dedupeRoutes(expanded);
}

/* -------------------------------------------------------------------------- */
/* 静态渲染器（fetcher 同构契约）                                               */
/* -------------------------------------------------------------------------- */

export interface StaticSsgRendererI18nInit {
  enabled?: boolean;
  strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
  defaultLocale?: string;
  locales?: Array<string | { code: string }>;
}

export interface StaticSsgRendererInit {
  /** 扫描得到的页面（含动态路由模式，供具象 URL 匹配） */
  pages: ScannedPageRoute[];
  /** `pages/404.vue` 自动检测的 404 页（可选） */
  notFoundPage?: ScannedPageRoute | null;
  /** i18n 配置（用于 locale 前缀剥离与默认语言） */
  i18n?: StaticSsgRendererI18nInit;
}

export interface RenderStaticPageInput {
  pageName: string;
  params: Record<string, string>;
  url: string;
  locale?: string;
}

export type RenderStaticPageFn = (input: RenderStaticPageInput) => Promise<{ html: string; statusCode: number }>;

export interface StaticSsgRenderer {
  /** 与 `PrerendererOptions.fetcher` 同构的契约 */
  fetcher: (url: string) => Promise<{ html: string; statusCode: number }>;
  /** i18n 多语言展开（按 strategy 生成全语言 URL，供 prerender 入队前应用） */
  expandRoutes: (routes: string[]) => string[];
  /** 底层渲染函数（等价性测试 / 调试用） */
  renderStaticPage: RenderStaticPageFn;
}

/**
 * 加载构建产物中的静态 entry（`dist/server/entry.mjs`），返回静态渲染器。
 *
 * 失败（entry 缺失 / 无 renderStaticPage 导出 / 加载异常）返回 `undefined`，
 * 由调用方降级（warn + placeholder prerender）。
 */
export async function createStaticSsgRenderer(
  cwd: string,
  manifest: { serverDir: string },
  init: StaticSsgRendererInit
): Promise<StaticSsgRenderer | undefined> {
  let mod: { renderStaticPage?: unknown };
  try {
    const entryPath = resolve(cwd, manifest.serverDir, 'entry.mjs');
    mod = (await import(pathToFileURL(entryPath).href)) as { renderStaticPage?: unknown };
  } catch (err) {
    logger.warn(`Failed to load static SSG entry: ${err instanceof Error ? err.message : String(err)}. Falling back.`);
    return undefined;
  }

  if (typeof mod.renderStaticPage !== 'function') {
    logger.warn('Static SSG entry does not export renderStaticPage; falling back.');
    return undefined;
  }
  const renderStaticPage = mod.renderStaticPage as RenderStaticPageFn;

  const compiled = init.pages.map(compilePageRoute);

  const i18nEnabled = init.i18n != null && init.i18n.enabled !== false;
  const localeCodes = i18nEnabled ? (init.i18n?.locales || []).map(l => (typeof l === 'string' ? l : l.code)) : [];
  const strategy = i18nEnabled ? init.i18n?.strategy || 'prefix_except_default' : 'no_prefix';
  const defaultLocale = (i18nEnabled && init.i18n?.defaultLocale) || '';
  const usePrefix = i18nEnabled && localeCodes.length > 0 && strategy !== 'no_prefix';

  return {
    renderStaticPage,
    expandRoutes: (routes: string[]) =>
      expandRoutesForLocales(routes, {
        enabled: i18nEnabled,
        strategy,
        defaultLocale,
        locales: localeCodes
      }),
    fetcher: async (url: string) => {
      const u = new URL(url, 'http://ubean.local');
      const pathname = u.pathname;
      const search = u.search;

      // 404 哨兵路由：渲染 notFoundPage 为 404.html
      if (pathname === STATIC_NOT_FOUND_ROUTE) {
        if (!init.notFoundPage) return { html: '', statusCode: 404 };
        return renderStaticPage({
          pageName: 'NotFound',
          params: {},
          url: `/404${search}`,
          locale: defaultLocale
        });
      }

      let pathToMatch = pathname;
      let locale = defaultLocale;
      if (usePrefix) {
        const { locale: extracted, pathWithoutLocale } = extractLocaleFromPath(pathname, localeCodes);
        if (extracted) {
          locale = extracted;
          pathToMatch = pathWithoutLocale;
        } else if (strategy === 'prefix') {
          // prefix 策略要求全部 URL 带语言前缀；无前缀 URL 在 fullstack 下会
          // 302 重定向，静态产物无执行点 → 按 404 跳过（P2 expandRoutes 补齐）
          return { html: '', statusCode: 404 };
        }
      }

      const match = matchRoutePattern(compiled, pathToMatch);
      if (!match) return { html: '', statusCode: 404 };

      return renderStaticPage({
        pageName: match.page.name,
        params: match.params,
        url: `${pathname}${search}`,
        locale
      });
    }
  };
}
