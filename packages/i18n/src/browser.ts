/**
 * Browser-safe `@ubean/i18n` entry: path compiler, locale detect helpers, SEO head.
 * No AsyncLocalStorage / Intlify core — those live on the main / `./routing` entries.
 */
export type {
  I18nRoutingStrategy,
  LocaleRoutingConfig,
  CompiledLocalePath,
  HonoLocalePath,
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

export { detectLocaleFromAcceptLanguage, parseLocaleCookie, serializeLocaleCookie } from './detect';

export { buildLocaleHead } from './head';
export type { LocaleHeadInput, LocaleHeadTags } from './head';
