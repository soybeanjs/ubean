import { defu } from 'defu';
import { loadConfig } from 'c12';
import { resolve } from 'pathe';
import { resolveRoutingConfig } from './routing';
import type { UbeanConfig, ResolvedConfig, PrerenderConfig, ResolvedPrerenderConfig } from './types';

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
    staticDir: config?.staticDir ?? 'dist/public'
  };
}

const configDefaults: ResolvedConfig = {
  rootDir: process.cwd(),
  srcDir: 'src',
  mode: 'fullstack',
  ssr: true,
  modules: [],
  icon: false,
  pwa: false,
  auth: false,
  image: false,
  fonts: false,
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
    theme: 'vitesse-dark',
    markdownExit: { html: true, linkify: true, breaks: false },
    headings: { anchorLinks: true },
    components: { autoImport: true }
  },
  imports: { autoImport: true, dirs: [], global: false },
  components: { autoImport: true, dirs: [], directoryAsNamespace: false },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    strategy: 'prefix_except_default',
    detectBrowserLocale: true,
    cookieName: 'ubean_locale',
    fallbackLocale: 'en'
  },
  routing: resolveRoutingConfig(),
  routeRules: {},
  prerender: resolvePrerenderConfig(),
  scanOptions: { ignore: ['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts'] }
};

let cachedConfig: ResolvedConfig | null = null;

export async function loadUbeanConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  const { config } = await loadConfig<UbeanConfig>({
    cwd,
    name: 'ubean',
    configFile: 'ubean.config',
    rcFile: '.ubeanrc',
    defaults: {}
  });

  const resolved = defu(config as Partial<ResolvedConfig>, configDefaults) as ResolvedConfig;
  resolved.rootDir = resolve(cwd);
  resolved.srcDir = resolve(cwd, resolved.srcDir);
  // 重新解析 routing(确保用户提供的 routing 字段被正确合并默认值)
  resolved.routing = resolveRoutingConfig(config.routing);
  // 重新解析 prerender(defu 浅合并会让派生字段 enabled 失真,
  // 必须基于合并后的 all/include 重算)
  resolved.prerender = resolvePrerenderConfig(config.prerender);
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
