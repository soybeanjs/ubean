import type { UbeanApp } from '@ubean/app';
import { generateTypes, generateOpenApiTypesFromServer } from '@ubean/build/codegen';
import { createDevApp } from '@ubean/build/vite';
import { loadUbeanConfig } from '@ubean/config';
import type { ResolvedLoggingConfig } from '@ubean/config';
import {
  resolvePresetByName,
  registerBuiltinPresets,
  createCapabilitySet,
  diagnoseCapabilities,
  NODE_REQUIREMENTS
} from '@ubean/preset';
import { scanProject } from '@ubean/scan';
import type { ScanResult, ScannedLayout } from '@ubean/scan';
import { getLogger, setMinLevel } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { green, cyan, dim, bold } from 'kolorist';
import { relative, resolve } from 'pathe';
import { createDevRunner, logDiagnostics } from './dev-server';

const logger = getLogger('cli');

/**
 * Best-effort loader for the optional `@ubean/devtools` peer dependency.
 *
 * `getCustomTabs()` returns user-registered DevTools tabs (registered via
 * `defineDevToolsTab`). `@ubean/devtools` is an optional peer dep — when not
 * installed, fall back to an empty list. Future versions of `@ubean/devtools`
 * may expose `getCustomTabs` from its main entry; we try dynamic import on
 * startup and replace the placeholder if the export is available.
 */
let _customTabsGetter: () => any[] = () => [];
import('@ubean/devtools')
  .then((mod: any) => {
    if (mod && typeof mod.getCustomTabs === 'function') {
      _customTabsGetter = mod.getCustomTabs;
    }
  })
  .catch(() => {
    // @ubean/devtools not installed — fall back to empty list
  });

function getCustomTabs(): any[] {
  return _customTabsGetter();
}

/**
 * dev 环境 SecurityHeaders 解析（ADR-0011）。
 *
 * ssg 模式默认关闭：静态产物不携带框架注入的安全头（响应头由托管平台
 * 控制），dev 默认关闭以对齐生产行为，消除「dev 有 CSP / 线上没有」的
 * 偏差。显式配置（`headers: true` 或对象）仍会被尊重，作为 CSP 调试
 * 入口。其余模式默认开启不变。
 */
export function resolveDevSecurityHeaders(config: any): boolean | Record<string, unknown> {
  if (config.security === false) return false;
  if (config.security?.headers === false) return false;
  if (config.security?.headers !== undefined) return config.security.headers;
  return config.mode !== 'ssg';
}

export const devCommand: CommandDef = {
  meta: {
    name: 'dev',
    description: 'Start the ubean development server'
  },
  args: {
    port: {
      type: 'string',
      description: 'Port to listen on (overrides ubean.config.ts dev.port)'
    },
    host: {
      type: 'string',
      description: 'Host to listen on (overrides ubean.config.ts dev.host)'
    },
    strictPort: {
      type: 'boolean',
      description: 'Exit if the port is already in use, instead of auto-incrementing',
      default: false
    },
    verbose: {
      type: 'boolean',
      description: 'Show detailed startup logs (directories, scan, codegen, diagnostics, reload events)'
    },
    logRequests: {
      type: 'boolean',
      description: 'Log each request (GET /path 200 12ms). Ignored in ssg/spa modes.'
    },
    open: {
      type: 'boolean',
      description: 'Open browser on startup'
    },
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());

    registerBuiltinPresets();
    const config = await loadUbeanConfig(cwd);

    // ---- 日志分类闸门:CLI flag > ubean.config.ts logging > 模式矩阵 ----
    // 直接改写 resolved config(进程内单例),buildApp/vite-server 等下游统一读取。
    const logging: ResolvedLoggingConfig = config.logging;
    if (args.verbose) {
      logging.scan = true;
      logging.lifecycle = true;
      logging.diagnostics = true;
    }
    if (args.logRequests) {
      logging.request = true;
      logging.requestSuppressed = false;
    }
    const backendCapable = config.mode === 'fullstack' || config.mode === 'backend';
    if (logging.request && !backendCapable) {
      logging.request = false;
      logging.requestSuppressed = true;
    }
    if (logging.requestSuppressed) {
      logger.warn(`Request logging is not applicable in "${config.mode}" mode — skipping.`);
    }
    // 显式配置级别优先于 LOG_LEVEL 环境变量
    setMinLevel(logging.level);

    const startedAt = Date.now();
    if (logging.lifecycle) logger.info('Starting ubean dev server...');
    // 优先级：CLI flag > ubean.config.ts dev 字段 > loader 默认值（9527/localhost）。
    // CLI args 不能设 citty default，否则默认值会让 || 短路、config.dev 永远读不到。
    const port = Number(args.port) || config.dev.port;
    const host = args.host || config.dev.host;

    const preset = resolvePresetByName(config.build.preset);
    if (logging.scan) {
      logger.info(`Root directory: ${config.rootDir}`);
      logger.info(`Source directory: ${config.srcDir}`);
      logger.info(`Preset: ${preset.name}`);
    }

    const capabilities = createCapabilitySet(preset.capabilities || {});

    if (logging.scan) logger.info('Running capability diagnostics...');
    const diagnostics = diagnoseCapabilities(preset.name, preset.capabilities || {}, NODE_REQUIREMENTS);
    logDiagnostics(diagnostics, { verbose: logging.diagnostics });

    if (!diagnostics.valid) {
      logger.warn('Some capability requirements are not met. Dev server may not function correctly.');
    }

    // Latest scan result — kept mutable so the file-watcher can update it and
    // the DevTools plugin can read the freshest data via `getScanResult`.
    // Initialized with the initial scan so DevTools shows routes/pages
    // immediately on startup (not only after the first file change).
    let {
      app: currentApp,
      layouts: currentLayouts,
      scanResult: currentScanResult
    } = await buildApp(cwd, config, logging);

    /**
     * 每次扫描后重建宿主 app（RM-V13：由 dev-scan 协调器驱动）。
     *
     * 协调器已经统一做了「去抖 + 单飞 + 一次扫描」，这里只负责 ubean dev 特有的部分：
     * 生成类型、重建 Hono app、更新 runner。**不再自己发 `full-reload`** —— 协调器会在所有
     * 订阅者（含本函数）完成之后统一发，浏览器因此不会带着旧的 `definePage` 元数据刷新。
     */
    /**
     * `experimental.viteBuilder` 打开时，dev app 归插件所有（见 vite-server 的说明）：
     * 插件自举的 app 会随扫描重建，CLI 只保留命令级事务，不再自建一份。
     */
    const pluginOwnsDevApp = config.experimental?.viteBuilder === true;

    async function onScan(result: ScanResult, changed: string[]) {
      if (changed.length > 0) {
        const touched = changed.map(file => relative(cwd, file).replace(/\\/g, '/'));
        lastChangedFile = touched[0] ?? null;
        if (logging.lifecycle) logger.info(`File change detected: ${lastChangedFile}`);
      }
      reloadStartedAt = Date.now();

      try {
        if (logging.scan) logger.info('Scanning project files...');
        await generateTypes(result, {
          cwd,
          srcDir: config.srcDir,
          buildDir: '.ubean',
          dirs: config.dir,
          autoImports: config.autoImports,
          components: config.components
        });

        currentScanResult = result;

        if (pluginOwnsDevApp) {
          // RM-V14：`experimental.viteBuilder` 打开时 app 由插件自举并随扫描重建，CLI 只做
          // 命令级事务（上面的类型生成 + 这里的扫描结果上报），不再另建一份 app。
          return;
        }

        const { app, layouts } = await createDevApp({
          rootDir: cwd,
          config,
          scanResult: result,
          // 请求日志（`logging.request`）在 builder 内挂（RM-V14）：它是配置域行为，
          // `vite dev` 与 `ubean dev` 需要一致的输出。这里只把 CLI 的 logger 传进去。
          logger
        });
        currentApp = app;
        currentLayouts = layouts;

        runner.updateApp(currentApp, currentLayouts);
        await runner.reload();
      } catch (err) {
        logger.error(`Rescan failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Reload 周期计时与变更文件记录 —— 供 onAfterReload 收敛为单行反馈
    let reloadStartedAt = Date.now();
    let lastChangedFile: string | null = null;

    const runner = await createDevRunner({
      cwd,
      srcDir: config.srcDir,
      port,
      host,
      strictPort: args.strictPort,
      preset,
      config,
      capabilities,
      app: currentApp,
      layouts: currentLayouts,
      onScan,
      // DevTools data accessors — the Vite plugin reads these to build the
      // `DevToolsInfo` shared state, replacing the old RPC seeding pattern.
      devtools: {
        getScanResult: () => currentScanResult,
        getConfigMeta: () => ({
          preset: config.build.preset,
          rootDir: config.rootDir,
          srcDir: config.srcDir,
          openAPI: {
            enabled: true,
            scalarPath: '/_scalar',
            openAPIPath: '/_openapi.json'
          },
          dir: config.dir
        }),
        getCustomTabs: () => getCustomTabs(),
        triggerRescan: () => runner.rescan()
        // AI config is sourced from env vars (UBEAN_AI_API_KEY / OPENAI_API_KEY)
        // inside the plugin's `buildDevToolsInfo`.
      },
      onListen({ url, networkUrls }) {
        const label = (text: string) => dim(text);
        const modeSuffix = dim(` (${config.mode} · ${preset.name})`);
        const lines = [
          `${green(bold(`🚀 ubean dev server ready in ${Date.now() - startedAt}ms`))}${modeSuffix}\n`,
          `  → ${label('Local:')}      ${cyan(url)}`,
          // 监听所有网卡（host: 0.0.0.0）时逐行列出局域网可达地址（对齐 Vite 的 Network 展示）
          ...(networkUrls || []).map(n => `  → ${label('Network:')}    ${cyan(n)}`)
        ];
        // 仅 backend 相关模式(fullstack/backend)才提供 OpenAPI / 类型生成。
        // ssg / spa 模式无后端接口,避免打印误导性 banner 与无意义告警。
        const hasBackend = config.mode !== 'ssg' && config.mode !== 'spa';
        if (hasBackend) {
          lines.push(
            `  → ${label('Scalar UI:')}  ${cyan(`${url}/_scalar`)}`,
            `  → ${label('OpenAPI:')}    ${cyan(`${url}/_openapi.json`)}`
          );
        }
        if (config.devtools.enabled) {
          lines.push(`  → ${label('DevTools:')}   ${cyan(`${url}${config.devtools.route}`)}`);
        }
        lines.push(`  → ${dim('Press Ctrl+C to stop')}`);
        logger.info(lines.join('\n'));

        // 异步生成 OpenAPI 类型声明(不阻塞 server 启动)。无后端模式返回
        // null(跳过),无需告警。
        if (hasBackend) {
          generateOpenApiTypesFromServer(url, { outDir: resolve(cwd, '.ubean') })
            .then(filePath => {
              if (filePath && logging.scan) logger.info(`OpenAPI types generated: ${filePath}`);
            })
            .catch(err => {
              logger.warn(`Failed to generate OpenAPI types: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
      },
      onBeforeReload() {
        reloadStartedAt = Date.now();
        if (logging.lifecycle) logger.info('Reloading...');
      },
      onAfterReload() {
        if (logging.lifecycle) {
          logger.info('Reloaded');
        } else {
          // 默认收敛为单行反馈;文件触发时附带变更文件,DevTools 触发时省略
          const file = lastChangedFile ? dim(` · ${lastChangedFile}`) : '';
          logger.info(dim(`↻ Reloaded in ${Date.now() - reloadStartedAt}ms${file}`));
        }
        lastChangedFile = null;
      }
    });

    try {
      await runner.start();
    } catch (err: any) {
      // 输出完整堆栈：仅 message 无法定位插件/虚拟模块层的启动错误。
      logger.error(err?.stack || err?.message || String(err));
      process.exit(1);
    }

    // `locales` 与 builder 侧（builder/src/vite.ts 的 configureServer）保持一致，
    // 否则语言文件改动不会触发 rescan。
    // RM-V13：CLI 不再自建 fs.watch 监听。文件监听、去抖、扫描与重载顺序统一由
    // `@ubean/build` 的 dev-scan 协调器负责（复用 Vite 自己的 `server.watcher`），
    // 本进程只在 `onScan` 回调里重建 app（见上）。
    // 此前这里是第三套监听：判据与两个插件各不相同，且会与它们**各扫一遍盘**。
    const cleanup = async () => {
      if (logging.lifecycle) logger.info('\nShutting down...');
      await runner.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};

async function buildApp(
  cwd: string,
  config: any,
  logging: ResolvedLoggingConfig
): Promise<{ app: UbeanApp; layouts: ScannedLayout[]; scanResult: ScanResult }> {
  if (logging.scan) logger.info('Scanning project files...');
  const result = await scanProject({
    cwd,
    srcDir: config.srcDir,
    dirs: config.dir,
    ignore: config.scanOptions?.ignore
  });

  if (logging.scan) {
    logger.info(
      `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts, ${result.middlewares.length} middlewares, ${result.plugins.length} plugins`
    );
  }

  if (logging.scan) logger.info('Generating type definitions...');
  await generateTypes(result, {
    cwd,
    srcDir: config.srcDir,
    buildDir: '.ubean',
    dirs: config.dir,
    autoImports: config.autoImports,
    components: config.components
  });

  // app 的创建（RM-V11 起）在 `@ubean/build`：`vite dev` 场景下插件要能自己造出同一个 app，
  // 两边共用一份 options 装配，避免 dev 与插件路径的语义分叉。扫描结果复用上面这一次。
  const { app, layouts } = await createDevApp({
    rootDir: cwd,
    config,
    scanResult: result,
    // 请求日志（`logging.request`）在 builder 内挂（RM-V14）：配置域行为，
    // `vite dev` 与 `ubean dev` 需要一致的输出。这里只把 CLI 的 logger 传进去。
    logger
  });

  return { app, layouts, scanResult: result };
}

/**
 * RM-V14：请求日志（`logging.request`）不再由 CLI 实现 —— 见 `@ubean/build` 的
 * `createDevApp({ logger })`。配置域行为放 builder，两条 dev 路径输出一致。
 */
