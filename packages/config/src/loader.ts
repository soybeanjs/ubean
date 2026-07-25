import { defu } from 'defu';
import { loadConfig } from 'c12';
import { resolve } from 'pathe';
import { resolveRoutingConfig } from './routing';
import type { UbeanConfig, ResolvedConfig } from './types';

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
  prerender: {
    enabled: false,
    routes: [],
    ignore: ['/api/**', '/_health'],
    crawlLinks: true,
    concurrency: 4,
    failOnError: false,
    staticDir: 'dist/public'
  },
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
