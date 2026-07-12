export type I18nRoutingStrategy = 'prefix' | 'prefix_except_default' | 'no_prefix';

export interface I18nConfig {
  defaultLocale: string;
  strategy: I18nRoutingStrategy;
  locales: string[];
}

export interface LocaleMessages {
  [key: string]: string | LocaleMessages;
}

export interface LocaleDefinition {
  code: string;
  messages: LocaleMessages;
  name?: string;
  dir?: 'ltr' | 'rtl';
  isDefault?: boolean;
}

export type LocaleChangeCallback = (locale: string) => void;

export interface I18nInstance {
  locale: string;
  fallbackLocale: string;
  availableLocales: string[];
  t(key: string, params?: Record<string, string | number>): string;
  setLocale(locale: string): void;
  getLocale(): string;
  addLocale(code: string, messages: LocaleMessages, options?: { name?: string; dir?: 'ltr' | 'rtl' }): void;
  mergeLocale(code: string, messages: LocaleMessages): void;
  detectLocale(acceptLanguage?: string): string;
  onLocaleChange(callback: LocaleChangeCallback): () => void;
  getLocaleDir(locale?: string): 'ltr' | 'rtl';
  getLocaleName(locale?: string): string | undefined;
}

interface RegisteredLocale {
  code: string;
  messages: LocaleMessages;
  name?: string;
  dir: 'ltr' | 'rtl';
  isDefault?: boolean;
}

const registeredLocales = new Map<string, RegisteredLocale>();
let currentLocale = 'en';
let fallbackLocale = 'en';
const localeListeners = new Set<LocaleChangeCallback>();
let i18nConfig: I18nConfig = {
  defaultLocale: 'en',
  strategy: 'prefix_except_default',
  locales: []
};

function notifyLocaleChange(locale: string): void {
  for (const fn of localeListeners) {
    fn(locale);
  }
}

function addLocaleListener(callback: LocaleChangeCallback): () => void {
  localeListeners.add(callback);
  return () => localeListeners.delete(callback);
}

function deepMerge(target: LocaleMessages, source: LocaleMessages): LocaleMessages {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as LocaleMessages, sourceVal as LocaleMessages);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

function flattenMessages(messages: LocaleMessages, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(result, flattenMessages(value, fullKey));
    }
  }
  return result;
}

function getMessage(locale: string, key: string): string | undefined {
  const localeData = registeredLocales.get(locale);
  if (!localeData) return undefined;

  const flat = flattenMessages(localeData.messages);
  return flat[key];
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

export function defineLocale(definition: LocaleDefinition): LocaleDefinition {
  const locale: RegisteredLocale = {
    code: definition.code,
    messages: definition.messages,
    name: definition.name,
    dir: definition.dir || 'ltr',
    isDefault: definition.isDefault
  };

  registeredLocales.set(definition.code, locale);

  if (definition.isDefault || registeredLocales.size === 1) {
    fallbackLocale = definition.code;
    if (!currentLocale || currentLocale === 'en') {
      currentLocale = definition.code;
    }
  }

  return definition;
}

export function setI18nConfig(config: Partial<I18nConfig>): void {
  i18nConfig = { ...i18nConfig, ...config };
  if (config.defaultLocale) {
    fallbackLocale = config.defaultLocale;
  }
}

export function getI18nConfig(): I18nConfig {
  return { ...i18nConfig, locales: Array.from(registeredLocales.keys()) };
}

export function getDefaultLocale(): string {
  for (const [code, loc] of registeredLocales) {
    if (loc.isDefault) return code;
  }
  return i18nConfig.defaultLocale;
}

export function localizePath(path: string, locale?: string): string {
  const targetLocale = locale || currentLocale;
  const defaultLocale = getDefaultLocale();
  const strategy = i18nConfig.strategy;

  const cleanPath = path.replace(/^\/+/, '/').replace(/\/+$/, '') || '/';

  if (strategy === 'no_prefix') {
    return cleanPath;
  }

  const pathParts = cleanPath.split('/').filter(Boolean);
  const firstSegment = pathParts[0] || '';
  const isLocalePrefix = registeredLocales.has(firstSegment);

  let pathWithoutPrefix = cleanPath;
  if (isLocalePrefix) {
    pathWithoutPrefix = '/' + pathParts.slice(1).join('/') || '/';
  }

  if (strategy === 'prefix_except_default' && targetLocale === defaultLocale) {
    return pathWithoutPrefix;
  }

  return `/${targetLocale}${pathWithoutPrefix === '/' ? '' : pathWithoutPrefix}`;
}

export function switchLocalePath(newLocale: string, currentPath?: string): string {
  const _global = globalThis as any;
  const path = currentPath || (typeof _global.window !== 'undefined' ? _global.window.location.pathname : '/');
  return localizePath(path, newLocale);
}

export function extractLocaleFromPath(path: string): { locale: string | null; pathWithoutLocale: string } {
  const pathParts = path.split('/').filter(Boolean);
  const firstSegment = pathParts[0] || '';

  if (registeredLocales.has(firstSegment)) {
    const pathWithoutLocale = '/' + pathParts.slice(1).join('/') || '/';
    return { locale: firstSegment, pathWithoutLocale };
  }

  return { locale: null, pathWithoutLocale: path };
}

export function useI18n(): I18nInstance {
  return {
    get locale() {
      return currentLocale;
    },
    get fallbackLocale() {
      return fallbackLocale;
    },
    get availableLocales() {
      return Array.from(registeredLocales.keys());
    },
    t(key: string, params?: Record<string, string | number>): string {
      let message = getMessage(currentLocale, key);
      if (message === undefined && currentLocale !== fallbackLocale) {
        message = getMessage(fallbackLocale, key);
      }
      if (message === undefined) {
        return key;
      }
      return interpolate(message, params);
    },
    setLocale(locale: string): void {
      if (registeredLocales.has(locale) && locale !== currentLocale) {
        currentLocale = locale;
        notifyLocaleChange(locale);
      }
    },
    getLocale(): string {
      return currentLocale;
    },
    addLocale(code: string, messages: LocaleMessages, options?: { name?: string; dir?: 'ltr' | 'rtl' }): void {
      const existing = registeredLocales.get(code);
      if (existing) {
        existing.messages = deepMerge(existing.messages, messages);
        if (options?.name) existing.name = options.name;
        if (options?.dir) existing.dir = options.dir;
      } else {
        registeredLocales.set(code, {
          code,
          messages,
          name: options?.name,
          dir: options?.dir || 'ltr'
        });
      }
    },
    mergeLocale(code: string, messages: LocaleMessages): void {
      const existing = registeredLocales.get(code);
      if (existing) {
        existing.messages = deepMerge(existing.messages, messages);
      } else {
        registeredLocales.set(code, { code, messages, dir: 'ltr' });
      }
    },
    detectLocale(acceptLanguage?: string): string {
      if (!acceptLanguage) return fallbackLocale;

      const requested = acceptLanguage
        .split(',')
        .map(lang => {
          const [code, q = 'q=1.0'] = lang.trim().split(';');
          const quality = parseFloat(q.replace('q=', '')) || 0;
          return { code: code.trim().toLowerCase(), quality };
        })
        .sort((a, b) => b.quality - a.quality);

      for (const { code } of requested) {
        for (const registered of registeredLocales.keys()) {
          if (code === registered.toLowerCase() || code.startsWith(`${registered.toLowerCase()}-`)) {
            return registered;
          }
        }
      }

      return fallbackLocale;
    },
    onLocaleChange: addLocaleListener,
    getLocaleDir(locale?: string): 'ltr' | 'rtl' {
      const code = locale || currentLocale;
      const loc = registeredLocales.get(code);
      return loc?.dir || 'ltr';
    },
    getLocaleName(locale?: string): string | undefined {
      const code = locale || currentLocale;
      const loc = registeredLocales.get(code);
      return loc?.name;
    }
  };
}

export function t(key: string, params?: Record<string, string | number>): string {
  return useI18n().t(key, params);
}

export function setLocale(locale: string): void {
  useI18n().setLocale(locale);
}

export function getLocale(): string {
  return useI18n().getLocale();
}

export function getRegisteredLocales(): string[] {
  return Array.from(registeredLocales.keys());
}

export function clearLocales(): void {
  registeredLocales.clear();
  localeListeners.clear();
  currentLocale = 'en';
  fallbackLocale = 'en';
}

export function onLocaleChange(callback: LocaleChangeCallback): () => void {
  return useI18n().onLocaleChange(callback);
}

export function getLocaleDir(locale?: string): 'ltr' | 'rtl' {
  return useI18n().getLocaleDir(locale);
}

export function getLocaleName(locale?: string): string | undefined {
  return useI18n().getLocaleName(locale);
}

export function detectLocale(acceptLanguage?: string): string {
  return useI18n().detectLocale(acceptLanguage);
}

export function addLocale(
  code: string,
  messages: LocaleMessages,
  options?: { name?: string; dir?: 'ltr' | 'rtl' }
): void {
  useI18n().addLocale(code, messages, options);
}

export function mergeLocale(code: string, messages: LocaleMessages): void {
  useI18n().mergeLocale(code, messages);
}

export function detectBrowserLocale(): string {
  const i18n = useI18n();
  if (typeof navigator !== 'undefined' && navigator.language) {
    return i18n.detectLocale(navigator.language);
  }
  return fallbackLocale;
}
