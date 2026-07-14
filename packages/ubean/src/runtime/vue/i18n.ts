import { ref, computed } from 'vue';
import {
  useI18n as useI18nCore,
  defineLocale as defineLocaleCore,
  t as tCore,
  setLocale as setLocaleCore,
  getLocale as getLocaleCore,
  onLocaleChange as onLocaleChangeCore,
  getLocaleDir as getLocaleDirCore,
  getLocaleName as getLocaleNameCore,
  getRegisteredLocales as getRegisteredLocalesCore,
  detectLocale as detectLocaleCore,
  detectBrowserLocale as detectBrowserLocaleCore,
  addLocale as addLocaleCore,
  mergeLocale as mergeLocaleCore,
  clearLocales as clearLocalesCore,
  getI18nConfig as getI18nConfigCore,
  setI18nConfig as setI18nConfigCore,
  localizePath as localizePathCore,
  switchLocalePath as switchLocalePathCore,
  getDefaultLocale as getDefaultLocaleCore,
  extractLocaleFromPath as extractLocaleFromPathCore
} from '../i18n';
import type { LocaleMessages, LocaleDefinition, LocaleChangeCallback, I18nConfig } from '../i18n';
import { LOCALE_DATA_ID } from '../pages/protocol';

const _global = globalThis as any;

function hydrateLocale(): { locale: string | null; dir: 'ltr' | 'rtl'; messages?: Record<string, unknown> } {
  if (typeof _global.document === 'undefined') return { locale: null, dir: 'ltr' };
  const el = _global.document.getElementById(LOCALE_DATA_ID);
  if (!el) return { locale: null, dir: 'ltr' };
  try {
    const data = JSON.parse(el.textContent || 'null');
    if (data && typeof data.locale === 'string') {
      return {
        locale: data.locale,
        dir: data.dir === 'rtl' ? 'rtl' : 'ltr',
        messages: data.messages
      };
    }
  } catch {
    return { locale: null, dir: 'ltr' };
  }
  return { locale: null, dir: 'ltr' };
}

function syncHtmlLang(locale: string, dir: 'ltr' | 'rtl'): void {
  if (typeof _global.document === 'undefined') return;
  const html = _global.document.documentElement;
  if (html) {
    html.setAttribute('lang', locale);
    html.setAttribute('dir', dir);
  }
}

const { locale: hydratedLocale, dir: hydratedDir, messages: hydratedMessages } = hydrateLocale();
if (hydratedLocale) {
  // Auto-register messages from SSR-injected data (no need for manual defineLocale in app.ts)
  if (hydratedMessages && typeof hydratedMessages === 'object') {
    defineLocaleCore({
      code: hydratedLocale,
      messages: hydratedMessages as LocaleMessages,
      dir: hydratedDir
    });
  }
  setLocaleCore(hydratedLocale);
  syncHtmlLang(hydratedLocale, hydratedDir);
}

const localeRef = ref(getLocaleCore());

onLocaleChangeCore((newLocale: string) => {
  localeRef.value = newLocale;
  syncHtmlLang(newLocale, getLocaleDirCore(newLocale));
});

export interface VueI18nInstance {
  locale: { value: string };
  fallbackLocale: string;
  availableLocales: string[];
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: string) => void;
  getLocale: () => string;
  onLocaleChange: (callback: LocaleChangeCallback) => () => void;
  getLocaleDir: (locale?: string) => 'ltr' | 'rtl';
  getLocaleName: (locale?: string) => string | undefined;
  localeDir: { value: 'ltr' | 'rtl' };
  localeName: { value: string | undefined };
}

export function useI18n(): VueI18nInstance {
  const core = useI18nCore();

  const localeDir = computed(() => getLocaleDirCore(localeRef.value));
  const localeName = computed(() => getLocaleNameCore(localeRef.value));

  function translate(key: string, params?: Record<string, string | number>): string {
    void localeRef.value;
    return core.t(key, params);
  }

  return {
    locale: localeRef,
    get fallbackLocale() {
      return core.fallbackLocale;
    },
    get availableLocales() {
      return core.availableLocales;
    },
    t: translate,
    setLocale(locale: string) {
      core.setLocale(locale);
    },
    getLocale() {
      return localeRef.value;
    },
    onLocaleChange(callback: LocaleChangeCallback) {
      return core.onLocaleChange(callback);
    },
    getLocaleDir(locale?: string) {
      return core.getLocaleDir(locale);
    },
    getLocaleName(locale?: string) {
      return core.getLocaleName(locale);
    },
    localeDir,
    localeName
  };
}

export function defineLocale(definition: LocaleDefinition): LocaleDefinition {
  const result = defineLocaleCore(definition);
  localeRef.value = getLocaleCore();
  return result;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return tCore(key, params);
}

export function setLocale(locale: string): void {
  setLocaleCore(locale);
}

export function getLocale(): string {
  return localeRef.value;
}

export function onLocaleChange(callback: LocaleChangeCallback): () => void {
  return onLocaleChangeCore(callback);
}

export function getLocaleDir(locale?: string): 'ltr' | 'rtl' {
  return getLocaleDirCore(locale);
}

export function getLocaleName(locale?: string): string | undefined {
  return getLocaleNameCore(locale);
}

export function getRegisteredLocales(): string[] {
  return getRegisteredLocalesCore();
}

export function detectLocale(acceptLanguage?: string): string {
  return detectLocaleCore(acceptLanguage);
}

export function detectBrowserLocale(): string {
  return detectBrowserLocaleCore();
}

export function addLocale(
  code: string,
  messages: LocaleMessages,
  options?: { name?: string; dir?: 'ltr' | 'rtl' }
): void {
  addLocaleCore(code, messages, options);
}

export function mergeLocale(code: string, messages: LocaleMessages): void {
  mergeLocaleCore(code, messages);
}

export function clearLocales(): void {
  clearLocalesCore();
  localeRef.value = getLocaleCore();
}

export function getI18nConfig(): I18nConfig {
  return getI18nConfigCore();
}

export function setI18nConfig(config: Partial<I18nConfig>): void {
  setI18nConfigCore(config);
}

export function localizePath(path: string, locale?: string): string {
  return localizePathCore(path, locale);
}

export function switchLocalePath(newLocale: string, currentPath?: string): string {
  return switchLocalePathCore(newLocale, currentPath);
}

export function getDefaultLocale(): string {
  return getDefaultLocaleCore();
}

export function extractLocaleFromPath(path: string): { locale: string | null; pathWithoutLocale: string } {
  return extractLocaleFromPathCore(path);
}

export function useSwitchLocalePath() {
  return computed(() => (newLocale: string) => {
    const path = typeof _global.window !== 'undefined' ? _global.window.location.pathname : '/';
    return switchLocalePathCore(newLocale, path);
  });
}

export function useLocalePath() {
  return computed(() => (path: string, locale?: string) => {
    return localizePathCore(path, locale || localeRef.value);
  });
}
