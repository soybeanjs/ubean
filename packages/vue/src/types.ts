import type { RouteMeta } from 'vue-router';

/**
 * `@ubean/vue` 页面路由共享类型(运行时 + 构建期 `/vite` 共用)。
 *
 * 本包是页面路由的唯一所有者:`@ubean/scan` 聚合层通过
 * `import type { ... } from '@ubean/vue'` re-export 这些类型保持向后兼容。
 */

/**
 * Page-level head configuration (SEO title, meta, link, etc.).
 *
 * 提取自 Markdown frontmatter 与 `definePage({ head })` 宏(构建期);
 * SSR 链路经 `pageObj.head` 应用,SPA 链路经 `setupPageHeadGuard` 读取
 * `route.meta.head` 后 push 进 head 实例。动态/响应式 head 用 `useHead()`。
 */
export interface PageHead {
  title?: string;
  meta?: Array<Record<string, string>>;
  link?: Array<Record<string, string>>;
  script?: Array<Record<string, string>>;
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

/**
 * Page-level route metadata extracted from `definePage()` macro calls.
 *
 * 注意:无 `middleware` 字段 —— 此前该字段从未被任何运行时消费
 * (服务端中间件走 `middleware/` 目录挂载,客户端守卫读 `meta`)。
 * 需要按路由声明守卫时,用 `meta: { middleware: [...] }` 透传到
 * `route.meta` 由用户导航守卫消费。
 */
export interface PageMeta {
  name?: string;
  path?: string;
  /**
   * Layout name, array of layout names (outer → inner, applied left-to-right),
   * or `false` to disable layout.
   */
  layout?: string | string[] | false;
  /** Reuse route target page name(元数据文件 `.reuse.ts` / `.reuse.js`)。 */
  reuse?: string;
  /** 任意扩展 meta,浅合并进 `route.meta`。 */
  meta?: RouteMeta;
  /** 鉴权标记,写入 `route.meta.requiresAuth`,由用户导航守卫消费。 */
  requiresAuth?: boolean;
  /** keep-alive 页面缓存声明。reuse 路由未显式声明时继承目标页。 */
  cache?: boolean;
  /** 页面级过渡名,`<PageView>` 消费;空串禁用本页过渡。 */
  transition?: string;
  /**
   * 页面级静态 head(SEO)。构建期提取;仅当 `/vite` 插件
   * `head: true` 时写入 `route.meta.head` 并参与扫描输出。
   */
  head?: PageHead;
  /**
   * Per-page select SSR. Wins over `routeRules.ssr` and the global exclude list.
   * `false` = CSR without loader; `'data-only'` = loader + CSR shell; `true` = SSR.
   */
  ssr?: boolean | 'streaming' | 'data-only';
}

/** 扫描得到的单个页面(字段与旧 `ScannedPageRoute` 完全兼容)。 */
export interface ScannedPage {
  fullPath: string;
  relativePath: string;
  dirname: string;
  basename: string;
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
  /** Parallel route slot name(`@slotName/` 目录约定)。 */
  slot?: string;
  /** Intercepting route:从 `interceptFrom` 导航到 `interceptTarget` 时拦截。 */
  interceptFrom?: string;
  interceptTarget?: string;
  /** 路由参数 → matcher 名称映射(`[param=matcher]` 语法)。 */
  matchers?: Record<string, string>;
}

/** 扫描得到的布局(`layouts/` 下 `xx.vue` 或 `xx/index.vue`)。 */
export interface ScannedLayout {
  fullPath: string;
  relativePath: string;
  dirname: string;
  basename: string;
  name: string;
  path: string;
  isDefault: boolean;
}

/**
 * `scanPages` 入参。`pagesDir` / `layoutsDir` 支持多目录
 * (先到先得去重,可分层叠加目录)。
 */
export interface ScanPagesOptions {
  /** 项目根目录(绝对)。 */
  cwd: string;
  /** 源码目录(绝对或相对 `cwd`)。 */
  srcDir: string;
  /** 页面目录,相对 `srcDir` 或绝对。默认 `['pages']`。 */
  pagesDir?: string | string[];
  /** 布局目录,相对 `srcDir` 或绝对。默认 `['layouts']`。 */
  layoutsDir?: string | string[];
  /**
   * 页面文件扩展名。默认 `['vue', 'tsx', 'jsx']`;markdown 开启后自动追加
   * 对应的 `.md` / `.mdx`。`.reuse.ts` 元数据文件为独立约定,始终参与扫描。
   */
  extensions?: string[];
  /** 额外 glob ignore。 */
  ignore?: string[];
  /**
   * Markdown 页面支持,默认 `false`(零成本)。
   * - `true`:扫描 `.md` + `.mdx`
   * - `'md'`:仅 `.md`
   * - `'mdx'`:仅 `.mdx`
   * 需安装 `@ubean/markdown`(构建期按需加载,未安装时降级为无 frontmatter)。
   */
  markdown?: boolean | 'mdx' | 'md';
  /**
   * 页面级 head 支持,默认 `false`。开启后 `definePage({ head })` 与
   * markdown frontmatter `head` 写入 `pageMeta.head` / `route.meta.head`。
   */
  head?: boolean;
}

export interface ScanPagesResult {
  pages: ScannedPage[];
  layouts: ScannedLayout[];
  notFoundPage?: ScannedPage;
  loadingPage?: ScannedPage;
  errorPage?: ScannedPage;
}
