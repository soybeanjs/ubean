import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { applyServerConfig } from '@ubean/app';
import type { UbeanApp } from '@ubean/app';
import { ubeanPlugin } from '@ubean/build/vite';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands';
import { resolveModules } from '@ubean/modules';
import type { ScannedLayout } from '@ubean/routing';
import { createVueRenderer } from '@ubean/ssr';
import { findAvailablePort, findUserViteConfig } from '@ubean/utils';
import { ubeanVuePlugin, VUE_PLUGIN_INCLUDE } from '@ubean/vite';
import { consola } from 'consola';
import type { DevRunnerDevtoolsOptions } from './runner';

const logger = consola.withTag('ubean-dev');

export interface ViteDevServerOptions {
  cwd: string;
  port: number;
  host?: string;
  strictPort?: boolean;
  config: UbeanResolvedConfig;
  app: UbeanApp;
  layouts?: ScannedLayout[];
  /** DevTools data accessors forwarded to the `@ubean/devtools` Vite plugin. */
  devtools?: DevRunnerDevtoolsOptions;
  onListen?: (info: { port: number; host: string; url: string }) => void;
}

export interface ViteDevServerInstance {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly viteServer: ViteDevServer;
  start(): Promise<void>;
  stop(): Promise<void>;
  updateApp(app: UbeanApp, layouts?: ScannedLayout[]): void;
}

async function toWebRequest(req: IncomingMessage, host: string, protocol: string): Promise<Request> {
  const url = `${protocol}://${req.headers.host || host}${req.url || '/'}`;
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

  return new Request(url, {
    method,
    headers,
    body,
    duplex: 'half'
  } as RequestInit);
}

async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  res.statusMessage = webRes.statusText;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

/**
 * 从 `@ubean/cli` 懒加载 scaffolding 操作(`createFsOps` / `scaffold` /
 * `deleteScaffold` / `recoverScaffold`),并返回一个透传给 `@ubean/devtools`
 * 的 `scaffoldOps` 对象。
 *
 * 设计理由:`@ubean/cli` 是可选 peerDep —— 前端-only 项目不需要安装 CLI
 * 也能跑 dev server。CLI 缺失时返回 `undefined`,DevTools 不会暴露路由 CRUD
 * 功能,但 dev server 本身仍可正常工作。
 */
async function loadScaffoldOps(): Promise<
  { createFsOps: unknown; scaffold: unknown; deleteScaffold: unknown; recoverScaffold: unknown } | undefined
> {
  try {
    const cli = (await import('@ubean/cli')) as {
      createFsOps?: unknown;
      scaffold?: unknown;
      deleteScaffold?: unknown;
      recoverScaffold?: unknown;
    };
    if (!cli.createFsOps || !cli.scaffold || !cli.deleteScaffold || !cli.recoverScaffold) {
      return undefined;
    }
    return {
      createFsOps: cli.createFsOps,
      scaffold: cli.scaffold,
      deleteScaffold: cli.deleteScaffold,
      recoverScaffold: cli.recoverScaffold
    };
  } catch {
    return undefined;
  }
}

export async function createViteDevServer(options: ViteDevServerOptions): Promise<ViteDevServerInstance> {
  const { cwd, config, app: initialApp, layouts: initialLayouts = [] } = options;
  const host = options.host || 'localhost';
  const strictPort = options.strictPort ?? false;
  let currentApp = initialApp;
  let currentLayouts = initialLayouts;
  let httpServer: ReturnType<typeof createHttpServer> | null = null;
  let viteServer: ViteDevServer | null = null;
  // Tracks whether the user's defineServer config has been applied to currentApp.
  // Reset to false on HMR app refresh so the new app instance gets re-configured.
  let serverConfigApplied = false;
  let serverReadyCalled = false;
  let cachedServerConfig: any = null;
  // Refresh callback registered by the DevTools plugin — invoked from
  // `updateApp()` so the plugin can rebuild `DevToolsInfo` from the latest
  // scan data and push patches to connected clients via sharedState.
  let refreshDevtools: (() => void) | null = null;

  // Resolve the actual port before creating the Vite server so that the HMR
  // config and the HTTP server use the same port.
  const requestedPort = options.port;
  let actualPort: number;
  try {
    actualPort = await findAvailablePort(requestedPort, { host, strictPort });
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${requestedPort} is already in use${host ? ` on ${host}` : ''}. ` +
          `Try a different port or remove the --strictPort flag.`,
        { cause: err }
      );
    }
    throw err;
  }
  if (actualPort !== requestedPort) {
    logger.warn(`Port ${requestedPort} is in use, trying ${actualPort} instead.`);
  }

  // DevTools Kit (DTK) integration: load `@ubean/devtools`'s Vite plugin
  // lazily so `@ubean/dev` has no static dependency on it. The plugin's
  // `devtools.setup` hook fires only when Vite DevTools is enabled below.
  // Scan/config accessors come from the dev runner; `registerRefresh` lets
  // `updateApp()` push scan updates to clients without re-polling.
  //
  // 全部 DevTools 插件加载由 `config.devtools.enabled` 控制（默认 false）。
  // 禁用时跳过 `@ubean/devtools` 与 `@vitejs/devtools`，不注入客户端脚本。
  const devtoolsEnabled = options.config.devtools.enabled;
  let devtoolsPlugin: Plugin | null = null;
  if (devtoolsEnabled) {
    try {
      const { ubeanDevtoolsPlugin } = await import('@ubean/devtools');
      const devtoolsOpts = options.devtools;
      const scaffoldOps = await loadScaffoldOps();
      devtoolsPlugin = ubeanDevtoolsPlugin({
        getCwd: () => cwd,
        getApp: () => currentApp,
        ...(scaffoldOps ? { scaffoldOps } : {}),
        ...(devtoolsOpts?.getScanResult ? { getScanResult: devtoolsOpts.getScanResult } : {}),
        ...(devtoolsOpts?.getConfigMeta ? { getConfigMeta: devtoolsOpts.getConfigMeta } : {}),
        ...(devtoolsOpts?.getCustomTabs ? { getCustomTabs: devtoolsOpts.getCustomTabs } : {}),
        ...(devtoolsOpts?.ai ? { ai: devtoolsOpts.ai } : {}),
        ...(devtoolsOpts?.getApp ? { getApp: devtoolsOpts.getApp } : {}),
        ...(devtoolsOpts?.triggerRescan ? { triggerRescan: devtoolsOpts.triggerRescan } : {}),
        registerRefresh: (fn: () => void) => {
          refreshDevtools = fn;
        }
      } as Parameters<typeof ubeanDevtoolsPlugin>[0]);
    } catch {
      // @ubean/devtools not installed — DTK integration skipped.
    }
  }

  // Vite-Plus-Core only loads `DevToolsIntegration` (build-only, `apply: "build"`).
  // For dev mode, we need `DevTools()` which includes `DevToolsServer()` — the
  // plugin whose `configureServer` hook calls `createDevToolsContext()` and
  // invokes each plugin's `devtools.setup(context)`. Without this, the
  // `devtools.setup` hook never fires during dev.
  let viteDevtoolsPlugins: Plugin[] = [];
  if (devtoolsEnabled) {
    try {
      const { DevTools } = await import('@vitejs/devtools');
      // builtinDevTools: false skips DevToolsRolldownUI (the built-in Vite DevTools
      // dock panels) — we only need DevToolsServer (which fires devtools.setup) and
      // DevToolsInjection (which injects the client bootstrap script).
      viteDevtoolsPlugins = await DevTools({ builtinDevTools: false });
    } catch {
      // @vitejs/devtools not installed — Vite DevTools UI skipped.
    }
  }

  // 检测用户是否提供了 vite.config.{ts,js,mjs}
  // 如果有,由用户的 vite.config 提供 ubeanPlugin()(无参调用,从缓存获取 config)
  // (ubeanPlugin() 包含 ubeanCorePlugin + ubeanVuePlugin + ubeanIslandsPlugin)
  // 如果没有,由 builtin 提供全部 ubean 插件,避免重复注册导致 Markdown
  // 等插件被注册两次(会让 .md 文件被双重转换,产出畸形 HTML)。
  const userViteConfig = findUserViteConfig(cwd);
  const hasUserViteConfig = !!userViteConfig;

  // backend 模式:无 Vue 页面、无 SSR,跳过 Vue 相关插件
  const isBackendMode = config.mode === 'backend';

  const builtinPlugins: Plugin[] = [
    ...(isBackendMode
      ? []
      : [
          vue({
            include: VUE_PLUGIN_INCLUDE,
            template: {
              compilerOptions: {
                isCustomElement: (tag: string) => tag.startsWith('ubean-')
              }
            }
          }) as unknown as Plugin
        ]),
    ...(hasUserViteConfig
      ? []
      : [
          ubeanPlugin({ config }),
          ...(isBackendMode ? [] : ubeanVuePlugin({ config })),
          ...(isBackendMode ? [] : [ubeanIslandsPlugin()])
        ]),
    ...viteDevtoolsPlugins,
    ...(devtoolsPlugin ? [devtoolsPlugin] : [])
  ];

  const { plugins } = await resolveModules({
    cwd,
    config,
    builtinPlugins
  });

  viteServer = await createViteServer({
    root: cwd,
    // 如果用户有 vite.config,让 Vite 加载它(用户配置中的 ubeanPlugin() 会从缓存获取 config)
    // 否则使用 false,完全由 builtin plugins 提供
    configFile: userViteConfig ?? false,
    server: {
      middlewareMode: true,
      hmr: {
        port: actualPort + 1000
      }
    },
    appType: 'custom',
    plugins,
    devtools: { enabled: devtoolsEnabled, clientAuthTokens: ['ubean-devtools-token'] },
    optimizeDeps: {
      exclude: [
        'ubean',
        'virtual:ubean-pages',
        'virtual:ubean-app',
        'virtual:ubean-server',
        'virtual:ubean-client-entry',
        '#ubean-pages',
        '#ubean-app',
        '#ubean-server',
        '#ubean-client-entry'
      ]
    },
    ssr: {
      noExternal: ['ubean']
    }
  });

  function enhanceAppWithVite(app: UbeanApp, layouts: ScannedLayout[] = []) {
    app.options.layouts = layouts;

    const routeLoaders: Record<string, () => Promise<any>> = {};
    for (const route of app.options.routes || []) {
      const fullPath = route.fullPath;
      routeLoaders[route.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.routeLoaders = routeLoaders;

    const pageLoaders: Record<string, () => Promise<any>> = {};
    for (const page of app.options.pages || []) {
      const fullPath = page.fullPath;
      pageLoaders[page.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.pageLoaders = pageLoaders;

    const middlewareLoaders: Record<string, () => Promise<any>> = {};
    for (const mw of app.options.middleware || []) {
      const fullPath = mw.fullPath;
      middlewareLoaders[mw.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.middlewareLoaders = middlewareLoaders;

    // Eagerly load cron files so defineScheduled() side effects register tasks
    // in the same Vite module-graph instance that API routes use.
    const cronFiles = app.options.crons || [];
    if (cronFiles.length > 0) {
      Promise.all(cronFiles.map(c => viteServer!.ssrLoadModule(c.fullPath))).catch(err => {
        console.error('[ubean] Failed to load cron files:', err);
      });
    }

    const layoutMap = new Map<string, string>();
    for (const layout of layouts) {
      layoutMap.set(layout.name, layout.fullPath);
    }

    const defaultLayout = layouts.find(l => l.isDefault)?.name || null;

    // backend 模式无页面、无 SSR,跳过 pageRenderer 创建
    if (config.mode === 'backend') {
      app.resetInit();
      return;
    }

    // Build vue-router routes for SSR
    const scannedPages = app.options.pages || [];
    const routes = scannedPages.map((p: any) => ({
      path: p.route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*'),
      name: p.name,
      component: async () => {
        const mod = await viteServer!.ssrLoadModule(p.fullPath);
        return mod.default || mod;
      },
      meta: {
        layout: p.layout === false ? false : p.layout || defaultLayout,
        pageName: p.name,
        cache: p.cache === true ? true : undefined
      }
    }));

    // Lazily load the user's defineApp config from the virtual module.
    // Cached so we only ssrLoadModule once per enhanceAppWithVite call (HMR
    // triggers a fresh call, which picks up app.ts / app.server.ts edits).
    let appConfigModule: Promise<any> | null = null;
    const getAppConfigModule = () => {
      if (!appConfigModule) {
        appConfigModule = viteServer!.ssrLoadModule('virtual:ubean-app');
      }
      return appConfigModule;
    };

    app.options.pageRenderer = createVueRenderer({
      routes,
      async resolveLayoutComponent(name: string | false | null | undefined) {
        if (name === false || name == null) return null;
        const fullPath = layoutMap.get(name);
        if (!fullPath) return null;
        const mod = await viteServer!.ssrLoadModule(fullPath);
        return mod.default || mod;
      },
      defaultLayout,
      async resolveAppConfig() {
        const mod = await getAppConfigModule();
        return mod.resolveAppConfig('server');
      }
    });

    app.resetInit();
  }

  enhanceAppWithVite(currentApp, currentLayouts);

  const getUrl = () => `http://${host}:${actualPort}`;

  const instance: ViteDevServerInstance = {
    get port() {
      return actualPort;
    },
    get host() {
      return host;
    },
    get url() {
      return getUrl();
    },
    get viteServer() {
      return viteServer!;
    },

    async start() {
      httpServer = createHttpServer(async (req, res) => {
        try {
          await new Promise<void>((resolve, reject) => {
            viteServer!.middlewares(req, res, (err?: unknown) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          if (res.writableEnded) {
            return;
          }

          // Load locales through Vite SSR module graph (supports HMR)
          try {
            const localesMod = await viteServer!.ssrLoadModule('ubean:locales');
            if (localesMod?.loadLocales) {
              await localesMod.loadLocales();
            }
          } catch (err) {
            logger.warn('[ubean] Failed to load locales:', err);
          }

          // Apply user's defineServer config (plugins, hooks, onAppCreated)
          // before init() — must happen before the first init() call.
          if (!serverConfigApplied) {
            serverConfigApplied = true;
            try {
              const serverMod = await viteServer!.ssrLoadModule('virtual:ubean-server');
              if (serverMod?.resolveServerConfig) {
                cachedServerConfig = serverMod.resolveServerConfig('dev');
                await applyServerConfig(currentApp, cachedServerConfig);
              }
            } catch (err) {
              logger.warn('[ubean] Failed to load server config:', err);
            }
          }

          await currentApp.init();

          // Call onServerReady once after the first successful init
          if (!serverReadyCalled) {
            serverReadyCalled = true;
            if (cachedServerConfig?.onServerReady) {
              try {
                await cachedServerConfig.onServerReady(currentApp);
              } catch (err) {
                logger.warn('[ubean] onServerReady error:', err);
              }
            }
          }
          // @ts-expect-error Socket 类型没有 encrypted 属性
          const protocol = req.socket?.encrypted ? 'https' : 'http';
          const webReq = await toWebRequest(req, host, protocol);
          const webRes = await currentApp.fetch(webReq);

          const contentType = webRes.headers.get('content-type') || '';
          // The DevTools client serves a pre-built SPA with separate static
          // assets. Vite's transformIndexHtml would break the pre-built module
          // references and import-analysis. Skip transform for all devtools
          // paths (client SPA root, assets, and legacy iframe alias).
          const skipTransform = (req.url || '').startsWith('/_devtools');
          if (contentType.includes('text/html') && webRes.body && !skipTransform) {
            const html = await webRes.text();
            const transformedHtml = await viteServer!.transformIndexHtml(req.url || '/', html);
            res.statusCode = webRes.status;
            res.statusMessage = webRes.statusText;
            webRes.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            res.end(transformedHtml);
          } else {
            await sendWebResponse(res, webRes);
          }
        } catch (err) {
          if (viteServer) {
            viteServer.ssrFixStacktrace(err as Error);
          }
          if (!res.headersSent) {
            res.statusCode = 500;
            const errorHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Server Error</title>
    <style>
      body { font-family: monospace; padding: 2rem; background: #1a1a1a; color: #ff6b6b; }
      pre { background: #2d2d2d; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>Internal Server Error</h1>
    <pre>${(err as Error).stack || (err as Error).message}</pre>
  </body>
</html>`;
            res.setHeader('Content-Type', 'text/html');
            res.end(errorHtml);
          } else if (!res.writableEnded) {
            res.end(err instanceof Error ? err.message : 'Internal Server Error');
          }
        }
      });

      viteServer!.httpServer = httpServer;

      // Listen with auto-increment as a safety net. The probe above already
      // resolved the port in the common case; this retry only fires if someone
      // grabbed the port between the probe and this listen call, mirroring
      // Vite's "never throw on port conflict" behaviour (unless strictPort).
      await new Promise<void>((resolve, reject) => {
        const tryListen = (port: number) => {
          httpServer!.removeAllListeners('error');
          httpServer!.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE' && !strictPort) {
              logger.warn(`Port ${port} is in use, trying ${port + 1} instead.`);
              tryListen(port + 1);
            } else {
              reject(err);
            }
          });
          httpServer!.listen(port, host, () => {
            const addr = httpServer!.address();
            actualPort = typeof addr === 'object' && addr ? addr.port : port;
            resolve();
          });
        };
        tryListen(actualPort);
      });

      options.onListen?.({
        port: actualPort,
        host,
        url: getUrl()
      });
    },

    async stop() {
      if (viteServer) {
        await viteServer.close();
        viteServer = null;
      }
      if (httpServer) {
        await new Promise<void>((res, rej) => {
          httpServer!.close(err => (err ? rej(err) : res()));
        });
        httpServer = null;
      }
    },

    updateApp(app: UbeanApp, layouts?: ScannedLayout[]) {
      currentApp = app;
      if (layouts) currentLayouts = layouts;
      // Reset server config flags — the new app instance needs fresh config
      // application on its first request.
      serverConfigApplied = false;
      serverReadyCalled = false;
      cachedServerConfig = null;
      enhanceAppWithVite(app, currentLayouts);
      // Push the fresh scan data to DevTools clients via sharedState. The
      // plugin's refresh callback rebuilds `DevToolsInfo` from `getScanResult`
      // and emits a patch — no polling involved.
      refreshDevtools?.();
    }
  };

  return instance;
}
