import type {
  I18nConfig,
  I18nDetectBrowserLanguage,
  I18nLocaleObject,
  I18nRoutingStrategy,
  I18nVueI18nOptions,
  ResolvedI18nConfig
} from './types';

const DETECT_DEFAULTS: I18nDetectBrowserLanguage = {
  cookieName: 'ubean_locale',
  redirectOn: 'root',
  alwaysRedirect: false
};

function normalizeLocales(locales: Array<string | I18nLocaleObject> | undefined): I18nLocaleObject[] {
  if (!locales || locales.length === 0) {
    return [{ code: 'en' }];
  }
  return locales.map(item => (typeof item === 'string' ? { code: item } : { ...item, code: item.code }));
}

/**
 * 解析用户侧 `i18n` 为 `ResolvedI18nConfig`。
 *
 * - `false` → `enabled: false`（不挂中间件、不改路由表）
 * - `undefined` / 对象 → `enabled: true`，locales 正规化为 `{ code }[]`
 */
export function resolveI18nConfig(config?: I18nConfig | false): ResolvedI18nConfig {
  if (config === false) {
    return {
      enabled: false,
      defaultLocale: 'en',
      locales: [{ code: 'en' }],
      strategy: 'prefix_except_default',
      baseUrl: '',
      detectBrowserLanguage: false,
      vueI18n: {},
      fallbackLocale: 'en'
    };
  }

  const locales = normalizeLocales(config?.locales);
  const defaultLocale = config?.defaultLocale || locales[0]?.code || 'en';
  const strategy: I18nRoutingStrategy = config?.strategy ?? 'prefix_except_default';

  let detectBrowserLanguage: false | I18nDetectBrowserLanguage;
  if (config?.detectBrowserLanguage === false) {
    detectBrowserLanguage = false;
  } else {
    detectBrowserLanguage = {
      ...DETECT_DEFAULTS,
      ...(typeof config?.detectBrowserLanguage === 'object' ? config.detectBrowserLanguage : {})
    };
  }

  const vueI18n: I18nVueI18nOptions = { ...config?.vueI18n };
  const fallbackLocale = vueI18n.fallbackLocale || defaultLocale;

  return {
    enabled: true,
    defaultLocale,
    locales,
    strategy,
    baseUrl: config?.baseUrl ?? '',
    detectBrowserLanguage,
    vueI18n,
    fallbackLocale
  };
}

export function localeCodesOf(config: ResolvedI18nConfig): string[] {
  return config.locales.map(l => l.code);
}
