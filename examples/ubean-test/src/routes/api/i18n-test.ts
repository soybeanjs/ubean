import {
  defineHandler,
  useI18n,
  t,
  setLocale,
  getLocale,
  getRegisteredLocales,
  getDefaultLocale,
  getLocaleDir,
  getLocaleName,
  detectLocale,
  localizePath,
  extractLocaleFromPath,
  getI18nConfig,
  localeRoutes
} from 'ubean';

export const GET = defineHandler(async c => {
  const i18n = useI18n();
  const action = c.req.query('action') || 'info';
  const locale = c.req.query('locale');
  const key = c.req.query('key') || 'common.hello';
  const countParam = c.req.query('count');
  const count = countParam !== undefined ? parseInt(countParam, 10) : undefined;
  const name = c.req.query('name') || 'World';

  // If locale query param is provided, switch locale for this request
  if (locale && getRegisteredLocales().includes(locale)) {
    setLocale(locale);
  }

  switch (action) {
    case 'info': {
      return c.json({
        currentLocale: getLocale(),
        defaultLocale: getDefaultLocale(),
        registeredLocales: getRegisteredLocales(),
        availableLocales: i18n.availableLocales,
        fallbackLocale: i18n.fallbackLocale,
        config: getI18nConfig(),
        localeDir: getLocaleDir(),
        localeName: getLocaleName()
      });
    }

    case 'translate': {
      const params: Record<string, string | number> = { name };
      if (count !== undefined) params.count = count;
      return c.json({
        key,
        locale: getLocale(),
        translation: t(key, params),
        params
      });
    }

    case 'plural': {
      const results: Record<string, string> = {};
      for (const k of ['items.count', 'items.explicit', 'items.categorized']) {
        const entries: Record<string, string> = {};
        for (const n of [0, 1, 2, 5]) {
          entries[n] = t(k, { count: n });
        }
        results[k] = JSON.stringify(entries);
      }
      return c.json({
        locale: getLocale(),
        plural: results
      });
    }

    case 'linked': {
      return c.json({
        locale: getLocale(),
        greeting: t('linked.greeting'),
        nested: t('linked.nested')
      });
    }

    case 'format': {
      const date = new Date('2025-01-15T10:30:00Z');
      return c.json({
        locale: getLocale(),
        date: {
          short: i18n.d(date, 'short'),
          medium: i18n.d(date, 'medium'),
          long: i18n.d(date, 'long'),
          full: i18n.d(date, 'full')
        },
        number: {
          decimal: i18n.n(1234567.89),
          percent: i18n.n(0.856, 'percent'),
          currency: i18n.c(99.99, 'USD'),
          currencyCNY: i18n.c(99.99, 'CNY')
        },
        relativeTime: {
          past: i18n.relativeTime(-1, 'day'),
          future: i18n.relativeTime(2, 'day'),
          hours: i18n.relativeTime(-3, 'hour')
        },
        list: {
          conjunction: i18n.list(['apple', 'banana', 'cherry']),
          disjunction: i18n.list(['apple', 'banana', 'cherry'], 'disjunction')
        }
      });
    }

    case 'routing': {
      const { getLocalizedPaths } = localeRoutes(['en', 'zh'], 'en', 'prefix_except_default');
      return c.json({
        locale: getLocale(),
        localizePath: {
          home_en: localizePath('/', 'en'),
          home_zh: localizePath('/', 'zh'),
          about_en: localizePath('/about', 'en'),
          about_zh: localizePath('/about', 'zh')
        },
        extractLocaleFromPath: {
          en: extractLocaleFromPath('/about'),
          zh: extractLocaleFromPath('/zh/about')
        },
        getLocalizedPaths: getLocalizedPaths('/about')
      });
    }

    case 'detect': {
      const acceptLang = c.req.header('accept-language') || 'en-US,en;q=0.9,zh-CN;q=0.8';
      return c.json({
        acceptLanguage: acceptLang,
        detected: detectLocale(acceptLang),
        currentLocale: getLocale()
      });
    }

    case 'setLocale': {
      if (!locale) {
        return c.json({ error: 'locale query param required' }, 400);
      }
      const before = getLocale();
      setLocale(locale);
      const after = getLocale();
      return c.json({
        before,
        after,
        success: after === locale,
        registeredLocales: getRegisteredLocales()
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
});
