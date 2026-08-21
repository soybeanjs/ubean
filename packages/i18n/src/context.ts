/**
 * Request-scoped i18n engine (@intlify/core).
 *
 * `t()` / `d()` / `n()` 必须在 `runWithI18n()`（由 createI18nMiddleware 包住）
 * 内调用。没有 ALS store 时抛错，禁止回落进程全局 locale。
 *
 * Cloudflare Workers：依赖 `nodejs_compat` 的 `AsyncLocalStorage`。不可用时
 * 同样抛错；handler 应改读 `c.get('locale')` 再 `translate(createRequestContext(...))`。
 *
 * Dev 下 CLI 从 Node 加载 `@ubean/app`（进而 `@ubean/i18n`），路由经 Vite
 * `ssrLoadModule` 再打一份 `@ubean/i18n`。ALS / catalogs / locale loader
 * 挂在 `globalThis` 上，保证两份模块读写同一份状态；`t()` 委托 scope 上
 * 绑定的 translate（与创建 ctx 的那份 `@intlify/core` 一致）。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { compile, createCoreContext, datetime, number, registerMessageCompiler, translate } from '@intlify/core';

registerMessageCompiler(compile);

export type LocaleMessages = Record<string, unknown>;

export interface I18nRequestScope {
  locale: string;
  fallbackLocale: string;
  ctx: ReturnType<typeof createCoreContext>;
  t?: (key: string, ...args: unknown[]) => string;
  d?: (value: Date | number | string, ...args: unknown[]) => string;
  n?: (value: number, ...args: unknown[]) => string;
}

type LocaleLoader = (code: string) => Promise<unknown>;

interface I18nEngineState {
  storage: AsyncLocalStorage<I18nRequestScope>;
  catalogs: Map<string, LocaleMessages>;
  catalogMeta: Map<string, { name?: string; dir: 'ltr' | 'rtl'; language?: string; isDefault?: boolean }>;
  fallbackLocaleCode: string;
  loadLocale?: LocaleLoader;
}

const ENGINE_KEY = '__UBEAN_I18N_ENGINE__' as const;

function getState(): I18nEngineState {
  const g = globalThis as typeof globalThis & { [ENGINE_KEY]?: I18nEngineState };
  if (!g[ENGINE_KEY]) {
    g[ENGINE_KEY] = {
      storage: new AsyncLocalStorage<I18nRequestScope>(),
      catalogs: new Map(),
      catalogMeta: new Map(),
      fallbackLocaleCode: 'en'
    };
  }
  return g[ENGINE_KEY];
}

export function setFallbackLocale(code: string): void {
  getState().fallbackLocaleCode = code;
}

export function getFallbackLocale(): string {
  return getState().fallbackLocaleCode;
}

export function setLocaleMessages(code: string, messages: LocaleMessages): void {
  getState().catalogs.set(code, messages);
}

export function getLocaleMessages(code: string): LocaleMessages | undefined {
  return getState().catalogs.get(code);
}

export function mergeLocaleMessages(code: string, messages: LocaleMessages): LocaleMessages {
  const catalogs = getState().catalogs;
  const existing = catalogs.get(code) || {};
  const merged = deepMerge(existing, messages);
  catalogs.set(code, merged);
  return merged;
}

export function setLocaleMeta(
  code: string,
  meta: { name?: string; dir?: 'ltr' | 'rtl'; language?: string; isDefault?: boolean }
): void {
  const catalogMeta = getState().catalogMeta;
  const prev = catalogMeta.get(code);
  catalogMeta.set(code, {
    name: meta.name ?? prev?.name,
    dir: meta.dir ?? prev?.dir ?? 'ltr',
    language: meta.language ?? prev?.language,
    isDefault: meta.isDefault ?? prev?.isDefault
  });
}

export function getLocaleMeta(code: string) {
  return getState().catalogMeta.get(code);
}

export function listLocaleCodes(): string[] {
  const { catalogs, catalogMeta } = getState();
  return Array.from(new Set([...catalogs.keys(), ...catalogMeta.keys()]));
}

export function getRegisteredLocalesMeta(): Array<{
  code: string;
  name?: string;
  dir: 'ltr' | 'rtl';
  language?: string;
  isDefault?: boolean;
}> {
  const { catalogMeta } = getState();
  return listLocaleCodes().map(code => {
    const meta = catalogMeta.get(code);
    return {
      code,
      name: meta?.name,
      dir: meta?.dir || 'ltr',
      language: meta?.language,
      isDefault: meta?.isDefault
    };
  });
}

export function getLocaleDir(locale?: string): 'ltr' | 'rtl' {
  const { storage, catalogMeta } = getState();
  const code = locale || storage.getStore()?.locale;
  if (!code) return 'ltr';
  return catalogMeta.get(code)?.dir || 'ltr';
}

export function getLocaleName(locale?: string): string | undefined {
  const { storage, catalogMeta } = getState();
  const code = locale || storage.getStore()?.locale;
  if (!code) return undefined;
  return catalogMeta.get(code)?.name;
}

/**
 * Vite 图里的 `ubean:locales` 在求值时注册；Node 侧中间件通过
 * `ensureLocaleMessages` 调用，避免 `import('ubean:locales')` 在 CLI 进程里 404。
 */
export function registerLocaleLoader(loader?: LocaleLoader): void {
  getState().loadLocale = loader;
}

export async function ensureLocaleMessages(locale: string, fallback?: string): Promise<void> {
  const loader = getState().loadLocale;
  if (loader) {
    await loader(locale);
    if (fallback && fallback !== locale) await loader(fallback);
    return;
  }
  try {
    const mod = (await import('ubean:locales')) as { loadLocale?: LocaleLoader };
    if (mod.loadLocale) {
      getState().loadLocale = mod.loadLocale;
      await mod.loadLocale(locale);
      if (fallback && fallback !== locale) await mod.loadLocale(fallback);
    }
  } catch {
    // virtual module missing (no locales dir / Node graph without Vite)
  }
}

export function createRequestContext(locale: string, fallback?: string): ReturnType<typeof createCoreContext> {
  const { catalogs, fallbackLocaleCode } = getState();
  const fb = fallback ?? fallbackLocaleCode;
  const messages: Record<string, LocaleMessages> = {};
  const locMsgs = catalogs.get(locale);
  if (locMsgs) messages[locale] = locMsgs;
  if (fb !== locale) {
    const fbMsgs = catalogs.get(fb);
    if (fbMsgs) messages[fb] = fbMsgs;
  }
  return createCoreContext({
    locale,
    fallbackLocale: fb,
    messages: messages as never,
    missingWarn: false,
    fallbackWarn: false,
    messageCompiler: compile
  });
}

function bindScope(scope: I18nRequestScope): I18nRequestScope {
  if (scope.t && scope.d && scope.n) return scope;
  const { ctx } = scope;
  return {
    ...scope,
    t: (key, ...args) => {
      try {
        const result = (translate as (c: unknown, k: string, ...rest: unknown[]) => unknown)(ctx, key, ...args);
        return typeof result === 'string' ? result : key;
      } catch {
        return key;
      }
    },
    d: (value, ...args) =>
      String((datetime as (c: unknown, v: unknown, ...rest: unknown[]) => unknown)(ctx, value, ...args)),
    n: (value, ...args) =>
      String((number as (c: unknown, v: unknown, ...rest: unknown[]) => unknown)(ctx, value, ...args))
  };
}

export function runWithI18n<T>(scope: I18nRequestScope, fn: () => T): T {
  return getState().storage.run(bindScope(scope), fn);
}

export function getI18nScope(): I18nRequestScope | undefined {
  return getState().storage.getStore();
}

export function getRequestLocale(): string {
  const scope = getState().storage.getStore();
  if (!scope) {
    throw new Error('[ubean/i18n] t()/getRequestLocale() called outside request scope (no AsyncLocalStorage store)');
  }
  return scope.locale;
}

export function t(key: string, ...args: unknown[]): string {
  const scope = getState().storage.getStore();
  if (!scope) {
    throw new Error('[ubean/i18n] t() called outside request scope. Use createI18nMiddleware or runWithI18n().');
  }
  return (scope.t ?? bindScope(scope).t!)(key, ...args);
}

export function d(value: Date | number | string, ...args: unknown[]): string {
  const scope = getState().storage.getStore();
  if (!scope) {
    throw new Error('[ubean/i18n] d() called outside request scope');
  }
  return (scope.d ?? bindScope(scope).d!)(value, ...args);
}

export function n(value: number, ...args: unknown[]): string {
  const scope = getState().storage.getStore();
  if (!scope) {
    throw new Error('[ubean/i18n] n() called outside request scope');
  }
  return (scope.n ?? bindScope(scope).n!)(value, ...args);
}

function deepMerge(target: LocaleMessages, source: LocaleMessages): LocaleMessages {
  const result: LocaleMessages = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as LocaleMessages, srcVal as LocaleMessages);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}
