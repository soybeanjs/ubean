import type { Plugin as VitePlugin } from 'vite';

export type ModuleConfiguration = string | [ModuleFactory, unknown] | VitePlugin | ModuleDefinition;

export interface ModuleDefinition {
  name?: string;
  setup?: (options: unknown, app: unknown) => void | Promise<void>;
  hooks?: Record<string, (...args: unknown[]) => void | Promise<void>>;
  dependsOn?: string[];
  vitePlugin?: VitePlugin | VitePlugin[];
}

export type ModuleFactory<TOptions = unknown> = (
  options: TOptions,
  app: unknown
) => VitePlugin | VitePlugin[] | ModuleDefinition | Promise<VitePlugin | VitePlugin[] | ModuleDefinition>;

export interface ResolvedModule {
  name: string;
  key: string;
  plugins: VitePlugin[];
  options?: Record<string, unknown>;
  setup?: (options: unknown, app: unknown) => void | Promise<void>;
  hooks?: Record<string, (...args: unknown[]) => void | Promise<void>>;
  dependsOn: string[];
}

export interface BuiltinModuleOptions {
  disabled?: boolean;
  [key: string]: unknown;
}

export interface UbeanConfig {
  rootDir?: string;
  srcDir?: string;
  modules?: ModuleConfiguration[];
  icon?: boolean | BuiltinModuleOptions;
  pwa?: boolean | BuiltinModuleOptions;
  auth?: boolean | BuiltinModuleOptions;
  image?: boolean | BuiltinModuleOptions;
  fonts?: boolean | BuiltinModuleOptions;
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
  prerender?: PrerenderConfig;
  scanOptions?: {
    ignore?: string[];
  };
}

export interface PrerenderConfig {
  enabled?: boolean;
  routes?: string[];
  ignore?: string[];
  crawlLinks?: boolean;
  concurrency?: number;
  failOnError?: boolean;
  staticDir?: string;
}

export interface PrerenderRoute {
  route: string;
  html?: string;
  data?: unknown;
  statusCode?: number;
  error?: Error;
  skip?: boolean;
}

export interface PrerenderResult {
  routes: PrerenderRoute[];
  generated: string[];
  errors: PrerenderRoute[];
  skipped: string[];
  duration: number;
}

export interface RouteRule {
  cache?: { ttl?: number; swr?: boolean };
  headers?: Record<string, string>;
  redirect?: string | { to: string; statusCode?: number };
  rewrite?: string;
  proxy?: string;
  prerender?: boolean;
}

export interface ResolvedConfig extends Required<Omit<UbeanConfig, 'build' | 'dev' | 'prerender' | 'icon' | 'pwa' | 'auth' | 'image' | 'fonts'>> {
  rootDir: string;
  srcDir: string;
  modules: ModuleConfiguration[];
  icon: boolean | BuiltinModuleOptions;
  pwa: boolean | BuiltinModuleOptions;
  auth: boolean | BuiltinModuleOptions;
  image: boolean | BuiltinModuleOptions;
  fonts: boolean | BuiltinModuleOptions;
  dir: Required<NonNullable<UbeanConfig['dir']>>;
  dev: Required<NonNullable<UbeanConfig['dev']>>;
  build: Required<NonNullable<UbeanConfig['build']>>;
  markdown: Required<NonNullable<UbeanConfig['markdown']>>;
  imports: Required<NonNullable<UbeanConfig['imports']>>;
  components: Required<NonNullable<UbeanConfig['components']>>;
  i18n: Required<NonNullable<UbeanConfig['i18n']>>;
  prerender: Required<NonNullable<UbeanConfig['prerender']>>;
}
