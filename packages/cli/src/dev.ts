import { generateTypes, generateOpenApiTypesFromServer } from '@ubean/build/codegen';
import { loadUbeanConfig } from '@ubean/config';
import type { ResolvedLoggingConfig } from '@ubean/config';
import { resolvePresetByName, registerBuiltinPresets, diagnoseCapabilities, NODE_REQUIREMENTS } from '@ubean/preset';
import { scanProject } from '@ubean/scan';
import type { ScanResult } from '@ubean/scan';
import { getLogger, setMinLevel } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { green, cyan, dim, bold } from 'kolorist';
import { relative, resolve } from 'pathe';
import { createDevViteServer, logDiagnostics } from './dev-server';
import type { DevViteServer } from './dev-server';

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

    // 类型声明的生成权归 CLI（下方每次扫描都会 generateTypes）——告诉 Vite 插件不要再跑一遍。
    // 插件侧读这个标志见 `@ubean/build` 的 `runProjectCodegen`；没有它（裸 `vite dev`）时由插件自己
    // 生成，否则 `.ubean/*.d.ts` 在裸 Vite 路径下根本不产出。
    process.env.UBEAN_CODEGEN_BY_CLI = '1';

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

    if (logging.scan) logger.info('Running capability diagnostics...');
    const diagnostics = diagnoseCapabilities(preset.name, preset.capabilities || {}, NODE_REQUIREMENTS);
    logDiagnostics(diagnostics, { verbose: logging.diagnostics });

    if (!diagnostics.valid) {
      logger.warn('Some capability requirements are not met. Dev server may not function correctly.');
    }

    // 初始扫描：DevTools 启动时就要有数据（不必等第一次文件变更），codegen 也用它。
    // app 本身不在这里建（RM-V14：由 `ubeanDevRequestPlugin` 自举），CLI 只保留数据与类型。
    let currentScanResult = await initialScan(cwd, config, logging);

    /**
     * 扫描后的命令级事务（RM-V13：扫描由 dev-scan 协调器驱动）。
     *
     * app 的重建不在这里 —— 它归 `ubeanDevRequestPlugin`（RM-V14）。CLI 负责把类型定义重新
     * 生成，并把新扫描结果交给 DevTools。**重载不由 CLI 发**：协调器会在所有订阅者完成后统一发
     * `full-reload`，因此浏览器不会带着旧的 `definePage` 元数据刷新。
     */
    async function onScan(result: ScanResult, changed: string[]) {
      if (changed.length > 0) {
        lastChangedFile = relative(cwd, changed[0]).replace(/\\/g, '/');
        if (logging.lifecycle) logger.info(`File change detected: ${lastChangedFile}`);
      }
      currentScanResult = result;

      try {
        await generateTypes(result, {
          cwd,
          srcDir: config.srcDir,
          buildDir: '.ubean',
          dirs: config.dir,
          autoImports: config.autoImports,
          components: config.components
        });
      } catch (err) {
        logger.error(`Rescan failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    let lastChangedFile: string | null = null;

    let devServer: DevViteServer | null = null;
    try {
      devServer = await createDevViteServer({
        cwd,
        port,
        host,
        strictPort: args.strictPort,
        config,
        onScan,
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
          getCustomTabs: () => getCustomTabs()
          // AI config 由插件从环境变量（UBEAN_AI_API_KEY / OPENAI_API_KEY）读取
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
        }
      });
    } catch (err: any) {
      // 输出完整堆栈：仅 message 无法定位插件/虚拟模块层的启动错误。
      logger.error(err?.stack || err?.message || String(err));
      process.exit(1);
    }

    // RM-V13/V14：文件监听、去抖、扫描与重载顺序全在 `@ubean/build` 的 dev-scan 协调器
    // （复用 Vite 自己的 server.watcher）；app 由 `ubeanDevRequestPlugin` 自举并在扫描后重建。
    // 本进程只订阅扫描做命令级事务（类型生成 + DevTools 上报）。
    const cleanup = async () => {
      if (logging.lifecycle) logger.info('\nShutting down...');
      await devServer?.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};

/**
 * 初始扫描 + 类型生成。
 *
 * RM-V14 起 CLI 不在这里建 app（由 `ubeanDevRequestPlugin` 自举），只负责扫描与 codegen；
 * 扫描结果交给 DevTools 作启动数据，并在每次文件变更后由 `onScan` 刷新。
 */
async function initialScan(cwd: string, config: any, logging: ResolvedLoggingConfig): Promise<ScanResult> {
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
    logger.info('Generating type definitions...');
  }
  await generateTypes(result, {
    cwd,
    srcDir: config.srcDir,
    buildDir: '.ubean',
    dirs: config.dir,
    autoImports: config.autoImports,
    components: config.components
  });

  return result;
}

/**
 * RM-V14：请求日志（`logging.request`）不再由 CLI 实现 —— 见 `@ubean/build` 的
 * `createDevApp({ logger })`。配置域行为放 builder，两条 dev 路径输出一致。
 */
