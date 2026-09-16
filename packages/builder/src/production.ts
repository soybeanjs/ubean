import { mkdir, writeFile } from 'node:fs/promises';
import type { Plugin as VitePlugin } from 'vite';
import { getColorModeScript, resolveColorModeConfig } from '@ubean/client';
import type { ResolvedConfig } from '@ubean/config';
import { resolveProductionCacheStore, isEphemeralCachePreset } from '@ubean/preset';
import type { Preset } from '@ubean/preset';
import type { ScanResult } from '@ubean/scan';
import { join, resolve, relative } from 'pathe';
import { localeVueParamFromI18n, serializeI18nConfig } from './i18n-config';
import { buildAssetTagsSetup, buildRendererSetup, buildStaticSsgEntry } from './ssg-entry';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
import type { VirtualModuleRegistry } from './virtual-registry';
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createServerEntryVirtualModule,
  createClientEntryVirtualModule
} from './vue';

export interface BuildOptions {
  cwd: string;
  config: ResolvedConfig;
  preset: Preset;
  scanResult: ScanResult;
  minify?: boolean;
  sourcemap?: boolean;
  /** Inlined content collections for production SSR (`queryCollection`). */
  contentSnapshot?: Record<string, unknown[]>;
}

export interface BuildManifest {
  assets: Array<{
    file: string;
    src?: string;
    isEntry?: boolean;
    css?: string[];
  }>;
  entry: string;
  clientDir: string;
  serverDir: string;
  preset: string;
}

function toVitePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 把扫描到的页面序列化进服务端入口（`const _pages = [...]`）。
 *
 * **白名单必须覆盖语义字段**：此前只序列化了 `relativePath/name/route/layout/reuseTarget/isReuse/
 * pageMeta`，于是 `matchers` / `slot` / `interceptFrom` / `interceptTarget` **在生产构建里丢失** ——
 * dev 用扫描得到的活对象（`enhanceDevApp` / `buildDevSsrRoutes` 直接拿 `scanResult.pages`），所以本地
 * 一切正常，只有构建产物坏掉：带着 `[id=numeric]` 的路由在 dev 返回 404、在生产返回 200（实测）。
 * 这类「dev 正常、产物丢失元数据」的缺陷对用户最不友好，因此单独抽成函数并配单测
 * （`packages/builder/test/page-metadata.test.ts`）。
 *
 * 不含 `fullPath`/`dirname`/`basename`（构建机上的文件系统细节，产物不需要）与 `frontmatter`
 * （Markdown 页正文用，服务端路由不消费）。
 */
export function serializePagesForEntry(pages: ScanResult['pages']): string {
  return JSON.stringify(
    pages.map(p => ({
      relativePath: p.relativePath,
      name: p.name,
      route: p.route,
      path: p.path,
      layout: p.layout,
      cache: p.cache,
      isReuse: p.isReuse,
      isMarkdown: p.isMarkdown,
      reuseTarget: p.reuseTarget,
      pageMeta: p.pageMeta,
      // 下面四个是「文件路由语法」的语义产物，服务端路由与客户端守卫都依赖它们
      matchers: p.matchers,
      slot: p.slot,
      interceptFrom: p.interceptFrom,
      interceptTarget: p.interceptTarget
    }))
  );
}

export async function generateVirtualModulesToDisk(
  cwd: string,
  config: ResolvedConfig,
  scanResult: ScanResult,
  virtualDir: string,
  preset: Preset,
  registry: VirtualModuleRegistry,
  contentSnapshot?: Record<string, unknown[]>
) {
  const mode = config.mode;
  const ssrEnabled = (mode === 'fullstack' && config.ssr.enabled) || mode === 'ssg';
  const hasPages = mode !== 'backend';
  const hasServer = mode !== 'spa';

  await mkdir(virtualDir, { recursive: true });

  const srcDirAbs = resolve(cwd, config.srcDir);
  const viteSrcDir = toVitePath(relative(cwd, srcDirAbs));
  const viteSrcPrefix = viteSrcDir ? `/${viteSrcDir}` : '';

  registry.register(
    createRoutingVirtualModule(
      scanResult.apiRoutes.map(r => ({
        method: r.method?.toUpperCase() || 'ALL',
        path: r.route,
        id: `${r.method}:${r.route}`,
        filePath: r.fullPath
      })),
      scanResult.middlewares.map(m => ({
        path: '/**',
        filePath: m.fullPath,
        order: m.order,
        global: m.global
      })),
      cwd
    )
  );

  if (hasPages) {
    registry.register(
      createPagesVirtualModule(
        scanResult.pages.map(p => ({
          name: p.name,
          path: p.route,
          filePath: p.fullPath,
          layout: p.layout,
          reuseTarget: p.reuseTarget
        })),
        scanResult.layouts.map(l => ({
          name: l.name,
          filePath: l.fullPath,
          isDefault: l.isDefault
        })),
        cwd
      )
    );

    registry.register(createMetaVirtualModule());
    registry.register(
      createVuePagesVirtualModule(
        scanResult.pages,
        scanResult.layouts,
        scanResult.notFoundPage,
        scanResult.loadingPage,
        scanResult.errorPage,
        localeVueParamFromI18n(config.i18n)
      )
    );
    registry.register(createVueAppEntryVirtualModule(scanResult.appEntry));
    registry.register(createClientEntryVirtualModule());
  }

  registry.register(
    createAppVirtualModule(
      scanResult.apiRoutes,
      scanResult.middlewares,
      hasPages ? scanResult.pages : [],
      viteSrcPrefix || '/'
    )
  );

  registry.register(
    createLocalesVirtualModule(
      scanResult.locales,
      scanResult.defaultLocale,
      viteSrcPrefix || '/',
      serializeI18nConfig(config.i18n)
    )
  );

  if (hasServer) {
    registry.register(createServerEntryVirtualModule(scanResult.serverEntry));
  }

  async function writeModule(id: string, filename: string, header = '// Auto-generated by ubean\n') {
    const mod = registry.getModules().find(m => m.id === id);
    const content = mod ? await mod.load() : '';
    await writeFile(join(virtualDir, filename), header + content, 'utf-8');
  }

  await writeModule('ubean:routes', 'routes.mjs');
  await writeModule('ubean:app-config', 'app-config.mjs');
  await writeModule('ubean:locales', 'locales.mjs');

  if (hasPages) {
    await writeModule('ubean:pages', 'pages.ts');
    await writeModule('ubean:meta', 'meta.mjs');
    await writeModule('virtual:ubean-pages', 'vue-pages.ts', '');
    await writeModule('virtual:ubean-app', 'vue-app.ts', '');
    await writeModule('virtual:ubean-client-entry', 'client-entry.mjs', '');
  }

  if (hasServer) {
    await writeModule('virtual:ubean-server', 'server-entry.ts', '');
  }

  // Islands registry stub for SSR build.
  // The real registry is populated by ubeanIslandsPlugin during the client
  // build (via transform/scan of SFCs with client:* directives). During SSR,
  // islands are rendered server-side — no client hydration — so an empty
  // stub suffices. This prevents the `virtual:ubean-islands-registry` import
  // (inside ubean/client, pulled in via virtual:ubean-app) from leaking
  // unresolved into the SSR bundle when ubean is noExternal.
  await writeFile(join(virtualDir, 'islands-registry.ts'), 'export const islands = {};\n', 'utf-8');

  const pagesGlob = JSON.stringify(`${viteSrcPrefix}/pages/**/*.{vue,ts,tsx,js,jsx,md,mdx}`);
  const routesGlob = JSON.stringify(`${viteSrcPrefix}/routes/**/*.{ts,js,mjs}`);
  const middlewareGlob = JSON.stringify(`${viteSrcPrefix}/middleware/**/*.{ts,js,mjs}`);
  const layoutsGlob = JSON.stringify(`${viteSrcPrefix}/layouts/**/*.{vue,ts}`);
  const cronsDirs = (Array.isArray(config.dir.crons) ? config.dir.crons : [config.dir.crons || 'crons']).map(d =>
    d.replace(/\\/g, '/')
  );
  const cronsGlob = JSON.stringify(
    cronsDirs.length === 1
      ? `${viteSrcPrefix}/${cronsDirs[0]}/**/*.{ts,js,mjs}`
      : `${viteSrcPrefix}/{${cronsDirs.join(',')}}/**/*.{ts,js,mjs}`
  );
  const seoGlob = JSON.stringify(
    `${viteSrcPrefix}/{sitemap,robots,manifest,opengraph-image,icon,apple-icon}.{ts,js,mjs,mts,cjs}`
  );
  const enableInProcessCron = !isEphemeralCachePreset(preset.name || 'standard');
  const enableIpx = Boolean(config.image);
  // Point publicDir to the build output (not the source public/) so preview
  // serves the compiled client assets and copied static files.
  const outputDir = config.build.outputDir || 'dist';
  const publicDir = toVitePath(resolve(cwd, outputDir, 'public'));

  // Serialize scanned route/middleware/page/layout metadata so the production
  // server entry can pass it to createUbeanApp. registerRoutes() iterates over
  // these arrays (not the loaders) to know which routes/pages/middleware to
  // register — without them every request falls through to the 404 handler.
  const routesJson = JSON.stringify(
    scanResult.apiRoutes.map(r => ({
      relativePath: r.relativePath,
      route: r.route,
      method: r.method,
      fileMeta: r.fileMeta
    }))
  );
  const middlewareJson = JSON.stringify(
    scanResult.middlewares.map(m => ({
      relativePath: m.relativePath,
      order: m.order,
      global: m.global
    }))
  );
  const pagesJson = serializePagesForEntry(scanResult.pages);
  const layoutsJson = JSON.stringify(
    scanResult.layouts.map(l => ({
      name: l.name,
      relativePath: l.relativePath,
      isDefault: l.isDefault
    }))
  );

  // Serialize the auto-detected 404 page metadata so the production server
  // entry can pass it to createUbeanApp for the Hono catch-all handler.
  // Only the fields consumed by router.ts are serialized (layout + head).
  const notFoundPageJson = JSON.stringify(
    scanResult.notFoundPage
      ? {
          relativePath: scanResult.notFoundPage.relativePath,
          name: scanResult.notFoundPage.name,
          route: scanResult.notFoundPage.route,
          layout: scanResult.notFoundPage.layout,
          pageMeta: scanResult.notFoundPage.pageMeta
        }
      : null
  );

  // Pre-render the no-FOUC color-mode script at build time so the SSG/prerender
  // path (which bypasses Vite's `transformIndexHtml`) can inject it into every
  // HTML response. Dev mode is handled by `transformIndexHtml` in the vite plugin.
  const colorModeScript =
    config.colorMode !== false ? getColorModeScript(resolveColorModeConfig(config.colorMode)) : '';

  const rendererImport = ssrEnabled ? `import { createVueRenderer } from 'ubean/ssr';` : '';
  const prodLocaleVueParam = localeVueParamFromI18n(config.i18n) || '';
  // 渲染器 setup 与 assetTags 生成逻辑已抽取到 ssg-entry.ts，
  // fullstack 与 ssg 静态 entry 共用同一份（防模板漂移 / 水合不一致，
  // 见 docs/adr/0011-lightweight-ssg-direct-render.md）。
  const rendererSetup = buildRendererSetup({
    ssrEnabled,
    mode,
    localeVueParam: prodLocaleVueParam
  });
  const assetTagsSetup = buildAssetTagsSetup(config.favicon);
  const productionCache = resolveProductionCacheStore(preset.name || 'standard', config.cache);
  const contentEntries = Object.entries(contentSnapshot ?? {}).filter(([, docs]) => Array.isArray(docs));
  const contentBootstrap =
    contentEntries.length > 0
      ? `
import { configureContentRuntime, registerContent } from '@ubean/content';
configureContentRuntime();
${contentEntries.map(([name, docs]) => `registerContent(${JSON.stringify(name)}, ${JSON.stringify(docs)});`).join('\n')}
`
      : '';
  const ipxImport = enableIpx
    ? `import { createIpxHonoHandler } from '@ubean/image';
`
    : '';
  const cronImport = enableInProcessCron
    ? `import { startCronScheduler } from '@ubean/server/cron';
`
    : '';
  if (hasServer) {
    // ssg 模式：生成最小静态渲染 entry（无 Hono app / API 路由 / 中间件 /
    // crons / IPX），导出 renderStaticPage 供 prerender 直接调用
    // （docs/adr/0011-lightweight-ssg-direct-render.md）。
    if (mode === 'ssg') {
      const staticEntry = buildStaticSsgEntry({
        pagesGlob,
        layoutsGlob,
        srcPrefix: JSON.stringify(viteSrcPrefix),
        pagesJson,
        layoutsJson,
        notFoundPageJson,
        localeVueParam: prodLocaleVueParam,
        contentBootstrap,
        colorModeScript,
        favicon: config.favicon
      });
      await writeFile(join(virtualDir, 'server-entry.mjs'), staticEntry, 'utf-8');
      return virtualDir;
    }

    const serverEntry = `// Auto-generated server entry
import { createUbeanApp, applyServerConfig } from 'ubean/server';
import { toVueRouterLocalePath } from '@ubean/i18n';
import 'ubean:locales';
${rendererImport}
import { resolveAppConfig as _resolveAppConfig } from 'virtual:ubean-app';
import { resolveServerConfig as _resolveServerConfig } from 'virtual:ubean-server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
${contentBootstrap}${ipxImport}${cronImport}
export { createUbeanApp };

const routeModules = import.meta.glob(${routesGlob}, { eager: false });
const middlewareModules = import.meta.glob(${middlewareGlob}, { eager: false });
const pageModules = import.meta.glob(${pagesGlob}, { eager: false });
const layoutModules = import.meta.glob(${layoutsGlob}, { eager: false });
const cronModules = import.meta.glob(${cronsGlob}, { eager: true });
const seoConventionModules = import.meta.glob(${seoGlob}, { eager: true });

const _srcPrefix = ${JSON.stringify(viteSrcPrefix)};
function normalizeKey(p) {
  const prefixes = ['/routes/', '/middleware/', '/pages/', '/layouts/'];
  for (const prefix of prefixes) {
    const fullPrefix = _srcPrefix + prefix;
    if (p.includes(fullPrefix)) {
      const idx = p.indexOf(fullPrefix);
      return p.slice(idx + fullPrefix.length);
    }
  }
  return p;
}

export const routeLoaders = {};
for (const [key, loader] of Object.entries(routeModules)) {
  routeLoaders[normalizeKey(key)] = loader;
}

export const middlewareLoaders = {};
for (const [key, loader] of Object.entries(middlewareModules)) {
  middlewareLoaders[normalizeKey(key)] = loader;
}

export const pageLoaders = {};
for (const [key, loader] of Object.entries(pageModules)) {
  pageLoaders[normalizeKey(key)] = loader;
}

const layoutLoaders = {};
for (const [key, loader] of Object.entries(layoutModules)) {
  layoutLoaders[normalizeKey(key)] = loader;
}

const _routes = ${routesJson};
const _middleware = ${middlewareJson};
const _pages = ${pagesJson};
const _layouts = ${layoutsJson};
const _notFoundPage = ${notFoundPageJson};
${rendererSetup}
${assetTagsSetup}

// 进程内 cron 调度器句柄：必须声明在模块作用域 —— createApp() 赋值、导出的 close() 读取；
// 若声明在 createApp 内部，close() 里读不到（且它整体包在 try/catch 里，会静默失败），
// 于是 30s 的调度间隔留在进程里，预渲染后进程永不退出（实测：timer-probe 点出这一段栈）。
let cronScheduler;

export async function createApp(options = {}) {
  const app = createUbeanApp({
    rootDir: ${JSON.stringify(cwd)},
    routes: _routes,
    middleware: _middleware,
    pages: _pages,
    layouts: _layouts,
    routeLoaders,
    middlewareLoaders,
    pageLoaders,
    pageRenderer: _pageRenderer,
    pageAssetTags: _assetTags,
    publicDir: ${JSON.stringify(publicDir)},
    i18nConfig: ${JSON.stringify(config.i18n)},
    ssrExclude: ${JSON.stringify(config.ssr?.exclude ?? [])},
    streaming: ${JSON.stringify(config.ssr?.streaming ?? false)},
    notFoundPage: _notFoundPage || undefined,
    colorModeScript: ${JSON.stringify(colorModeScript)},
    routeRules: ${JSON.stringify(config.routeRules || {})},
    csrf: ${JSON.stringify(config.security === false ? false : (config.security?.csrf ?? true))},
    securityHeaders: ${JSON.stringify(config.security === false ? false : (config.security?.headers ?? true))},
    dataCache: ${JSON.stringify(config.dataCache ?? true)},
    cache: ${JSON.stringify(productionCache)},
    seoConventions: { srcDir: ${JSON.stringify(srcDirAbs)} },
    seoConventionModules,
    ipxHandler: ${enableIpx ? `createIpxHonoHandler({ rootDir: ${JSON.stringify(publicDir)}, staticDir: '.' })` : 'undefined'},
    ...options
  });

  // Apply user's defineServer config (plugins, hooks, onAppCreate) before init
  const _serverConfig = _resolveServerConfig('prod');
  await applyServerConfig(app, _serverConfig);

  await app.init();

  ${
    enableInProcessCron
      ? `if (Object.keys(cronModules).length > 0) {
    cronScheduler = startCronScheduler();
  }`
      : ''
  }

  // Call onServerReady after init completes
  if (_serverConfig.onServerReady) {
    await _serverConfig.onServerReady(app);
  }

  return app;
}

export default async function createFetchHandler() {
  const app = await createApp();
  return app.fetch;
}

// 释放本 entry 打开的运行时资源（RM-V21）：
// 预渲染需要 import() 构建好的 entry 来渲染真实 HTML，而 entry 的 createApp() 会启动进程内
// cron 调度器（以及可能被页面用到的队列 worker / 数据库连接）—— 进程因此不再退出：
// ubean build 之后 CLI 显式退出看不出来，vite build 则会挂住（实测 13 分钟仍在）。
// 保留调度器句柄并导出 close()，由预渲染步骤在渲染完成后调用。
export async function close() {
  try {
    await cronScheduler?.stop?.();
    cronScheduler = null;
  } catch {}
  // 经 ubean/server（项目必然依赖 ubean）而非子包路径 @ubean/server/* —— 后者从构建产物
  // 解析不到，清理会静默失败（实测：定时器还在，进程不退）。
  try {
    const runtime = await import('ubean/server');
    runtime.disposeMemoryRateLimitStores?.();
    await runtime.stopQueueWorkers?.();
    await runtime.closeDatabases?.();
  } catch {}
}

export const handler = async (req, ctx) => {
  const app = await createApp();
  return app.fetch(req, ctx);
};
`;
    await writeFile(join(virtualDir, 'server-entry.mjs'), serverEntry, 'utf-8');
  }

  return virtualDir;
}

export type PresetBuildConfig = ReturnType<typeof getPresetBuildConfig>;

export function getPresetBuildConfig(preset: Preset) {
  const presetName = preset.name;

  switch (presetName) {
    case 'node':
    case 'bun':
    case 'deno':
      return {
        format: 'esm' as const,
        target: 'node18',
        entryType: 'node' as const,
        external: ['hono', 'vue', 'vue/server-renderer', /^ubean(\/.*)?$/, /^node:/]
      };
    case 'cloudflare':
      return {
        format: 'esm' as const,
        target: 'es2022',
        entryType: 'worker' as const,
        external: ['hono', 'vue', 'vue/server-renderer', /^ubean(\/.*)?$/]
      };
    case 'standard':
    default:
      return {
        format: 'esm' as const,
        target: 'es2022',
        entryType: 'fetch' as const,
        external: ['hono', 'vue', 'vue/server-renderer', /^ubean(\/.*)?$/]
      };
  }
}

/**
 * SSR 期的 islands 注册表空壳插件。
 *
 * 真正的注册表由 `ubeanIslandsPlugin` 在**客户端**构建期填充；SSR 期 islands 由服务端渲染
 * （不水合），空壳即可 —— 但不能让它以裸 `virtual:ubean-islands-registry` 泄漏给 Node。
 */
export function createIslandsSsrStubPlugin(): VitePlugin {
  return {
    name: 'ubean:islands-ssr-stub',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:ubean-islands-registry') return '\0virtual:ubean-islands-registry';
      return undefined;
    },
    load(id) {
      if (id === '\0virtual:ubean-islands-registry') return 'export const islands = {};';
      return undefined;
    }
  };
}

export function generateNodeServerEntry(): string {
  return `// Auto-generated ubean Node.js server entry
import { createServer } from 'node:http';
import createFetchHandler from './entry.mjs';

const port = Number(process.env.PORT || 9527);
const host = process.env.HOST || '0.0.0.0';

async function main() {
  const fetch = await createFetchHandler();

  const server = createServer(async (req, res) => {
    try {
      const protocol = req.socket?.encrypted ? 'https' : 'http';
      const url = \`\${protocol}://\${req.headers.host || host}\${req.url || '/'}\`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else {
            headers.set(key, value);
          }
        }
      }
      const method = req.method || 'GET';
      const body = method === 'GET' || method === 'HEAD' ? undefined : req;
      const webReq = new Request(url, { method, headers, body, duplex: 'half' });
      const webRes = await fetch(webReq);

      res.statusCode = webRes.status;
      res.statusMessage = webRes.statusText;
      webRes.headers.forEach((value, key) => res.setHeader(key, value));

      if (webRes.body) {
        const reader = webRes.body.getReader();
        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            res.write(chunk);
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
      }
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  server.listen(port, host, () => {
    console.log(\`ubean server listening on http://\${host}:\${port}\`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
`.trim();
}

export function generateStandardHandlerEntry(): string {
  return `// Auto-generated ubean standard fetch handler
import createFetchHandler from './entry.mjs';

const handlerPromise = createFetchHandler();
export default async function fetch(req, ctx) {
  const handler = await handlerPromise;
  return handler(req, ctx);
}
`.trim();
}

export function generateCloudflareWorkerEntry(): string {
  return `// Auto-generated ubean Cloudflare Worker entry
import createFetchHandler from './entry.mjs';

const handlerPromise = createFetchHandler();
export default {
  async fetch(req, env, ctx) {
    const handler = await handlerPromise;
    return handler(req, { ...ctx, env });
  }
};
`.trim();
}

export { buildWithEnvironments } from './vite/build-app';
