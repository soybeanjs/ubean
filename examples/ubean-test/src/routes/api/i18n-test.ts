import { defineHandler } from 'ubean';
import {
  t,
  d,
  n,
  getRequestLocale,
  localizePath,
  extractLocaleFromPath,
  detectLocaleFromAcceptLanguage,
  runWithI18n,
  createRequestContext,
  listLocaleCodes,
  getLocaleDir,
  getLocaleName,
  getFallbackLocale,
  ensureLocaleMessages
} from 'ubean/runtime/i18n';

const routing = {
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy: 'prefix_except_default' as const
};

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';
  const localeOverride = c.req.query('locale');
  const key = c.req.query('key') || 'common.hello';
  const countParam = c.req.query('count');
  const count = countParam !== undefined ? parseInt(countParam, 10) : undefined;
  const name = c.req.query('name') || 'World';
  const registered = listLocaleCodes();

  const run = async (fn: () => unknown) => {
    if (localeOverride && routing.locales.includes(localeOverride)) {
      const fallback = getFallbackLocale();
      await ensureLocaleMessages(localeOverride, fallback);
      return runWithI18n(
        { locale: localeOverride, fallbackLocale: fallback, ctx: createRequestContext(localeOverride, fallback) },
        fn
      );
    }
    return fn();
  };

  return run(() => {
    const locale = localeOverride && routing.locales.includes(localeOverride) ? localeOverride : getRequestLocale(c);

    switch (action) {
      case 'info': {
        return c.json({
          currentLocale: locale,
          defaultLocale: routing.defaultLocale,
          registeredLocales: registered.length ? registered : routing.locales,
          availableLocales: registered.length ? registered : routing.locales,
          fallbackLocale: getFallbackLocale(),
          localeDir: getLocaleDir(locale),
          localeName: getLocaleName(locale)
        });
      }

      case 'translate': {
        try {
          const params: Record<string, string | number> = { name };
          if (count !== undefined) params.count = count;
          return c.json({
            key,
            locale,
            translation: t(key, params),
            params
          });
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }

      case 'plural': {
        const results: Record<string, string> = {};
        for (const k of ['items.count', 'items.explicit', 'items.categorized']) {
          const entries: Record<string, string> = {};
          for (const nCount of [0, 1, 2, 5]) {
            entries[nCount] = t(k, nCount);
          }
          results[k] = JSON.stringify(entries);
        }
        return c.json({ locale, plural: results });
      }

      case 'linked': {
        return c.json({
          locale,
          greeting: t('linked.greeting'),
          nested: t('linked.nested')
        });
      }

      case 'format': {
        const date = new Date('2025-01-15T10:30:00Z');
        return c.json({
          locale,
          date: { short: d(date), medium: d(date), long: d(date), full: d(date) },
          number: { decimal: n(1234567.89) }
        });
      }

      case 'routing': {
        return c.json({
          locale,
          localizePath: {
            home_en: localizePath('/', 'en', routing),
            home_zh: localizePath('/', 'zh', routing),
            about_en: localizePath('/about', 'en', routing),
            about_zh: localizePath('/about', 'zh', routing)
          },
          extractLocaleFromPath: {
            en: extractLocaleFromPath('/about', routing.locales),
            zh: extractLocaleFromPath('/zh/about', routing.locales)
          }
        });
      }

      case 'detect': {
        const acceptLang = c.req.header('accept-language') || 'en-US,en;q=0.9,zh-CN;q=0.8';
        return c.json({
          acceptLanguage: acceptLang,
          detected: detectLocaleFromAcceptLanguage(acceptLang, routing.locales, routing.defaultLocale),
          currentLocale: locale
        });
      }

      case 'setLocale': {
        if (!localeOverride) {
          return c.json({ error: 'locale query param required' }, 400);
        }
        return c.json({
          before: getRequestLocale(c),
          after: localeOverride,
          success: registered.includes(localeOverride) || routing.locales.includes(localeOverride),
          registeredLocales: registered.length ? registered : routing.locales
        });
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  });
});
