export type I18nRoutingStrategy = 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';

interface GlobalWithWindow {
  window?: {
    location: {
      pathname: string;
    };
  };
}

export type DateTimeFormatStyle = 'short' | 'medium' | 'long' | 'full';
export type NumberFormatStyle = 'decimal' | 'percent' | 'currency';
export type ListFormatStyle = 'conjunction' | 'disjunction' | 'unit';
export type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

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
export type MissingKeyHandler = (locale: string, key: string) => void;

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  style?: NumberFormatStyle;
}

export interface I18nInstance {
  locale: string;
  fallbackLocale: string;
  availableLocales: string[];
  t(key: string, params?: Record<string, string | number>): string;
  d(value: Date | number, style?: DateTimeFormatStyle, options?: Intl.DateTimeFormatOptions): string;
  n(value: number, style?: NumberFormatStyle, options?: NumberFormatOptions): string;
  c(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  relativeTime(value: number, unit: RelativeTimeUnit, options?: Intl.RelativeTimeFormatOptions): string;
  list(items: string[], style?: ListFormatStyle, options?: Intl.ListFormatOptions): string;
  setLocale(locale: string): void;
  getLocale(): string;
  addLocale(code: string, messages: LocaleMessages, options?: { name?: string; dir?: 'ltr' | 'rtl' }): void;
  mergeLocale(code: string, messages: LocaleMessages): void;
  detectLocale(acceptLanguage?: string): string;
  onLocaleChange(callback: LocaleChangeCallback): () => void;
  getLocaleDir(locale?: string): 'ltr' | 'rtl';
  getLocaleName(locale?: string): string | undefined;
  onMissingKey(handler: MissingKeyHandler): () => void;
}

interface RegisteredLocale {
  code: string;
  messages: LocaleMessages;
  name?: string;
  dir: 'ltr' | 'rtl';
  isDefault?: boolean;
}

interface I18nGlobalState {
  registeredLocales: Map<string, RegisteredLocale>;
  messageCache: Map<string, Record<string, string>>;
  currentLocale: string;
  fallbackLocale: string;
  localeListeners: Set<LocaleChangeCallback>;
  missingKeyHandlers: Set<MissingKeyHandler>;
  missingKeyWarned: Set<string>;
  i18nConfig: I18nConfig;
}

const I18N_STATE_KEY = '__ubean_i18n_state__';

function getI18nState(): I18nGlobalState {
  const g = globalThis as Record<string, unknown>;
  if (!g[I18N_STATE_KEY]) {
    g[I18N_STATE_KEY] = {
      registeredLocales: new Map<string, RegisteredLocale>(),
      messageCache: new Map<string, Record<string, string>>(),
      currentLocale: 'en',
      fallbackLocale: 'en',
      localeListeners: new Set<LocaleChangeCallback>(),
      missingKeyHandlers: new Set<MissingKeyHandler>(),
      missingKeyWarned: new Set<string>(),
      i18nConfig: {
        defaultLocale: 'en',
        strategy: 'prefix_except_default',
        locales: []
      }
    } as I18nGlobalState;
  }
  return g[I18N_STATE_KEY] as I18nGlobalState;
}

function notifyLocaleChange(locale: string): void {
  for (const fn of getI18nState().localeListeners) {
    fn(locale);
  }
}

function addLocaleListener(callback: LocaleChangeCallback): () => void {
  getI18nState().localeListeners.add(callback);
  return () => getI18nState().localeListeners.delete(callback);
}

function addMissingKeyHandler(handler: MissingKeyHandler): () => void {
  getI18nState().missingKeyHandlers.add(handler);
  return () => getI18nState().missingKeyHandlers.delete(handler);
}

function notifyMissingKey(locale: string, key: string): void {
  const state = getI18nState();
  const cacheKey = `${locale}:${key}`;
  if (!state.missingKeyWarned.has(cacheKey)) {
    state.missingKeyWarned.add(cacheKey);
    for (const fn of state.missingKeyHandlers) {
      fn(locale, key);
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] Missing key "${key}" for locale "${locale}"`);
    }
  }
}

function invalidateCache(locale: string): void {
  getI18nState().messageCache.delete(locale);
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

function getFlatMessages(locale: string): Record<string, string> {
  const state = getI18nState();
  const cached = state.messageCache.get(locale);
  if (cached) return cached;

  const localeData = state.registeredLocales.get(locale);
  if (!localeData) return {};

  const flat = flattenMessages(localeData.messages);
  state.messageCache.set(locale, flat);
  return flat;
}

function getPluralCategory(count: number, locale: string): string {
  try {
    const pr = new Intl.PluralRules(locale);
    return pr.select(count);
  } catch {
    return count === 0 ? 'zero' : count === 1 ? 'one' : 'other';
  }
}

function selectPlural(template: string, count: number, locale: string): string {
  const parts = template.split('|').map(p => p.trim());
  if (parts.length === 1) return template;

  for (const part of parts) {
    const eqMatch = part.match(/^=(\d+)\s*/);
    if (eqMatch) {
      const num = parseInt(eqMatch[1], 10);
      if (num === count) return part.replace(/^=\d+\s*/, '');
    }
  }

  const explicitCategories: Array<{ cat: string; text: string }> = [];
  const plainParts: string[] = [];

  for (const part of parts) {
    if (/^=\d+\s*/.test(part)) continue;
    const catMatch = part.match(/^(\w+):\s*/);
    if (catMatch) {
      explicitCategories.push({ cat: catMatch[1], text: part.replace(/^\w+:\s*/, '') });
    } else {
      plainParts.push(part);
    }
  }

  for (const { cat, text } of explicitCategories) {
    if (cat === 'zero' && count === 0) return text;
    if (cat === 'one' && count === 1) return text;
    const pluralCat = getPluralCategory(count, locale);
    if (cat === pluralCat) return text;
  }

  if (plainParts.length === 2) {
    return count === 1 ? plainParts[0] : plainParts[1];
  }

  if (plainParts.length >= 3) {
    if (count === 0) return plainParts[0];
    if (count === 1) return plainParts[1];
    return plainParts[plainParts.length - 1];
  }

  if (plainParts.length === 1) {
    return plainParts[0];
  }

  const category = getPluralCategory(count, locale);
  const categoryOrder = ['zero', 'one', 'two', 'few', 'many', 'other'];
  const categoryIndex = categoryOrder.indexOf(category);
  if (categoryIndex >= 0 && categoryIndex < parts.length) {
    return parts[categoryIndex];
  }

  return parts[parts.length - 1];
}

function resolveLinkedMessages(
  template: string,
  flat: Record<string, string>,
  visited: Set<string> = new Set()
): string {
  return template.replace(/@(?::([\w.]+)|{([\w.]+)})/g, (_match, colonKey, braceKey) => {
    const key = colonKey || braceKey;
    if (!key || visited.has(key)) return _match;
    visited.add(key);
    const linked = flat[key];
    if (linked === undefined) return _match;
    const resolved = resolveLinkedMessages(linked, flat, visited);
    visited.delete(key);
    return resolved;
  });
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
  locale?: string,
  flat?: Record<string, string>
): string {
  let result = template;

  if (flat) {
    result = resolveLinkedMessages(result, flat);
  }

  if (params && typeof params.count === 'number') {
    result = selectPlural(result, params.count, locale || 'en');
  }

  if (params) {
    result = result.replace(/\{(\w+)\}/g, (_, key) => {
      const val = params[key];
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }

  return result;
}

function getMessage(locale: string, key: string, params?: Record<string, string | number>): string | undefined {
  const flat = getFlatMessages(locale);
  const msg = flat[key];
  if (msg === undefined) return undefined;
  return interpolate(msg, params, locale, flat);
}

export function defineLocale(definition: LocaleDefinition): LocaleDefinition {
  const state = getI18nState();
  const locale: RegisteredLocale = {
    code: definition.code,
    messages: definition.messages,
    name: definition.name,
    dir: definition.dir || 'ltr',
    isDefault: definition.isDefault
  };

  state.registeredLocales.set(definition.code, locale);
  invalidateCache(definition.code);

  if (definition.isDefault || state.registeredLocales.size === 1) {
    state.fallbackLocale = definition.code;
    if (!state.currentLocale || state.currentLocale === 'en') {
      state.currentLocale = definition.code;
    }
  }

  return definition;
}

export function setI18nConfig(config: Partial<I18nConfig>): void {
  const state = getI18nState();
  state.i18nConfig = { ...state.i18nConfig, ...config };
  if (config.defaultLocale) {
    state.fallbackLocale = config.defaultLocale;
  }
}

export function getI18nConfig(): I18nConfig {
  const state = getI18nState();
  return { ...state.i18nConfig, locales: Array.from(state.registeredLocales.keys()) };
}

export function getDefaultLocale(): string {
  const state = getI18nState();
  for (const [code, loc] of state.registeredLocales) {
    if (loc.isDefault) return code;
  }
  return state.i18nConfig.defaultLocale;
}

export function localizePath(path: string, locale?: string): string {
  const state = getI18nState();
  const targetLocale = locale || state.currentLocale;
  const defaultLocale = getDefaultLocale();
  const strategy = state.i18nConfig.strategy;

  const cleanPath = path.replace(/^\/+/, '/').replace(/\/+$/, '') || '/';

  if (strategy === 'no_prefix') {
    return cleanPath;
  }

  const pathParts = cleanPath.split('/').filter(Boolean);
  const firstSegment = pathParts[0] || '';
  const isLocalePrefix = state.registeredLocales.has(firstSegment);

  let pathWithoutPrefix = cleanPath;
  if (isLocalePrefix) {
    const rest = pathParts.slice(1).join('/');
    pathWithoutPrefix = rest ? `/${rest}` : '/';
  }

  if ((strategy === 'prefix_except_default' || strategy === 'prefix_and_default') && targetLocale === defaultLocale) {
    return pathWithoutPrefix;
  }

  return `/${targetLocale}${pathWithoutPrefix === '/' ? '' : pathWithoutPrefix}`;
}

export function switchLocalePath(newLocale: string, currentPath?: string): string {
  const _global = globalThis as GlobalWithWindow;
  const path = currentPath || (typeof _global.window !== 'undefined' ? _global.window.location.pathname : '/');
  return localizePath(path, newLocale);
}

export function extractLocaleFromPath(path: string): { locale: string | null; pathWithoutLocale: string } {
  const state = getI18nState();
  const pathParts = path.split('/').filter(Boolean);
  const firstSegment = pathParts[0] || '';

  if (state.registeredLocales.has(firstSegment)) {
    const rest = pathParts.slice(1).join('/');
    const pathWithoutLocale = rest ? `/${rest}` : '/';
    return { locale: firstSegment, pathWithoutLocale };
  }

  return { locale: null, pathWithoutLocale: path };
}

export function useI18n(): I18nInstance {
  return {
    get locale() {
      return getI18nState().currentLocale;
    },
    get fallbackLocale() {
      return getI18nState().fallbackLocale;
    },
    get availableLocales() {
      return Array.from(getI18nState().registeredLocales.keys());
    },
    t(key: string, params?: Record<string, string | number>): string {
      const state = getI18nState();
      let message = getMessage(state.currentLocale, key, params);
      if (message === undefined && state.currentLocale !== state.fallbackLocale) {
        message = getMessage(state.fallbackLocale, key, params);
      }
      if (message === undefined) {
        notifyMissingKey(state.currentLocale, key);
        return key;
      }
      return message;
    },
    d(value: Date | number, style: DateTimeFormatStyle = 'short', options?: Intl.DateTimeFormatOptions): string {
      try {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) throw new Error('Invalid date');
        const dtf = new Intl.DateTimeFormat(getI18nState().currentLocale, { dateStyle: style, ...options });
        return dtf.format(date);
      } catch {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return String(value);
        return date.toISOString().split('T')[0];
      }
    },
    n(value: number, style: NumberFormatStyle = 'decimal', options?: NumberFormatOptions): string {
      try {
        const nf = new Intl.NumberFormat(getI18nState().currentLocale, { style, ...options });
        return nf.format(value);
      } catch {
        return String(value);
      }
    },
    c(value: number, currency: string, options?: Intl.NumberFormatOptions): string {
      try {
        const nf = new Intl.NumberFormat(getI18nState().currentLocale, {
          style: 'currency',
          currency,
          ...options
        });
        return nf.format(value);
      } catch {
        return `${currency} ${value}`;
      }
    },
    relativeTime(value: number, unit: RelativeTimeUnit, options?: Intl.RelativeTimeFormatOptions): string {
      try {
        const rtf = new Intl.RelativeTimeFormat(getI18nState().currentLocale, options);
        return rtf.format(value, unit);
      } catch {
        const suffix = value === 1 ? '' : 's';
        const prefix = value >= 0 ? 'in ' : '';
        const postfix = value < 0 ? ' ago' : '';
        return `${prefix}${Math.abs(value)} ${unit}${suffix}${postfix}`;
      }
    },
    list(items: string[], style: ListFormatStyle = 'conjunction', options?: Intl.ListFormatOptions): string {
      try {
        const lf = new Intl.ListFormat(getI18nState().currentLocale, { type: style, ...options });
        return lf.format(items);
      } catch {
        return items.join(', ');
      }
    },
    setLocale(locale: string): void {
      const state = getI18nState();
      if (state.registeredLocales.has(locale) && locale !== state.currentLocale) {
        state.currentLocale = locale;
        notifyLocaleChange(locale);
      }
    },
    getLocale(): string {
      return getI18nState().currentLocale;
    },
    addLocale(code: string, messages: LocaleMessages, options?: { name?: string; dir?: 'ltr' | 'rtl' }): void {
      const state = getI18nState();
      const existing = state.registeredLocales.get(code);
      if (existing) {
        existing.messages = deepMerge(existing.messages, messages);
        if (options?.name) existing.name = options.name;
        if (options?.dir) existing.dir = options.dir;
      } else {
        state.registeredLocales.set(code, {
          code,
          messages,
          name: options?.name,
          dir: options?.dir || 'ltr'
        });
      }
      invalidateCache(code);
      state.missingKeyWarned = new Set();
    },
    mergeLocale(code: string, messages: LocaleMessages): void {
      const state = getI18nState();
      const existing = state.registeredLocales.get(code);
      if (existing) {
        existing.messages = deepMerge(existing.messages, messages);
      } else {
        state.registeredLocales.set(code, { code, messages, dir: 'ltr' });
      }
      invalidateCache(code);
      state.missingKeyWarned = new Set();
    },
    detectLocale(acceptLanguage?: string): string {
      const state = getI18nState();
      if (!acceptLanguage) return state.fallbackLocale;

      const requested = acceptLanguage
        .split(',')
        .map(lang => {
          const [code, q = 'q=1.0'] = lang.trim().split(';');
          const quality = parseFloat(q.replace('q=', '')) || 0;
          return { code: code.trim().toLowerCase(), quality };
        })
        .sort((a, b) => b.quality - a.quality);

      for (const { code } of requested) {
        for (const registered of state.registeredLocales.keys()) {
          if (code === registered.toLowerCase() || code.startsWith(`${registered.toLowerCase()}-`)) {
            return registered;
          }
        }
      }

      return state.fallbackLocale;
    },
    onLocaleChange: addLocaleListener,
    onMissingKey: addMissingKeyHandler,
    getLocaleDir(locale?: string): 'ltr' | 'rtl' {
      const state = getI18nState();
      const code = locale || state.currentLocale;
      const loc = state.registeredLocales.get(code);
      return loc?.dir || 'ltr';
    },
    getLocaleName(locale?: string): string | undefined {
      const state = getI18nState();
      const code = locale || state.currentLocale;
      const loc = state.registeredLocales.get(code);
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
  return Array.from(getI18nState().registeredLocales.keys());
}

export function getLocaleMessages(locale?: string): LocaleMessages | undefined {
  const state = getI18nState();
  const code = locale || state.currentLocale;
  return state.registeredLocales.get(code)?.messages;
}

export function clearLocales(): void {
  const state = getI18nState();
  state.registeredLocales.clear();
  state.localeListeners.clear();
  state.missingKeyHandlers.clear();
  state.messageCache.clear();
  state.missingKeyWarned = new Set();
  state.currentLocale = 'en';
  state.fallbackLocale = 'en';
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
  return getI18nState().fallbackLocale;
}

export function formatDate(
  value: Date | number,
  style?: DateTimeFormatStyle,
  options?: Intl.DateTimeFormatOptions
): string {
  return useI18n().d(value, style, options);
}

export function formatNumber(value: number, style?: NumberFormatStyle, options?: NumberFormatOptions): string {
  return useI18n().n(value, style, options);
}

export function formatCurrency(value: number, currency: string, options?: Intl.NumberFormatOptions): string {
  return useI18n().c(value, currency, options);
}

export function formatRelativeTime(
  value: number,
  unit: RelativeTimeUnit,
  options?: Intl.RelativeTimeFormatOptions
): string {
  return useI18n().relativeTime(value, unit, options);
}

export function formatList(items: string[], style?: ListFormatStyle, options?: Intl.ListFormatOptions): string {
  return useI18n().list(items, style, options);
}
