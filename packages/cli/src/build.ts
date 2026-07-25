import { pathToFileURL } from 'node:url';
import { buildProduction } from '@ubean/build/production';
import type { BuildManifest } from '@ubean/build/production';
import { generateTypes } from '@ubean/codegen';
import { loadUbeanConfig } from '@ubean/config';
import { prerender } from '@ubean/prerender';
import { resolvePresetByName, registerBuiltinPresets } from '@ubean/preset';
import { scanProject } from '@ubean/routing';
import type { CommandDef } from 'citty';
import { consola } from 'consola';
import { resolve } from 'pathe';

const logger = consola.withTag('ubean-cli');

/**
 * Creates a fetcher that invokes the built SSR entry to render real HTML.
 * Inspired by void's Node prerender runner: import the built `entry.mjs`,
 * call its `createFetchHandler()` to obtain a `fetch(req)` function, then
 * drive it with synthetic `http://localhost<path>` requests.
 *
 * If the SSR entry cannot be loaded (e.g. missing dependencies), returns
 * `undefined` so the caller falls back to the existing placeholder behavior.
 */
async function createSsrFetcher(
  cwd: string,
  manifest: BuildManifest
): Promise<((url: string) => Promise<{ html: string; statusCode: number }>) | undefined> {
  try {
    const entryPath = resolve(cwd, manifest.serverDir, 'entry.mjs');
    const entryUrl = pathToFileURL(entryPath).href;
    const mod = await import(entryUrl);
    const createFetchHandler = mod.default ?? mod.createFetchHandler;
    if (typeof createFetchHandler !== 'function') {
      logger.warn('SSR entry does not export createFetchHandler; falling back to placeholder prerender.');
      return undefined;
    }
    const fetch = await createFetchHandler();
    if (typeof fetch !== 'function') {
      logger.warn('SSR entry did not return a fetch handler; falling back to placeholder prerender.');
      return undefined;
    }
    return async (url: string) => {
      const req = new Request(`http://localhost${url || '/'}`, {
        headers: { 'x-ubean-prerender': '1' }
      });
      const res = await fetch(req);
      const html = typeof res.text === 'function' ? await res.text() : String(res.body ?? '');
      return { html, statusCode: res.status ?? 200 };
    };
  } catch (err) {
    logger.warn(
      `Failed to load SSR entry for prerender: ${err instanceof Error ? err.message : String(err)}. Falling back to placeholder prerender.`
    );
    return undefined;
  }
}

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
      buildDir: '.ubean',
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
      preset: resolvedPreset,
      scanResult: result,
      minify: args.minify as boolean,
      sourcemap: args.sourcemap as boolean
    });

    const shouldPrerender = args.prerender ?? config.prerender.enabled;
    if (shouldPrerender) {
      logger.info('Prerendering static pages...');
      const fetcher = await createSsrFetcher(cwd, manifest);
      await prerender({
        cwd,
        outputDir: config.build.outputDir,
        pages: result.pages,
        routeRules: config.routeRules,
        prerender: config.prerender,
        fetcher
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
