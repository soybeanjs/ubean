import type { CommandDef } from 'citty';
import { resolve } from 'pathe';
import { loadUbeanConfig } from '../config/loader';
import { createUbeanApp } from '../../runtime/app';
import { generateTypes } from '../codegen';
import { createDevRunner, createDevWatcher, logDiagnostics } from '../dev';
import type {
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsLayoutInfo,
  DevToolsCronInfo
} from '../devtools/types';
import { logger } from '../log';
import { resolvePresetByName, registerBuiltinPresets } from '../preset';
import { createCapabilitySet, diagnoseCapabilities, NODE_REQUIREMENTS } from '../preset/capabilities';
import { scanProject } from '../routing/scan';

export const devCommand: CommandDef = {
  meta: {
    name: 'dev',
    description: 'Start the ubean development server'
  },
  args: {
    port: {
      type: 'string',
      description: 'Port to listen on',
      default: '3000'
    },
    host: {
      type: 'string',
      description: 'Host to listen on',
      default: 'localhost'
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
    logger.start('Starting ubean dev server...');

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

    let currentApp = await buildApp(cwd, config);

    const runner = await createDevRunner({
      cwd,
      srcDir: config.srcDir,
      port,
      host,
      preset,
      capabilities,
      app: currentApp,
      onListen({ url, port: p }) {
        logger.box(
          `🚀 ubean dev server ready\n\n` +
            `  → Local:      ${url}\n` +
            `  → Scalar UI:  ${url}/_scalar\n` +
            `  → OpenAPI:    ${url}/_openapi.json\n` +
            `  → Port:       ${p}\n` +
            `  → Press Ctrl+C to stop`
        );
      },
      onBeforeReload() {
        logger.info('Reloading...');
      },
      onAfterReload() {
        logger.success('Reloaded');
      }
    });

    await runner.start();

    const watchDirs = ['api', 'pages', 'middleware', 'layouts', 'plugins', 'app'];
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

        try {
          currentApp = await buildApp(cwd, config);
          runner.updateApp(currentApp);
          await runner.reload();
        } catch (err) {
          logger.error(`Reload failed: ${err instanceof Error ? err.message : String(err)}`);
        }
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

async function buildApp(cwd: string, config: any) {
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
    routes: result.apiRoutes,
    middleware: result.middlewares,
    pages: result.pages,
    routeRules: config.routeRules || {},
    devtools: true,
    openAPI: {
      title: 'UBEAN Dev API',
      scalarPath: '/_scalar',
      openAPIPath: '/_openapi.json'
    }
  });

  if (app.devtools) {
    const devRoutes: DevToolsRouteInfo[] = result.apiRoutes.map(r => ({
      method: r.method || 'GET',
      path: r.route,
      filePath: r.relativePath
    }));

    const devPages: DevToolsPageInfo[] = result.pages
      .filter(p => !p.isReuse)
      .map(p => ({
        path: p.route,
        name: p.name,
        filePath: p.relativePath,
        layout: p.layout === false ? undefined : p.layout || 'default'
      }));

    const devMiddlewares: DevToolsMiddlewareInfo[] = result.middlewares.map(m => ({
      path: m.global ? '*' : m.relativePath,
      filePath: m.relativePath,
      global: m.global
    }));

    const devLayouts: DevToolsLayoutInfo[] = result.layouts.map(l => ({
      name: l.name,
      path: l.path,
      filePath: l.relativePath,
      isDefault: l.isDefault
    }));

    const devCrons: DevToolsCronInfo[] = (result.crons || []).map(c => ({
      name: c.name,
      filePath: c.relativePath
    }));

    app.devtools.rpc.setRoutes(devRoutes);
    app.devtools.rpc.setPages(devPages);
    app.devtools.rpc.setMiddlewares(devMiddlewares);
    app.devtools.rpc.setLayouts(devLayouts);
    app.devtools.rpc.setCrons(devCrons);
    app.devtools.rpc.setPresets([config.build.preset]);
    app.devtools.rpc.updateInfo({
      config: {
        preset: config.build.preset,
        rootDir: config.rootDir,
        srcDir: config.srcDir
      }
    });
  }

  app.hooks.hook('request:start', c => {
    logger.log(`${c.req.method} ${c.req.path}`);
  });

  return app;
}
