import { computed } from 'vue';
import type { App, ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import type { useRouter } from 'vue-router';
import { createI18n, useI18n as useVueI18n } from 'vue-i18n';
import type { Composer, I18n } from 'vue-i18n';
import {
  localizePath as localizePathCore,
  switchLocalePath as switchLocalePathCore,
  extractLocaleFromPath as extractLocaleFromPathCore,
  buildLocaleHead
} from '@ubean/i18n/browser';
import type { LocaleRoutingConfig } from '@ubean/i18n/browser';
import { LOCALE_DATA_ID } from '@ubean/pages';

export type LocaleMessages = Record<string, unknown>;

export interface I18nRuntimeConfig {
  defaultLocale: string;
  locales: string[];
  strategy: LocaleRoutingConfig['strategy'];
  fallbackLocale: string;
  cookieName: string;
  baseUrl: string;
  vueI18n?: Record<string, unknown>;
}

export interface LocaleLoader {
  (code: string): Promise<LocaleMessages>;
}

interface HydratedLocalePayload {
  locale?: string;
  dir?: 'ltr' | 'rtl';
  messages?: LocaleMessages;
  fallbackLocale?: string;
  fallbackMessages?: LocaleMessages;
  routing?: LocaleRoutingConfig;
  cookieName?: string;
  baseUrl?: string;
  locales?: Array<{ code: string; language?: string; name?: string; dir?: 'ltr' | 'rtl'; isDefault?: boolean }>;
  availableLocales?: Array<{
    code: string;
    language?: string;
    name?: string;
    dir?: 'ltr' | 'rtl';
    isDefault?: boolean;
  }>;
}

interface I18nRuntimeState {
  config: I18nRuntimeConfig | null;
  loader: LocaleLoader | null;
  metas: HydratedLocalePayload['locales'];
  i18n?: I18n;
  router?: ReturnType<typeof useRouter>;
}

const RUNTIME_KEY = '__UBEAN_I18N_RUNTIME__' as const;

function getRuntimeState(): I18nRuntimeState {
  const g = globalThis as typeof globalThis & { [RUNTIME_KEY]?: I18nRuntimeState };
  if (!g[RUNTIME_KEY]) {
    g[RUNTIME_KEY] = { config: null, loader: null, metas: [] };
  }
  return g[RUNTIME_KEY];
}

function getRuntimeConfigState(): I18nRuntimeConfig | null {
  return getRuntimeState().config;
}

function setRuntimeConfigState(config: I18nRuntimeConfig): void {
  getRuntimeState().config = config;
}

export function bindI18nRuntime(i18n: I18n, router?: I18nRuntimeState['router']): void {
  const state = getRuntimeState();
  state.i18n = i18n;
  if (router) state.router = router;
}

export function configureI18nRuntime(options: {
  config: I18nRuntimeConfig;
  loadLocale?: LocaleLoader;
  locales?: HydratedLocalePayload['locales'];
}): void {
  const state = getRuntimeState();
  state.config = options.config;
  if (options.loadLocale) state.loader = options.loadLocale;
  if (options.locales) state.metas = options.locales;
}

export function getI18nRuntimeConfig(): I18nRuntimeConfig | null {
  return getRuntimeConfigState();
}

function localeCodesFrom(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const codes: string[] = [];
  for (const item of input) {
    if (typeof item === 'string') codes.push(item);
    else if (item && typeof item === 'object' && 'code' in item) codes.push(String((item as { code: unknown }).code));
  }
  return codes;
}

function applyHydratedPayload(hydrated: HydratedLocalePayload): void {
  const state = getRuntimeState();
  if (hydrated.routing && !state.config) {
    setRuntimeConfigState({
      defaultLocale: hydrated.routing.defaultLocale,
      locales: localeCodesFrom(hydrated.routing.locales),
      strategy: hydrated.routing.strategy,
      fallbackLocale: hydrated.fallbackLocale || hydrated.routing.defaultLocale,
      cookieName: hydrated.cookieName || 'ubean_locale',
      baseUrl: hydrated.baseUrl || ''
    });
  } else if (hydrated.routing && state.config && !state.config.locales.length) {
    state.config.locales = localeCodesFrom(hydrated.routing.locales);
  }
  const metas = hydrated.locales || hydrated.availableLocales;
  if (metas) state.metas = metas;
}

function routingFrom(config: I18nRuntimeConfig): LocaleRoutingConfig {
  return {
    defaultLocale: config.defaultLocale,
    locales: config.locales,
    strategy: config.strategy
  };
}

function readHydratedPayload(): HydratedLocalePayload | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(LOCALE_DATA_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as HydratedLocalePayload;
  } catch {
    return null;
  }
}

export function createUbeanI18n(options?: {
  locale?: string;
  fallbackLocale?: string;
  messages?: Record<string, LocaleMessages>;
  vueI18n?: Record<string, unknown>;
}): I18n {
  const hydrated = typeof document !== 'undefined' ? readHydratedPayload() : null;
  const cfg = getRuntimeConfigState();
  const locale = options?.locale || hydrated?.locale || cfg?.defaultLocale || 'en';
  const fallbackLocale =
    options?.fallbackLocale || hydrated?.fallbackLocale || cfg?.fallbackLocale || cfg?.defaultLocale || locale;

  const messages: Record<string, LocaleMessages> = { ...options?.messages };
  if (hydrated?.messages && hydrated.locale) {
    messages[hydrated.locale] = hydrated.messages;
  }
  if (hydrated?.fallbackMessages && hydrated.fallbackLocale && hydrated.fallbackLocale !== hydrated.locale) {
    messages[hydrated.fallbackLocale] = hydrated.fallbackMessages;
  }
  if (!messages[locale]) messages[locale] = {};
  if (fallbackLocale !== locale && !messages[fallbackLocale]) messages[fallbackLocale] = {};

  if (hydrated) applyHydratedPayload(hydrated);
  const hydratedConfig = getRuntimeState().config;
  if (hydratedConfig && options?.vueI18n) hydratedConfig.vueI18n = options.vueI18n;

  return createI18n({
    legacy: false,
    locale,
    fallbackLocale,
    messages: messages as never,
    missingWarn: false,
    fallbackWarn: false,
    ...cfg?.vueI18n,
    ...options?.vueI18n
  });
}

export function installUbeanI18n(app: App, i18n: I18n): void {
  app.use(i18n);
}

function writeLocaleCookie(code: string): void {
  if (typeof document === 'undefined') return;
  const name = getRuntimeConfigState()?.cookieName || 'ubean_locale';
  document.cookie = `${name}=${encodeURIComponent(code)}; Path=/; SameSite=Lax`;
}

/**
 * Framework setLocale: load messages, switch composer locale, write cookie,
 * navigate to the localized path (`no_prefix` skips navigation).
 *
 * Uses the runtime bound by `bindI18nRuntime` (not Vue composables) so it is
 * safe to call from click handlers.
 */
export async function setLocale(code: string): Promise<void> {
  const state = getRuntimeState();
  const composer = state.i18n?.global as Composer | undefined;
  if (!composer) return;

  composer.locale.value = code;
  writeLocaleCookie(code);

  const loader = state.loader;
  const loadPromise = loader
    ? loader(code).then(msgs => {
        composer.setLocaleMessage(code, msgs as never);
      })
    : Promise.resolve();

  const cfg = state.config;
  let navPromise = Promise.resolve();
  if (cfg && cfg.strategy !== 'no_prefix') {
    const router = state.router;
    const currentPath = (
      router?.currentRoute.value.path ||
      router?.currentRoute.value.fullPath?.split('?')[0] ||
      (typeof window !== 'undefined' ? window.location.pathname : '/')
    ).split('?')[0];
    const target = switchLocalePathCore(code, currentPath, routingFrom(cfg));
    if (target !== currentPath && router) {
      navPromise = router.replace(target).then(
        () => undefined,
        () => undefined
      );
    }
  }

  await Promise.all([loadPromise, navPromise]);
}

export function getLocale(): string {
  try {
    return String(useVueI18n().locale.value);
  } catch {
    return getRuntimeConfigState()?.defaultLocale || 'en';
  }
}

export function localizePath(path: string, locale?: string): string {
  const cfg = getRuntimeConfigState();
  if (!cfg) return path;
  return localizePathCore(path, locale || getLocale(), routingFrom(cfg));
}

export function switchLocalePath(locale: string, path?: string): string {
  const cfg = getRuntimeConfigState();
  if (!cfg) return path || '/';
  const current = path ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  return switchLocalePathCore(locale, current, routingFrom(cfg));
}

export function extractLocaleFromPath(path: string): { locale: string | null; pathWithoutLocale: string } {
  const codes = getRuntimeConfigState()?.locales || [];
  return extractLocaleFromPathCore(path, codes);
}

export function useI18n(): Composer {
  return useVueI18n() as Composer;
}

export function t(key: string, ...args: unknown[]): string {
  const translate = useVueI18n().t as (k: string, ...rest: unknown[]) => unknown;
  return String(translate(key, ...args));
}

export function useLocalePath(): (path: string, locale?: string) => string {
  const i18n = useVueI18n();
  return (path: string, locale?: string) => localizePath(path, locale ?? String(i18n.locale.value));
}

export function useSwitchLocalePath(): (locale: string) => string {
  const route = useRoute();
  return (locale: string) => switchLocalePath(locale, route.path);
}

export function useLocaleRoute(): (path: string, locale?: string) => string {
  return useLocalePath();
}

export function useLocaleHead(): ComputedRef<ReturnType<typeof buildLocaleHead>> {
  const i18n = useVueI18n();
  const route = useRoute();
  return computed(() => {
    const cfg = getRuntimeConfigState();
    const routing: LocaleRoutingConfig = cfg
      ? routingFrom(cfg)
      : { defaultLocale: 'en', locales: ['en'], strategy: 'prefix_except_default' };
    return buildLocaleHead({
      path: route.path,
      locale: String(i18n.locale.value),
      locales: (getRuntimeState().metas || []).map(l => ({
        code: l.code,
        language: l.language,
        name: l.name,
        dir: l.dir,
        isDefault: l.isDefault
      })),
      routing,
      baseUrl: cfg?.baseUrl
    });
  });
}

/** Hydrate routing config from SSR payload before the first render. */
export function initClientI18n(): void {
  const hydrated = readHydratedPayload();
  if (!hydrated) return;
  applyHydratedPayload(hydrated);
}

export { useVueI18n };
