import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { findClientManifest, summarizeBundle, writeBundleBaseline, compareBundleBaseline } from '../src/analyze-lib';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples/ubean-test');
const BASELINE_PATH = join(EXAMPLE_DIR, 'benchmarks/bundle-baseline.json');
const CI_PATH = join(REPO_ROOT, '.github/workflows/ci.yml');

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

/**
 * TS-23 · 绝对上限**已启用**（RM-P06 从 opt-in 机制变成强制门禁）。
 *
 * `docs/perf-regression-net.md` §8.4 记录过：`maxTotalGzip` / `maxEntryGzip` / `maxChunkGzip`
 * 的**机制**早已落地，但没有任何调用点传 `--max-*-kb`，于是实际生效的只有相对 5% 门禁与
 * RM-P23 缺 chunk 判据。相对门禁有个结构性盲区：它只比「与 committed 基线」的比例，
 * 若产物从 0 涨到很大、而 committed 基线**也**是那个大数字（或基线被一起改大），
 * 比例照样是 0%，闸门全绿。历史事故 #2「体积门禁全绿但产物空」就是这个盲区。
 *
 * 这里把「上限确实配上了、且配得合理」钉住 —— 脚本被改回不带 `--max-*-kb` 时本文件会红。
 */
describe('TS-23 · 绝对上限已启用', () => {
  interface ExamplePackage {
    scripts: Record<string, string>;
  }
  interface Baseline {
    entries: Array<{ file: string; bytes: number; gzip: number; isEntry?: boolean }>;
    totalGzip: number;
    entryGzip: number;
  }

  /** 从 `analyze:check` 脚本里读 `--max-total-kb <n>` 形态的上限（kB）。 */
  function readCeiling(script: string, flag: string): number | undefined {
    const match = new RegExp(`--${flag}\\s+(\\d+(?:\\.\\d+)?)`).exec(script);
    return match ? Number(match[1]) : undefined;
  }

  function loadScripts(): { script: string; baseline: Baseline } {
    const pkg = JSON.parse(readFileSync(join(EXAMPLE_DIR, 'package.json'), 'utf8')) as ExamplePackage;
    const script = pkg.scripts['analyze:check'];
    expect(script, 'examples/ubean-test 的 package.json 必须有 analyze:check 脚本').toBeTypeOf('string');
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    return { script, baseline };
  }

  it('analyze:check 带三类绝对上限：总量 / entry / 单 chunk', () => {
    const { script } = loadScripts();

    for (const flag of ['max-total-kb', 'max-entry-kb', 'max-chunk-kb']) {
      expect(readCeiling(script, flag), `analyze:check 缺少 --${flag}（绝对上限未启用）`).toBeTypeOf('number');
    }
    // 相对门禁必须保留（RM-P06 是补充而非替换）
    expect(script).toContain('--check benchmarks/bundle-baseline.json');
    expect(script).toContain('--write=false');
  });

  it('上限对 committed 基线仍有余量：门禁不是「出生即红」，也不是形同虚设', () => {
    const { script, baseline } = loadScripts();
    const total = readCeiling(script, 'max-total-kb')!;
    const entry = readCeiling(script, 'max-entry-kb')!;
    const chunk = readCeiling(script, 'max-chunk-kb')!;

    const totalKb = baseline.totalGzip / 1024;
    const entryKb = baseline.entryGzip / 1024;
    const biggestChunkKb = Math.max(...baseline.entries.map(e => e.gzip)) / 1024;

    // 下界：基线必须真的在上限之内，否则门禁一合入就红
    expect(total).toBeGreaterThan(totalKb);
    expect(entry).toBeGreaterThan(entryKb);
    expect(chunk).toBeGreaterThan(biggestChunkKb);

    // 上界：上限只能挡「数量级异常」（docs/perf-regression-net.md 的宽松阈值口径），
    // 不能紧到把正常的 5% 增长也一起拦掉 —— 那样相对门禁就失去意义了。
    expect(total).toBeLessThanOrEqual(totalKb * 2);
    expect(entry).toBeLessThanOrEqual(entryKb * 2);
    expect(chunk).toBeLessThanOrEqual(biggestChunkKb * 2);
  });

  it('三类上限各自能红，且失败信息同时含实际值与上限', () => {
    const { script, baseline } = loadScripts();
    const ceilings = {
      maxTotalGzip: readCeiling(script, 'max-total-kb')! * 1024,
      maxEntryGzip: readCeiling(script, 'max-entry-kb')! * 1024,
      maxChunkGzip: readCeiling(script, 'max-chunk-kb')! * 1024
    };

    // 以 committed 基线为「当前构建」，把上限压到基线之下 —— 三类各应独立触发
    for (const [kind, key] of [
      ['total', 'maxTotalGzip'],
      ['entry', 'maxEntryGzip']
    ] as const) {
      const result = compareBundleBaseline(baseline, baseline, { [key]: 2048 });
      expect(result.ok, `${kind} 上限压到 2 kB 时应失败`).toBe(false);
      expect(result.violations.map(v => v.kind)).toContain(kind);
      const message = result.messages.find(m => m.includes('absolute budget'))!;
      // 可读失败信息：实测值与上限都在（kB 形态，便于直接对照）
      expect(message).toContain('absolute budget');
      expect(message).toMatch(/\d+\.\d+ kB/);
      expect(message).toContain('2.0 kB');
    }

    const chunkResult = compareBundleBaseline(baseline, baseline, { ...ceilings, maxChunkGzip: 2048 });
    expect(chunkResult.ok).toBe(false);
    const chunkMessage = chunkResult.messages.find(m => m.includes('chunk(s) exceed'))!;
    // per-chunk 失败信息必须点名 offending chunk（否则排查无从下手）
    expect(chunkMessage).toContain(baseline.entries[0].file);

    // 用**真实的**上限跑一遍：基线自身必须过（与上面「有余量」互为印证）
    expect(compareBundleBaseline(baseline, baseline, ceilings).ok).toBe(true);
  });

  it('CI 的 Client JS budget 步骤跑的就是这个脚本（不是另一条命令）', () => {
    const ci = readFileSync(CI_PATH, 'utf8');
    const step = ci.slice(ci.indexOf('- name: Client JS budget'));
    expect(step).toContain('pnpm --filter ubean-test analyze:check');
    // 绝对上限写在 package.json 脚本里、CI 只调脚本 —— 避免两处数字漂移
    expect(step.slice(0, step.indexOf('- name:', 10))).not.toContain('--max-total-kb');
  });
});
