import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';
import {
  createRequestContext,
  ensureLocaleMessages,
  getFallbackLocale,
  runWithI18n,
  setFallbackLocale
} from './context';
import { detectLocaleFromAcceptLanguage, parseLocaleCookie, serializeLocaleCookie } from './detect';
import { extractLocaleFromPath, localizePath, switchLocalePath, compileLocalePaths } from './paths';
import type { I18nDetectOptions, I18nMiddlewareOptions, I18nRoutingStrategy, LocaleRoutingConfig } from './types';

const DETECT_DEFAULTS: I18nDetectOptions = {
  cookieName: 'ubean_locale',
  redirectOn: 'root',
  alwaysRedirect: false
};

function routingFrom(options: I18nMiddlewareOptions): LocaleRoutingConfig {
  return {
    defaultLocale: options.defaultLocale,
    locales: options.locales,
    strategy: options.strategy
  };
}

function isRootPath(path: string): boolean {
  return path === '/' || path === '';
}

function shouldSkipDetect(path: string): boolean {
  return path.startsWith('/api/') || path.startsWith('/_') || path.startsWith('/__');
}

function resolvePreferredFromRequest(
  c: Context<UbeanEnv>,
  detect: false | I18nDetectOptions,
  cookieName: string,
  locales: string[],
  defaultLocale: string
): string {
  if (!detect) return defaultLocale;
  const cookieLocale = parseLocaleCookie(c.req.header('cookie'), cookieName);
  if (cookieLocale && locales.includes(cookieLocale)) return cookieLocale;
  return detectLocaleFromAcceptLanguage(c.req.header('accept-language'), locales, defaultLocale);
}

export function createI18nMiddleware(options: I18nMiddlewareOptions): MiddlewareHandler<UbeanEnv> {
  const { strategy, defaultLocale, locales } = options;
  const detect =
    options.detectBrowserLanguage === false ? false : { ...DETECT_DEFAULTS, ...options.detectBrowserLanguage };
  const cookieName = detect ? detect.cookieName : DETECT_DEFAULTS.cookieName;
  const routing = routingFrom(options);

  setFallbackLocale(defaultLocale);

  return async function i18nMiddleware(c: Context<UbeanEnv>, next: Next) {
    const url = new URL(c.req.url);
    const path = url.pathname;

    if (shouldSkipDetect(path)) {
      const preferred = resolvePreferredFromRequest(c, detect, cookieName, locales, defaultLocale);
      c.set('locale', preferred);
      const fallback = getFallbackLocale();
      if (options.loadMessages) {
        await options.loadMessages(preferred, fallback);
      } else {
        await ensureLocaleMessages(preferred, fallback);
      }
      const ctx = createRequestContext(preferred, fallback);
      await runWithI18n({ locale: preferred, fallbackLocale: fallback, ctx }, () => next());
      return;
    }

    const extracted = extractLocaleFromPath(path, locales);
    let detectedLocale = defaultLocale;

    if (extracted.locale && locales.includes(extracted.locale)) {
      if (strategy === 'prefix_except_default' && extracted.locale === defaultLocale) {
        writeCookie(c, defaultLocale);
        return c.redirect(extracted.pathWithoutLocale + url.search, 302);
      }
      detectedLocale = extracted.locale;
      c.set('pathWithoutLocale', extracted.pathWithoutLocale);
    } else if (strategy === 'prefix') {
      const preferred = resolvePreferred();
      const redirectUrl = localizePath(path, preferred, routing);
      if (redirectUrl !== path) {
        writeCookie(c, preferred);
        return c.redirect(redirectUrl + url.search, 302);
      }
      detectedLocale = preferred;
    } else if (strategy === 'prefix_and_default') {
      detectedLocale = defaultLocale;
      c.set('pathWithoutLocale', path);
    } else if (strategy === 'prefix_except_default') {
      if (detect && (detect.redirectOn === 'all' || (detect.redirectOn === 'root' && isRootPath(path)))) {
        const preferred = resolvePreferred();
        if (preferred !== defaultLocale) {
          const redirectUrl = localizePath(path, preferred, routing);
          writeCookie(c, preferred);
          return c.redirect(redirectUrl + url.search, 302);
        }
      }
      detectedLocale = defaultLocale;
      c.set('pathWithoutLocale', path);
    } else if (strategy === 'no_prefix') {
      detectedLocale = resolvePreferred();
      c.set('pathWithoutLocale', path);
    }

    function resolvePreferred(): string {
      if (detect) {
        const cookieLocale = parseLocaleCookie(c.req.header('cookie'), cookieName);
        if (cookieLocale && locales.includes(cookieLocale)) return cookieLocale;
        const header = c.req.header('accept-language');
        return detectLocaleFromAcceptLanguage(header, locales, defaultLocale);
      }
      return defaultLocale;
    }

    writeCookie(c, detectedLocale);
    c.set('locale', detectedLocale);
    c.header('Content-Language', detectedLocale);

    const fallback = getFallbackLocale();
    if (options.loadMessages) {
      await options.loadMessages(detectedLocale, fallback);
    } else {
      await ensureLocaleMessages(detectedLocale, fallback);
    }
    const ctx = createRequestContext(detectedLocale, fallback);
    await runWithI18n({ locale: detectedLocale, fallbackLocale: fallback, ctx }, () => next());
  };

  function writeCookie(c: Context<UbeanEnv>, locale: string): void {
    c.header('Set-Cookie', serializeLocaleCookie(cookieName, locale), { append: true });
  }
}

export function getRequestLocale(c: Context): string {
  return (c.get('locale') as string) || 'en';
}

export function getPathWithoutLocale(c: Context): string {
  return (c.get('pathWithoutLocale') as string) || new URL(c.req.url).pathname;
}

export { switchLocalePath, localizePath, extractLocaleFromPath, compileLocalePaths };
export type { I18nRoutingStrategy, I18nMiddlewareOptions };
