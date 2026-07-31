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
  layout?: string | string[] | false;
  cache?: boolean;
  isReuse: boolean;
  isMarkdown: boolean;
  reuseTarget?: string;
  pageMeta?: PageMeta;
  frontmatter?: Record<string, unknown>;
  /**
   * Parallel route slot name (P9-18). When set, this page is a parallel route
   * that populates a named view in the layout. Derived from `@slotName/`
   * directory convention. Undefined for the default slot (main page).
   */
  slot?: string;
  /**
   * Intercepting route info (P9-18). When set, this page intercepts
   * navigation to `interceptTarget` when coming from `interceptFrom`.
   * Derived from `(..)name/`, `(.)name/`, `(...)name/` directory conventions.
   */
  interceptFrom?: string;
  interceptTarget?: string;
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
    routes?: string | string[];
    middleware?: string | string[];
    pages?: string | string[];
    layouts?: string | string[];
    plugins?: string | string[];
    crons?: string | string[];
    queues?: string | string[];
    locales?: string | string[];
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
  /**
   * `pages/404.vue`(或 `.ts`/`.md`)自动检测的 404 页面。
   * 不作为常规路由注册,而是作为 Vue Router 的 catch-all 路由
   * `/:pathMatch(.*)*` 和 Hono 的兜底页面处理器。
   * `undefined` 表示未找到 404 页面文件。
   */
  notFoundPage?: ScannedPageRoute;
  /**
   * `pages/loading.vue`(或 `.ts`/`.md`)自动检测的加载组件。
   * 不作为路由注册,而是作为 `<Suspense>` 的 fallback 组件,
   * 在 SPA 导航懒加载页面组件时显示。
   * `undefined` 表示未找到 loading 页面文件。
   */
  loadingPage?: ScannedPageRoute;
  /**
   * `pages/error.vue`(或 `.ts`/`.md`)自动检测的错误兜底组件。
   * 不作为路由注册,而是作为渲染错误边界(ErrorBoundary)组件,
   * 当页面组件渲染、异步解析或 setup 抛出错误时显示。
   * `undefined` 表示未找到 error 页面文件。
   */
  errorPage?: ScannedPageRoute;
}

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';
export const GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}';
export const GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}';

/* -------------------------------------------------------------------------- */
/* Page meta types(从 define-page.ts 引入,放此处避免循环引用)                  */
/* -------------------------------------------------------------------------- */

/**
 * Page-level head configuration (SEO title, meta, link, etc.).
 * Extracted from both Markdown frontmatter and `definePage({ head })` macro
 * at build time; applied during SSR via `pageObj.head` → `pushPageHead`.
 * For dynamic/reactive head, use `useHead()` at runtime — both can coexist
 * (`useHead()` overrides `definePage.head` for same keys).
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
  /**
   * Layout name, array of layout names (outer → inner, applied left-to-right),
   * or `false` to disable layout. When an array is given, layouts are nested:
   * the first entry is the outermost layout, the last is the innermost, and
   * the innermost layout's `<PageView />` renders the matched page.
   */
  layout?: string | string[] | false;
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
   * Page-level static head configuration (SEO).
   * Build-time extracted by `extractDefinePageFromCode`; applied during SSR
   * via `pageObj.head` → `pushPageHead` (same path as Markdown frontmatter).
   * For dynamic/reactive head, use `useHead()` — both can coexist.
   */
  head?: PageHead;
}

export interface DefineMetaResult {
  meta?: Record<string, unknown>;
  requiresAuth?: boolean;
}
