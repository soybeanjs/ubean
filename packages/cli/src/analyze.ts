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
  compareBundleBaseline,
  formatKilobytes
} from './analyze-lib';

const logger = getLogger('cli');

function readStringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Absolute ceilings are given in kB on the CLI; the budget API works in bytes. */
function readKilobyteArg(value: unknown, flag: string): number | undefined {
  const raw = readStringArg(value);
  if (raw === undefined) return undefined;
  const kb = Number(raw);
  if (!Number.isFinite(kb) || kb < 0) {
    throw new Error(`[ubean] analyze: ${flag} must be a non-negative number of kB`);
  }
  return Math.round(kb * 1024);
}

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
    },
    maxTotalKb: {
      type: 'string',
      description: 'Absolute ceiling for total client JS gzip in kB (checked against this build alone)'
    },
    maxEntryKb: {
      type: 'string',
      description: 'Absolute ceiling for entry chunk gzip in kB'
    },
    maxChunkKb: {
      type: 'string',
      description: 'Absolute ceiling for any single chunk gzip in kB'
    }
  },
  async run({ args }) {
    const cwd = resolve(typeof args.cwd === 'string' ? args.cwd : process.cwd());
    if (!existsSync(join(cwd, 'package.json'))) {
      throw new Error(`[ubean] analyze: ${cwd} is not a project root`);
    }
    await loadUbeanConfig(cwd).catch(() => undefined);

    const found = findClientManifest(cwd);
    if (!found) {
      logger.error('No client Vite manifest found. Run `ubean build` first.');
      throw new Error('missing client manifest');
    }

    const manifest = readViteManifest(found.manifestPath);
    const baseline = summarizeBundle(found.outDir, manifest);
    baseline.outDir = relative(cwd, found.outDir).replace(/\\/g, '/') || baseline.outDir;
    logger.info(
      `client JS: ${formatKilobytes(baseline.totalGzip)} gzip / ${formatKilobytes(baseline.totalBrotli ?? 0)} brotli (${baseline.entries.length} js chunks, entry ${formatKilobytes(baseline.entryGzip)} gzip)`
    );
    for (const entry of baseline.entries.slice(0, 12)) {
      logger.info(`  ${entry.isEntry ? '[entry] ' : ''}${entry.file}  ${(entry.gzip / 1024).toFixed(1)} kB gzip`);
    }
    if (args.write !== false) {
      const outArg = readStringArg(args.out);
      const out = outArg ? resolve(cwd, outArg) : join(cwd, '.ubean/bundle-baseline.json');
      writeBundleBaseline(out, baseline);
      logger.info(`wrote ${out}`);
    }

    const checkArg = readStringArg(args.check);
    const absoluteBudget = {
      maxTotalGzip: readKilobyteArg(args.maxTotalKb, '--max-total-kb'),
      maxEntryGzip: readKilobyteArg(args.maxEntryKb, '--max-entry-kb'),
      maxChunkGzip: readKilobyteArg(args.maxChunkKb, '--max-chunk-kb')
    };
    const hasAbsoluteBudget = Object.values(absoluteBudget).some(value => value !== undefined);

    if (checkArg || hasAbsoluteBudget) {
      let committed: { totalGzip: number; entryGzip: number };
      if (checkArg) {
        const checkPath = resolve(cwd, checkArg);
        if (!existsSync(checkPath)) {
          logger.error(`baseline not found: ${checkPath}`);
          throw new Error('missing budget baseline');
        }
        const parsed = JSON.parse(readFileSync(checkPath, 'utf8')) as { totalGzip?: number; entryGzip?: number };
        committed = { totalGzip: parsed.totalGzip ?? 0, entryGzip: parsed.entryGzip ?? 0 };
      } else {
        // Absolute budgets stand on their own. Comparing the build with itself keeps the
        // relative gate inert (ratio 0) instead of reporting an infinite regression.
        committed = { totalGzip: baseline.totalGzip, entryGzip: baseline.entryGzip };
      }
      const maxIncrease = Number(args.maxIncrease ?? 0.05);
      const result = compareBundleBaseline(baseline, committed, {
        maxIncrease: Number.isFinite(maxIncrease) ? maxIncrease : 0.05,
        ...absoluteBudget
      });
      if (!result.ok) {
        for (const message of result.messages) logger.error(message);
        throw new Error('client JS budget exceeded');
      }
      const relativeSummary = checkArg
        ? `total ${(result.totalRatio * 100).toFixed(1)}%, entry ${(result.entryRatio * 100).toFixed(1)}% vs baseline, max ${(result.maxIncrease * 100).toFixed(0)}%`
        : 'no baseline comparison';
      logger.info(`budget ok (${relativeSummary})`);
    }
  }
};
