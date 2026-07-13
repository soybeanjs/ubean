export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RouteMeta {
  public?: boolean;
  [key: string]: unknown;
}

export interface ScannedFile {
  fullPath: string;
  relativePath: string;
  dirname: string;
  basename: string;
}

export interface ScannedApiRoute extends ScannedFile {
  route: string;
  method?: HttpMethod | Lowercase<HttpMethod>;
  env?: 'dev' | 'prod' | 'prerender';
  exports: string[];
  hasMeta: boolean;
  fileMeta?: RouteMeta;
}

export interface ScannedMiddleware extends ScannedFile {
  order: number;
  global: boolean;
}

export interface PageHeadMeta {
  title?: string;
  meta?: Array<Record<string, string>>;
  link?: Array<Record<string, string>>;
  script?: Array<Record<string, string>>;
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

export interface ScannedPageRoute extends ScannedFile {
  name: string;
  route: string;
  path: string;
  layout?: string | false;
  isReuse: boolean;
  isMarkdown: boolean;
  reuseTarget?: string;
  pageMeta?: import('./define-page').PageMeta;
  frontmatter?: Record<string, unknown>;
}

export interface ScannedLayout extends ScannedFile {
  name: string;
  path: string;
  isDefault: boolean;
}

export interface ScannedPlugin extends ScannedFile {
  order: number;
}

export interface ScannedCronTask extends ScannedFile {
  name: string;
}

export interface ScannedQueue extends ScannedFile {
  name: string;
}

export interface ScannedLocale extends ScannedFile {
  code: string;
  namespace?: string;
  isDefault?: boolean;
  name?: string;
  dir?: 'ltr' | 'rtl';
}

export interface AppEntry {
  exists: boolean;
  fullPath?: string;
  relativePath?: string;
}

export interface ScannedAppEntry {
  shared: AppEntry;
  server: AppEntry;
  client: AppEntry;
}

export interface ScanOptions {
  cwd: string;
  srcDir: string;
  dirs?: {
    routes?: string;
    middleware?: string;
    pages?: string;
    layouts?: string;
    plugins?: string;
    crons?: string;
    queues?: string;
    locales?: string;
  };
  ignore?: string[];
}

export interface ScanResult {
  apiRoutes: ScannedApiRoute[];
  middlewares: ScannedMiddleware[];
  pages: ScannedPageRoute[];
  layouts: ScannedLayout[];
  plugins: ScannedPlugin[];
  crons: ScannedCronTask[];
  queues: ScannedQueue[];
  locales: ScannedLocale[];
  defaultLocale?: string;
  appEntry: ScannedAppEntry;
}

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';
export const GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}';
export const GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}';
