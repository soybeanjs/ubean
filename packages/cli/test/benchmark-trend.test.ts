/**
 * TS-26 · 周期性基准趋势（nightly）的契约测试。
 *
 * 为什么必须钉住这几件事：
 *
 * 1. **趋势必须真的会累积，而不是每次覆盖。** 这是本任务的核心 ——
 *    `benchmark-lifecycle.mjs` 的 `--json` / `--out` 都是整文件覆盖，跑完一次上一次就没了；
 *    `appendTrendPoints` 若退化成 `writeFileSync`，本任务的全部价值当场归零，而**没有任何
 *    肉眼可见的症状**（单次运行照样打印一张漂亮的表）。所以断言必须真读盘、真跑两次。
 * 2. **`comparable: false` 时不得给出「性能回归」的暗示。** 基线在 Apple M1/M5 上采，
 *    nightly 在 ubuntu EPYC 上跑，绝对值天然差几倍。若不标注机器差异，趋势会变成一部
 *    生产事故制造机（`docs/perf-regression-net.md` §4.4 的原话：会持续假阳性，
 *    最终结局是被绕过或放宽）。
 * 3. **畸形历史行必须抛错。** 追加写的文件里一行坏掉不会让已有行失效，很容易被当成
 *    「少了一个点」静默放过；但坏行的真实含义是「这份历史不可信」——那正是趋势要回答的问题。
 * 4. **退出码恒为 0。** 本脚本是采集不是门禁；若它开始因数值变化返回非零，就等于在
 *    nightly 里引入了性能阻断（TS-26 验收第二格的边界）。
 * 5. **PR 门禁里没有 benchmark step。** 验收第二格「PR 门禁中无性能阻断」需要机器判据，
 *    否则只能靠人记得「别往 ci.yml 里加 benchmark」。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TREND_PATH,
  TREND_KIND,
  TREND_METRICS,
  appendTrendPoints,
  buildTrend,
  compareMetrics,
  parseTrendHistory,
  pickArmPoints,
  readTrendHistory,
  renderTrendMarkdown,
  trendPointsFromReport
} from '../../../scripts/benchmark-trend.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const scriptPath = join(repoRoot, 'scripts/benchmark-trend.mjs');
const tempDir = join(repoRoot, '.temp', 'benchmark-trend-test');
const rootRequire = createRequire(join(repoRoot, 'package.json'));

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** 造一份 `benchmark-lifecycle.mjs --json` 形态的报告（`{ environment, arms }`）。 */
function reportFixture({ environment, arms } = {}) {
  const summary = (devColdStart, buildWall) => ({
    devColdStart: { n: 3, p50: devColdStart, p95: devColdStart + 10, min: devColdStart - 5, max: devColdStart + 20 },
    buildWall: { n: 3, p50: buildWall, p95: buildWall + 10, min: buildWall - 5, max: buildWall + 20 },
    reloadScope: { n: 3, preserved: 3, reevaluated: 0, processRestarted: 0 }
  });
  return {
    environment: environment ?? {
      node: 'v24.21.0',
      platform: 'darwin',
      arch: 'arm64',
      cpuModel: 'Apple M5',
      cpuCount: 10,
      totalMemMb: 16384
    },
    arms: arms ?? {
      cli: { label: 'cli', summary: summary(1000, 1300) }
    }
  };
}

function pointFor(arm, at, devColdStart, environment) {
  return trendPointsFromReport(
    reportFixture({
      environment,
      arms: {
        [arm]: {
          label: arm,
          summary: { devColdStart: { n: 3, p50: devColdStart }, reloadScope: { n: 3, preserved: 3 } }
        }
      }
    }),
    { at, label: 'test' }
  )[0];
}

describe('TS-26 基准趋势采集', () => {
  it('趋势点从报告里提取 p50，缺指标记为 null 而不是 0', () => {
    const points = trendPointsFromReport(reportFixture());
    expect(points).toHaveLength(1);
    const [point] = points;
    expect(point.kind).toBe(TREND_KIND);
    expect(point.arm).toBe('cli');
    expect(point.metrics.devColdStart).toBe(1000);
    // 报告里没有 browserHydration → 必须是 null（0ms 会被读成「快得离谱」）
    expect(point.metrics.browserHydration).toBeNull();
    expect(point.reloadScope).toEqual({ n: 3, preserved: 3, reevaluated: 0 });
    expect(point.environment.cpuModel).toBe('Apple M5');
  });

  it('追加写而非覆盖：第二次追加后历史里有两个点（真读盘）', () => {
    const file = join(tempDir, 'trend.jsonl');
    const first = appendTrendPoints(file, pointFor('cli', '2026-10-01T00:00:00.000Z', 1000));
    expect(first).toHaveLength(1);

    const second = appendTrendPoints(file, pointFor('cli', '2026-10-02T00:00:00.000Z', 1100));
    expect(second).toHaveLength(2);

    // 断言磁盘上的真实内容 —— 只断言返回值的话，`writeFileSync` 也能骗过前两条
    const onDisk = parseTrendHistory(readFileSync(file, 'utf8'));
    expect(onDisk).toHaveLength(2);
    expect(onDisk.map(point => point.metrics.devColdStart)).toEqual([1000, 1100]);
    expect(pickArmPoints(readTrendHistory(file), 'cli')).toHaveLength(2);
  });

  it('多个臂在一次追加里各自成点', () => {
    const file = join(tempDir, 'arms.jsonl');
    const points = trendPointsFromReport(
      reportFixture({
        arms: {
          cli: { label: 'cli', summary: { devColdStart: { n: 3, p50: 1000 } } },
          vite: { label: 'vite', summary: { devColdStart: { n: 3, p50: 100 } } }
        }
      }),
      { at: '2026-10-01T00:00:00.000Z' }
    );
    expect(points.map(point => point.arm)).toEqual(['cli', 'vite']);
    const history = appendTrendPoints(file, points);
    expect(history).toHaveLength(2);
    expect(pickArmPoints(history, 'vite')[0].metrics.devColdStart).toBe(100);
  });

  it('畸形历史行抛错（不静默跳过）', () => {
    expect(() => parseTrendHistory('{"kind":"other"}\n')).toThrow(/kind 不是/);
    expect(() => parseTrendHistory('not json\n')).toThrow(/不是合法 JSON/);
    expect(() => parseTrendHistory(`${JSON.stringify({ kind: TREND_KIND, arm: 'cli' })}\n`)).toThrow(/缺少 metrics/);
    expect(() => parseTrendHistory(`${JSON.stringify({ kind: TREND_KIND, metrics: {} })}\n`)).toThrow(/缺少 arm/);
    // 空行跳过（文件末尾的换行不该炸）
    expect(parseTrendHistory('\n\n')).toEqual([]);
  });

  it('报告结构不对时抛错（臂为空 / 没有 arms）', () => {
    expect(() => trendPointsFromReport({ environment: {} })).toThrow(/缺少 arms/);
    expect(() => trendPointsFromReport({ arms: {} })).toThrow(/arms 为空/);
  });

  it('与上一次对比：算出每个指标的差值与比例', () => {
    const base = pointFor('cli', '2026-10-01T00:00:00.000Z', 1000);
    const current = pointFor('cli', '2026-10-02T00:00:00.000Z', 1250);
    const comparison = compareMetrics(current, base);
    expect(comparison.comparable).toBe(true);
    const row = comparison.rows.find(entry => entry.key === 'devColdStart');
    expect(row.base).toBe(1000);
    expect(row.current).toBe(1250);
    expect(row.ratio).toBeCloseTo(1.25, 5);
    expect(row.deltaPct).toBeCloseTo(25, 5);
    // 两边都缺的指标 → ratio/deltaPct 为 null 而不是 NaN
    const missing = comparison.rows.find(entry => entry.key === 'buildCpu');
    expect(missing.ratio).toBeNull();
    expect(missing.deltaPct).toBeNull();
  });

  it('机器不同 → comparable: false 且写明差异字段（不让人误读成性能回归）', () => {
    const base = pointFor('cli', '2026-10-01T00:00:00.000Z', 1000, {
      node: 'v24.21.0',
      platform: 'darwin',
      arch: 'arm64',
      cpuModel: 'Apple M5',
      cpuCount: 10
    });
    const current = pointFor('cli', '2026-10-02T00:00:00.000Z', 4000, {
      node: 'v24.21.0',
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'AMD EPYC 7763 64-Core Processor',
      cpuCount: 4
    });
    const comparison = compareMetrics(current, base);
    expect(comparison.comparable).toBe(false);
    expect(comparison.reason).toContain('机器不同');
    expect(comparison.reason).toContain('platform');
    expect(comparison.reason).toContain('cpuModel');
    // 数字仍然给出（是采集到的事实），只是整体标记为不可比
    expect(comparison.rows.find(entry => entry.key === 'devColdStart').current).toBe(4000);
  });

  it('buildTrend 给出最新点 / 上一个点 / 基线三条参照', () => {
    const history = [
      pointFor('cli', '2026-10-01T00:00:00.000Z', 1000),
      pointFor('cli', '2026-10-02T00:00:00.000Z', 1100)
    ];
    const baseline = {
      recordedOn: 'current',
      environment: { platform: 'darwin', arch: 'arm64', cpuModel: 'Apple M5' },
      arms: { cli: { summary: { devColdStart: { n: 5, p50: 900 } } } }
    };
    const trend = buildTrend(history, { baseline });
    expect(trend.totalPoints).toBe(2);
    const [arm] = trend.arms;
    expect(arm.pointCount).toBe(2);
    expect(arm.latest.metrics.devColdStart).toBe(1100);
    expect(arm.previous.metrics.devColdStart).toBe(1000);
    expect(arm.vsPrevious.rows.find(entry => entry.key === 'devColdStart').deltaPct).toBeCloseTo(10, 5);
    expect(arm.vsBaseline.rows.find(entry => entry.key === 'devColdStart').base).toBe(900);
    expect(arm.baselineLabel).toBe('current');
  });

  it('只有一个数据点时 vsPrevious 为 null（不编造「与上一次相同」）', () => {
    const trend = buildTrend([pointFor('cli', '2026-10-01T00:00:00.000Z', 1000)], { baseline: null });
    expect(trend.arms[0].vsPrevious).toBeNull();
    expect(trend.arms[0].vsBaseline).toBeNull();
    const markdown = renderTrendMarkdown(trend, { trendPath: '/tmp/x.jsonl' });
    expect(markdown).toContain('只有一个数据点');
  });

  it('markdown 写明「不进 PR 门禁」并渲染指标表', () => {
    const history = [
      pointFor('cli', '2026-10-01T00:00:00.000Z', 1000),
      pointFor('cli', '2026-10-02T00:00:00.000Z', 1100)
    ];
    const markdown = renderTrendMarkdown(buildTrend(history), { trendPath: '/tmp/x.jsonl' });
    expect(markdown).toContain('不进 PR 门禁');
    expect(markdown).toContain('不设阈值');
    for (const { label } of TREND_METRICS) expect(markdown).toContain(label);
    expect(markdown).toContain('历史点：2 条');
    expect(markdown).toContain('与上一次运行对比');
    // 单例保留（RM-P04）也要出现在趋势里 —— 它是正确性判据，不只是耗时
    expect(markdown).toContain('reload 正确性');
  });

  it('默认趋势路径落在 .temp/ 下（已被 .gitignore 忽略）', () => {
    expect(DEFAULT_TREND_PATH.startsWith(join(repoRoot, '.temp'))).toBe(true);
    const ignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    expect(ignore.split('\n').map(line => line.trim())).toContain('.temp');
  });

  it('CLI：追加趋势点并退出 0（真跑子进程，真读盘）', () => {
    mkdirSync(tempDir, { recursive: true });
    const reportPath = join(tempDir, 'report.json');
    const trendPath = join(tempDir, 'cli-trend.jsonl');
    writeFileSync(reportPath, `${JSON.stringify(reportFixture(), null, 2)}\n`);

    const output = execFileSync(
      process.execPath,
      [scriptPath, '--report', reportPath, '--trend', trendPath, '--baseline', 'none'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    expect(output).toContain('生命周期基准趋势');
    expect(output).toContain('不进 PR 门禁');
    expect(output).toContain('追加 1 个趋势点');
    expect(existsSync(trendPath)).toBe(true);

    // 再跑一次 → 历史累积（这正是「趋势」与「一次性报告」的分界）
    execFileSync(process.execPath, [scriptPath, '--report', reportPath, '--trend', trendPath, '--baseline', 'none'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    expect(parseTrendHistory(readFileSync(trendPath, 'utf8'))).toHaveLength(2);
  });

  it('CLI 缺少 --report 时打印用法并退出 1', () => {
    let code = 0;
    let output = '';
    try {
      execFileSync(process.execPath, [scriptPath], { cwd: repoRoot, encoding: 'utf8' });
    } catch (error) {
      code = error.status;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    expect(code).toBe(1);
    expect(output).toContain('用法');
  });
});

describe('TS-26 nightly 接线与 PR 门禁边界', () => {
  const workflowPath = join(repoRoot, '.github/workflows/nightly-perf.yml');
  const ciPath = join(repoRoot, '.github/workflows/ci.yml');
  const YAML = rootRequire('yaml');
  // 刻意解析 YAML 而不是断言源码文本：注释里也会出现 `pull_request`、`benchmark:lifecycle`
  // 这些词，`source.includes(...)` 会被注释满足（TS-24 的 M1 假绿就是这个形态），
  // 反过来 `not.toContain` 也会被注释误伤 —— 两个方向都只能靠解析结构来避免。
  const nightly = YAML.parse(readFileSync(workflowPath, 'utf8'));
  const ci = YAML.parse(readFileSync(ciPath, 'utf8'));
  const nightlyRunText = nightly.jobs.perf.steps.map(step => step.run ?? '').join('\n');

  it('存在独立的 nightly workflow，且不被 PR / push 触发', () => {
    expect(Object.keys(nightly.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(nightly.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('nightly workflow 真的接线了采集脚本（跑的是 run，不是注释）', () => {
    expect(nightlyRunText).toContain('benchmark:lifecycle');
    expect(nightlyRunText).toContain('scripts/benchmark-trend.mjs');
    expect(nightlyRunText).toContain('playwright install');
    // 报告与趋势文件确实传给了趋势脚本
    expect(nightlyRunText).toMatch(/--report\s+\.temp\/perf-report\.json/);
    // 趋势历史确实会被恢复（否则每次都是从零开始，趋势不成立）
    const cacheStep = nightly.jobs.perf.steps.find(
      step => step.uses === 'actions/cache@v6' && step.with?.['restore-keys']
    );
    expect(cacheStep?.with?.['restore-keys']).toContain('perf-trend-');
    expect(cacheStep?.with?.path).toBe('.temp/perf-trend.jsonl');
  });

  it('nightly workflow 里没有任何性能阻断参数', () => {
    expect(nightlyRunText).not.toMatch(/--max-|--threshold|--fail-on|--assert/);
  });

  it('PR 路径（ci.yml）里没有任何基准步骤 —— 验收第二格的机器判据', () => {
    const ciRunText = ci.jobs.ci.steps.map(step => step.run ?? '').join('\n');
    expect(ciRunText).not.toContain('benchmark:lifecycle');
    expect(ciRunText).not.toContain('benchmark-trend');
    expect(ciRunText).not.toContain('nightly-perf');
    // 唯一与性能有关的步骤是体积预算 —— 确定性的、由 RM-P06 定义，不是时序数字
    const names = ci.jobs.ci.steps.map(step => step.name ?? step.uses ?? '');
    expect(names.filter(name => /benchmark|perf|trend|budget/i.test(name))).toEqual(['Client JS budget']);
  });
});
