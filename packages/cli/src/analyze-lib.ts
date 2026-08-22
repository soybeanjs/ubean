import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
  isEntry?: boolean;
}

export interface BundleBaseline {
  generatedAt: string;
  outDir: string;
  entries: BundleBudgetEntry[];
  totalBytes: number;
  totalGzip: number;
  entryGzip: number;
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
    const bytes = statSync(abs).size;
    const gzip = gzipSync(readFileSync(abs)).length;
    entries.push({ file: chunk.file, bytes, gzip, isEntry: chunk.isEntry });
  }
  entries.sort((a, b) => b.gzip - a.gzip);
  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
  const totalGzip = entries.reduce((sum, e) => sum + e.gzip, 0);
  const entryGzip = entries.filter(e => e.isEntry).reduce((sum, e) => sum + e.gzip, 0);
  return {
    generatedAt: new Date().toISOString(),
    outDir,
    entries,
    totalBytes,
    totalGzip,
    entryGzip
  };
}

export function compareBundleBaseline(
  current: Pick<BundleBaseline, 'totalGzip' | 'entryGzip'>,
  committed: Pick<BundleBaseline, 'totalGzip' | 'entryGzip'>,
  options: { maxIncrease?: number } = {}
): {
  ok: boolean;
  maxIncrease: number;
  totalRatio: number;
  entryRatio: number;
  messages: string[];
} {
  const maxIncrease = options.maxIncrease ?? 0.05;
  const totalRatio =
    committed.totalGzip === 0 ? (current.totalGzip === 0 ? 0 : Infinity) : current.totalGzip / committed.totalGzip - 1;
  const entryRatio =
    committed.entryGzip === 0 ? (current.entryGzip === 0 ? 0 : Infinity) : current.entryGzip / committed.entryGzip - 1;
  const messages: string[] = [];
  if (totalRatio > maxIncrease) {
    messages.push(
      `total gzip ${(current.totalGzip / 1024).toFixed(1)} kB exceeds baseline ${(committed.totalGzip / 1024).toFixed(1)} kB by ${(totalRatio * 100).toFixed(1)}% (max ${(maxIncrease * 100).toFixed(0)}%)`
    );
  }
  if (entryRatio > maxIncrease) {
    messages.push(
      `entry gzip ${(current.entryGzip / 1024).toFixed(1)} kB exceeds baseline ${(committed.entryGzip / 1024).toFixed(1)} kB by ${(entryRatio * 100).toFixed(1)}% (max ${(maxIncrease * 100).toFixed(0)}%)`
    );
  }
  return { ok: messages.length === 0, maxIncrease, totalRatio, entryRatio, messages };
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
