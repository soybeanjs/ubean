import { existsSync } from 'node:fs';
import { defu } from 'defu';
import { loadConfig } from 'c12';
import { createJiti } from 'jiti';
import { resolve, join } from 'pathe';
import { resolveI18nConfig } from './i18n';
import { resolveRoutingConfig } from './routing';
import type {
  UbeanConfig,
  ResolvedConfig,
  PrerenderConfig,
  ResolvedPrerenderConfig,
  SsrOptions,
  ResolvedSsrConfig,
  DevToolsConfig,
  ResolvedDevToolsConfig,
  LoggingConfig,
  ResolvedLoggingConfig,
  AppMode
} from './types';

/**
 * 默认排除的路由模式。
 *
 * 这些路由不应被预渲染:
 * - `/api/**`:API 路由,返回 JSON/text,不是页面
 * - `/_**`:内置内部路由(`/_health`、`/_devtools`、`/_scalar`、`/_openapi.json`、`/_iconify`)
 * - `/robots.txt`、`/sitemap.xml`、`/favicon.ico`、`/favicon.svg`、`/manifest.webmanifest`:
 *   文件型路由,有专门的处理器(不应作为目录渲染成 `index.html`)
 *
 * 用户的 `exclude` 配置会叠加在默认值之后,不可被覆盖。
 */
export const DEFAULT_PRERENDER_EXCLUDE: string[] = [
  '/api/**',
  '/_**',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/favicon.svg',
  '/manifest.webmanifest'
];

/**
 * 解析用户侧 `DevToolsConfig` 为内部 `ResolvedDevToolsConfig`。
 *
 * - `undefined` / `false` → `enabled: false`(DevTools 完全关闭)
 * - `true` → `enabled: true`(使用默认配置)
 * - 对象形式 → 按 `enabled` 字段判断(默认 `false`)
 *
 * 导出此函数供 dev-server 包和 CLI 复用,避免逻辑重复。
 */
export function resolveDevToolsConfig(config?: boolean | DevToolsConfig): ResolvedDevToolsConfig {
  if (config === true) {
    return { enabled: true, route: '/_devtools', ai: { enabled: false } };
  }
  if (config === false || config === undefined) {
    return { enabled: false, route: '/_devtools', ai: { enabled: false } };
  }
  return {
    enabled: config.enabled ?? false,
    route: config.route ?? '/_devtools',
    ai: {
      enabled: config.ai?.enabled ?? false,
      provider: config.ai?.provider,
      apiKey: config.ai?.apiKey,
      model: config.ai?.model,
      endpoint: config.ai?.endpoint,
      allowedTools: config.ai?.allowedTools
    }
  };
}

/**
 * 解析用户侧 `PrerenderConfig` 为内部 `ResolvedPrerenderConfig`。
 *
 * - 未设置 / 空对象 → `enabled: false`(no-op)
 * - `all: true` → 启用,匹配所有非动态页面
 * - `include: [...]` → 启用,仅匹配列表
 * - `all: true` 与 `include` 同时设置 → `include` 静默忽略
 *
 * `exclude` 字段会自动合并默认排除列表(`DEFAULT_PRERENDER_EXCLUDE`),
 * 用户的 `exclude` 配置叠加在默认值之后。如需禁用默认排除,可显式传入空数组并配合
 * `include` 精确控制;若希望覆盖某个默认排除规则,需将其在 `include` 中显式列出
 * (`include` 在 `collectPrerenderRoutes` 中直接加入队列,不经过 `exclude`)。
 *
 * 导出此函数供 prerender 包和 CLI 复用,避免逻辑重复。
 */
export function resolvePrerenderConfig(config?: PrerenderConfig): ResolvedPrerenderConfig {
  const all = config?.all === true;
  const include = config?.include ?? [];
  const enabled = all || include.length > 0;
  const userExclude = config?.exclude ?? [];

  return {
    enabled,
    all,
    include,
    exclude: [...DEFAULT_PRERENDER_EXCLUDE, ...userExclude],
    crawlLinks: config?.crawlLinks ?? true,
    concurrency: config?.concurrency ?? 4,
    failOnError: config?.failOnError ?? false,
    // 不设默认值：落盘目录由 `resolvePrerenderStaticDir()` 从**实际的** `build.outputDir` 派生，
    // 这样 `--outDir` 与 preset 自带的产物目录都被尊重（旧默认值写死 'dist/public' 时，预渲染
    // 会静默写进错误的产物树）。
    staticDir: config?.staticDir,
    extractDataPayload: config?.extractDataPayload ?? true
  };
}

/**
 * 解析 SSR 配置。
 *
 * - `true` / 未设置 → `{ enabled: true, all: true, exclude: [] }`
 * - `false` → `{ enabled: false, all: false, exclude: [] }`
 * - 对象 → 按 `all` / `exclude` 解析(`all` 默认 `true`)
 */
export function resolveSsrConfig(config?: boolean | SsrOptions): ResolvedSsrConfig {
  if (config === false) {
    return { enabled: false, all: false, exclude: [], streaming: false };
  }
  if (config === true || config === undefined) {
    return { enabled: true, all: true, exclude: [], streaming: false };
  }
  // 对象形式
  const all = config.all !== false; // 默认 true
  return {
    enabled: all,
    all,
    exclude: config.exclude ?? [],
    streaming: config.streaming === true
  };
}

/**
 * favicon 自动检测的候选文件名（按优先级排序）。
 */
const FAVICON_CANDIDATES = ['favicon.ico', 'favicon.svg', 'favicon.png', 'favicon.jpg', 'favicon.jpeg'] as const;

/**
 * 解析 favicon 配置。
 *
 * - `false` → `null`（禁用）
 * - `string` → 直接使用该路径作为 HREF（如 `/icons/my-icon.png`）
 * - `true` / 未设置 → 自动从 `publicDir` 依次查找
 *   `favicon.ico` → `favicon.svg` → `favicon.png` → `favicon.jpg` → `favicon.jpeg`,
 *   返回第一个找到文件的 HREF;未找到则返回 `null`
 *
 * @param favicon 用户配置的 favicon 值
 * @param publicDir public 目录的绝对路径
 * @returns 解析后的 favicon HREF（如 `/favicon.ico`），`null` 表示禁用或未找到
 */
export function resolveFavicon(favicon: boolean | string | undefined, publicDir: string): string | null {
  if (favicon === false) return null;
  if (typeof favicon === 'string') return favicon;
  // favicon === true 或 undefined → 自动检测
  for (const name of FAVICON_CANDIDATES) {
    if (existsSync(join(publicDir, name))) {
      return `/${name}`;
    }
  }
  return null;
}

/**
 * 解析日志展示配置为分类闸门(按模式应用默认值矩阵)。
 *
 * 语义:banner 与 warn/error 始终输出,不可配置;此函数只解析其余分类的默认值。
 *
 * - `diagnostics`:仅 `true` 时总是输出诊断信息;`'auto'`/`false`/未设置 → 仅失败时输出
 * - `request`:`'auto'`/未设置 → 关闭;显式 `true` 在 `ssg`/`spa` 模式下强制关闭并
 *   置位 `requestSuppressed`(由 CLI 提示一次),其余模式开启
 * - `scan` / `lifecycle`:默认关闭,显式 `true` 开启
 *
 * CLI flag(`--verbose`/`--log-requests`)在加载后于 CLI 层叠加,优先级高于本结果。
 *
 * 导出此函数供 CLI 复用,避免逻辑重复。
 */
export function resolveLoggingConfig(config?: LoggingConfig, mode?: AppMode): ResolvedLoggingConfig {
  const backendCapable = mode === undefined || mode === 'fullstack' || mode === 'backend';
  let request = false;
  let requestSuppressed = false;
  if (config?.request === true) {
    if (backendCapable) {
      request = true;
    } else {
      requestSuppressed = true;
    }
  }
  return {
    level: config?.level,
    diagnostics: config?.diagnostics === true,
    request,
    requestSuppressed,
    scan: config?.scan === true,
    lifecycle: config?.lifecycle === true
  };
}

const configDefaults: ResolvedConfig = {
  rootDir: process.cwd(),
  srcDir: 'src',
  mode: 'fullstack',
  ssr: { enabled: true, all: true, exclude: [], streaming: false },
  modules: [],
  content: false,
  icon: false,
  pwa: false,
  auth: false,
  image: false,
  fonts: false,
  electron: false,
  ui: false,
  pinia: false,
  ai: false,
  devtools: { enabled: false, route: '/_devtools', ai: { enabled: false } },
  dir: {
    pages: 'pages',
    routes: 'routes',
    layouts: 'layouts',
    middleware: 'middleware',
    plugins: 'plugins',
    composables: 'composables',
    components: 'components',
    public: 'public',
    crons: 'crons',
    queues: 'queues',
    locales: 'locales'
  },
  dev: { port: 9527, host: 'localhost', open: false },
  preview: { port: 9725, host: 'localhost', strictPort: false },
  build: { preset: 'node', outputDir: 'dist', minify: true, sourcemap: false },
  markdown: {
    enabled: true,
    mdx: false,
    theme: 'one-dark',
    markdownExit: { html: true, linkify: true, breaks: false },
    wrapperClass: 'markdown-wrapper',
    headings: { anchorLinks: true },
    components: { autoImport: true },
    remarkPlugins: [],
    rehypePlugins: []
  },
  autoImports: true,
  components: true,
  i18n: resolveI18nConfig(),
  routing: resolveRoutingConfig(),
  routeRules: {},
  security: undefined,
  dataCache: true,
  cache: { store: 'auto' },
  logging: resolveLoggingConfig(undefined, 'fullstack'),
  prerender: resolvePrerenderConfig(),
  scanOptions: { ignore: ['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts'] },
  favicon: null,
  colorMode: false,
  partyTown: false,
  search: false
};

let cachedConfig: ResolvedConfig | null = null;

/**
 * 将用户侧 `UbeanConfig` 解析为内部 `ResolvedConfig`（合并默认值 + 派生字段）。
 *
 * `loadUbeanConfig`（async）和 `loadUbeanConfigSync`（sync）共用此逻辑，
 * 确保两条路径产出完全一致的配置对象。
 */
function resolveUbeanConfig(config: UbeanConfig, cwd: string): ResolvedConfig {
  const resolved = defu(config as Partial<ResolvedConfig>, configDefaults) as ResolvedConfig;
  resolved.rootDir = resolve(cwd);
  resolved.srcDir = resolve(cwd, resolved.srcDir);
  // Electron 启用时，ssr 默认改为 false（桌面应用无需 SSR，除非用户显式指定）
  if (resolved.electron !== false && config.ssr === undefined) {
    resolved.ssr = resolveSsrConfig(false);
  }
  // 重新解析 routing(确保用户提供的 routing 字段被正确合并默认值)
  resolved.routing = resolveRoutingConfig(config.routing);
  // 重新解析 prerender(defu 浅合并会让派生字段 enabled 失真,
  // 必须基于合并后的 all/include 重算)
  resolved.prerender = resolvePrerenderConfig(config.prerender);
  // 重新解析 ssr(boolean | 对象 → ResolvedSsrConfig)
  resolved.ssr = resolveSsrConfig(config.ssr);
  // 重新解析 devtools(同 prerender,defu 浅合并会让 enabled 失真)
  resolved.devtools = resolveDevToolsConfig(config.devtools);
  resolved.i18n = resolveI18nConfig(config.i18n);
  // 重新解析 logging(按 mode 应用请求日志的模式矩阵;defu 浅合并会让
  // requestSuppressed 等派生字段失真,必须基于用户原始值重算)
  resolved.logging = resolveLoggingConfig(config.logging, resolved.mode);
  // 解析 favicon(自动检测 public 目录或使用用户配置的路径)
  const publicDir = join(resolved.rootDir, resolved.dir.public);
  resolved.favicon = resolveFavicon(config.favicon, publicDir);
  return resolved;
}

/**
 * 查找 ubean 配置文件（支持 .ts/.js/.mjs/.cjs/.mts/.cts 扩展名）。
 * 返回找到的第一个文件的绝对路径，未找到返回 null。
 */
function findUbeanConfigFile(cwd: string): string | null {
  const extensions = ['.ts', '.js', '.mjs', '.cjs', '.mts', '.cts'];
  for (const ext of extensions) {
    const filePath = join(cwd, `ubean.config${ext}`);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

/**
 * 把 jiti 同步加载顶层 await 配置时抛出的 SyntaxError 转成可操作的错误。
 *
 * jiti 同步模式用 `node:vm` 求值编译后的 CJS，顶层 await 报
 * `SyntaxError: await is only valid in async functions and the top level bodies of modules`，
 * 栈里全是 `node:vm` / jiti 内部帧，看不出是哪个配置字段、也不知道怎么修。
 *
 * 非顶层 await 的错误（如配置里的真实语法错误、运行时异常）原样返回 `undefined`，
 * 由调用方重新抛出，避免掩盖真正的问题。
 */
function topLevelAwaitError(error: unknown, configPath: string): Error | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (!/await is only valid in async functions|top[- ]level await/i.test(message)) return undefined;

  return new Error(
    [
      `Failed to load ${configPath}: it uses top-level await, which cannot be resolved synchronously.`,
      '',
      'The synchronous loader compiles the config to CommonJS, where top-level await is a syntax error.',
      'Frameworks do not hit this — `ubeanPlugin()` (from `ubean/vite`) loads the config asynchronously.',
      'Reach for an async loader instead:',
      '',
      '  loadUbeanConfig(cwd)   — load from disk (merged with `.ubeanrc` / env)',
      '  ensureUbeanConfig(cwd) — cache-first: reuse an already-loaded config, else load'
    ].join('\n')
  );
}

export async function loadUbeanConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  const { config } = await loadConfig<UbeanConfig>({
    cwd,
    name: 'ubean',
    configFile: 'ubean.config',
    rcFile: '.ubeanrc',
    defaults: {}
  });

  const resolved = resolveUbeanConfig(config, cwd);
  cachedConfig = resolved;
  return resolved;
}

/**
 * 确保 ubean 配置已加载（异步，缓存优先）。
 *
 * 与 `loadUbeanConfig()` 的区别：**已加载时直接返回缓存**，不会从磁盘重新加载。
 * 这是插件工厂必须的语义 —— `ubean dev`/`build`/`preview` 在加载后会对同一个 resolved 对象
 * 做原地修改（`config.mode = 'ssg'`、`config.ssr = …`、`config.logging.* = …`），二次加载
 * 会把这些 CLI 覆盖全部丢弃。
 *
 * 主要消费者：`ubean/vite` 的 `ubeanPlugin()` —— 它在工厂内 `await` 本函数，于是
 * `ubean.config.ts` 的顶层 await 在裸 Vite 与 ubean CLI 两条路径上都能解析。
 * 自建 Vite server、或想在 `vite.config.ts` 里提前读配置字段时才需要手动调用。
 */
export async function ensureUbeanConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  if (cachedConfig) return cachedConfig;
  return loadUbeanConfig(cwd);
}

/**
 * 同步加载 ubean 配置。
 *
 * 用于 Vite 插件工厂等必须同步获取配置的场景（如 `ubeanPlugin()` 在
 * `vite.config.ts` 中被调用时，无法 await `loadUbeanConfig()`）。
 *
 * 解析顺序：
 * 1. `tryGetConfig()` 全局缓存（CLI `dev`/`build` 已调用 `loadUbeanConfig()` 时命中）
 * 2. 用 jiti 同步加载 `ubean.config.{ts,js,mjs,cjs,mts,cts}`
 *
 * 注意：同步路径不支持 c12 的 `.ubeanrc` 和环境变量合并，仅读取 `ubean.config.*` 文件。
 * 实践中 `ubean.config.ts` 是唯一配置源，此限制可接受。
 *
 * **顶层 await 不受支持**：jiti 同步模式把配置编译成 CJS，顶层 await 在那里是语法错误，
 * 而「同步」与「顶层 await」在原理上不可兼容。此时抛出带修复指引的错误（见 `topLevelAwaitError`），
 * 而不是把 vm 内部的 SyntaxError 直接抛给用户。
 */
export function loadUbeanConfigSync(cwd: string = process.cwd()): ResolvedConfig {
  // 1. 优先使用缓存（CLI 已加载时命中，包含 CLI 对 mode/ssr 的修改）
  if (cachedConfig) return cachedConfig;

  // 2. 用 jiti 同步加载 ubean.config.* 文件
  const configPath = findUbeanConfigFile(cwd);
  let config: UbeanConfig = {};

  if (configPath) {
    const jiti = createJiti(cwd, { interopDefault: true });
    let loaded: UbeanConfig & { default?: UbeanConfig };
    try {
      loaded = jiti(configPath) as UbeanConfig & { default?: UbeanConfig };
    } catch (error) {
      throw topLevelAwaitError(error, configPath) ?? error;
    }
    // jiti 对 `export default {...}` 的 .ts 配置可能仍返回模块命名空间（`{ default: cfg }`），
    // `interopDefault` 并不总能拆掉它 —— 实测：拿到命名空间后 `config.content`/`i18n` 等全是
    // undefined，于是 `resolveUbeanConfig` 回落到**全默认值**。CLI 路径因为先异步加载并写入
    // 缓存（本函数第一段直接命中缓存）而看不到这个缺陷，只有 `vite dev` / `vite build`
    // （插件自举、没有 CLI 预加载）会整份跑在默认配置上。
    config = (loaded?.default ?? loaded) as UbeanConfig;
  }

  const resolved = resolveUbeanConfig(config, cwd);
  cachedConfig = resolved;
  return resolved;
}

export function getConfig(): ResolvedConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadUbeanConfig() first.');
  }
  return cachedConfig;
}

/** Returns the cached config if loaded, otherwise null (no throw). */
export function tryGetConfig(): ResolvedConfig | null {
  return cachedConfig;
}

export function defineConfig(config?: UbeanConfig): UbeanConfig {
  return config ?? {};
}
