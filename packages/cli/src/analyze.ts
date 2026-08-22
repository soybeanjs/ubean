import { existsSync } from 'node:fs';
import { loadUbeanConfig } from '@ubean/config';
import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { join, resolve } from 'pathe';
import { findClientManifest, readViteManifest, summarizeBundle, writeBundleBaseline } from './analyze-lib';

const logger = getLogger('cli');

export const analyzeCommand: CommandDef = {
  meta: {
    name: 'analyze',
    description: 'Report client JS budget from the Vite client manifest (run after `ubean build`)'
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Project root (defaults to process.cwd())'
    },
    write: {
      type: 'boolean',
      description: 'Write `.ubean/bundle-baseline.json`',
      default: true
    }
  },
  async run({ args }) {
    const cwd = resolve(typeof args.cwd === 'string' ? args.cwd : process.cwd());
    if (!existsSync(join(cwd, 'package.json'))) {
      throw new Error(`[ubean] analyze: ${cwd} is not a project root`);
    }
    await loadUbeanConfig({ cwd }).catch(() => undefined);

    const found = findClientManifest(cwd);
    if (!found) {
      logger.error('No client Vite manifest found. Run `ubean build` first.');
      throw new Error('missing client manifest');
    }

    const manifest = readViteManifest(found.manifestPath);
    const baseline = summarizeBundle(found.outDir, manifest);
    logger.info(
      `client JS: ${(baseline.totalGzip / 1024).toFixed(1)} kB gzip (${baseline.entries.length} js chunks, entry ${(baseline.entryGzip / 1024).toFixed(1)} kB)`
    );
    for (const entry of baseline.entries.slice(0, 12)) {
      logger.info(`  ${entry.isEntry ? '[entry] ' : ''}${entry.file}  ${(entry.gzip / 1024).toFixed(1)} kB gzip`);
    }
    if (args.write !== false) {
      const out = join(cwd, '.ubean/bundle-baseline.json');
      writeBundleBaseline(out, baseline);
      logger.info(`wrote ${out}`);
    }
  }
};
