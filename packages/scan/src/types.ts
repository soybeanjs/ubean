import type { RouteMeta } from '@ubean/shared';

/**
 * 聚合层类型:`@ubean/scan` = 服务端路由(API/中间件/插件/crons/queues/
 * locales/entries)+ 页面路由聚合。
 *
 * 页面路由类型(`PageMeta` / `PageHead` / `ScannedPage` / `ScannedLayout`)
 * 的所有权在 `@ubean/vue`(页面路由唯一所有者),此处 re-export 保持
 * 向后兼容 —— 消费方(`packages/vite` / `api-routes` / `builder` / `cli`)
 * 无需改动导入路径。
 */

export type { RouteMeta } from '@ubean/shared';
export type { PageHead, PageMeta, ScannedPage, ScannedLayout, ScanPagesOptions, ScanPagesResult } from '@ubean/vue';
/** 旧名称别名(BC):页面扫描结果类型现由 `@ubean/vue` 提供。 */
export type { ScannedPage as ScannedPageRoute } from '@ubean/vue';

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
  /**
   * 路由参数 → matcher 名称映射。
   *
   * 由文件路由 `[param=matcher]` 语法解析得到,例如 `routes/api/users/[id=numeric].ts`
   * → `{ id: 'numeric' }`。运行时 router 在匹配到该路由后,调用对应名称的 matcher
   * 函数校验参数值,失败则视为不匹配(返回 404,让 Hono 继续匹配下一候选路由)。
   *
   * 与 `ScannedPage.matchers` 同义,但作用于 API 路由。
   */
  matchers?: Record<string, string>;
}

export interface ScannedMiddleware extends ScannedFile {
  order: number;
  global: boolean;
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
  /**
   * 页面 markdown 支持(委托给 `@ubean/vue` 扫描器)。
   * 框架模式默认开启(`true` = `.md` + `.mdx`);传 `'md'` / `'mdx'` 精细控制。
   */
  markdown?: boolean | 'mdx' | 'md';
  /**
   * 页面级 head 支持(委托给 `@ubean/vue` 扫描器)。
   * 框架模式(SSR)默认开启(`true`),保证 `pageObj.head` 链路可用。
   */
  head?: boolean;
}

export interface ScanResult {
  apiRoutes: ScannedApiRoute[];
  middlewares: ScannedMiddleware[];
  pages: import('@ubean/vue').ScannedPage[];
  layouts: import('@ubean/vue').ScannedLayout[];
  plugins: ScannedPlugin[];
  crons: ScannedCronTask[];
  queues: ScannedQueue[];
  locales: ScannedLocale[];
  defaultLocale?: string;
  appEntry: ScannedAppEntry;
  serverEntry: ScannedServerEntry;
  /**
   * `pages/404.vue`(或 `.tsx`/`.md`)自动检测的 404 页面。
   * 不作为常规路由注册,而是作为 Vue Router 的 catch-all 路由
   * `/:pathMatch(.*)*` 和 Hono 的兜底页面处理器。
   * `undefined` 表示未找到 404 页面文件。
   */
  notFoundPage?: import('@ubean/vue').ScannedPage;
  /**
   * `pages/loading.vue`(或 `.ts`/`.md`)自动检测的加载组件。
   * 不作为路由注册,而是作为 `<Suspense>` 的 fallback 组件,
   * 在 SPA 导航懒加载页面组件时显示。
   * `undefined` 表示未找到 loading 页面文件。
   */
  loadingPage?: import('@ubean/vue').ScannedPage;
  /**
   * `pages/error.vue`(或 `.ts`/`.md`)自动检测的错误兜底组件。
   * 不作为路由注册,而是作为渲染错误边界(ErrorBoundary)组件,
   * 当页面组件渲染、异步解析或 setup 抛出错误时显示。
   * `undefined` 表示未找到 error 页面文件。
   */
  errorPage?: import('@ubean/vue').ScannedPage;
}

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';
export const GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}';
export const GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}';

export interface DefineMetaResult {
  meta?: Record<string, unknown>;
  requiresAuth?: boolean;
}
