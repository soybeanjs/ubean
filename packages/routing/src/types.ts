import type { PageHead, RouteMeta } from '@ubean/types';

/**
 * Re-export shared types so internal modules (and consumers) can import
 * them from a single entry point within `@ubean/routing`.
 *
 * `PageHead` is sourced from `@ubean/types` (not `@ubean/pages`) to avoid a
 * `routing ↔ pages` circular dependency. `RouteMeta` is the base route meta
 * interface; projects can still augment `vue-router`'s `RouteMeta` via
 * `declare module 'vue-router' { interface RouteMeta { ... } }` in their
 * own app — that augmentation lives in `@ubean/runtime`.
 */
export type { PageHead, RouteMeta };

/**
 * HTTP methods supported by ubean API routes.
 * Aligned with Hono's built-in methods (excludes TRACE).
 */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

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

export interface ScannedPageRoute extends ScannedFile {
  name: string;
  route: string;
  path: string;
  layout?: string | false;
  cache?: boolean;
  isReuse: boolean;
  isMarkdown: boolean;
  reuseTarget?: string;
  pageMeta?: PageMeta;
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

export interface ScannedServerEntry {
  shared: AppEntry;
  dev: AppEntry;
  prod: AppEntry;
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
  serverEntry: ScannedServerEntry;
}

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';
export const GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}';
export const GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}';

/* -------------------------------------------------------------------------- */
/* Page meta types(从 define-page.ts 引入,放此处避免循环引用)                  */
/* -------------------------------------------------------------------------- */

/**
 * Page-level head configuration (SEO title, meta, link, etc.).
 * Used by Markdown frontmatter; Vue pages use `useHead()` at runtime instead.
 *
 * `PageHead` itself is imported from `@ubean/types` to avoid a
 * routing ↔ pages circular dependency.
 */

/**
 * Page-level route metadata extracted from `definePage()` macro calls.
 *
 * `meta` is typed against the local `RouteMeta` (re-exported from
 * `@ubean/types`). When the consumer augments `vue-router`'s
 * `RouteMeta` interface, the augmented members flow through here via
 * the `@ubean/types` re-export.
 *
 * NOTE: The `declare module 'vue-router' { interface RouteMeta { ... } }`
 * augmentation is owned by `@ubean/runtime` to keep this package
 * decoupled from the Vue runtime.
 */
export interface PageMeta {
  name?: string;
  path?: string;
  layout?: string | false;
  reuse?: string;
  /**
   * Route metadata. Extends vue-router's `RouteMeta` so projects can
   * augment it via `declare module 'vue-router' { interface RouteMeta { ... } }`
   * and get full type-safety inside `definePage({ meta: { ... } })`.
   */
  meta?: RouteMeta;
  middleware?: string | string[];
  requiresAuth?: boolean;
  /**
   * Enable `<keep-alive>` caching for this page.
   * When `true`, the page component instance is preserved (not destroyed)
   * when navigating away, and restored when navigating back.
   * The page's route name is used as the cache key (component name).
   * Can be toggled at runtime via `enablePageCache(name)` / `disablePageCache(name)`.
   */
  cache?: boolean;
  /**
   * Page-level head configuration (SEO title, meta, link, etc.).
   * Used by Markdown frontmatter; Vue pages use `useHead()` at runtime instead.
   */
  head?: PageHead;
}

export interface DefineMetaResult {
  meta?: Record<string, unknown>;
  requiresAuth?: boolean;
}
