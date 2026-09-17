/**
 * dev 的 Vite 装配（RM-V14：取代 `vite-server.ts` + `runner.ts`）。
 *
 * CLI 不再自建 app、不再持有 HTTP server、也不再管热重载：
 * - **请求路由**与**宿主 app** 由 `@ubean/build` 的 `ubeanDevRequestPlugin` 负责（自举 +
 *   随扫描重建）；
 * - **文件监听与重载顺序**由 `dev-scan` 协调器负责；
 * - CLI 只装配插件、起 Vite server、打印 banner，并订阅扫描做命令级事务（类型生成、
 *   DevTools 数据上报）。
 *
 * 保留两处 CLI 专有接线（无法下沉）：`@ubean/devtools` / `@vitejs/devtools` 的按需加载
 * （可选依赖 + `config.devtools.enabled` 闸门），以及 DevTools 的 scaffold CRUD
 * （页面增删改是 CLI 的能力）。
 */
import { createServer as createViteServer } from 'vite';
import type { Logger, Plugin, ViteDevServer } from 'vite';
import {
  createVirtualRegistry,
  DEVTOOLS_PASS_THROUGH_PREFIXES,
  getDevApp,
  onDevScan,
  peekDevScanCoordinator,
  ubeanDevRequestPlugin,
  ubeanPlugin
} from '@ubean/build/vite';
import { ubeanVite } from '@ubean/build/vue';
import { resolveModules } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
import type { ScanResult } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import { findUserViteConfig, getLanAddresses, isLoopbackHost, isWildcardHost } from '@ubean/shared/node';
import { createFsOps } from '../shared/fs-ops';
import { deleteScaffold, recoverScaffold, scaffold } from '../page';

const logger = getLogger('dev-server');

/**
 * 收编 Vite 原生日志到 ubean 分类闸门：`lifecycle` 关闭时（默认）info 降为 debug，
 * warn/error 原样保留（这两级永远可见）。
 */
function createGatedViteLogger(logging: { lifecycle: boolean }): Logger {
  return {
    info: (msg: string) => logger.debug(msg),
    warn: (msg: string) => logger.warn(msg),
    warnOnce: (msg: string) => logger.warn(msg),
    error: (msg: string, options?: { error?: Error }) => logger.error(options?.error ? `${msg} ${options.error}` : msg),
    clearScreen: () => {},
    hasWarned: false,
    ...(logging.lifecycle ? { info: (msg: string) => logger.info(msg) } : {})
  } as unknown as Logger;
}

export interface DevViteServerOptions {
  cwd: string;
  host: string;
  port: number;
  strictPort?: boolean;
  config: UbeanResolvedConfig;
  /** DevTools 数据访问器（`@ubean/devtools` 插件读取）。类型保持宽松：devtools 是可选依赖。 */
  devtools?: {
    getScanResult?: () => ScanResult | null;
    getConfigMeta?: () => Record<string, unknown> | null;
    getCustomTabs?: () => Array<{ id: string; label: string; icon?: string; src: string; sandbox?: string[] }>;
  };
  onListen?: (info: { port: number; host: string; url: string; networkUrls: string[] }) => void;
  /** 每次扫描后的回调（CLI 用它做类型生成与 DevTools 上报）。 */
  onScan?: (result: ScanResult, changed: string[]) => void | Promise<void>;
}

export interface DevViteServer {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly viteServer: ViteDevServer;
  /** 手动触发一次扫描（DevTools CRUD 后即时刷新）。 */
  rescan(): Promise<void>;
  stop(): Promise<void>;
}

export async function createDevViteServer(options: DevViteServerOptions): Promise<DevViteServer> {
  const { cwd, config, host, strictPort = false } = options;
  const devtoolsEnabled = config.devtools.enabled;
  // 用户 `vite.config.ts` 里的 `ubeanPlugin()` 已带上自举版请求路由插件；CLI 只在**用户没有**
  // 该文件时补一个，两个 pre 中间件都认领应用请求会让先注册的胜出、另一个成为影子。
  const userViteConfig = findUserViteConfig(cwd);
  const hasUserViteConfig = !!userViteConfig;
  const isBackendMode = config.mode === 'backend';

  // 闭包在 server 建好后读取它（插件必须在 createViteServer 之前给出，因此只能延后取值）
  let viteServer: ViteDevServer | null = null;
  const rescanDev = () => peekDevScanCoordinator(viteServer!)?.rescan();

  const builtinPlugins: Plugin[] = [
    ...(hasUserViteConfig
      ? []
      : [
          // 重定向与 `passThrough` 都由请求插件自己处理（顺序敏感，见其选项说明）
          ubeanDevRequestPlugin({
            passThrough: devtoolsEnabled ? [...DEVTOOLS_PASS_THROUGH_PREFIXES] : [],
            devtoolsRedirect: devtoolsEnabled
          })
        ]),
    ...(hasUserViteConfig
      ? []
      : [
          // RM-V02：dev 也用显式注入的注册表，core 与 vue 共享同一实例（不走模块级单例）
          ubeanPlugin({ config, registry: createVirtualRegistry() }),
          ...(isBackendMode ? [] : ubeanVite({ config, registry: createVirtualRegistry() })),
          ...(isBackendMode ? [] : [ubeanIslandsPlugin()])
        ])
  ];

  if (devtoolsEnabled) {
    process.env.VITE_DEVTOOLS_DISABLE_CLIENT_AUTH = 'true';

    try {
      const { ubeanDevtoolsPlugin } = await import('@ubean/devtools');
      builtinPlugins.push(
        ubeanDevtoolsPlugin({
          getScanResult: options.devtools?.getScanResult as never,
          getConfigMeta: options.devtools?.getConfigMeta as never,
          getCustomTabs: options.devtools?.getCustomTabs,
          getCwd: () => cwd,
          scaffoldOps: { createFsOps, scaffold, deleteScaffold, recoverScaffold },
          getApp: () => getDevApp(viteServer!) ?? undefined,
          triggerRescan: async () => {
            await rescanDev();
          }
        }) as Plugin
      );
    } catch {
      // `@ubean/devtools` 未安装 —— 静默跳过（它是可选依赖）
    }

    try {
      const { DevTools } = await import('@vitejs/devtools');
      builtinPlugins.push(...((await DevTools({ builtinDevTools: false })) as unknown as Plugin[]));
    } catch {
      // `@vitejs/devtools` 不可用 —— 静默跳过
    }
  }

  const { plugins } = await resolveModules({ cwd, config, builtinPlugins });

  viteServer = await createViteServer({
    root: cwd,
    // 有用户 vite.config 时由它提供 ubean 插件（其 `ubeanPlugin()` 从缓存取 config）；
    // 没有则完全由 builtin plugins 提供。
    configFile: userViteConfig ?? false,
    customLogger: createGatedViteLogger({ lifecycle: config.logging.lifecycle }),
    resolve: {
      // pnpm 的 peer 变体可能装出多份 vue-router。它的注入键是**实例级 Symbol**，SSR 侧
      // provide 的 router 与组件侧 inject 必须同一份，因此强制去重到根副本。
      dedupe: ['vue', 'vue-router']
    },
    server: { host, port: options.port, strictPort },
    appType: 'custom',
    plugins,
    devtools: { enabled: devtoolsEnabled, clientAuth: false },
    optimizeDeps: {
      exclude: [
        'ubean',
        'vue-router',
        'virtual:ubean-pages',
        'virtual:ubean-app',
        'virtual:ubean-server',
        'virtual:ubean-client-entry',
        'ubean:locales',
        'ubean:pages',
        'ubean:routes',
        'ubean:meta',
        'ubean:app-config'
      ]
    },
    ssr: {
      // 内联 `@ubean/*` 运行时：Node-external 时各包从自身 node_modules 解析 vue-router，
      // 会被 peer 变体劈成多份实例（注入键为实例级 Symbol）→ SSR 渲染直接崩。
      noExternal: ['ubean', /^@ubean\//],
      external: ['@ubean/i18n']
    }
  });

  if (options.onScan) {
    onDevScan(viteServer, options.onScan);
  }

  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const actualPort = address && typeof address === 'object' ? address.port : options.port;

  const displayHost = isWildcardHost(host) ? 'localhost' : host;
  const url = `http://${displayHost}:${actualPort}`;
  const networkUrls = isLoopbackHost(host)
    ? []
    : getLanAddresses().map(lanAddress => `http://${lanAddress}:${actualPort}`);

  options.onListen?.({ port: actualPort, host, url, networkUrls });

  return {
    get port() {
      return actualPort;
    },
    get host() {
      return host;
    },
    get url() {
      return url;
    },
    get viteServer() {
      return viteServer!;
    },
    async rescan() {
      await rescanDev();
    },
    async stop() {
      const server = viteServer;
      viteServer = null;
      await server?.close();
    }
  };
}
