import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
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

  it('reports brotli alongside gzip', () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-analyze-brotli-'));
    const js = 'console.log("islands")'.repeat(64);
    writeFileSync(join(dir, 'entry.js'), js);
    const baseline = summarizeBundle(dir, {
      'src/main.ts': { file: 'entry.js', isEntry: true }
    });
    expect(baseline.entries[0].brotli).toBe(brotliCompressSync(Buffer.from(js)).length);
    expect(baseline.totalBrotli).toBe(baseline.entries[0].brotli);
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

  // RM-P23：体积门禁只守增长，产物变小反而算通过 —— 于是「功能被静默砍掉」的回归能溜过去
  // （实测：岛屿组件 chunk 全部消失，报的却是 budget ok）。这条判据按名字对照两份清单。
  it('fails when a chunk present in the baseline is missing from the build', () => {
    const result = compareBundleBaseline(
      {
        totalGzip: 90,
        entryGzip: 18,
        entries: [
          { file: 'assets/app-AAAABBBB.js', bytes: 1, gzip: 18, isEntry: true },
          { file: 'assets/chunks/IslandCounter-CCCCDDDD.js', bytes: 1, gzip: 2 }
        ]
      },
      {
        totalGzip: 100,
        entryGzip: 20,
        entries: [
          { file: 'assets/app-ZZZZYYYY.js', bytes: 1, gzip: 20, isEntry: true },
          { file: 'assets/chunks/IslandCounter-WWWWXXXX.js', bytes: 1, gzip: 2 },
          { file: 'assets/chunks/IslandClock-EEEEFFFF.js', bytes: 1, gzip: 2 }
        ]
      },
      { maxIncrease: 0.05 }
    );

    // 体积是变小了（-10%），旧判据会说 OK；缺 chunk 必须拦下
    expect(result.ok).toBe(false);
    expect(result.violations.filter(v => v.kind === 'missing').map(v => v.file)).toEqual([
      'assets/chunks/IslandClock.<hash>.js'
    ]);
    expect(result.messages.some(m => m.includes('missing from this build'))).toBe(true);
  });

  it('treats a renamed-but-present chunk as present (hash normalization)', () => {
    const entries = [{ file: 'assets/chunks/IslandCounter-CCCCDDDD.js', bytes: 1, gzip: 2 }];
    const result = compareBundleBaseline(
      { totalGzip: 10, entryGzip: 5, entries },
      {
        totalGzip: 10,
        entryGzip: 5,
        entries: [{ file: 'assets/chunks/IslandCounter-11112222.js', bytes: 1, gzip: 2 }]
      },
      { maxIncrease: 0.05 }
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

  it('enforces an absolute total ceiling even when the baseline is larger', () => {
    const result = compareBundleBaseline(
      { totalGzip: 120 * 1024, entryGzip: 20 * 1024 },
      { totalGzip: 500 * 1024, entryGzip: 20 * 1024 },
      { maxTotalGzip: 100 * 1024 }
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([{ kind: 'total', actual: 120 * 1024, limit: 100 * 1024 }]);
    expect(result.messages.some(m => m.includes('absolute budget'))).toBe(true);
  });

  it('names the offending chunk when a per-chunk ceiling is exceeded', () => {
    const result = compareBundleBaseline(
      {
        totalGzip: 5_000,
        entryGzip: 5_000,
        entries: [
          { file: 'assets/app-aaaa.js', bytes: 1, gzip: 5_000, isEntry: true },
          { file: 'assets/chunks/big-bbbb.js', bytes: 1, gzip: 4_500 }
        ]
      },
      { totalGzip: 5_000, entryGzip: 5_000 },
      { maxChunkGzip: 4_096 }
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map(v => v.file)).toEqual(['assets/app-aaaa.js', 'assets/chunks/big-bbbb.js']);
    expect(result.messages.some(m => m.includes('assets/app-aaaa.js'))).toBe(true);
  });

  it('passes absolute ceilings that are not exceeded and ignores them when unset', () => {
    const current = {
      totalGzip: 5_000,
      entryGzip: 1_000,
      entries: [{ file: 'assets/app-aaaa.js', bytes: 1, gzip: 1_000, isEntry: true }]
    };
    expect(
      compareBundleBaseline(
        current,
        { totalGzip: 5_000, entryGzip: 1_000 },
        {
          maxTotalGzip: 8_192,
          maxEntryGzip: 2_048,
          maxChunkGzip: 2_048
        }
      ).ok
    ).toBe(true);
    expect(compareBundleBaseline(current, { totalGzip: 5_000, entryGzip: 1_000 }).violations).toEqual([]);
  });
});
