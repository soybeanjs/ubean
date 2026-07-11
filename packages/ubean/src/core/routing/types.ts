export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RouteMeta {
  public?: boolean;
  openAPI?: {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    deprecated?: boolean;
    responses?: Record<string | number, unknown>;
  };
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
  hasValidator: boolean;
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
  layout?: string;
  isReuse: boolean;
  reuseTarget?: string;
  pageMeta?: {
    name?: string;
    path?: string;
    layout?: string;
    reuse?: string;
    meta?: Record<string, unknown>;
    middleware?: string | string[];
    public?: boolean;
    head?: PageHeadMeta;
  };
}

export interface ScannedLayout extends ScannedFile {
  name: string;
  path: string;
  isDefault: boolean;
}

export interface ScannedPlugin extends ScannedFile {
  order: number;
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
  };
  ignore?: string[];
}

export interface ScanResult {
  apiRoutes: ScannedApiRoute[];
  middlewares: ScannedMiddleware[];
  pages: ScannedPageRoute[];
  layouts: ScannedLayout[];
  plugins: ScannedPlugin[];
}

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';
export const GLOB_VUE_PATTERN = '**/*.{vue,ts}';
export const GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}';
