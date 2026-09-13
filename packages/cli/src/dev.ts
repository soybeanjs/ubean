import { createUbeanApp } from '@ubean/app';
import { generateTypes, generateOpenApiTypesFromServer } from '@ubean/build/codegen';
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
import type { ScanResult } from '@ubean/scan';
import { getLogger, setMinLevel } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { green, cyan, dim, bold } from 'kolorist';
import { resolve } from 'pathe';
import { createDevRunner, createDevWatcher, logDiagnostics } from './dev-server';

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

    // Reusable rescan function — called by the file watcher AND by the
    // DevTools plugin (via `triggerRescan`) after CRUD operations so the
    // DevTools list updates immediately without waiting for the watcher's
    // debounce.
    let rescanInProgress = false;
    async function rescan() {
      if (rescanInProgress) return;
      rescanInProgress = true;
      try {
        const { app: newApp, layouts: newLayouts, scanResult } = await buildApp(cwd, config, logging);
        currentApp = newApp;
        currentLayouts = newLayouts;
        currentScanResult = scanResult;
        runner.updateApp(currentApp, currentLayouts);
        await runner.reload();
        // Trigger a full browser reload AFTER the server-side app has been
        // rebuilt with the latest `definePage` metadata. Previously the Vite
        // plugin's file watcher sent `full-reload` immediately — racing with
        // this debounced rescan and leaving the browser with stale route meta
        // (the "must restart server" symptom). Now the reload is sequenced:
        // scan → rebuild app → update runner → reload browser.
        runner.sendFullReload();
      } catch (err) {
        logger.error(`Rescan failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        rescanInProgress = false;
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
        triggerRescan: () => rescan()
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

    const watchDirs = ['api', 'pages', 'middleware', 'layouts', 'plugins', 'app', 'routes'];
    const watcher = createDevWatcher({
      cwd,
      dirs: watchDirs.map(d => `${config.srcDir}/${d}`),
      ignore: ['**/node_modules/**', '**/.git/**', '**/.ubean/**'],
      debounceMs: 150,
      async onChange(events) {
        const relevantEvents = events.filter(
          e => /\.(ts|js|vue|mjs|cjs|json)$/.test(e.relativePath) && !e.relativePath.includes('.bak')
        );

        if (relevantEvents.length === 0) return;

        lastChangedFile = relevantEvents[0].relativePath;
        if (logging.lifecycle) logger.info(`File change detected: ${lastChangedFile}`);
        await rescan();
      }
    });

    watcher.start();

    const cleanup = async () => {
      if (logging.lifecycle) logger.info('\nShutting down...');
      watcher.stop();
      await runner.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};

/** 默认跳过请求日志的内部路径前缀(`/_health`、`/_devtools`、`/_openapi.json`、Vite 内部 `/@id/...` 等)。 */
const REQUEST_LOG_INTERNAL_PREFIXES = ['/_', '/@'];

/** 请求日志中,超过该毫秒数的请求提升为 warn(慢请求告警)。 */
const REQUEST_LOG_SLOW_THRESHOLD = 1000;

async function buildApp(
  cwd: string,
  config: any,
  logging: ResolvedLoggingConfig
): Promise<{ app: ReturnType<typeof createUbeanApp>; layouts: any[]; scanResult: ScanResult }> {
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

  const app = createUbeanApp({
    rootDir: cwd,
    routes: result.apiRoutes,
    middleware: result.middlewares,
    pages: result.pages,
    crons: result.crons,
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
    notFoundPage: result.notFoundPage,
    csrf: config.security === false ? false : (config.security?.csrf ?? true),
    securityHeaders: resolveDevSecurityHeaders(config),
    dataCache: config.dataCache,
    cache: config.cache,
    seoConventions: { srcDir: resolve(cwd, config.srcDir) }
  });

  // 请求日志(request 分类):默认关闭,`logging.request: true` 或 --log-requests 打开。
  // ssg/spa 模式在 CLI 层已被强制关闭。挂点用 app hooks(requestId 中间件之后),
  // 资源/模块请求在 Vite 中间件层即被消费,不会进入这里 —— 天然只记录应用请求。
  const requestStartTimes = new WeakMap<object, number>();
  const isInternalPath = (path: string) => REQUEST_LOG_INTERNAL_PREFIXES.some(p => path.startsWith(p));

  app.hooks.hook('request:start', c => {
    requestStartTimes.set(c, Date.now());
    // 深度诊断仍可用 LOG_LEVEL=debug 打开(与 request 分类正交)
    logger.debug(`${c.req.method} ${c.req.path}`);
  });

  app.hooks.hook('request:end', (c, res) => {
    if (!logging.request) return;
    const start = requestStartTimes.get(c);
    const duration = start === undefined ? 0 : Date.now() - start;
    const line = `${c.req.method} ${c.req.path} ${res.status} ${duration}ms`;
    // 5xx 永远可见(即使内部路径);内部路径的成功请求不打扰终端
    if (res.status >= 500) {
      logger.error(line);
      return;
    }
    if (isInternalPath(c.req.path)) return;
    if (res.status >= 400 || duration >= REQUEST_LOG_SLOW_THRESHOLD) logger.warn(line);
    else logger.info(line);
  });

  app.hooks.hook('request:error', (c, err) => {
    if (!logging.request) return;
    logger.error(`${c.req.method} ${c.req.path} ERROR ${err instanceof Error ? err.message : String(err)}`);
  });

  return { app, layouts: result.layouts, scanResult: result };
}
