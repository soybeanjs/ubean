import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'pathe';

export interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  name?: string;
  src?: string;
}

export interface BundleBudgetEntry {
  file: string;
  bytes: number;
  gzip: number;
  /** Brotli size, reported for context; no gate reads it yet. */
  brotli?: number;
  isEntry?: boolean;
}

export interface BundleBaseline {
  generatedAt: string;
  outDir: string;
  entries: BundleBudgetEntry[];
  totalBytes: number;
  totalGzip: number;
  totalBrotli?: number;
  entryGzip: number;
}

export interface BundleBudgetOptions {
  /** Allowed relative gzip growth for total and entry. Defaults to 0.05. */
  maxIncrease?: number;
  /**
   * Absolute gzip ceilings in bytes. Checked against the current build alone, so they hold
   * even when the committed baseline was recorded from a smaller tree.
   */
  maxTotalGzip?: number;
  maxEntryGzip?: number;
  maxChunkGzip?: number;
}

export interface BundleBudgetViolation {
  kind: 'total' | 'entry' | 'chunk';
  /** Measured gzip size in bytes. */
  actual: number;
  /** Ceiling that was exceeded, in bytes. */
  limit: number;
  file?: string;
}

const CHUNK_VIOLATION_DISPLAY_LIMIT = 5;

export function formatKilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export function readViteManifest(manifestPath: string): Record<string, ManifestChunk> {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>;
  return raw;
}

export function summarizeBundle(outDir: string, manifest: Record<string, ManifestChunk>): BundleBaseline {
  const entries: BundleBudgetEntry[] = [];
  for (const chunk of Object.values(manifest)) {
    if (!chunk.file || chunk.file.endsWith('.css')) continue;
    const abs = join(outDir, chunk.file);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs);
    entries.push({
      file: chunk.file,
      bytes: statSync(abs).size,
      gzip: gzipSync(source).length,
      brotli: brotliCompressSync(source).length,
      isEntry: chunk.isEntry
    });
  }
  entries.sort((a, b) => b.gzip - a.gzip);
  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
  const totalGzip = entries.reduce((sum, e) => sum + e.gzip, 0);
  const totalBrotli = entries.reduce((sum, e) => sum + (e.brotli ?? 0), 0);
  const entryGzip = entries.filter(e => e.isEntry).reduce((sum, e) => sum + e.gzip, 0);
  return {
    generatedAt: new Date().toISOString(),
    outDir,
    entries,
    totalBytes,
    totalGzip,
    totalBrotli,
    entryGzip
  };
}

export function compareBundleBaseline(
  current: Pick<BundleBaseline, 'totalGzip' | 'entryGzip'> & Partial<Pick<BundleBaseline, 'entries'>>,
  committed: Pick<BundleBaseline, 'totalGzip' | 'entryGzip'>,
  options: BundleBudgetOptions = {}
): {
  ok: boolean;
  maxIncrease: number;
  totalRatio: number;
  entryRatio: number;
  messages: string[];
  violations: BundleBudgetViolation[];
} {
  const maxIncrease = options.maxIncrease ?? 0.05;
  const totalRatio = growthRatio(current.totalGzip, committed.totalGzip);
  const entryRatio = growthRatio(current.entryGzip, committed.entryGzip);
  const messages: string[] = [];
  const violations: BundleBudgetViolation[] = [];

  if (totalRatio > maxIncrease) {
    messages.push(
      `total gzip ${formatKilobytes(current.totalGzip)} exceeds baseline ${formatKilobytes(committed.totalGzip)} by ${(totalRatio * 100).toFixed(1)}% (max ${(maxIncrease * 100).toFixed(0)}%)`
    );
  }
  if (entryRatio > maxIncrease) {
    messages.push(
      `entry gzip ${formatKilobytes(current.entryGzip)} exceeds baseline ${formatKilobytes(committed.entryGzip)} by ${(entryRatio * 100).toFixed(1)}% (max ${(maxIncrease * 100).toFixed(0)}%)`
    );
  }

  if (options.maxTotalGzip !== undefined && current.totalGzip > options.maxTotalGzip) {
    violations.push({ kind: 'total', actual: current.totalGzip, limit: options.maxTotalGzip });
    messages.push(
      `total gzip ${formatKilobytes(current.totalGzip)} exceeds the absolute budget ${formatKilobytes(options.maxTotalGzip)}`
    );
  }
  if (options.maxEntryGzip !== undefined && current.entryGzip > options.maxEntryGzip) {
    violations.push({ kind: 'entry', actual: current.entryGzip, limit: options.maxEntryGzip });
    messages.push(
      `entry gzip ${formatKilobytes(current.entryGzip)} exceeds the absolute budget ${formatKilobytes(options.maxEntryGzip)}`
    );
  }

  const oversizedChunks =
    options.maxChunkGzip === undefined
      ? []
      : (current.entries ?? []).filter(entry => entry.gzip > options.maxChunkGzip!);
  for (const entry of oversizedChunks) {
    violations.push({ kind: 'chunk', actual: entry.gzip, limit: options.maxChunkGzip!, file: entry.file });
  }
  if (oversizedChunks.length > 0) {
    const shown = oversizedChunks
      .slice(0, CHUNK_VIOLATION_DISPLAY_LIMIT)
      .map(entry => `${entry.file} ${formatKilobytes(entry.gzip)}`)
      .join(', ');
    const rest = oversizedChunks.length - CHUNK_VIOLATION_DISPLAY_LIMIT;
    messages.push(
      `${oversizedChunks.length} chunk(s) exceed the absolute budget ${formatKilobytes(options.maxChunkGzip!)}: ${shown}${rest > 0 ? ` (+${rest} more)` : ''}`
    );
  }

  return { ok: messages.length === 0, maxIncrease, totalRatio, entryRatio, messages, violations };
}

function growthRatio(current: number, committed: number): number {
  if (committed === 0) return current === 0 ? 0 : Infinity;
  return current / committed - 1;
}

export function writeBundleBaseline(filePath: string, baseline: BundleBaseline): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

export function findClientManifest(cwd: string): { outDir: string; manifestPath: string } | undefined {
  const candidates = [
    join(cwd, 'dist/client/.vite/manifest.json'),
    join(cwd, 'dist/public/.vite/manifest.json'),
    join(cwd, 'dist/.vite/manifest.json'),
    join(cwd, '.output/public/.vite/manifest.json')
  ];
  for (const manifestPath of candidates) {
    if (existsSync(manifestPath)) {
      return { outDir: resolve(dirname(manifestPath), '..'), manifestPath };
    }
  }
  return undefined;
}
