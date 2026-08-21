export type I18nRoutingStrategy = 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';

export interface LocaleRoutingConfig {
  defaultLocale: string;
  locales: string[];
  strategy: I18nRoutingStrategy;
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
  detectBrowserLanguage?: false | Partial<I18nDetectOptions>;
  loadMessages?: (locale: string, fallback: string) => Promise<void>;
}

export interface I18nLocaleMeta {
  code: string;
  language?: string;
  name?: string;
  dir?: 'ltr' | 'rtl';
  isDefault?: boolean;
}
