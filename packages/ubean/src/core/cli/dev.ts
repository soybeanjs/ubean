import type { CommandDef } from 'citty';
import { resolve } from 'pathe';
import { loadUbeanConfig } from '../config/loader';
import { createUbeanApp } from '../../runtime/app';
import { generateTypes } from '../codegen';
import { startDevServer } from '../dev/server';
import { logger } from '../log';
import { resolvePresetByName, registerBuiltinPresets } from '../preset';
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
    await generateTypes(result, { cwd, buildDir: '.ubean' });

    const app = createUbeanApp({
      routes: result.apiRoutes,
      middleware: result.middlewares,
      pages: result.pages,
      openAPI: {
        title: 'UBEAN Dev API',
        scalarPath: '/_scalar',
        openAPIPath: '/_openapi.json'
      }
    });

    app.hooks.hook('request:start', c => {
      logger.log(`${c.req.method} ${c.req.path}`);
    });

    const server = await startDevServer({
      port,
      host,
      app,
      onListen({ port: p, host: h }) {
        logger.box(
          `🚀 ubean dev server ready\n\n` +
            `  → Local:      http://${h}:${p}\n` +
            `  → Scalar UI:  http://${h}:${p}/_scalar\n` +
            `  → OpenAPI:    http://${h}:${p}/_openapi.json\n` +
            `  → Routes:     ${result.apiRoutes.length} API, ${result.pages.length} pages\n` +
            `  → Press Ctrl+C to stop`
        );
      }
    });

    const cleanup = async () => {
      logger.info('\nShutting down...');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};
