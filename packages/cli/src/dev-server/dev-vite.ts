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
 * 保留一处 CLI 专有接线（无法下沉）：`@ubean/devtools` / `@devframes/vite` 的按需加载
 * （可选依赖 + `config.devtools.enabled` 闸门）。DevTools 的 scaffold CRUD 由注入的
 * `scaffoldOps` 提供。
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
  /**
   * 重建 DevTools 快照并经 sharedState 推给已连接的面板。由 `onScan` 调用 ——
   * 没有它，面板只在首次加载时拿到数据，之后一直停在旧快照。
   */
  refreshDevtools(): void;
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
  // DevTools devframe 把它的刷新回调登记在这里；扫描完成后调它，把新快照经 sharedState
  // 推给已连接的面板（取代旧的 3s 轮询）。
  let refreshDevtools: (() => void) | undefined;
  // DevTools hub 插件。必须在 `ubeanDevRequestPlugin` **之前**（见下方 builtinPlugins 注释）。
  const devtoolsPlugins: Plugin[] = [];

  if (devtoolsEnabled) {
    // DevTools 的 hub：`@devframes/vite/hub` 的 `viteDevframeHub()` 在 Vite dev server 里挂
    // 一个完整 hub（一个 WebSocket、一套 RPC 注册表、一套认证门），ubean 的 DevTools 只是挂上去的
    // 一个 devframe。之前由 `@vitejs/devtools`（DTK）提供的面板外壳、dock 侧栏、连接元数据
    // 现在全部由 hub + `@devframes/hub-ui` 提供。
    //
    // `quiet: true` 关掉该插件的一次性建议（它会推荐改用 DTK —— 我们正是有意不用 DTK：
    // DTK 把 `vite` 的 `devtools` 选项当入口，而 ubean 需要 hub 能在**没有** `@vitejs/devtools`
    // 的机器上工作，且不想让 Vite 自己再插一套客户端脚本）。
    try {
      const [{ viteDevframeHub }, { createUbeanDevframe, UBEAN_ANCHOR_DOCK }] = await Promise.all([
        import('@devframes/vite/hub'),
        import('@ubean/devtools')
      ]);
      const devframe = createUbeanDevframe({
        getScanResult: options.devtools?.getScanResult as never,
        getConfigMeta: options.devtools?.getConfigMeta as never,
        getCustomTabs: options.devtools?.getCustomTabs,
        getCwd: () => cwd,
        scaffoldOps: { createFsOps, scaffold, deleteScaffold, recoverScaffold },
        getApp: () => getDevApp(viteServer!) ?? undefined,
        triggerRescan: async () => {
          await rescanDev();
        },
        basePath: `${config.devtools.route.replace(/\/$/, '')}/`,
        registerRefresh: fn => {
          refreshDevtools = fn;
        }
      });

      devtoolsPlugins.push(
        viteDevframeHub({
          // `dock` 覆盖必须走这个入口，**不能**写在 `DevframeDefinition.dock` 里：
          // `frameId` / `subTabs` / `visibility` 属于 `DevframeViewIframe`，而
          // `DevframeDockDefaults`（`def.dock` 的类型）只有 title/icon/category/order/…
          // 少了 `subTabs`，hub 就不会给这个 iframe 挂 frame-nav 适配器，
          // SPA 上报的视图清单永远不会变成 dock 按钮（面板只剩一个空壳 iframe）。
          devframes: [{ devframe, dock: UBEAN_ANCHOR_DOCK }],
          quiet: true,
          // `auth: false` —— hub 默认开交互式 OTP（“Authorize Devframes” 屏），而旧 DevTools
          // 从来没有这一步（CLI 以前设 `VITE_DEVTOOLS_DISABLE_CLIENT_AUTH=true` +
          // `clientAuth: false`）。dev server 已经默认只绑 localhost，再加一道一次性口令
          // 只会把用户挡在面板外。需要时用户可自己给 `devtools` 配认证。
          auth: false
        }) as Plugin
      );
    } catch {
      // `@ubean/devtools` 或 `@devframes/vite` 未安装 —— 静默跳过（可选依赖）
    }
  }

  const builtinPlugins: Plugin[] = [
    // DevTools hub 排在最前：它要在应用请求路由（`ubeanDevRequestPlugin` 的 `pre` 中间件）
    // 之前拿到 `/_devtools` 与 hub base 下的全部请求。`DEVTOOLS_PASS_THROUGH_PREFIXES`
    // 仍然必要 —— `pre` 中间件可能先于 hub 的 `nodeMiddleware` 拿到请求。
    ...devtoolsPlugins,
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
    // 注意：**不再**传 Vite 的 `devtools` 选项 —— 那个选项是 DTK（`@vitejs/devtools`）的入口。
    // 面板现在由 `@devframes/vite/hub` 挂的 hub 提供，DTK 不再参与。
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
    refreshDevtools() {
      refreshDevtools?.();
    },
    async stop() {
      const server = viteServer;
      viteServer = null;
      await server?.close();
    }
  };
}
