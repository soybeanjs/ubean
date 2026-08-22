import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { findClientManifest, summarizeBundle, writeBundleBaseline } from '../src/analyze-lib';

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
