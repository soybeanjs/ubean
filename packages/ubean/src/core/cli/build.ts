import type { CommandDef } from 'citty';
import { resolve } from 'pathe';
import { loadUbeanConfig } from '../config/loader';
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

    logger.success(`Build preparation complete for preset "${preset.name}".`);
    if (!shouldPrerender) {
      logger.info(
        `Note: Full production bundling (Vite SSR build + preset entry generation) ` +
          `will be activated when Vue SSR renderer is complete in Phase 4.`
      );
    }
  }
};
