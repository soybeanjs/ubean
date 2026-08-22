import { existsSync, readFileSync } from 'node:fs';
import { loadUbeanConfig } from '@ubean/config';
import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { join, relative, resolve } from 'pathe';
import {
  findClientManifest,
  readViteManifest,
  summarizeBundle,
  writeBundleBaseline,
  compareBundleBaseline
} from './analyze-lib';

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
    },
    out: {
      type: 'string',
      description: 'Baseline JSON path (default: .ubean/bundle-baseline.json)'
    },
    check: {
      type: 'string',
      description: 'Committed baseline JSON to compare against (fails if gzip grows past --max-increase)'
    },
    maxIncrease: {
      type: 'string',
      description: 'Allowed relative gzip growth when using --check (default 0.05)'
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
    baseline.outDir = relative(cwd, found.outDir).replace(/\\/g, '/') || baseline.outDir;
    logger.info(
      `client JS: ${(baseline.totalGzip / 1024).toFixed(1)} kB gzip (${baseline.entries.length} js chunks, entry ${(baseline.entryGzip / 1024).toFixed(1)} kB)`
    );
    for (const entry of baseline.entries.slice(0, 12)) {
      logger.info(`  ${entry.isEntry ? '[entry] ' : ''}${entry.file}  ${(entry.gzip / 1024).toFixed(1)} kB gzip`);
    }
    if (args.write !== false) {
      const out =
        typeof args.out === 'string' && args.out.length > 0
          ? resolve(cwd, args.out)
          : join(cwd, '.ubean/bundle-baseline.json');
      writeBundleBaseline(out, baseline);
      logger.info(`wrote ${out}`);
    }

    if (typeof args.check === 'string' && args.check.length > 0) {
      const checkPath = resolve(cwd, args.check);
      if (!existsSync(checkPath)) {
        logger.error(`baseline not found: ${checkPath}`);
        throw new Error('missing budget baseline');
      }
      const committed = JSON.parse(readFileSync(checkPath, 'utf8')) as { totalGzip?: number; entryGzip?: number };
      const maxIncrease = Number(args.maxIncrease ?? 0.05);
      const result = compareBundleBaseline(
        baseline,
        { totalGzip: committed.totalGzip ?? 0, entryGzip: committed.entryGzip ?? 0 },
        { maxIncrease: Number.isFinite(maxIncrease) ? maxIncrease : 0.05 }
      );
      if (!result.ok) {
        for (const message of result.messages) logger.error(message);
        throw new Error('client JS budget exceeded');
      }
      logger.info(
        `budget ok (total ${(result.totalRatio * 100).toFixed(1)}%, entry ${(result.entryRatio * 100).toFixed(1)}% vs baseline, max ${(result.maxIncrease * 100).toFixed(0)}%)`
      );
    }
  }
};
