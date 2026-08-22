export type {
  I18nRoutingStrategy,
  LocaleRoutingConfig,
  CompiledLocalePath,
  HonoLocalePath,
  I18nMiddlewareOptions,
  I18nLocaleMeta
} from './types';

export {
  compileLocalePaths,
  extractLocaleFromPath,
  localizePath,
  switchLocalePath,
  getVueLocaleParam,
  toVueRouterLocalePath
} from './paths';

export {
  t,
  d,
  n,
  runWithI18n,
  getI18nScope,
  getRequestLocale as getAlsLocale,
  createRequestContext,
  setLocaleMessages,
  getLocaleMessages,
  mergeLocaleMessages,
  setLocaleMeta,
  getLocaleMeta,
  getLocaleDir,
  getLocaleName,
  listLocaleCodes,
  getRegisteredLocalesMeta,
  setFallbackLocale,
  getFallbackLocale,
  registerLocaleLoader,
  ensureLocaleMessages
} from './context';
export type { LocaleMessages, I18nRequestScope, I18nCoreContext } from './context';

export { detectLocaleFromAcceptLanguage, parseLocaleCookie, serializeLocaleCookie } from './detect';

export { createI18nMiddleware, getRequestLocale, getPathWithoutLocale } from './routing';

export { buildLocaleHead } from './head';
export type { LocaleHeadInput, LocaleHeadTags } from './head';
