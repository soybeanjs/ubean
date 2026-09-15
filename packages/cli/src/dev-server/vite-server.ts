import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import type { Logger, Plugin, ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { applyServerConfig } from '@ubean/app';
import type { UbeanApp } from '@ubean/app';
import { createVirtualRegistry, enhanceDevApp, ubeanDevRequestPlugin, ubeanPlugin } from '@ubean/build/vite';
import { ubeanVite, VUE_PLUGIN_INCLUDE } from '@ubean/build/vue';
import { resolveModules } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { getVueLocaleParam } from '@ubean/i18n';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
import type { ScannedLayout } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import {
  findAvailablePort,
  findUserViteConfig,
  getLanAddresses,
  isLoopbackHost,
  isWildcardHost
} from '@ubean/shared/node';
import { createFsOps } from '../shared/fs-ops';
import { deleteScaffold, recoverScaffold, scaffold } from '../page';
import type { DevRunnerDevtoolsOptions } from './runner';

const logger = getLogger('dev-server');

/**
 * 收编 Vite 原生日志(hmr update、依赖预构建提示等)到 ubean 分类闸门:
 * - info 级别(如 `[vite] hmr update /src/x.vue`)默认静默;`logging.lifecycle` 开启时以 `[vite]` 前缀透传
 * - warn/error 始终透传(不可静默)
 */
function createGatedViteLogger(logging: { lifecycle: boolean }): Logger {
  return {
    info(msg) {
      if (logging.lifecycle) logger.info(`[vite] ${msg}`);
    },
    warn(msg) {
      logger.warn(msg);
    },
    warnOnce(msg) {
      logger.warn(msg);
    },
    error(msg) {
      logger.error(msg);
    },
    clearScreen() {},
    hasWarned: false,
    hasErrorLogged() {
      return false;
    }
  } as Logger;
}

/**
 * Compute the vue-router locale param (e.g. `:locale(zh)?`) from the resolved
 * i18n routing config, mirroring `localeVueParamFromI18n` (`@ubean/build`).
 * Returns `''` when i18n is disabled or no prefix is needed.
 */
function resolveLocaleVueParam(config: UbeanResolvedConfig['i18n']): string {
  if (!config?.enabled || !config.locales?.length) return '';
  return getVueLocaleParam({
    defaultLocale: config.defaultLocale,
    locales: config.locales.map(l => l.code),
    strategy: config.strategy
  });
}

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
  onListen?: (info: { port: number; host: string; url: string; networkUrls: string[] }) => void;
}

export interface ViteDevServerInstance {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly viteServer: ViteDevServer;
  start(): Promise<void>;
  stop(): Promise<void>;
  updateApp(app: UbeanApp, layouts?: ScannedLayout[]): void;
  /** Send a `full-reload` event to all connected browser clients. */
  sendFullReload(): void;
}

function loadScaffoldOps(): {
  createFsOps: unknown;
  scaffold: unknown;
  deleteScaffold: unknown;
  recoverScaffold: unknown;
} {
  return { createFsOps, scaffold, deleteScaffold, recoverScaffold };
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

  /**
   * ubean 侧的应用请求处理（RM-V10 起由 Vite 中间件链中的请求路由中间件调用）。
   *
   * 从原先的 `httpServer` 处理器里整段搬来，语义未变：locales 按请求加载、用户
   * `defineServer` 配置在首次 init 前应用、`onServerReady` 只调一次、随后交给 Hono app。
   * HTML 的 `transformIndexHtml` / CSS 注入不在这里 —— 那属于「响应如何交给 Vite 处理」，
   * 现在统一由 `ubeanDevRequestPlugin` 负责，两条路径（CLI 与 `vite dev`）共用。
   */
  async function handleAppRequest(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    // 裸 `/_devtools` 与 `/_devtools/` 重定向到 Vite DevTools 外壳 `/__devtools/`：
    // 用户从 CLI banner 点进来时能看到带 dock 侧栏与全部标签页的完整 UI，而不是我们
    // 单独的 SPA。`/_devtools/` **下**的静态资源必须保持直接可达（外壳以 iframe 载入
    // `/_devtools/index.html#/route`），因此只重定向这两个「空路径」。
    if (options.config.devtools.enabled && (pathname === '/_devtools' || pathname === '/_devtools/')) {
      return new Response(null, { status: 302, headers: { Location: '/__devtools/' } });
    }

    // Locales load per-request via createI18nMiddleware.loadMessages
    try {
      await viteServer!.ssrLoadModule('ubean:locales');
    } catch (err) {
      logger.warn('[ubean] Failed to resolve locales module:', err);
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

    return currentApp.fetch(request);
  }

  // Create the HTTP server BEFORE Vite so that:
  // 1. `@vitejs/devtools` can mount its WebSocket server during
  //    `configureServer` (needs `server.httpServer` to be set)
  // 2. Vite's HMR WebSocket can share the same port (no separate HMR port)
  //
  // RM-V10 起请求分发不再由这里完成：`ubeanDevRequestPlugin`（`@ubean/build`）把
  // 「归 ubean 的请求」的判定与响应接管进 Vite 自己的中间件链（pre 判据 + post 兜底），
  // 因此这里只负责把请求交给 `viteServer.middlewares`。`vite dev` 走同一条路径。
  httpServer = createHttpServer(async (req, res) => {
    // `stop()` tears the Vite server down while the listener is still able
    // to deliver requests on established keep-alive connections (Node's
    // `close()` only rejects *new* connections). Answer such a request
    // instead of dereferencing a nulled server.
    if (!viteServer) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('ubean dev server is shutting down');
      return;
    }

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

      // 中间件链里没人接手（正常路径下 post 兜底总会结束响应）——给一个确定的收尾，
      // 避免请求悬挂。
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not Found');
      }
    } catch (err) {
      viteServer.ssrFixStacktrace(err as Error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(err instanceof Error ? err.message : 'Internal Server Error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

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
      // @ubean/devtools 经其自身依赖解析到另一个 vite-plus-core 实例
      // (peer 上下文含 @vitejs/devtools),与 CLI 直接 import 的实例
      // (peer 上下文含 esbuild/terser)类型不同源;运行时结构完全一致,
      // 用双重断言桥接类型差异(与下方 viteDevtoolsPlugins 同理)。
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
      } as Parameters<typeof ubeanDevtoolsPlugin>[0]) as unknown as Plugin;
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
      // @vitejs/devtools 也解析到含 @vitejs+devtools peer 上下文的 vite-plus-core
      // 实例,返回的 Plugin[] 与 CLI 直接 import 的实例类型不同源;运行时一致,
      // 用双重断言桥接类型差异。
      viteDevtoolsPlugins = (await DevTools({ builtinDevTools: false })) as unknown as Plugin[];
    } catch {
      // @vitejs/devtools not installed — Vite DevTools UI skipped.
    }
  }

  // 检测用户是否提供了 vite.config.{ts,js,mjs}
  // 如果有,由用户的 vite.config 提供 ubeanPlugin()(无参调用,从缓存获取 config)
  // (ubeanPlugin() 包含 ubeanCorePlugin + ubeanVite + ubeanIslandsPlugin)
  // 如果没有,由 builtin 提供全部 ubean 插件,避免重复注册导致 Markdown
  // 等插件被注册两次(会让 .md 文件被双重转换,产出畸形 HTML)。
  const userViteConfig = findUserViteConfig(cwd);
  const hasUserViteConfig = !!userViteConfig;

  // backend 模式:无 Vue 页面、无 SSR,跳过 Vue 相关插件
  const isBackendMode = config.mode === 'backend';

  // Vite-Plus does not set `viteServer.httpServer` when using
  // `middlewareMode: { server: httpServer }` (unlike standard Vite).
  // `@vitejs/devtools`'s `DevToolsServer` plugin (enforce: "post") reads
  // `viteServer.httpServer` during its `configureServer` hook to decide
  // whether to bind the WebSocket to the existing HTTP server (route-bound)
  // or spin up a separate port. Without this fix, the WS lands on a random
  // port that browsers may block (CORS/mixed-content) and the DevTools
  // dock shell cannot establish a connection.
  // This pre-plugin runs before `DevToolsServer` (post) and patches
  // `viteServer.httpServer` so the WS binds to our HTTP server.
  const httpServerBinderPlugin: Plugin = {
    name: 'ubean:http-server-binder',
    enforce: 'pre',
    configureServer(server) {
      if (!server.httpServer && httpServer) {
        (server as any).httpServer = httpServer;
      }
    }
  };

  // RM-V02：本 dev server 的虚拟模块注册表，显式注入给 core / vue 两个插件
  const devVirtualRegistry = createVirtualRegistry();

  const builtinPlugins: Plugin[] = [
    httpServerBinderPlugin,
    // RM-V10：请求路由（pre 判据 + post 兜底）。放在最前面不必要 —— 它靠 Vite 的
    // 中间件装配顺序（钩子体内 use() 排在 transform 之前，返回的函数排在静态之后）定位，
    // 但排在数组前面能让「ubean 请求」的判定先于其他插件的 pre 钩子注册。
    ubeanDevRequestPlugin({
      handler: request => handleAppRequest(request),
      // DevTools 客户端是预构建 SPA，其产物自带模块引用；经 `transformIndexHtml`
      // 重写会被破坏（import-analysis 解析不了预构建引用）。`/_devtools/` 下的静态
      // 资源本来就带扩展名，由 Vite 服务，这里只为可能的 HTML 响应兜住。
      skipHtmlTransform: url => url.startsWith('/_devtools')
    }),
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
          // RM-V02：dev 也用显式注入的注册表，两个插件共享同一实例（不再走模块级单例）
          ubeanPlugin({ config, registry: devVirtualRegistry }),
          ...(isBackendMode ? [] : ubeanVite({ config, registry: devVirtualRegistry })),
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

  if (devtoolsEnabled) {
    process.env.VITE_DEVTOOLS_DISABLE_CLIENT_AUTH = 'true';
  }

  viteServer = await createViteServer({
    root: cwd,
    // 如果用户有 vite.config,让 Vite 加载它(用户配置中的 ubeanPlugin() 会从缓存获取 config)
    // 否则使用 false,完全由 builtin plugins 提供
    configFile: userViteConfig ?? false,
    // Vite 原生 info 日志(hmr update 等)纳入 ubean 分类闸门,warn/error 保留
    customLogger: createGatedViteLogger({ lifecycle: config.logging.lifecycle }),
    resolve: {
      // pnpm peer-variant duplication can install multiple physical copies of
      // vue-router (e.g. `@ubean/client` vs `@ubean/vue` resolving different
      // peer contexts). vue-router's injection keys are per-instance Symbols,
      // so the SSR router (provided by `@ubean/client`) and the RouterView/
      // Link components (from `@ubean/vue`) must share ONE copy. Dedupe forces
      // every import — client graph and inlined SSR graph — to the root copy.
      dedupe: ['vue', 'vue-router']
    },
    server: {
      middlewareMode: {
        server: httpServer
      },
      hmr: {
        port: actualPort + 1000
      }
    },
    appType: 'custom',
    plugins,
    devtools: { enabled: devtoolsEnabled, clientAuth: false },
    optimizeDeps: {
      exclude: [
        'ubean',
        // vue-router 必须与被 exclude 的 `ubean` 运行时链保持同一模块实例:
        // 若仅应用源码里的 vue-router 被预打包(deps/vue-router.js),而
        // `ubean` 链(exclude)走原始文件,会出现两份 `Symbol(route location)`,
        // 导致用户组件 useRoute() 报 "injection not found"。整体 exclude 使
        // 所有 importer 共享同一份原始 ESM 实例。
        'vue-router',
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
      // 将 @ubean/* 运行时全部内联进 Vite SSR 图:若保持 Node-external,
      // 各包从自身 node_modules 解析 vue-router,会被 pnpm peer 变体劈成
      // 多份实例(注入键为实例级 Symbol),SSR 渲染直接崩溃。内联后统一
      // 走 resolve.dedupe 指向根副本。
      noExternal: ['ubean', /^@ubean\//],
      external: ['@ubean/i18n']
    }
  });

  // SSR 渲染器必须经 Vite SSR 图加载,而不是在 CLI 的 Node ESM 域静态
  // import:静态 import 会让 `@ubean/client` 用自身嵌套的 vue-router 副本
  // 创建 router(provide 侧),而组件(Link/PageView)在 Vite SSR 图里解析到
  // 另一副本(inject 侧),Symbol 键不一致 → dev server SSR 崩溃。经
  // ssrLoadModule 加载后,配合 resolve.dedupe,两侧共享同一 vue-router 实例。
  const { createVueRenderer } = await viteServer.ssrLoadModule('@ubean/client/ssr');

  /**
   * 把 Vite SSR 图的加载器与渲染器接到 host app 上（RM-V11 起实现在 `@ubean/build`）。
   *
   * 每次 app 实例更新后都要重跑（`updateApp`）：加载器闭包指向当次的扫描结果，
   * 且 HMR 后 `app.ts` / `app.server.ts` 的改动要立刻生效。
   */
  function enhanceAppWithVite(app: UbeanApp, layouts: ScannedLayout[] = []) {
    enhanceDevApp({
      app,
      layouts,
      loadModule: id => viteServer!.ssrLoadModule(id),
      // ssrLoadModule 返回 any，直接传入即可（无需类型断言）
      createRenderer: createVueRenderer,
      localeVueParam: resolveLocaleVueParam(config.i18n),
      backend: config.mode === 'backend',
      // cron 文件必须与 API 路由在同一份 Vite 模块图实例里求值（`defineScheduled` 是模块副作用）
      startCronScheduler: async () => {
        const cron = await import('@ubean/server/cron');
        cron.startCronScheduler();
      },
      onCronError: error => console.error('[ubean] Failed to load cron files:', error)
    });
  }

  enhanceAppWithVite(currentApp, currentLayouts);

  // 展示用 host：监听所有网卡（0.0.0.0/::）时 banner 的 Local/Scalar/OpenAPI 等
  // URL 统一走 localhost（对 0.0.0.0 发起 HTTP 在部分平台不可达），局域网可达性
  // 由 networkUrls 单独列出（对齐 Vite 的 Local/Network 双行展示）。
  const displayHost = isWildcardHost(host) ? 'localhost' : host;
  const getNetworkUrls = () =>
    isLoopbackHost(host) ? [] : getLanAddresses().map(address => `http://${address}:${actualPort}`);

  const getUrl = () => `http://${displayHost}:${actualPort}`;

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
        url: getUrl(),
        networkUrls: getNetworkUrls()
      });
    },

    async stop() {
      // Tear down in reverse order of construction: stop listening and drop
      // existing sockets first, then close Vite. Idle keep-alive connections
      // (browser tabs) and in-flight responses otherwise keep
      // `httpServer.close()`'s callback — and so the CLI's `process.exit()` —
      // from ever firing, leaving a zombie process that holds the port and
      // answers every request with an error. Dropping the sockets mirrors
      // Vite's own server close. Vite is closed last so that no request can
      // ever observe a half-torn-down server (see the `viteServer` guard in
      // the request handler).
      if (httpServer) {
        const server = httpServer;
        httpServer = null;
        await new Promise<void>(resolve => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
      }
      if (viteServer) {
        await viteServer.close();
        viteServer = null;
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
    },

    sendFullReload() {
      if (viteServer) {
        viteServer.ws.send({ type: 'full-reload' });
      }
    }
  };

  return instance;
}
