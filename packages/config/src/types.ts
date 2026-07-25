import type { Plugin as VitePlugin } from 'vite';
import type { RouteRule } from '@ubean/types';

export type { RouteRule } from '@ubean/types';

/* -------------------------------------------------------------------------- */
/* Module System                                                                */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Routing Config (T2-7 — aligned with elegant-router)                         */
/* -------------------------------------------------------------------------- */

/**
 * 路由数据生成模式。
 *
 * - `virtual` (默认):仅生成虚拟模块,路由数据通过 `virtual:ubean-pages` 等
 *   虚拟模块在内存中传递给 Vite。无实体文件产生。
 * - `file`:仅生成实体文件到 `outputDir`(默认 `src/router/_generated/`)。
 *   路由数据通过 import 实体文件获取,允许用户编辑 `meta` 字段(增量更新保护)。
 * - `both`:同时生成虚拟模块和实体文件。适合调试场景。
 */
export type RouteGenMode = 'virtual' | 'file' | 'both';

/**
 * 路由生成配置。对齐 elegant-router 的 RouterOptions,允许用户在
 * `ubean.config.ts` 中通过 `routing: { ... }` 自定义路由生成行为。
 *
 * @example
 * ```ts
 * // ubean.config.ts
 * export default defineConfig({
 *   routing: {
 *     mode: 'file',
 *     outputDir: 'src/router/_generated',
 *     routeLazy: true,
 *     onGenerated(files) {
 *       console.log('Generated routes:', files);
 *     }
 *   }
 * });
 * ```
 */
export interface RoutingConfig {
  /** 路由数据生成模式,默认 `virtual`。 */
  mode?: RouteGenMode;

  /**
   * 实体路由文件输出目录(相对于 `srcDir`),默认 `router/_generated`。
   * 仅在 `mode` 为 `file` 或 `both` 时生效。
   */
  outputDir?: string;

  /**
   * 类型声明文件(`.d.ts`)输出目录(相对于 `srcDir`),默认与 `outputDir` 同目录。
   * 包含 `typed-router.d.ts`、`ubean-router.d.ts` 等。
   */
  dtsDir?: string;

  /**
   * 页面文件 glob 包含规则(相对于 `pages/` 目录),默认包含所有文件。
   * 用于过滤扫描结果,例如只包含特定目录的页面。
   */
  pageInclude?: string[];

  /**
   * 页面文件 glob 排除规则(相对于 `pages/` 目录)。
   * 默认排除下划线前缀的文件、测试文件和类型声明文件。
   */
  pageExclude?: string[];

  /** 是否生成内置路由(如 404、首页重定向),默认 `true`。 */
  generateBuiltinRoutes?: boolean;

  /**
   * 根路径重定向目标,例如 `/home` 会将 `/` 重定向到 `/home`。
   * 默认 `undefined`(不重定向)。
   */
  rootRedirect?: string;

  /**
   * 404 页面组件文件路径(相对于 `pages/` 目录),默认 `404.vue`。
   * 若文件不存在,使用内置 404 组件。
   */
  notFoundRouteComponent?: string;

  /**
   * 默认复用路由组件文件路径(相对于 `pages/` 目录),默认 `undefined`。
   * 用于 `xxx.reuse.vue` 的默认 fallback。
   */
  defaultReuseRouteComponent?: string;

  /**
   * 复用路由配置。每项 `{ path, component }` 定义一个可复用的路由,
   * 类似 vue-router 的 children 但使用扁平模式。
   */
  reuseRoutes?: Array<{ path: string; component?: string }>;

  /** 布局相关配置。 */
  layouts?: {
    /**
     * 默认布局名称,默认 `default`。
     * 设为 `false` 表示不使用默认布局。
     */
    defaultLayout?: string | false;
    /** 是否惰性加载布局组件,默认 `true`。 */
    layoutLazy?: boolean;
  };

  /**
   * 是否惰性加载路由组件,默认 `true`。
   * 设为 `false` 时所有路由组件同步 import(不推荐,影响首屏性能)。
   */
  routeLazy?: boolean;

  /**
   * 是否惰性加载布局组件,默认 `true`。
   * 等同于 `layouts.layoutLazy`,此处作为顶层快捷配置。
   */
  layoutLazy?: boolean;

  /**
   * 自定义路由名称生成器。
   * 默认实现:`filePathToRoute` + `stripRouteGroups` + 首字母大写驼峰。
   *
   * @param filePath 相对于 `pages/` 目录的文件路径
   * @returns 路由名称(如 `user-detail`)
   */
  getRouteName?: (filePath: string) => string;

  /**
   * 自定义路由路径生成器。
   * 默认实现:`filePathToRoute`(支持 `[id]`、`[...slug]`、`(group)` 语法)。
   *
   * @param filePath 相对于 `pages/` 目录的文件路径
   * @returns 路由路径(如 `/user/:id`)
   */
  getRoutePath?: (filePath: string) => string;

  /**
   * 自定义布局解析器。
   * 默认实现:从 `definePage({ layout })` 宏或 frontmatter 中读取。
   *
   * @param filePath 相对于 `pages/` 目录的文件路径
   * @returns 布局名称,`false` 表示不使用布局,`undefined` 表示使用默认布局
   */
  getRouteLayout?: (filePath: string) => string | false | undefined;

  /**
   * 自定义路由 meta 解析器。
   * 默认实现:合并 `definePage({ meta })` 宏和 frontmatter 中的 `meta` 字段。
   *
   * @param filePath 相对于 `pages/` 目录的文件路径
   * @param frontmatter 从文件 frontmatter 中解析出的元数据
   * @returns 路由 meta 对象
   */
  getRouteMeta?: (filePath: string, frontmatter: Record<string, unknown>) => Record<string, unknown>;

  /**
   * 路由文件生成完成后的回调。仅在 `mode` 为 `file` 或 `both` 时触发。
   *
   * @param files 生成的文件路径数组(绝对路径)
   */
  onGenerated?: (files: string[]) => void;

  /**
   * 是否在 dev 模式下监听文件变更并重新生成路由,默认 `true`。
   * 仅在 `mode` 为 `file` 或 `both` 时生效。
   */
  watchFile?: boolean;

  /** 文件变更后重新生成的 debounce 时长(毫秒),默认 `100`。 */
  fileUpdateDuration?: number;
}

/**
 * 解析后的 `RoutingConfig`,所有字段均已填充默认值。
 */
export interface ResolvedRoutingConfig extends Required<
  Omit<RoutingConfig, 'getRouteName' | 'getRoutePath' | 'getRouteLayout' | 'getRouteMeta' | 'onGenerated'>
> {
  // 函数字段保持可选(默认值由 `@ubean/routing` 的扫描器实现提供)
  getRouteName?: RoutingConfig['getRouteName'];
  getRoutePath?: RoutingConfig['getRoutePath'];
  getRouteLayout?: RoutingConfig['getRouteLayout'];
  getRouteMeta?: RoutingConfig['getRouteMeta'];
  onGenerated?: RoutingConfig['onGenerated'];
}

/* -------------------------------------------------------------------------- */
/* Prerender Config                                                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* UbeanConfig                                                                  */
/* -------------------------------------------------------------------------- */

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
  preview?: {
    port?: number;
    host?: string;
    strictPort?: boolean;
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
    strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
    detectBrowserLocale?: boolean;
    cookieName?: string;
    fallbackLocale?: string;
  };
  routing?: RoutingConfig;
  routeRules?: Record<string, RouteRule>;
  prerender?: PrerenderConfig;
  scanOptions?: {
    ignore?: string[];
  };
}

export interface ResolvedConfig extends Required<
  Omit<UbeanConfig, 'build' | 'dev' | 'preview' | 'prerender' | 'icon' | 'pwa' | 'auth' | 'image' | 'fonts' | 'routing'>
> {
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
  preview: Required<NonNullable<UbeanConfig['preview']>>;
  build: Required<NonNullable<UbeanConfig['build']>>;
  markdown: Required<NonNullable<UbeanConfig['markdown']>>;
  imports: Required<NonNullable<UbeanConfig['imports']>>;
  components: Required<NonNullable<UbeanConfig['components']>>;
  i18n: Required<NonNullable<UbeanConfig['i18n']>>;
  prerender: Required<NonNullable<UbeanConfig['prerender']>>;
  routing: ResolvedRoutingConfig;
}
