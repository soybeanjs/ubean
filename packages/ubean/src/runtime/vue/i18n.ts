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
  clearLocales as clearLocalesCore
} from '../i18n';
import type { LocaleMessages, LocaleDefinition, LocaleChangeCallback } from '../i18n';

const localeRef = ref(getLocaleCore());

onLocaleChangeCore((newLocale: string) => {
  localeRef.value = newLocale;
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

  function t(key: string, params?: Record<string, string | number>): string {
    localeRef.value;
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
    t,
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
