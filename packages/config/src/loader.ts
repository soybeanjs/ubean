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
    staticDir: config?.staticDir ?? 'dist/public',
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
  experimental: { viteBuilder: false },
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
  // RM-V07：灰度开关，默认关闭 —— 关闭时插件不注册 environments，行为与旧路径一致。
  resolved.experimental = { viteBuilder: config.experimental?.viteBuilder === true };
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
 */
export function loadUbeanConfigSync(cwd: string = process.cwd()): ResolvedConfig {
  // 1. 优先使用缓存（CLI 已加载时命中，包含 CLI 对 mode/ssr 的修改）
  if (cachedConfig) return cachedConfig;

  // 2. 用 jiti 同步加载 ubean.config.* 文件
  const configPath = findUbeanConfigFile(cwd);
  let config: UbeanConfig = {};

  if (configPath) {
    const jiti = createJiti(cwd, { interopDefault: true });
    const loaded = jiti(configPath) as UbeanConfig & { default?: UbeanConfig };
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
