import type { CompiledLocalePath, HonoLocalePath, LocaleRoutingConfig } from './types';

/** URL segment for a locale code (`paths` override, else the code itself). */
export function localeSegment(code: string, paths?: Record<string, string>): string {
  return paths?.[code] ?? code;
}

/**
 * Reverse of `localeSegment`: the locale code owning a URL segment.
 * Returns `null` for a segment no configured locale claims.
 */
export function localeFromSegment(segment: string, locales: string[], paths?: Record<string, string>): string | null {
  for (const code of locales) {
    if (localeSegment(code, paths) === segment) return code;
  }
  return null;
}

/**
 * URL segments for every configured locale, in config order.
 *
 * This — not the raw codes — is the set the router matches against: with
 * `{ 'zh-CN': 'zh' }` the URL is `/zh/about`, so a param built from `zh-CN`
 * would never match the path the server rewrites to.
 */
export function localeSegments(cfg: LocaleRoutingConfig): string[] {
  return cfg.locales.map(code => localeSegment(code, cfg.paths));
}

function escapeRegex(code: string): string {
  return code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function joinCodes(codes: string[]): string {
  return codes.map(escapeRegex).join('|');
}

function normalizePath(path: string): string {
  if (!path || path === '') return '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) return withSlash.slice(0, -1);
  return withSlash;
}

/**
 * vue-router locale param segment for the given strategy.
 *
 * - `prefix_except_default`: `:locale(zh)?` (default unprefixed; `/en/about` 不匹配)
 * - `prefix`: `:locale(en|zh)` (required)
 * - `prefix_and_default`: `:locale(en|zh)?` (`/about` 与 `/en/about` 都匹配)
 * - `no_prefix`: empty
 */
export function getVueLocaleParam(cfg: LocaleRoutingConfig): string {
  const { strategy, defaultLocale } = cfg;
  const segments = localeSegments(cfg);
  const defaultSegment = localeSegment(defaultLocale, cfg.paths);
  const others = segments.filter(c => c !== defaultSegment);
  switch (strategy) {
    case 'no_prefix':
      return '';
    case 'prefix':
      return segments.length === 0 ? '' : `:locale(${joinCodes(segments)})`;
    case 'prefix_except_default':
      if (others.length === 0) return '';
      return `:locale(${joinCodes(others)})?`;
    case 'prefix_and_default':
      if (segments.length === 0) return '';
      return `:locale(${joinCodes(segments)})?`;
    default:
      return '';
  }
}

/** Apply a vue-router locale param to a page path (`/` / `/about` / catch-all). */
export function toVueRouterLocalePath(pagePath: string, localeParam: string): string {
  if (!localeParam) return pagePath;
  const path = normalizePath(pagePath);
  if (path === '/') return `/${localeParam}`;
  return `/${localeParam}${path}`;
}

/**
 * Split a URL path into its locale code and the rest.
 *
 * The returned `locale` is the **code**, not the segment — with
 * `{ 'zh-CN': 'zh' }` requesting `/zh/about` yields `{ locale: 'zh-CN' }`,
 * so callers keep using one vocabulary everywhere except in the URL itself.
 */
export function extractLocaleFromPath(
  path: string,
  localeCodes: string[],
  paths?: Record<string, string>
): { locale: string | null; pathWithoutLocale: string } {
  const normalized = normalizePath(path);
  const segments = normalized.split('/').filter(Boolean);
  const first = segments[0];
  if (first) {
    const code = localeFromSegment(first, localeCodes, paths);
    if (code) {
      const rest = segments.slice(1).join('/');
      return { locale: code, pathWithoutLocale: rest ? `/${rest}` : '/' };
    }
  }
  return { locale: null, pathWithoutLocale: normalized };
}

export function localizePath(path: string, locale: string, cfg: LocaleRoutingConfig): string {
  const { pathWithoutLocale } = extractLocaleFromPath(path, cfg.locales, cfg.paths);
  const clean = pathWithoutLocale;
  const suffix = clean === '/' ? '' : clean;
  const segment = localeSegment(locale, cfg.paths);

  switch (cfg.strategy) {
    case 'no_prefix':
      return clean;
    case 'prefix':
      return `/${segment}${suffix}`;
    case 'prefix_except_default':
    case 'prefix_and_default':
      if (locale === cfg.defaultLocale) return clean;
      return `/${segment}${suffix}`;
    default:
      return clean;
  }
}

export function switchLocalePath(locale: string, currentPath: string, cfg: LocaleRoutingConfig): string {
  return localizePath(currentPath, locale, cfg);
}

function honoPathsFor(pagePath: string, cfg: LocaleRoutingConfig): HonoLocalePath[] {
  const path = normalizePath(pagePath);
  const suffix = path === '/' ? '' : path;
  const { defaultLocale, locales, strategy } = cfg;
  const result: HonoLocalePath[] = [];

  const push = (mounted: string, locale: string, isDefault: boolean) => {
    result.push({ path: mounted || '/', locale, isDefault });
  };
  const segment = (code: string) => localeSegment(code, cfg.paths);

  switch (strategy) {
    case 'no_prefix':
      push(path, defaultLocale, true);
      break;
    case 'prefix':
      for (const locale of locales) {
        push(`/${segment(locale)}${suffix}`, locale, locale === defaultLocale);
      }
      break;
    case 'prefix_except_default':
      push(path, defaultLocale, true);
      for (const locale of locales) {
        if (locale === defaultLocale) continue;
        push(`/${segment(locale)}${suffix}`, locale, false);
      }
      break;
    case 'prefix_and_default':
      push(path, defaultLocale, true);
      for (const locale of locales) {
        push(`/${segment(locale)}${suffix}`, locale, locale === defaultLocale);
      }
      break;
    default:
      push(path, defaultLocale, true);
  }

  return result;
}

export function compileLocalePaths(pagePath: string, cfg: LocaleRoutingConfig): CompiledLocalePath {
  const localeParam = getVueLocaleParam(cfg);
  return {
    vuePath: toVueRouterLocalePath(pagePath, localeParam),
    hono: honoPathsFor(pagePath, cfg)
  };
}
