import type { Logger } from 'vite';
/**
 * 宿主 dev app 的创建与自举（RM-V11）。
 *
 * 与同目录 `dev-host-app.ts` 的分工：
 * - `enhanceDevApp()`：把 Vite SSR 图的加载器/渲染器**接到**一个已存在的 app 上；
 * - 本模块：**创建**那个 app（扫描 → `createUbeanApp`），并负责首次请求前的 ready 流程。
 *
 * 之所以要从 CLI 搬进来：ADR-0012 §3 的目标形态是 Vite 持有 server、框架插件自举 ——
 * 插件拿不到「CLI 造好的 app」，就必须能自己造。
 *
 * 三个出口按依赖递增排列，调用方按自己拿得到的东西选：
 * 1. `createDevApp()` —— 不需要 Vite server（CLI 的 dev 命令用它）；
 * 2. `createDevAppReady()` —— 需要一个 `loadModule`（`server.ssrLoadModule`）；
 * 3. `bootstrapDevApp()` —— 两者 + `enhanceDevApp`，即插件自举时的完整入口。
 *
 * 日志策略（请求日志的级别与过滤）刻意不搬：那是 CLI 的 `logging` 配置域与终端呈现，
 * 由调用方通过 `configureApp` 挂 hook，builder 只保证结构。
 */
import { applyServerConfig, createUbeanApp } from '@ubean/app';
import type { UbeanApp } from '@ubean/app';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { getVueLocaleParam } from '@ubean/i18n';
import type { PageRenderer } from '@ubean/pages';
import { scanProject } from '@ubean/scan';
import type { ScanResult, ScannedLayout } from '@ubean/scan';
import { enhanceDevApp } from './dev-host-app';
import type { DevRendererOptions } from './dev-host-app';

/** 本模块用到的最小 logger 面（与 Vite 的 `Logger` 兼容，便于直接传 `server.config.logger`）。 */
export type BootstrapLogger = Pick<Logger, 'warn' | 'error'>;

const fallbackLogger: BootstrapLogger = {
  warn: message => console.warn(message),
  error: message => console.error(message)
};

export interface CreateDevAppOptions {
  rootDir: string;
  config: UbeanResolvedConfig;
  /**
   * 已扫描的结果。调用方若为其它目的（如 codegen）已经扫过盘，传进来即可避免二次扫描。
   */
  scanResult?: ScanResult;
  /** dev 安全头配置（CLI 会按 `--no-security` 等命令行覆盖）。缺省按 `config.security` 推导。 */
  securityHeaders?: boolean | Record<string, unknown>;
  /** 额外的 app 装配（CLI 用它挂请求日志 hook）。 */
  configureApp?: (app: UbeanApp) => void;
}

export interface DevApp {
  app: UbeanApp;
  scanResult: ScanResult;
  layouts: ScannedLayout[];
}

/** 扫描（可选）并创建 dev 用的宿主 app —— 不需要 Vite server。 */
export async function createDevApp(options: CreateDevAppOptions): Promise<DevApp> {
  const { rootDir, config, configureApp } = options;

  const scanResult =
    options.scanResult ??
    (await scanProject({
      cwd: rootDir,
      srcDir: config.srcDir,
      dirs: config.dir,
      ignore: config.scanOptions?.ignore
    }));

  const app = createUbeanApp({
    rootDir,
    routes: scanResult.apiRoutes,
    middleware: scanResult.middlewares,
    pages: scanResult.pages,
    crons: scanResult.crons,
    routeRules: config.routeRules || {},
    publicDir: config.dir.public,
    pageAssetTags: config.favicon ? { favicon: config.favicon } : undefined,
    openAPI: {
      title: 'UBEAN Dev API',
      scalarPath: '/_scalar',
      openAPIPath: '/_openapi.json'
    },
    i18nConfig: config.i18n,
    ssrExclude: config.ssr.exclude,
    streaming: config.ssr.streaming,
    notFoundPage: scanResult.notFoundPage,
    csrf: config.security === false ? false : (config.security?.csrf ?? true),
    securityHeaders: options.securityHeaders ?? resolveDevSecurityHeaders(config),
    dataCache: config.dataCache,
    // `store: 'auto'` 是**构建期**概念（生产 Node 系落 fs，serverless 落内存），而
    // `createUbeanApp` 只认 `'fs' | 'memory'`，非 `'fs'` 一律走内存 —— 恰是 dev 的语义。
    // 这里显式归一化而不是把 `'auto'` 透传（透传在类型上不合法，也会把语义留给读者猜）。
    cache: config.cache?.store === 'fs' ? { store: 'fs' as const, dir: config.cache.dir } : { dir: config.cache?.dir },
    seoConventions: { srcDir: config.srcDir }
  });

  configureApp?.(app);

  return { app, scanResult, layouts: scanResult.layouts };
}

export interface DevAppReadyOptions {
  app: UbeanApp;
  /** 经 Vite SSR 图加载模块（`server.ssrLoadModule`）。 */
  loadModule: (id: string) => Promise<unknown>;
  logger?: BootstrapLogger;
}

export interface DevAppReady {
  /** 幂等：同一个 app 实例内只做一次真正的初始化，后续请求复用同一个 promise。 */
  (): Promise<void>;
  /** ready 之后可读到用户的 server 配置（`onServerReady` 等）。 */
  serverConfig(): { onServerReady?: (app: UbeanApp) => unknown } | null;
}

/**
 * 首次处理请求前的初始化：加载 locales、应用用户 `defineServer` 配置、`app.init()`、
 * 调一次 `onServerReady`。
 *
 * 每次 app 实例更换后都要重新建一个（CLI 的 `updateApp` / HMR 之后）：新实例需要重新应用
 * 配置并重新走 init，旧实例的 ready 缓存不能复用。
 */
export function createDevAppReady(options: DevAppReadyOptions): DevAppReady {
  const { app, loadModule } = options;
  const logger = options.logger ?? fallbackLogger;

  let readyPromise: Promise<void> | null = null;
  let cachedServerConfig: { onServerReady?: (app: UbeanApp) => unknown } | null = null;
  let serverReadyCalled = false;

  const ready = (() => {
    readyPromise ??= (async () => {
      // locales 按请求经 createI18nMiddleware.loadMessages 加载；这里先触发一次，让本地化
      // 消息与路由中间件在同一份 Vite 模块图里就位。
      try {
        await loadModule('ubean:locales');
      } catch (error) {
        logger.warn(`[ubean] Failed to resolve locales module: ${String(error)}`);
      }

      // 用户的 defineServer 配置必须在首次 init() 之前应用。
      try {
        const serverMod = (await loadModule('virtual:ubean-server')) as {
          resolveServerConfig?: (mode: string) => { onServerReady?: (app: UbeanApp) => unknown };
        };
        if (serverMod?.resolveServerConfig) {
          cachedServerConfig = serverMod.resolveServerConfig('dev');
          await applyServerConfig(app, cachedServerConfig as never);
        }
      } catch (error) {
        logger.warn(`[ubean] Failed to load server config: ${String(error)}`);
      }

      await app.init();

      if (!serverReadyCalled) {
        serverReadyCalled = true;
        if (cachedServerConfig?.onServerReady) {
          try {
            await cachedServerConfig.onServerReady(app);
          } catch (error) {
            logger.warn(`[ubean] onServerReady error: ${String(error)}`);
          }
        }
      }
    })();
    return readyPromise;
  }) as DevAppReady;

  ready.serverConfig = () => cachedServerConfig;
  return ready;
}

export interface BootstrapDevAppOptions extends CreateDevAppOptions {
  /** 经 Vite SSR 图加载模块（`server.ssrLoadModule`）。 */
  loadModule: (id: string) => Promise<unknown>;
  /** 渲染器工厂，必须取自 Vite SSR 图（见 `DevRendererOptions`）。 */
  createRenderer: (options: DevRendererOptions) => PageRenderer;
  /** crons 加载完后的启动钩子。 */
  startCronScheduler?: () => unknown;
  logger?: BootstrapLogger;
}

export interface DevAppBootstrap extends DevApp {
  ready: DevAppReady;
  /**
   * 扫描结果变化后重建 app（新页面 / 新路由文件必须被注册）。
   *
   * 插件自举路径（`vite dev`）靠它保持 dev 行为与 CLI 一致：CLI 路径有自己的 `onScan`
   * 订阅者重建 app，插件路径则在自举 handler 里订阅同一次扫描 —— 两条路径各自只重建一次。
   */
  rebuild(scanResult: ScanResult): Promise<void>;
}

/**
 * 插件自举入口：创建 app → 接上 Vite SSR 图 → 准备好 ready。
 *
 * `vite dev` 场景下由框架插件调用（无 CLI 参与）；`ubean dev` 目前分两步调用
 * （`createDevApp` 在 CLI、`createDevAppReady` 在 dev server），因为 CLI 需要在 Vite server
 * 建起来之前就把 app 交给 DevTools/runner。RM-V12 摘除 CLI 的 server 层后两者会合并。
 */
export async function bootstrapDevApp(options: BootstrapDevAppOptions): Promise<DevAppBootstrap> {
  const created = await createDevApp(options);

  const enhance = (target: UbeanApp, targetLayouts: ScannedLayout[]) =>
    enhanceDevApp({
      app: target,
      layouts: targetLayouts,
      loadModule: options.loadModule,
      createRenderer: options.createRenderer,
      localeVueParam: resolveLocaleVueParam(options.config),
      backend: options.config.mode === 'backend',
      startCronScheduler: options.startCronScheduler,
      onCronError: error =>
        (options.logger ?? fallbackLogger).error(`[ubean] Failed to load cron files: ${String(error)}`)
    });

  // ready 必须绑在「当前」app 实例上：重建后要重新应用 defineServer 配置并重新 init，
  // 旧实例的 ready 缓存不能复用（与 CLI 的 updateApp 语义一致）。
  const bootstrap: DevAppBootstrap = {
    app: created.app,
    scanResult: created.scanResult,
    layouts: created.layouts,
    ready: createDevAppReady({ app: created.app, loadModule: options.loadModule, logger: options.logger }),
    async rebuild(scanResult) {
      const next = await createDevApp({ ...options, scanResult });
      bootstrap.app = next.app;
      bootstrap.scanResult = next.scanResult;
      bootstrap.layouts = next.layouts;
      bootstrap.ready = createDevAppReady({ app: next.app, loadModule: options.loadModule, logger: options.logger });
      enhance(next.app, next.layouts);
    }
  };

  enhance(bootstrap.app, bootstrap.layouts);

  return bootstrap;
}

/**
 * `config.security` → dev 安全头默认值。
 *
 * ssg 模式默认关闭：静态产物没有框架运行时的安全头，dev 下也没有需要保护的服务端渲染面。
 */
export function resolveDevSecurityHeaders(config: UbeanResolvedConfig): boolean | Record<string, unknown> {
  const security = config.security;
  if (security === false) return false;
  if (security?.headers === false) return false;
  if (security?.headers !== undefined) return security.headers;
  return config.mode !== 'ssg';
}

/**
 * locale param 必须与客户端 `virtual:ubean-pages` 的路由表一致，否则 `/zh/xxx` 在服务端
 * 落不到对应路由（会掉进 404 catch-all），而客户端渲染的是真实页面 → 水合不一致。
 * i18n 未启用或不需要前缀时返回空串。
 */
export function resolveLocaleVueParam(config: UbeanResolvedConfig): string {
  const i18n = config.i18n;
  if (!i18n?.enabled || !i18n.locales?.length) return '';
  return getVueLocaleParam({
    defaultLocale: i18n.defaultLocale,
    locales: i18n.locales.map(l => l.code),
    strategy: i18n.strategy
  });
}
