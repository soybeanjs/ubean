import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';
import { useI18n } from './index';
import type { I18nRoutingStrategy } from './index';

export type { I18nRoutingStrategy } from './index';

export interface I18nRoutingOptions {
  strategy?: I18nRoutingStrategy;
  defaultLocale?: string;
  locales?: string[];
  detectFromHeader?: boolean;
  detectFromCookie?: boolean | string;
  redirectOnLocaleMismatch?: boolean;
  cookieName?: string;
}

function getLocaleFromPath(path: string, locales: string[]): { locale: string | null; pathWithoutLocale: string } {
  const segments = path.split('/');
  if (segments.length >= 2 && locales.includes(segments[1])) {
    const remainingPath = segments.slice(2).join('/');
    return {
      locale: segments[1],
      pathWithoutLocale: remainingPath ? `/${remainingPath}` : '/'
    };
  }
  return { locale: null, pathWithoutLocale: path };
}

export function createI18nMiddleware(options: I18nRoutingOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    strategy = 'prefix_except_default',
    defaultLocale: explicitDefault,
    locales: explicitLocales,
    detectFromHeader = true,
    detectFromCookie = true,
    redirectOnLocaleMismatch = true,
    cookieName = 'ubean_locale'
  } = options;

  return async function i18nMiddleware(c: Context<UbeanEnv>, next: Next) {
    const i18n = useI18n();
    const resolvedDefaultLocale = explicitDefault || i18n.fallbackLocale;
    const resolvedLocales = explicitLocales || i18n.availableLocales;
    const path = new URL(c.req.url).pathname;

    let detectedLocale = resolvedDefaultLocale;

    if (strategy === 'prefix' || strategy === 'prefix_except_default' || strategy === 'prefix_and_default') {
      const { locale: pathLocale, pathWithoutLocale } = getLocaleFromPath(path, resolvedLocales);
      if (pathLocale) {
        detectedLocale = pathLocale;
        c.set('locale', pathLocale);
        c.set('pathWithoutLocale', pathWithoutLocale);
      } else if (strategy === 'prefix_and_default') {
        // prefix_and_default: unprefixed path also works for default locale (no redirect)
        detectedLocale = resolvedDefaultLocale;
        c.set('pathWithoutLocale', path);
      } else if (strategy === 'prefix') {
        const preferredLocale = resolvePreferredLocale();
        if (redirectOnLocaleMismatch && preferredLocale !== resolvedDefaultLocale) {
          const redirectUrl = `/${preferredLocale}${path === '/' ? '' : path}`;
          return c.redirect(redirectUrl, 302);
        }
        if (redirectOnLocaleMismatch) {
          return c.redirect(`/${resolvedDefaultLocale}${path === '/' ? '' : path}`, 302);
        }
      } else if (strategy === 'prefix_except_default') {
        const preferredLocale = resolvePreferredLocale();
        if (preferredLocale !== resolvedDefaultLocale && redirectOnLocaleMismatch) {
          return c.redirect(`/${preferredLocale}${path === '/' ? '' : path}`, 302);
        }
        detectedLocale = resolvedDefaultLocale;
      }
    } else if (strategy === 'no_prefix') {
      detectedLocale = resolvePreferredLocale();
    }

    function resolvePreferredLocale(): string {
      if (detectFromCookie) {
        const cookieLocale = c.req.header('cookie');
        if (cookieLocale) {
          const match = cookieLocale.match(new RegExp(`${cookieName}=([^;]+)`));
          if (match && resolvedLocales.includes(match[1])) {
            return match[1];
          }
        }
      }

      if (detectFromHeader) {
        const acceptLang = c.req.header('accept-language');
        if (acceptLang) {
          const detected = i18n.detectLocale(acceptLang);
          if (resolvedLocales.includes(detected)) {
            return detected;
          }
        }
      }

      return resolvedDefaultLocale;
    }

    if (resolvedLocales.includes(detectedLocale)) {
      i18n.setLocale(detectedLocale);
    }

    c.set('locale', detectedLocale);
    c.header('Content-Language', detectedLocale);

    await next();
  };
}

export function switchLocalePath(
  c: Context,
  locale: string,
  strategy: I18nRoutingStrategy = 'prefix_except_default',
  defaultLocale?: string
): string {
  const path = new URL(c.req.url).pathname;
  const i18n = useI18n();
  const resolvedDefault = defaultLocale || i18n.fallbackLocale;
  const resolvedLocales = i18n.availableLocales;
  const { pathWithoutLocale } = getLocaleFromPath(path, resolvedLocales);
  const cleanPath = pathWithoutLocale === '/' ? '' : pathWithoutLocale;

  switch (strategy) {
    case 'no_prefix':
      return path;
    case 'prefix':
      return `/${locale}${cleanPath}`;
    case 'prefix_except_default':
    case 'prefix_and_default':
      if (locale === resolvedDefault) {
        return cleanPath || '/';
      }
      return `/${locale}${cleanPath}`;
    default:
      return path;
  }
}

export function getLocalePath(c: Context): string {
  return (c.get('locale') as string) || 'en';
}

export function getPathWithoutLocale(c: Context): string {
  return (c.get('pathWithoutLocale') as string) || new URL(c.req.url).pathname;
}

export function localeRoutes(
  locales: string[],
  defaultLocale: string,
  strategy: I18nRoutingStrategy = 'prefix_except_default'
): {
  localizePath: (path: string, locale?: string) => string;
  getLocaleFromUrl: (url: string) => string | null;
  getLocalizedPaths: (path: string) => Array<{ locale: string; path: string }>;
} {
  function localizePath(path: string, locale?: string): string {
    const targetLocale = locale || defaultLocale;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    switch (strategy) {
      case 'no_prefix':
        return cleanPath;
      case 'prefix':
        return `/${targetLocale}${cleanPath === '/' ? '' : cleanPath}`;
      case 'prefix_except_default':
      case 'prefix_and_default':
        if (targetLocale === defaultLocale) {
          return cleanPath;
        }
        return `/${targetLocale}${cleanPath === '/' ? '' : cleanPath}`;
    }
  }

  function getLocaleFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const { locale } = getLocaleFromPath(pathname, locales);
      return locale;
    } catch {
      const { locale } = getLocaleFromPath(url, locales);
      return locale;
    }
  }

  function getLocalizedPaths(path: string): Array<{ locale: string; path: string }> {
    return locales.map(locale => ({
      locale,
      path: localizePath(path, locale)
    }));
  }

  return { localizePath, getLocaleFromUrl, getLocalizedPaths };
}
