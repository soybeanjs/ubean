/**
 * TS-22：覆盖率报告的**结构断言 + 纯函数断言**。
 *
 * 为什么这几条必须钉住：
 *
 * 1. 「不设阈值」是本任务与 `docs/test.md` §7 不做清单的**直接契约**。没有断言时，
 *    后来者「顺手」加一个 `thresholds: { lines: 80 }` 会让 CI 变红却无人知道这是
 *    刻意禁止的 —— 12 个参照框架里 0 个设阈值，理由是设了就会逼出空断言。
 * 2. 覆盖率步骤必须是 **非阻断** 的（`continue-on-error: true`）：它会重跑一遍全部测试，
 *    测试失败已由 `pnpm test` 负责阻断；这里再阻断一次等于把同一件事罚两遍，而且
 *    会让「报告」在测试红时消失 —— 恰恰是最需要看报告的时候。
 * 3. `scripts/coverage.mjs` 对 `cli` 必须带 `--coverage.reportOnFailure`。缺 chromium 时
 *    cli 测试失败，不带这个 flag 报告会一起丢掉，报告里 cli 整包消失 —— 看起来像
 *    「cli 零覆盖」，实际是「报告没写出来」。这条已经踩过一次，值得自动化。
 * 4. `UBUNTU_ONLY_STEPS` 的覆盖由 `ci-matrix.test.ts` 负责（那边是全序断言）。
 *
 * 用**纯函数**断言而不是跑真收集：真收集要 3 分钟且依赖本机 chromium；这里只需要
 * 证明「给定的 summary 会被正确分类」与「脚本的 flag 组合正确」。
 */
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  buildTimings,
  appendStepSummary,
  parseReportedDuration,
  renderMarkdown,
  SHARD_THRESHOLD_MS,
  TIMED_EXAMPLES,
  VP_TEST_ARGS
} from '../../../scripts/coverage.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const scriptSource = readFileSync(join(repoRoot, 'scripts/coverage.mjs'), 'utf8');
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** 造一份最小 summary：一个零覆盖文件、一个低覆盖文件、一个健康文件。 */
function summaryFixture() {
  const mk = (covered: number, total: number) => ({
    statements: { covered, total, pct: (covered / total) * 100 },
    lines: { total, covered, pct: 50 },
    functions: { total: 4, covered: 2, pct: 50 },
    branches: { total: 2, covered: 1, pct: 50 }
  });
  return [
    {
      total: mk(90, 100),
      files: [
        {
          package: 'server',
          file: 'src/observability.ts',
          statements: 0,
          lines: 0,
          functions: 0,
          branches: 0,
          coveredStatements: 0,
          totalStatements: 186
        },
        {
          package: 'server',
          file: 'src/queue.ts',
          statements: 3,
          lines: 3,
          functions: 0,
          branches: 0,
          coveredStatements: 3,
          totalStatements: 147
        },
        {
          package: 'server',
          file: 'src/cache.ts',
          statements: 71,
          lines: 70,
          functions: 80,
          branches: 60,
          coveredStatements: 71,
          totalStatements: 100
        }
      ]
    }
  ];
}

const okResult = { name: 'server', ok: true, log: '' };

/** 造一条带耗时的 runPackage 结果。 */
function timed(name: string, durationMs: number, layer = 'L1', ok = true) {
  return { name, layer, coverage: true, ok, log: '', durationMs, reportedDurationMs: durationMs - 20 };
}

describe('TS-22 覆盖率报告', () => {
  it('脚本只在「工具本身坏了」时退出非零，正常收尾恒为 exit(0)', () => {
    // 结构断言：两处 exit(1) 都出现在收集阶段（没有待测包 / 一个报告都没产出），
    // 最后的 exit(0) 无条件执行 —— 覆盖率数字再低也走不到 exit(1)。
    const exits = scriptSource.match(/process\.exit\([^)]*\)/g) ?? [];
    expect(exits, `脚本的退出点应是 [exit(1), exit(1), exit(0)]，实际 ${JSON.stringify(exits)}`).toEqual([
      'process.exit(1)',
      'process.exit(1)',
      'process.exit(0)'
    ]);

    const report = buildReport([okResult], summaryFixture());
    expect(report.thresholds, '报告必须显式声明「无阈值」，避免以后被顺手加上').toBeNull();
  });

  it('零覆盖文件被单独归类（P1-9 六个域的诊断入口）', () => {
    const report = buildReport([okResult], summaryFixture());
    const zero = report.zeroCoverage.map(f => f.file);
    expect(zero, 'observability.ts 语句 0/186 必须进零覆盖清单').toContain('src/observability.ts');
    expect(zero, 'queue.ts 语句 3/147 不是零覆盖（有 3 行被测到）').not.toContain('src/queue.ts');
    expect(zero, 'cache.ts 71% 不该出现在零覆盖清单').not.toContain('src/cache.ts');
  });

  it('低覆盖阈值可调，且分类按语句覆盖率', () => {
    const at10 = buildReport([okResult], summaryFixture(), 10);
    expect(
      at10.lowCoverage.map(f => f.file),
      '默认 10% 时 queue.ts(2.04%) 属低覆盖'
    ).toContain('src/queue.ts');
    expect(at10.lowCoverage.map(f => f.file)).not.toContain('src/observability.ts');

    const at1 = buildReport([okResult], summaryFixture(), 1);
    expect(
      at1.lowCoverage.map(f => f.file),
      '阈值降到 1% 后 queue.ts 不再是低覆盖'
    ).not.toContain('src/queue.ts');
    expect(at1.lowCoverageThreshold).toBe(1);
  });

  it('测试失败的包仍进报告，且被标注出来（而不是静默消失）', () => {
    const report = buildReport(
      [
        { name: 'cli', ok: false, log: 'chromium missing' },
        { name: 'server', ok: true, log: '' }
      ],
      summaryFixture()
    );
    expect(report.packages.failedTests, '失败的包必须在报告里可见').toEqual(['cli']);
    expect(report.packages.total).toBe(2);
    expect(report.packages.reported).toBe(1);
  });

  it('markdown 报告显式写出「不设阈值」，且列出零覆盖文件', () => {
    const md = renderMarkdown(buildReport([okResult], summaryFixture()));
    expect(md).toContain('本报告不设阈值');
    expect(md).toContain('src/observability.ts');
  });

  it('脚本对 cli 带 --coverage.reportOnFailure（否则 cli 整包从报告里消失）', () => {
    // 断言**真正的参数数组**，不是源码文本：文件头注释里也写了这个 flag 名，
    // 用 `source.includes(...)` 会被注释满足（实测漏过一次破坏）。
    expect(VP_TEST_ARGS, '缺 chromium 时 cli 测试会失败，报告仍必须落盘').toContain('--coverage.reportOnFailure');
    expect(VP_TEST_ARGS, '聚合所需的报告格式').toContain('--coverage.reporter=json-summary');
    expect(VP_TEST_ARGS.slice(0, 2), '必须走 vp test run 而不是 vp test（后者是 watch）').toEqual(['test', 'run']);
  });

  it('脚本排除 dist / test / node_modules（否则报告混进产物覆盖率）', () => {
    // `packages/ubean/test/exports.test.ts` 故意 import dist/（锁构建产物导出面），
    // 不排除的话 `dist/index.js` 这类条目会出现在「零覆盖文件」清单里，
    // 把「哪些源码一行没测」这个信号淹没。
    for (const pattern of ['**/dist/**', '**/test/**', '**/node_modules/**']) {
      expect(VP_TEST_ARGS, `缺少 --coverage.exclude=${pattern}`).toContain(`--coverage.exclude=${pattern}`);
    }
  });

  it('根 package.json 提供 coverage script，且 @vitest/coverage-v8 版本与内嵌 vitest 对齐', () => {
    expect(rootPkg.scripts.coverage, '根 scripts 必须有 coverage 入口').toBeDefined();
    expect(rootPkg.scripts.coverage).toContain('scripts/coverage.mjs');
    // vite-plus 内嵌 vitest 5.0.1；coverage-v8 版本不一致会报 provider 版本冲突。
    expect(rootPkg.devDependencies['@vitest/coverage-v8']).toMatch(/^5\.0\.1$/);
  });

  it('覆盖率步骤是非阻断的（continue-on-error），且报告会上传为 artifact', () => {
    const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    // 定位 coverage step 那一段（到下一个 step 名或 job 边界为止）。
    const start = ci.indexOf('Coverage report (diagnostic, no thresholds)');
    expect(start, 'CI 里必须有 coverage 步骤').toBeGreaterThan(-1);
    const block = ci.slice(start, ci.indexOf('      - name:', start + 10));

    expect(block, '覆盖率是诊断步骤，数字再低也不能阻断 merge').toContain('continue-on-error: true');
    expect(block, '报告必须作为 artifact 上传，否则 CI 里看不到').toContain('node scripts/coverage.mjs');

    const uploadStart = ci.indexOf('Upload coverage report');
    expect(uploadStart, 'CI 里必须有 coverage artifact 上传步骤').toBeGreaterThan(-1);
    const uploadBlock = ci.slice(uploadStart, ci.indexOf('      - name:', uploadStart + 10));
    expect(uploadBlock, 'artifact 必须走 upload-artifact').toContain('actions/upload-artifact');
    expect(uploadBlock, 'artifact 名固定为 coverage-report').toContain('name: coverage-report');
    expect(uploadBlock, '测试失败也要把已有报告传上来（always()）').toContain('always()');
  });

  it('仓库里不存在任何覆盖率阈值配置（与 §7 不做清单一致）', () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const config = join(repoRoot, 'packages', entry.name, 'vite.config.ts');
      let text: string | null = null;
      try {
        text = readFileSync(config, 'utf8');
      } catch {
        continue;
      }
      if (/coverage\s*:\s*\{[\s\S]*?thresholds/.test(text)) offenders.push(config);
    }
    expect(offenders, `以下文件配置了覆盖率阈值（本任务刻意禁止）：${offenders.join(', ')}`).toEqual([]);
    // 脚本自己也不能悄悄加阈值对象（`thresholds: null` 是允许的显式声明）。
    expect(scriptSource).not.toMatch(/thresholds\s*:\s*\{/);
  });
});

/**
 * TS-24：分片**先测量**，未超阈值则显式记「延后」并写明阈值数字。
 *
 * 为什么这些必须钉住：
 *
 * 1. 阈值必须是**关键路径**口径而不是「所有包耗时之和」。`pnpm -r` 是并发调度，总墙钟
 *    由最慢的项目决定；用求和口径会让阈值随「加了几个小包」漂移，而加小包并不加时。
 * 2. 「未超阈值」必须是报告里**可见的一句话**（`deferred: true` + `reason` 含阈值数字），
 *    而不是留个沉默的缺席 —— 否则半年后没人知道这个决策当时是怎么定的、拿什么数字定的。
 * 3. CI 注释里也要写同一组数字（10 分钟 / 600s），因为 CI 是「读者会去看」的那一面。
 * 4. 测量必须搭在已有的 coverage 趟上（不再起第三遍全量测试）。这条用 `TIMED_EXAMPLES`
 *    的 `coverage: false` 语义 + 脚本里没有独立的计时入口来钉住。
 */
describe('TS-24 耗时采集与分片决策', () => {
  it('关键路径取 max 而不是求和（并发调度下总墙钟由最慢的项目决定）', () => {
    const timings = buildTimings([
      timed('cli', 122_000),
      timed('builder', 19_500),
      timed('server', 1_700),
      timed('ubean-test', 19_400, 'L2'),
      timed('client-only-spa', 1_400, 'L5')
    ]);

    expect(timings.criticalPathMs, '关键路径是最慢的那个项目，不是 5 项之和').toBe(122_000);
    expect(timings.criticalPathProject).toBe('cli');
    expect(timings.totalMs, '累计耗时可单独看，但不作为阈值口径').toBe(122_000 + 19_500 + 1_700 + 19_400 + 1_400);
    expect(
      timings.projects.map(p => p.name),
      '项目按耗时降序，最慢的排最前'
    ).toEqual(['cli', 'builder', 'ubean-test', 'server', 'client-only-spa']);
  });

  it('分层汇总按层累计，且 L1/L2/L5 各自可辨', () => {
    const timings = buildTimings([
      timed('cli', 122_000),
      timed('server', 1_700),
      timed('ubean-test', 19_400, 'L2'),
      timed('client-only-spa', 1_400, 'L5')
    ]);
    const byLayer = Object.fromEntries(timings.layers.map(l => [l.layer, l]));

    expect(byLayer.L1.projects).toBe(2);
    expect(byLayer.L1.durationMs).toBe(123_700);
    expect(byLayer.L2.durationMs).toBe(19_400);
    expect(byLayer.L5.durationMs).toBe(1_400);
    expect(byLayer.L3.note, 'L3 不在本脚本计时，但分层表里要解释清楚它去哪了').toContain('pnpm test:e2e');
  });

  it('未超阈值时显式记「延后」并写明阈值数字（TS-24 验收②）', () => {
    expect(SHARD_THRESHOLD_MS, '阈值定为 10 分钟').toBe(600_000);

    const under = buildTimings([timed('cli', 122_000), timed('server', 1_700)]);
    expect(under.shard.deferred).toBe(true);
    expect(under.shard.thresholdMs).toBe(600_000);
    expect(under.shard.measuredMs, '记的是实测关键路径').toBe(122_000);
    expect(under.shard.reason, '必须写出阈值数字，否则半年后没人知道拿什么定的').toContain('10 分钟');
    expect(under.shard.reason).toContain('延后分片');

    const over = buildTimings([timed('cli', 700_000)]);
    expect(over.shard.deferred).toBe(false);
    expect(over.shard.reason, '超阈值时要点名先切谁').toContain('cli');
  });

  it('耗时数字标注了「含覆盖率插桩」，避免被当成裸测试耗时', () => {
    const timings = buildTimings([timed('cli', 122_000)]);
    expect(timings.instrumentation).toBe('coverage-instrumented');
    const md = renderMarkdown(buildReport([okResult], summaryFixture()));
    expect(md, 'markdown 报告要写明插桩前提').toContain('覆盖率插桩');
    expect(md, '分片决策段要出现阈值与实测').toContain('分片决策');
  });

  it('从 vitest 的 Duration 行取秒/毫秒，缺行时为 null', () => {
    expect(parseReportedDuration(' Test Files  2 passed (2)\n Duration  1.23s (tests 97%)')).toBe(1230);
    expect(parseReportedDuration('Duration  254ms (transform 44%)')).toBe(254);
    expect(parseReportedDuration('Duration  122.15s (tests 97%, import 3%)')).toBe(122_150);
    expect(parseReportedDuration('没有这一行'), '解析不到就是 null，不能编一个 0').toBeNull();
  });

  it('L2/L5 示例只计时不参与覆盖率聚合，且 debug 用的 --packages 会跳过它们', () => {
    expect(TIMED_EXAMPLES.map(e => [e.name, e.layer])).toEqual([
      ['ubean-test', 'L2'],
      ['client-only-spa', 'L5']
    ]);
    // 只计时不聚合：它们的 summary 不该被读（否则报告里会混进示例源码）。
    expect(scriptSource, '示例必须走 coverage:false 的计时分支').toContain('coverage: false');
    expect(scriptSource, '--packages 是调试开关，要跳过示例计时').toMatch(/if \(!onlyPackages\)/);
  });

  it('没有任何项目时不编造「0s 未超阈值」的假结论', () => {
    const empty = buildTimings([]);
    expect(empty.criticalPathProject).toBeNull();
    expect(empty.shard.reason).toContain('无法判断');

    // 老调用点（只给 `{name, ok, log}`）不得让 `criticalPathMs` 变成 NaN/null。
    const legacy = buildTimings([{ name: 'server', ok: true, log: '' }]);
    expect(legacy.criticalPathMs, '缺 durationMs 时按 0 处理，而不是 NaN').toBe(0);
    expect(legacy.shard.reason).not.toContain('NaN');
  });

  it('CI 的 coverage 步骤写明「未超阈值，延后」与阈值数字', () => {
    const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    const start = ci.indexOf('Coverage report (diagnostic, no thresholds)');
    const block = ci.slice(start, ci.indexOf('      - name:', start + 10));

    expect(block, 'TS-24 验收②：CI 注释要写明「未超阈值，延后」').toContain('未超阈值，延后分片');
    expect(block, 'TS-24 验收②：注释要带阈值数字').toMatch(/10 分钟（600s）/);
    expect(block, '触发时的优先切割对象也要写在注释里').toContain('packages/cli');
  });

  it('耗时贴到 $GITHUB_STEP_SUMMARY（真调用，不是断言源码里出现过这个词）', () => {
    // 这条曾经用 `scriptSource.includes('GITHUB_STEP_SUMMARY')` 断言，而文件头注释里
    // 也写了这个词，于是把 appendFileSync 删掉仍能过（实测确认漏过）。现在直接调用函数。
    const target = join(repoRoot, 'coverage', '.step-summary-test.md');
    rmSync(target, { force: true });
    try {
      expect(appendStepSummary('# 报告\n\n| 项目 | 耗时 |\n', target), '有 summary 路径时写入').toBe(true);
      const written = readFileSync(target, 'utf8');
      expect(written, '写的是 markdown 报告本身').toContain('# 报告');
      expect(written, '末尾补换行，避免下一段粘上来').toMatch(/\n$/);

      expect(
        appendStepSummary('# 报告', undefined),
        '本地跑（无 GITHUB_STEP_SUMMARY）时静默跳过，诊断步骤不该因此失败'
      ).toBe(false);
    } finally {
      rmSync(target, { force: true });
    }
  });
});
