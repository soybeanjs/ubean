export interface UbeanConfig {
  rootDir?: string;
  srcDir?: string;
  dir?: {
    pages?: string;
    routes?: string;
    layouts?: string;
    middleware?: string;
    plugins?: string;
    composables?: string;
    components?: string;
    public?: string;
    crons?: string;
    queues?: string;
    locales?: string;
  };
  dev?: {
    port?: number;
    host?: string;
    open?: boolean;
  };
  build?: {
    preset?: string;
    outputDir?: string;
    minify?: boolean;
    sourcemap?: boolean;
  };
  markdown?: {
    enabled?: boolean;
    mdx?: boolean;
    theme?: string | { light: string; dark: string };
    markdownExit?: Record<string, unknown>;
    headings?: { anchorLinks?: boolean };
    components?: { autoImport?: boolean };
  };
  imports?: {
    autoImport?: boolean;
    dirs?: string[];
    global?: boolean;
  };
  components?: {
    autoImport?: boolean;
    dirs?: string[];
    directoryAsNamespace?: boolean;
  };
  i18n?: {
    defaultLocale?: string;
    locales?: string[];
    strategy?: 'prefix' | 'prefix_except_default' | 'no_prefix';
    detectBrowserLocale?: boolean;
    cookieName?: string;
    fallbackLocale?: string;
  };
  routeRules?: Record<string, RouteRule>;
  scanOptions?: {
    ignore?: string[];
  };
}

export interface RouteRule {
  cache?: { ttl?: number; swr?: boolean };
  headers?: Record<string, string>;
  redirect?: string | { to: string; statusCode?: number };
  rewrite?: string;
  proxy?: string;
  prerender?: boolean;
}

export interface ResolvedConfig extends Required<Omit<UbeanConfig, 'build' | 'dev'>> {
  rootDir: string;
  srcDir: string;
  dir: Required<NonNullable<UbeanConfig['dir']>>;
  dev: Required<NonNullable<UbeanConfig['dev']>>;
  build: Required<NonNullable<UbeanConfig['build']>>;
  markdown: Required<NonNullable<UbeanConfig['markdown']>>;
  imports: Required<NonNullable<UbeanConfig['imports']>>;
  components: Required<NonNullable<UbeanConfig['components']>>;
  i18n: Required<NonNullable<UbeanConfig['i18n']>>;
}
