import type { CompiledLocalePath, HonoLocalePath, I18nRoutingStrategy, LocaleRoutingConfig } from './types';

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
  const { strategy, defaultLocale, locales } = cfg;
  const others = locales.filter(c => c !== defaultLocale);
  switch (strategy) {
    case 'no_prefix':
      return '';
    case 'prefix':
      return locales.length === 0 ? '' : `:locale(${joinCodes(locales)})`;
    case 'prefix_except_default':
      if (others.length === 0) return '';
      return `:locale(${joinCodes(others)})?`;
    case 'prefix_and_default':
      if (locales.length === 0) return '';
      return `:locale(${joinCodes(locales)})?`;
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

export function extractLocaleFromPath(
  path: string,
  localeCodes: string[]
): { locale: string | null; pathWithoutLocale: string } {
  const normalized = normalizePath(path);
  const segments = normalized.split('/').filter(Boolean);
  const first = segments[0];
  if (first && localeCodes.includes(first)) {
    const rest = segments.slice(1).join('/');
    return { locale: first, pathWithoutLocale: rest ? `/${rest}` : '/' };
  }
  return { locale: null, pathWithoutLocale: normalized };
}

export function localizePath(path: string, locale: string, cfg: LocaleRoutingConfig): string {
  const { pathWithoutLocale } = extractLocaleFromPath(path, cfg.locales);
  const clean = pathWithoutLocale;
  const suffix = clean === '/' ? '' : clean;

  switch (cfg.strategy) {
    case 'no_prefix':
      return clean;
    case 'prefix':
      return `/${locale}${suffix}`;
    case 'prefix_except_default':
    case 'prefix_and_default':
      if (locale === cfg.defaultLocale) return clean;
      return `/${locale}${suffix}`;
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

  switch (strategy) {
    case 'no_prefix':
      push(path, defaultLocale, true);
      break;
    case 'prefix':
      for (const locale of locales) {
        push(`/${locale}${suffix}`, locale, locale === defaultLocale);
      }
      break;
    case 'prefix_except_default':
      push(path, defaultLocale, true);
      for (const locale of locales) {
        if (locale === defaultLocale) continue;
        push(`/${locale}${suffix}`, locale, false);
      }
      break;
    case 'prefix_and_default':
      push(path, defaultLocale, true);
      for (const locale of locales) {
        push(`/${locale}${suffix}`, locale, locale === defaultLocale);
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

export type { I18nRoutingStrategy };
