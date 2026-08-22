import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { findClientManifest, summarizeBundle, writeBundleBaseline, compareBundleBaseline } from '../src/analyze-lib';

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('summarizeBundle', () => {
  it('sums gzip sizes from a Vite client manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-analyze-'));
    const js = 'console.log("islands")';
    writeFileSync(join(dir, 'entry.js'), js);
    const baseline = summarizeBundle(dir, {
      'src/main.ts': { file: 'entry.js', isEntry: true }
    });
    expect(baseline.entries).toHaveLength(1);
    expect(baseline.entryGzip).toBe(gzipSync(Buffer.from(js)).length);
    expect(baseline.totalGzip).toBe(baseline.entryGzip);
    const out = join(dir, 'baseline.json');
    writeBundleBaseline(out, baseline);
  });
});

describe('findClientManifest', () => {
  it('finds dist/public/.vite/manifest.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-analyze-public-'));
    const viteDir = join(dir, 'dist/public/.vite');
    mkdirSync(viteDir, { recursive: true });
    writeFileSync(join(viteDir, 'manifest.json'), '{}');
    const found = findClientManifest(dir);
    expect(found?.manifestPath).toBe(join(dir, 'dist/public/.vite/manifest.json'));
  });
});

describe('compareBundleBaseline', () => {
  it('passes when gzip is within the allowed increase', () => {
    const result = compareBundleBaseline(
      { totalGzip: 105, entryGzip: 21 },
      { totalGzip: 100, entryGzip: 20 },
      { maxIncrease: 0.1 }
    );
    expect(result.ok).toBe(true);
  });

  it('fails when total gzip grows past the threshold', () => {
    const result = compareBundleBaseline(
      { totalGzip: 120, entryGzip: 20 },
      { totalGzip: 100, entryGzip: 20 },
      { maxIncrease: 0.05 }
    );
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.includes('total gzip'))).toBe(true);
  });
});
