import type { CommandDef } from 'citty';
import { resolve } from 'pathe';
import { loadUbeanConfig } from '../config/loader';
import { buildProduction } from '../build/vite/build';
import { generateTypes } from '../codegen';
import { logger } from '../log';
import { prerender } from '../prerender';
import { resolvePresetByName, registerBuiltinPresets } from '../preset';
import { scanProject } from '../routing/scan';

export const buildCommand: CommandDef = {
  meta: {
    name: 'build',
    description: 'Build the ubean application for production'
  },
  args: {
    preset: {
      type: 'string',
      description: 'Deployment preset (node, bun, deno, cloudflare, vercel, netlify, standard)'
    },
    minify: {
      type: 'boolean',
      description: 'Minify output',
      default: true
    },
    sourcemap: {
      type: 'boolean',
      description: 'Generate sourcemaps',
      default: false
    },
    prerender: {
      type: 'boolean',
      description: 'Pre-render static pages (SSG)'
    },
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.start('Building ubean application...');

    registerBuiltinPresets();
    const config = await loadUbeanConfig(cwd);
    const presetName = args.preset || config.build.preset;

    const preset = resolvePresetByName(presetName);
    logger.info(`Using preset: ${preset.name}`);

    logger.info('Scanning project...');
    const result = await scanProject({
      cwd,
      srcDir: config.srcDir,
      dirs: config.dir,
      ignore: config.scanOptions?.ignore
    });

    logger.info(
      `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts`
    );

    logger.info('Generating types...');
    await generateTypes(result, {
      cwd,
      srcDir: config.srcDir,
      buildDir: config.build.outputDir,
      dirs: config.dir,
      imports: config.imports,
      components: config.components,
      composablesDirs: config.imports.dirs,
      componentsDirs: config.components.dirs
    });

    const resolvedPreset = preset as { name: string; hooks?: Record<string, (ctx: any) => void | Promise<void>> };

    if (resolvedPreset.hooks?.['build:before']) {
      await resolvedPreset.hooks['build:before']({
        cwd,
        outputDir: config.build.outputDir,
        preset: resolvedPreset,
        config: config as unknown as Record<string, unknown>
      });
    }

    logger.info('Building with Vite...');
    const manifest = await buildProduction({
      cwd,
      config,
      preset: resolvedPreset as any,
      scanResult: result,
      minify: args.minify as boolean,
      sourcemap: args.sourcemap as boolean
    });

    const shouldPrerender = args.prerender ?? config.prerender.enabled;
    if (shouldPrerender) {
      logger.info('Prerendering static pages...');
      await prerender({
        cwd,
        outputDir: config.build.outputDir,
        pages: result.pages,
        routeRules: config.routeRules,
        prerender: config.prerender
      });
    }

    if (resolvedPreset.hooks?.['build:after']) {
      await resolvedPreset.hooks['build:after']({
        cwd,
        outputDir: config.build.outputDir,
        preset: resolvedPreset,
        config: config as unknown as Record<string, unknown>,
        manifest
      });
    }

    logger.success(`Build complete for preset "${resolvedPreset.name}"!`);
    logger.info(`  Output directory: ${resolve(cwd, config.build.outputDir)}`);
    logger.info(`  Server entry: ${manifest.entry}`);
    logger.info(`  Client assets: ${manifest.assets.length} files`);
  }
};
