export type I18nRoutingStrategy = 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';

export interface LocaleRoutingConfig {
  defaultLocale: string;
  locales: string[];
  strategy: I18nRoutingStrategy;
  /**
   * Locale code → URL segment. Missing entries fall back to the code itself.
   *
   * `code` is the identity (BCP-47, used for cookies / messages / `<html lang>`),
   * `path` is only the URL segment, so `{ 'zh-CN': 'zh' }` gives `/zh/about`
   * while every other surface still speaks `zh-CN`.
   */
  paths?: Record<string, string>;
}

export interface HonoLocalePath {
  path: string;
  locale: string;
  isDefault: boolean;
}

export interface CompiledLocalePath {
  /** vue-router path, may contain `:locale(zh)?` */
  vuePath: string;
  /** Concrete Hono mount paths */
  hono: HonoLocalePath[];
}

export interface I18nDetectOptions {
  cookieName: string;
  redirectOn: 'root' | 'all';
  alwaysRedirect: boolean;
}

export interface I18nMiddlewareOptions {
  defaultLocale: string;
  locales: string[];
  strategy: I18nRoutingStrategy;
  /** Locale code → URL segment override. See `LocaleRoutingConfig.paths`. */
  paths?: Record<string, string>;
  detectBrowserLanguage?: false | Partial<I18nDetectOptions>;
  loadMessages?: (locale: string, fallback: string) => Promise<void>;
}

export interface I18nLocaleMeta {
  /** Locale identity, BCP-47 when configured that way (`zh-CN`). */
  code: string;
  /** URL segment when it differs from `code`; `undefined` means "same as code". */
  path?: string;
  language?: string;
  name?: string;
  dir?: 'ltr' | 'rtl';
  isDefault?: boolean;
}
