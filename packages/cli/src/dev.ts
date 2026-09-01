import { createUbeanApp } from '@ubean/app';
import { generateTypes, generateOpenApiTypesFromServer } from '@ubean/build/codegen';
import { loadUbeanConfig } from '@ubean/config';
import {
  resolvePresetByName,
  registerBuiltinPresets,
  createCapabilitySet,
  diagnoseCapabilities,
  NODE_REQUIREMENTS
} from '@ubean/preset';
import { scanProject } from '@ubean/scan';
import type { ScanResult } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
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

export const devCommand: CommandDef = {
  meta: {
    name: 'dev',
    description: 'Start the ubean development server'
  },
  args: {
    port: {
      type: 'string',
      description: 'Port to listen on',
      default: '9527'
    },
    host: {
      type: 'string',
      description: 'Host to listen on',
      default: 'localhost'
    },
    strictPort: {
      type: 'boolean',
      description: 'Exit if the port is already in use, instead of auto-incrementing',
      default: false
    },
    open: {
      type: 'boolean',
      description: 'Open browser on startup',
      default: false
    },
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.info('Starting ubean dev server...');

    registerBuiltinPresets();
    const config = await loadUbeanConfig(cwd);
    const port = Number(args.port) || config.dev.port;
    const host = args.host || config.dev.host;

    logger.info(`Root directory: ${config.rootDir}`);
    logger.info(`Source directory: ${config.srcDir}`);

    const preset = resolvePresetByName(config.build.preset);
    logger.info(`Preset: ${preset.name}`);

    const capabilities = createCapabilitySet(preset.capabilities || {});

    logger.info('Running capability diagnostics...');
    const diagnostics = diagnoseCapabilities(preset.name, preset.capabilities || {}, NODE_REQUIREMENTS);
    logDiagnostics(diagnostics);

    if (!diagnostics.valid) {
      logger.warn('Some capability requirements are not met. Dev server may not function correctly.');
    }

    // Latest scan result — kept mutable so the file-watcher can update it and
    // the DevTools plugin can read the freshest data via `getScanResult`.
    // Initialized with the initial scan so DevTools shows routes/pages
    // immediately on startup (not only after the first file change).
    let { app: currentApp, layouts: currentLayouts, scanResult: currentScanResult } = await buildApp(cwd, config);

    // Reusable rescan function — called by the file watcher AND by the
    // DevTools plugin (via `triggerRescan`) after CRUD operations so the
    // DevTools list updates immediately without waiting for the watcher's
    // debounce.
    let rescanInProgress = false;
    async function rescan() {
      if (rescanInProgress) return;
      rescanInProgress = true;
      try {
        const { app: newApp, layouts: newLayouts, scanResult } = await buildApp(cwd, config);
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
      onListen({ url }) {
        const label = (text: string) => dim(text);
        const lines = [
          `${green(bold('🚀 ubean dev server ready'))}\n`,
          `  → ${label('Local:')}      ${cyan(url)}`,
          `  → ${label('Scalar UI:')}  ${cyan(`${url}/_scalar`)}`,
          `  → ${label('OpenAPI:')}    ${cyan(`${url}/_openapi.json`)}`
        ];
        if (config.devtools.enabled) {
          lines.push(`  → ${label('DevTools:')}   ${cyan(`${url}${config.devtools.route}`)}`);
        }
        lines.push(`  → ${dim('Press Ctrl+C to stop')}`);
        logger.info(lines.join('\n'));

        // 异步生成 OpenAPI 类型声明(不阻塞 server 启动)
        generateOpenApiTypesFromServer(url, { outDir: resolve(cwd, '.ubean') })
          .then(filePath => {
            logger.info(`OpenAPI types generated: ${filePath}`);
          })
          .catch(err => {
            logger.warn(`Failed to generate OpenAPI types: ${err instanceof Error ? err.message : String(err)}`);
          });
      },
      onBeforeReload() {
        logger.info('Reloading...');
      },
      onAfterReload() {
        logger.info('Reloaded');
      }
    });

    try {
      await runner.start();
    } catch (err: any) {
      logger.error(err?.message || String(err));
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

        logger.info(`File change detected: ${relevantEvents[0].relativePath}`);
        await rescan();
      }
    });

    watcher.start();

    const cleanup = async () => {
      logger.info('\nShutting down...');
      watcher.stop();
      await runner.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};

async function buildApp(
  cwd: string,
  config: any
): Promise<{ app: ReturnType<typeof createUbeanApp>; layouts: any[]; scanResult: ScanResult }> {
  logger.info('Scanning project files...');
  const result = await scanProject({
    cwd,
    srcDir: config.srcDir,
    dirs: config.dir,
    ignore: config.scanOptions?.ignore
  });

  logger.info(
    `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts, ${result.middlewares.length} middlewares, ${result.plugins.length} plugins`
  );

  logger.info('Generating type definitions...');
  await generateTypes(result, {
    cwd,
    srcDir: config.srcDir,
    buildDir: '.ubean',
    dirs: config.dir,
    imports: config.imports,
    components: config.components,
    composablesDirs: config.imports.dirs,
    componentsDirs: config.components.dirs
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
    securityHeaders:
      config.security === false
        ? false
        : config.security?.headers === false
          ? false
          : (config.security?.headers ?? true),
    dataCache: config.dataCache,
    cache: config.cache,
    seoConventions: { srcDir: resolve(cwd, config.srcDir) }
  });

  app.hooks.hook('request:start', c => {
    // 请求日志默认隐藏(LOG_LEVEL=debug 打开),避免干扰 dev 终端输出
    logger.debug(`${c.req.method} ${c.req.path}`);
  });

  return { app, layouts: result.layouts, scanResult: result };
}
