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

/**
 * Electron 模块配置。
 * main/preload 有默认值，`electron: true` 即可启用。
 */
export interface ElectronModuleConfig {
  /** 是否禁用 */
  disabled?: boolean;
  /** main 进程入口（默认 'electron/main.ts'） */
  main?: {
    entry?: string;
    vite?: import('vite').InlineConfig;
  };
  /** preload 脚本入口（默认 'electron/preload.ts'） */
  preload?: {
    input?: string;
    vite?: import('vite').InlineConfig;
  };
  /** renderer 进程配置（可选） */
  renderer?: {
    nodeIntegration?: boolean;
  };
}

/**
 * UI 模块配置（@soybeanjs/ui 集成）。
 * `ui: true` 即可启用，默认自动注入 styles.css + UiResolver。
 */
export interface UiModuleConfig {
  /** 是否禁用 */
  disabled?: boolean;
  /**
   * 是否自动注入 `@soybeanjs/ui/styles.css`，默认 true。
   * 设为 false 时使用 UnoCSS 模式（用户自行配置 @soybeanjs/unocss-shadcn）。
   */
  css?: boolean;
}

/**
 * Pinia 模块配置（SSR 状态管理集成）。
 * `pinia: true` 即可启用 Vite 预构建优化。
 *
 * 注意:SSR 状态水合需要在 `src/app.ts` 中显式配置
 * `serializeState` / `hydrateState`(从 `@ubean/pinia/runtime` 导入)。
 */
export interface UbeanPiniaOptions {
  /** 是否禁用 */
  disabled?: boolean;
  /**
   * 是否将 `pinia` 加入 Vite 的 `optimizeDeps.include`，默认 true。
   * dev 模式下预构建 pinia 可避免首次请求的依赖扫描延迟。
   */
  optimizeDeps?: boolean;
}

/* -------------------------------------------------------------------------- */
/* DevTools Config                                                             */
/* -------------------------------------------------------------------------- */

/**
 * DevTools 配置。
 *
 * - `devtools: true` 启用（使用默认配置）
 * - `devtools: false`（默认）禁用 — dev server 不加载 `@ubean/devtools` 与
 *   `@vitejs/devtools` 插件，不注入 DevTools 客户端脚本
 * - `devtools: { enabled: true, ... }` 启用并自定义
 *
 * @example
 * ```ts
 * // ubean.config.ts
 * export default defineConfig({
 *   devtools: { enabled: true }
 * });
 * ```
 */
export interface DevToolsConfig {
  /**
   * 是否启用 DevTools，默认 `false`。
   *
   * 启用后 dev server 会加载 `@ubean/devtools` Vite 插件（提供路由/页面/
   * API/配置等可视化面板）和 `@vitejs/devtools`（提供 `devtools.setup`
   * hook 与客户端注入脚本）。
   */
  enabled?: boolean;

  /**
   * DevTools 面板访问路径，默认 `/_devtools`。
   */
  route?: string;

  /**
   * DevTools 内置 AI 助手配置。
   */
  ai?: {
    enabled?: boolean;
    provider?: 'openai' | 'anthropic' | 'custom';
    apiKey?: string;
    model?: string;
    endpoint?: string;
    /** AI 可使用的工具白名单，默认全部 */
    allowedTools?: string[];
  };
}

/**
 * 解析后的 DevTools 配置，所有字段均已填充默认值。
 */
export interface ResolvedDevToolsConfig {
  enabled: boolean;
  route: string;
  ai: {
    enabled: boolean;
    provider?: 'openai' | 'anthropic' | 'custom';
    apiKey?: string;
    model?: string;
    endpoint?: string;
    allowedTools?: string[];
  };
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
 *
 * 类型声明文件(`typed-router.d.ts`)不在此配置内,固定生成到
 * `.ubean/typed-router.d.ts`(与 `auto-imports.d.ts`、`components.d.ts`
 * 等其他生成产物同目录,均为纯类型声明,可在 `.gitignore` 中忽略)。
 */
export interface RoutingConfig {
  /** 路由数据生成模式,默认 `virtual`。 */
  mode?: RouteGenMode;

  /**
   * 实体路由文件输出目录(相对于 `rootDir`),默认 `src/router/_generated`。
   * 仅在 `mode` 为 `file` 或 `both` 时生效,产出 `routes.ts` 和 `imports.ts`。
   *
   * 注意:`typed-router.d.ts` 不在此目录下,固定生成到 `.ubean/`。
   */
  outputDir?: string;

  /**
   * 是否生成内置路由(如 404、首页重定向),默认 `true`。
   *
   * 页面文件扫描直接基于 `dir.pages`(支持多目录),不再通过独立的
   * `pageInclude`/`pageExclude` glob 过滤。如需排除特定文件,使用
   * `scanOptions.ignore`(适用于所有扫描类型:pages/routes/layouts 等)。
   */
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
   * 默认布局名称,默认 `default`。
   * 设为 `false` 表示不使用默认布局。
   */
  defaultLayout?: string | false;

  /**
   * 是否惰性加载路由组件,默认 `true`。
   * 设为 `false` 时所有路由组件同步 import(不推荐,影响首屏性能)。
   */
  routeLazy?: boolean;

  /**
   * 是否惰性加载布局组件,默认 `true`。
   * 与 `routeLazy` 平行,无嵌套形式。
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
/* SSR Config                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * SSR(服务端渲染)配置。
 *
 * - `true`(默认):所有页面走 SSR
 * - 对象形式:精细控制哪些页面排除 SSR(走 CSR)
 *
 * @example
 * // 全部 SSR
 * ssr: true
 *
 * // 排除指定页面(走 CSR)
 * ssr: { exclude: ['/admin/**', '/dashboard/*'] }
 *
 * // 显式声明全部 SSR(等同 true)
 * ssr: { all: true }
 */
export interface SsrOptions {
  /**
   * 是否对所有页面启用 SSR。默认 `true`。
   * 设为 `false` 时仅 `include` 中的页面走 SSR(未实现,预留)。
   */
  all?: boolean;

  /**
   * 不进行 SSR 的路由模式列表(走 CSR)。
   *
   * 通配符:
   * - `*`  单段匹配  (`'/admin/*'` 匹配 `'/admin/a'` 不匹配 `'/admin/a/b'`)
   * - `**` 多段递归  (`'/admin/**'` 匹配 `'/admin/a/b/c'`)
   *
   * 匹配的页面将跳过服务端渲染,返回客户端渲染 shell。
   */
  exclude?: string[];
}

/**
 * 内部解析后的 SSR 配置。
 */
export interface ResolvedSsrConfig {
  /** 是否启用 SSR(等价于 `all === true`) */
  enabled: boolean;
  all: boolean;
  exclude: string[];
}

/* -------------------------------------------------------------------------- */
/* Prerender Config                                                             */
/* -------------------------------------------------------------------------- */

/**
 * 预渲染(SSG)配置。
 *
 * 用户配置侧仅接受对象形式;`prerender` 字段未设置等同于关闭。
 * 启用预渲染必须显式设置 `all: true` 或 `include: [...]` 之一。
 *
 * - `all: true`     预渲染所有非动态页面(可用 `exclude` 进一步排除)
 * - `include: [...]` 仅预渲染匹配的路由(`all` 优先于此字段)
 *
 * `exclude` 对 `all`、`include` 以及 `crawlLinks` 发现的链接均生效。
 *
 * 示例:
 * ```ts
 * // 全部页面
 * prerender: { all: true }
 *
 * // 全部 + 排除
 * prerender: { all: true, exclude: ['/admin/**'] }
 *
 * // 仅指定页面
 * prerender: { include: ['/about'] }
 *
 * // 动态路由的具体路径
 * prerender: { include: ['/blog/hello-world', '/blog/second-post'] }
 * ```
 */
export interface PrerenderConfig {
  /**
   * 是否预渲染所有非动态页面。
   *
   * - true: 预渲染所有非动态页面(可再用 `exclude` 排除)
   * - false/未设置: 仅预渲染 `include` 中列出的路由
   *
   * `all: true` 时 `include` 字段被忽略(不报错,静默忽略)。
   */
  all?: boolean;

  /**
   * 要预渲染的路由模式列表(`all: false` 或未设置时生效)。
   *
   * 通配符:
   * - `*`  单段匹配  (`'/blog/*'` 匹配 `'/blog/a'` 不匹配 `'/blog/a/b'`)
   * - `**` 多段递归  (`'/blog/**'` 匹配 `'/blog/a/b/c'`)
   *
   * 不含通配符的具体路径直接加入预渲染队列,
   * 用于动态路由(`[id].vue`)的具象值(如 `'/blog/hello-world'`)。
   */
  include?: string[];

  /**
   * 从匹配结果中排除的路由模式。
   * 对 `all` 和 `include` 都生效,也过滤 `crawlLinks` 发现的链接。
   */
  exclude?: string[];

  /**
   * 是否从已渲染 HTML 中提取 `<a href>` 继续预渲染。
   * 默认 true。发现的链接仍受 `exclude` 过滤。
   */
  crawlLinks?: boolean;

  /** 并发数。默认 4。 */
  concurrency?: number;

  /** 失败是否中断构建。默认 false。 */
  failOnError?: boolean;

  /** 静态产物输出目录,相对 cwd。默认 'dist/public'。 */
  staticDir?: string;
}

/**
 * 内部解析后的预渲染配置。
 * `enabled` 字段为内部派生标记,用户配置侧不暴露。
 */
export interface ResolvedPrerenderConfig {
  /** 是否启用(等价于 `all === true || include.length > 0`) */
  enabled: boolean;
  all: boolean;
  include: string[];
  exclude: string[];
  crawlLinks: boolean;
  concurrency: number;
  failOnError: boolean;
  staticDir: string;
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
/* AppMode                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 应用模式,控制构建流程按需执行。
 *
 * - `fullstack`(默认):客户端 + SSR + 服务端,完整全栈
 * - `spa`:纯客户端渲染,无 SSR、无服务端 bundle
 * - `ssg`:静态站点生成,构建时预渲染,产物为纯静态文件
 * - `backend`:纯 API 后端,无 Vue 页面、无 SSR
 *
 * SSR 的开/关由 `ssr` 选项在 `fullstack` 模式下单独控制,
 * 不再保留独立的 `ssr` mode(它在此前与 `fullstack` 完全等价)。
 */
export type AppMode = 'fullstack' | 'spa' | 'ssg' | 'backend';

/* -------------------------------------------------------------------------- */
/* UbeanConfig                                                                  */
/* -------------------------------------------------------------------------- */

export interface UbeanConfig {
  rootDir?: string;
  srcDir?: string;

  /**
   * 应用模式,控制构建流程按需执行。
   *
   * - `fullstack`(默认):客户端 + SSR + 服务端,完整全栈
   * - `spa`:纯客户端渲染,无 SSR、无服务端 bundle
   * - `ssg`:静态站点生成,构建时预渲染,产物为纯静态文件
   * - `backend`:纯 API 后端,无 Vue 页面、无 SSR
   *
   * 详见 [docs/modes.md](../../docs/modes.md)。
   */
  mode?: AppMode;

  /**
   * SSR 配置。仅在 `mode === 'fullstack'` 时生效。
   *
   * - `true`(默认):构建 SSR bundle,所有页面走服务端渲染
   * - `false`:跳过 SSR bundle 构建,仅保留客户端渲染 + API 路由
   * - 对象形式:`{ all?: boolean; exclude?: string[] }`,精细控制排除页面
   *
   * 其他 mode 下此字段被忽略(`spa`/`backend` 始终无 SSR;
   * `ssg` 始终需要 SSR 进行预渲染)。
   */
  ssr?: boolean | SsrOptions;

  modules?: ModuleConfiguration[];
  icon?: boolean | BuiltinModuleOptions;
  pwa?: boolean | BuiltinModuleOptions;
  auth?: boolean | BuiltinModuleOptions;
  image?: boolean | BuiltinModuleOptions;
  fonts?: boolean | BuiltinModuleOptions;
  /** Electron 桌面应用配置（`true` 使用默认入口启用） */
  electron?: boolean | ElectronModuleConfig;
  /** @soybeanjs/ui 集成配置（`true` 启用，默认注入 styles.css + UiResolver） */
  ui?: boolean | UiModuleConfig;
  /**
   * Pinia 集成配置（`true` 启用 Vite 预构建优化）。
   *
   * 注意:`pinia: true` 仅启用 Vite 插件优化。SSR 状态水合需要在 `src/app.ts`
   * 中显式配置 `serializeState` / `hydrateState`(从 `@ubean/pinia/runtime` 导入)。
   *
   * @example
   * ```ts
   * // ubean.config.ts
   * export default defineConfig({ pinia: true });
   *
   * // src/app.ts
   * import { createPinia } from 'pinia';
   * import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
   * export default defineApp({
   *   plugins: [createPinia()],
   *   serializeState: serializePiniaState,
   *   hydrateState: hydratePiniaState
   * });
   * ```
   */
  pinia?: boolean | UbeanPiniaOptions;
  /**
   * DevTools 配置（默认 `false` 禁用）。
   *
   * - `true` 启用（使用默认配置）
   * - `false` 禁用 — 不加载 DevTools 插件、不注入客户端脚本
   * - 对象形式自定义配置
   */
  devtools?: boolean | DevToolsConfig;
  dir?: {
    pages?: string | string[];
    routes?: string | string[];
    layouts?: string | string[];
    middleware?: string | string[];
    plugins?: string | string[];
    composables?: string;
    components?: string;
    public?: string;
    crons?: string | string[];
    queues?: string | string[];
    locales?: string | string[];
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

  /**
   * 网站图标（favicon）配置。
   *
   * - `true` 或未设置（默认）:自动从 `public/` 目录依次查找
   *   `favicon.ico` → `favicon.svg` → `favicon.png` → `favicon.jpg` → `favicon.jpeg`,
   *   使用第一个找到的文件作为图标
   * - `string`:自定义图标路径（如 `/icons/my-icon.png`）,
   *   注意为以 `/` 开头的 URL 路径,指向 public 目录下的文件
   * - `false`:禁用图标自动注入
   *
   * @example
   * ```ts
   * // 自动检测（默认）
   * export default defineConfig({});
   *
   * // 自定义路径
   * export default defineConfig({ favicon: '/icons/logo.png' });
   *
   * // 禁用
   * export default defineConfig({ favicon: false });
   * ```
   */
  favicon?: boolean | string;
}

export interface ResolvedConfig extends Required<
  Omit<
    UbeanConfig,
    | 'build'
    | 'dev'
    | 'preview'
    | 'prerender'
    | 'ssr'
    | 'icon'
    | 'pwa'
    | 'auth'
    | 'image'
    | 'fonts'
    | 'routing'
    | 'devtools'
    | 'favicon'
  >
> {
  rootDir: string;
  srcDir: string;
  modules: ModuleConfiguration[];
  icon: boolean | BuiltinModuleOptions;
  pwa: boolean | BuiltinModuleOptions;
  auth: boolean | BuiltinModuleOptions;
  image: boolean | BuiltinModuleOptions;
  fonts: boolean | BuiltinModuleOptions;
  electron: boolean | ElectronModuleConfig;
  ui: boolean | UiModuleConfig;
  pinia: boolean | UbeanPiniaOptions;
  devtools: ResolvedDevToolsConfig;
  dir: Required<NonNullable<UbeanConfig['dir']>>;
  prerender: ResolvedPrerenderConfig;
  ssr: ResolvedSsrConfig;
  dev: Required<NonNullable<UbeanConfig['dev']>>;
  preview: Required<NonNullable<UbeanConfig['preview']>>;
  build: Required<NonNullable<UbeanConfig['build']>>;
  markdown: Required<NonNullable<UbeanConfig['markdown']>>;
  imports: Required<NonNullable<UbeanConfig['imports']>>;
  components: Required<NonNullable<UbeanConfig['components']>>;
  i18n: Required<NonNullable<UbeanConfig['i18n']>>;
  routing: ResolvedRoutingConfig;
  /**
   * 解析后的 favicon HREF（如 `/favicon.ico`），`null` 表示禁用。
   * 由 `resolveFavicon()` 在配置加载时从 `public/` 目录自动检测或使用用户配置的路径。
   */
  favicon: string | null;
}
