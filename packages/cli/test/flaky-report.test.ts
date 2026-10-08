/**
 * TS-25：flaky 报告与**待修清单门禁**的结构断言 + 纯函数断言。
 *
 * 为什么这几条必须钉住：
 *
 * 1. **门禁必须真的会因为「未记录」而失败。** TS-25 的验收第二格是「flaky 用例进入待修清单，
 *    而非靠 retry 转绿」。只产出报告时，这一格只能靠人自觉满足 —— 清单会永远空着，而验收
 *    项看起来已经通过。这正是本仓在 TS-20 / TS-22 / TS-24 反复踩过的「断言被缺席满足」。
 *    所以这里断言的是 `ok === false`（真判定），不是「报告里有个字段叫 unrecorded」。
 * 2. **`retriesEnabled: false` 时不得判定。** 没给过重试机会的运行，「0 条 flaky」只说明没测。
 *    若不区分，本地跑一次（无重试）就会给出「清单完整」的假结论，把门禁变成摆设。
 * 3. **`stale` 只能是提示。** flaky 是间歇的，一次未复现不是「已修」证据；做成错误会逼人
 *    删条目，反而丢掉历史。
 * 4. **畸形清单行必须抛错。** 静默跳过一行等于让那个条目从此不可见，门禁形同不存在。
 * 5. **`retry` 只在 CI 开、且两条轨都接线。** 不重试就观测不到 flaky（第一次失败即失败）；
 *    但本地默认必须 0 —— 偶发失败应当在本地当场暴露，而不是被重试吞掉。
 * 6. **`retry` / `reporters` 缺一不可。** 只配 retry 不配 reporter 等于纯掩盖；只配 reporter
 *    不配 retry 则永远收不到数据（`flaky` 恒为 false）。两条都要断言。
 *
 * 用**纯函数断言 + 真跑一次探针**而不是跑真 E2E：真 E2E 要 5 分钟且依赖 chromium；这里
 * 只需要证明「给定的报告与清单会被正确判定」以及「配置确实接上了」。
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CI_RETRIES,
  DEFAULT_LOCAL_RETRIES,
  LEDGER_COLUMNS,
  LEDGER_PLACEHOLDER,
  appendStepSummary,
  buildFlakyReport,
  checkFlakyLedger,
  diffFlaky,
  keyOf,
  parseFlakyLedger,
  renderCheckResult,
  renderFlakyMarkdown,
  renderGitHubWarnings,
  resolveRetries,
  writeFlakyReport
} from '../../../scripts/flaky.mjs';
import { withStepSummaryEnv } from './helpers/step-summary-env';

const repoRoot = resolve(import.meta.dirname, '../../..');
const scriptSource = readFileSync(join(repoRoot, 'scripts/flaky.mjs'), 'utf8');
const ledgerSource = readFileSync(join(repoRoot, 'docs/test-flaky.md'), 'utf8');

function flakyEntry(overrides: Record<string, unknown> = {}) {
  return {
    file: 'test/browser/specs/06-islands.e2e.spec.ts',
    testName: 'islands > hydrates on visibility',
    line: 42,
    layer: 'L3',
    retryCount: 1,
    retriesAllowed: 2,
    ...overrides
  };
}

function reportFixture(overrides: Record<string, unknown> = {}) {
  return buildFlakyReport({
    entries: [flakyEntry()],
    layer: 'L3',
    root: repoRoot,
    retriesEnabled: true,
    retriesAllowed: 2,
    generatedAt: '2026-10-07T00:00:00.000Z',
    ...overrides
  });
}

/** 清单 markdown：表头 + 若干条目（用与真实文件相同的列顺序）。 */
function ledgerMarkdown(rows: string[][]) {
  const body =
    rows.length > 0 ? rows.map(cells => `| ${cells.join(' | ')} |`).join('\n') : `| ${LEDGER_PLACEHOLDER} | | | | |`;
  return [
    '# flaky 用例待修清单（TS-25）',
    '',
    '## 待修清单',
    '',
    `| ${LEDGER_COLUMNS.join(' | ')} |`,
    `| ${LEDGER_COLUMNS.map(() => '---').join(' | ')} |`,
    body,
    ''
  ].join('\n');
}

describe('TS-25 flaky 报告与待修清单门禁', () => {
  it('重试策略：CI 1 次、本地 0 次，UBEAN_TEST_RETRIES 优先', () => {
    // 断言字面量而不是断言常量：`resolveRetries({}) === DEFAULT_LOCAL_RETRIES` 是自指的，
    // 把常量改成 1 也照样绿（实测确认漏过）。
    expect(resolveRetries({}), '本地默认必须是 0：偶发失败应当当场暴露，而不是被重试吞掉').toBe(0);
    expect(DEFAULT_LOCAL_RETRIES, '常量本身也要是 0').toBe(0);
    expect(resolveRetries({ CI: 'true' }), 'CI 下给 1 次').toBe(1);
    expect(DEFAULT_CI_RETRIES, 'CI 给 1 次即可暴露 flaky；2 次会放大本就慢的 L3').toBe(1);
    expect(resolveRetries({ CI: 'true', UBEAN_TEST_RETRIES: '3' }), '显式值覆盖 CI 默认').toBe(3);
    expect(resolveRetries({ UBEAN_TEST_RETRIES: '0' }), '显式 0 也是有效值，不能被 falsy 判断吞掉').toBe(0);
    expect(resolveRetries({ CI: 'true', UBEAN_TEST_RETRIES: 'abc' }), '非法值回退到默认，不产生 NaN').toBe(
      DEFAULT_CI_RETRIES
    );
    expect(resolveRetries({ CI: 'true', UBEAN_TEST_RETRIES: '-1' })).toBe(DEFAULT_CI_RETRIES);
  });

  it('门禁真的会因为「观测到但未记录」而失败（这是验收第二格的判据）', () => {
    const ledger = parseFlakyLedger(ledgerMarkdown([]), { path: 'ledger' });
    expect(ledger, '占位行必须被显式跳过，而不是被当成条目').toEqual([]);

    // 真判定：用临时文件喂给 checkFlakyLedger，走的是与 CI 完全相同的读盘路径。
    const reportPath = join(repoRoot, 'coverage', '.flaky-gate-test.json');
    const ledgerPath = join(repoRoot, 'coverage', '.flaky-gate-test.md');
    try {
      writeFlakyReport(reportFixture(), { jsonPath: reportPath });
      writeFileSync(ledgerPath, ledgerMarkdown([]));

      const failing = checkFlakyLedger({ reportPaths: [reportPath], ledgerPath });
      expect(failing.ok, '未记录 → 必须失败').toBe(false);
      expect(failing.diff.unrecorded).toHaveLength(1);
      expect(renderCheckResult(failing), '失败信息要点名是哪条用例').toContain('islands > hydrates on visibility');
      expect(renderCheckResult(failing), '并给出补齐方式').toContain('docs/test-flaky.md');

      writeFileSync(
        ledgerPath,
        ledgerMarkdown([
          [
            'islands > hydrates on visibility',
            '`test/browser/specs/06-islands.e2e.spec.ts:42`',
            'L3',
            '2026-10-07',
            '待修'
          ]
        ])
      );
      const passing = checkFlakyLedger({ reportPaths: [reportPath], ledgerPath });
      expect(passing.ok, '记录后通过').toBe(true);
      expect(passing.diff.recorded).toHaveLength(1);
    } finally {
      rmSync(reportPath, { force: true });
      rmSync(reportPath.replace(/\.json$/, '.md'), { force: true });
      rmSync(ledgerPath, { force: true });
    }
  });

  it('未启用重试的报告不参与判定（「0 条 flaky」不等于「没有 flaky」）', () => {
    // 必须走 `checkFlakyLedger` 真读盘 —— 早前这条自己重算了一遍过滤条件
    // （`[noRetry].filter(...)`），于是把过滤删掉也照样绿：测的是测试自己。
    const reportPath = join(repoRoot, 'coverage', '.flaky-noretry-test.json');
    const ledgerPath = join(repoRoot, 'coverage', '.flaky-noretry-test.md');
    try {
      writeFlakyReport(
        buildFlakyReport({ entries: [], layer: 'L2', root: repoRoot, retriesEnabled: false, retriesAllowed: 0 }),
        { jsonPath: reportPath }
      );
      writeFileSync(ledgerPath, ledgerMarkdown([]));

      const result = checkFlakyLedger({ reportPaths: [reportPath], ledgerPath });
      expect(result.reports, '报告本身要读到').toHaveLength(1);
      expect(result.gateable, '未启用重试 → 不进判定集合').toHaveLength(0);
      expect(result.skipped, '但要记为「跳过」而不是「没有」').toHaveLength(1);
      expect(result.ok, '不可判定时不算失败').toBe(true);
      expect(result.notes.join('\n'), '不静默放行：要写明为什么没判定').toContain('无法判定');
      expect(result.notes.join('\n'), '并点名是哪份报告被跳过').toContain('未启用重试、不参与判定');
      expect(renderFlakyMarkdown(result.reports[0]), '报告要自己说明这一趟没给过重试机会').toContain('未启用重试');
      expect(renderFlakyMarkdown(result.reports[0])).toContain('不构成「没有 flaky」的证据');
    } finally {
      rmSync(reportPath, { force: true });
      rmSync(reportPath.replace(/\.json$/, '.md'), { force: true });
      rmSync(ledgerPath, { force: true });
    }
  });

  it('清单里未复现的条目只提示，不判定（flaky 是间歇的）', () => {
    const reportPath = join(repoRoot, 'coverage', '.flaky-stale-test.json');
    const ledgerPath = join(repoRoot, 'coverage', '.flaky-stale-test.md');
    try {
      writeFlakyReport(reportFixture(), { jsonPath: reportPath });
      // 清单里只有一条**本次没观测到**的条目（stale），本次观测到的那条未记录。
      writeFileSync(
        ledgerPath,
        ledgerMarkdown([
          ['gone test', '`test/browser/specs/01-home-navigation.e2e.spec.ts:7`', 'L3', '2026-09-01', '已修（待观察）']
        ])
      );
      const result = checkFlakyLedger({ reportPaths: [reportPath], ledgerPath });
      expect(result.diff.stale.map(entry => entry.testName)).toEqual(['gone test']);
      expect(result.diff.unrecorded).toHaveLength(1);

      const rendered = renderCheckResult(result);
      expect(rendered).toContain('本次未复现');
      expect(rendered).toContain('一次未复现不构成「已修」证据');
      expect(rendered, '❌ 必须来自 unrecorded，而不是 stale').toContain('❌');
      expect(rendered).toContain('未记录进待修清单');

      // 反过来：只有 stale、没有 unrecorded 时结论必须是 ✅（stale 不判定）。
      writeFileSync(
        ledgerPath,
        ledgerMarkdown([
          [
            'islands > hydrates on visibility',
            '`test/browser/specs/06-islands.e2e.spec.ts:42`',
            'L3',
            '2026-10-07',
            '待修'
          ],
          ['gone test', '`test/browser/specs/01-home-navigation.e2e.spec.ts:7`', 'L3', '2026-09-01', '已修（待观察）']
        ])
      );
      const onlyStale = checkFlakyLedger({ reportPaths: [reportPath], ledgerPath });
      expect(onlyStale.diff.stale, 'still stale').toHaveLength(1);
      expect(onlyStale.diff.unrecorded, 'nothing unrecorded now').toHaveLength(0);
      expect(onlyStale.ok, 'stale 不得把结论改成失败').toBe(true);
      expect(renderCheckResult(onlyStale), '但必须仍然提示 stale').toContain('本次未复现');
      expect(renderCheckResult(onlyStale)).toContain('✅ 门禁通过');
    } finally {
      rmSync(reportPath, { force: true });
      rmSync(reportPath.replace(/\.json$/, '.md'), { force: true });
      rmSync(ledgerPath, { force: true });
    }
  });

  it('畸形清单行抛错而不是静默跳过（静默跳过等于门禁失效）', () => {
    const bad = ledgerMarkdown([['only-two', '`a.ts`']]);
    expect(() => parseFlakyLedger(bad, { path: 'docs/test-flaky.md' })).toThrow(/必须有 5 列/);
    expect(() => parseFlakyLedger('# 没有待修清单标题\n', { path: 'docs/test-flaky.md' })).toThrow(
      /找不到「## 待修清单」/
    );
    expect(() => parseFlakyLedger(ledgerMarkdown([['name', '', 'L3', '2026-10-07', '待修']]), { path: 'l' })).toThrow(
      /文件」列不能为空/
    );
  });

  it('用例身份是「文件::用例名」：用例在文件里挪动不该让清单条目失效', () => {
    const entry = flakyEntry();
    expect(keyOf(entry)).toBe('test/browser/specs/06-islands.e2e.spec.ts::islands > hydrates on visibility');
    const moved = flakyEntry({ line: 999 });
    expect(keyOf(moved), '行号不入键').toBe(keyOf(entry));

    const report = reportFixture({ entries: [flakyEntry({ line: 999 })] });
    const ledger = parseFlakyLedger(
      ledgerMarkdown([
        [
          'islands > hydrates on visibility',
          '`test/browser/specs/06-islands.e2e.spec.ts:42`',
          'L3',
          '2026-10-07',
          '待修'
        ]
      ]),
      { path: 'l' }
    );
    expect(diffFlaky([report], ledger).unrecorded, '行号变化不算未记录').toHaveLength(0);
  });

  it('报告与注解：重试比降序、::warning 带 file/title/line', () => {
    const report = buildFlakyReport({
      entries: [
        flakyEntry({ testName: 'low', retryCount: 1, retriesAllowed: 3 }),
        flakyEntry({ testName: 'high', retryCount: 2, retriesAllowed: 2 })
      ],
      layer: 'L3',
      retriesEnabled: true,
      retriesAllowed: 3
    });
    expect(report.total).toBe(2);
    expect(
      report.entries.map(entry => entry.testName),
      '重试比高的排前面（优先修）'
    ).toEqual(['high', 'low']);
    expect(report.entries[0].ratio).toBe(1);
    expect(renderFlakyMarkdown(report)).toContain('重试比 ≥ 80%');
    expect(renderFlakyMarkdown(report)).toContain('docs/test-flaky.md');

    const warnings = renderGitHubWarnings(report);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('::warning file=test/browser/specs/06-islands.e2e.spec.ts');
    expect(warnings[0]).toContain('line=42');
    expect(warnings[0], '冒号必须转义，否则 GitHub 解析注解时截断').toContain('title=flaky test%3A high');
    expect(warnings[0]).toContain('retries: 2 of 2');
    expect(
      renderGitHubWarnings(reportFixture({ entries: [flakyEntry({ line: null })] }))[0],
      '拿不到行号时省略该属性'
    ).not.toContain('line=');
  });

  it('step summary 与 TS-24 共用同一个 $GITHUB_STEP_SUMMARY（追加，不覆盖）', () => {
    const target = join(repoRoot, 'coverage', '.flaky-step-summary-test.md');
    rmSync(target, { force: true });
    try {
      expect(appendStepSummary('# flaky\n', target)).toBe(true);
      expect(appendStepSummary('# 覆盖率\n', target), '两次调用都成功').toBe(true);
      const written = readFileSync(target, 'utf8');
      expect(written, '两次都保留：追加语义').toContain('# flaky');
      expect(written, 'TS-24 的报告不能被覆盖').toContain('# 覆盖率');
      // 必须真的摘掉环境变量：`appendStepSummary(markdown, file = process.env.GITHUB_STEP_SUMMARY)`
      // 是默认参数，传 `undefined` 一样落回默认值 —— runner 上该变量存在，于是这里既返回 true
      // 又往真 step summary 里追加垃圾（CI 实测红过：`本地无该环境变量时静默跳过… expected true to be false`）。
      withStepSummaryEnv(undefined, () => {
        expect(appendStepSummary('# flaky'), '本地无该环境变量时静默跳过').toBe(false);
      });
    } finally {
      rmSync(target, { force: true });
    }
  });

  it('两条轨（L2/L3）都接上了 reporter 与 retry', () => {
    const rootConfig = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8');
    const exampleConfig = readFileSync(join(repoRoot, 'examples/ubean-test/vitest.config.ts'), 'utf8');

    expect(rootConfig, 'L3 必须真的允许重试，否则永远观测不到 flaky').toMatch(/retry:\s*resolveRetries\(\)/);
    expect(rootConfig, 'L3 必须挂 flaky reporter').toContain("'./scripts/flaky.mjs'");
    expect(rootConfig, 'L3 reporter 要标层').toContain("layer: 'L3'");
    expect(rootConfig, "reporters 是替换语义，必须显式保留 'default'").toMatch(/reporters:\s*\['default'/);

    expect(exampleConfig, 'L2 同样要 retry').toMatch(/retry:\s*resolveRetries\(\)/);
    expect(exampleConfig, 'L2 同样要挂 reporter').toContain('flaky.mjs');
    expect(exampleConfig, 'L2 reporter 要标层').toContain("layer: 'L2'");
    expect(exampleConfig, 'Windows 矩阵格上 URL.pathname 会给出 /C:/...，必须用 fileURLToPath').toContain(
      'fileURLToPath'
    );
    expect(exampleConfig, 'fileURLToPath 需要 import').toMatch(/import \{ fileURLToPath \} from 'node:url'/);
    // 注意：文件里原有的 islands registry 别名**合法地**用了 `.pathname`，所以只能对
    // reporter 路径这一行做断言，不能对整个文件断言「不出现 .pathname」。
    const reporterPathLine = exampleConfig.split('\n').find(line => line.includes('const flakyReporter')) ?? '';
    expect(reporterPathLine, 'reporter 路径要用 fileURLToPath(new URL(...)) 解析').toContain('fileURLToPath(new URL(');
    expect(reporterPathLine, 'reporter 路径不得用 URL.pathname').not.toContain('.pathname');

    // 反向断言：只有 retry 没有 reporter 时，flaky 一律静默转绿 —— 这正是「靠 retry 掩盖」。
    expect(rootConfig).toMatch(/reporters:[\s\S]*?flaky\.mjs/);
    expect(exampleConfig, 'L2 的 reporters 里要引用 flakyReporter 常量').toMatch(/reporters:[\s\S]*?flakyReporter/);
    expect(exampleConfig, 'flakyReporter 要指向 flaky.mjs').toContain(
      "const flakyReporter = fileURLToPath(new URL('../../scripts/flaky.mjs', import.meta.url));"
    );
  });

  it('待修清单文件本身可解析，且空清单用显式占位行', () => {
    expect(ledgerSource, '空清单不能靠「表里没数据」隐式表达').toContain(LEDGER_PLACEHOLDER);
    expect(ledgerSource).toContain('## 待修清单');
    for (const column of LEDGER_COLUMNS) expect(ledgerSource).toContain(column);
    expect(parseFlakyLedger(ledgerSource, { path: 'docs/test-flaky.md' }), '当前清单为空').toEqual([]);
    expect(ledgerSource, '清单要写明门禁语义，否则后人不知道空清单意味着什么').toContain(
      'node scripts/flaky.mjs --check'
    );
    expect(ledgerSource, '要写明 stale 只提示不判定').toContain('只提示');
  });

  it('CI 里有门禁步骤，且它是真门禁（无 continue-on-error）', () => {
    const ciYaml = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    // 只看步骤块，避免被文件里其他 `--check` 字样（比如注释）满足。
    const stepStart = ciYaml.indexOf('- name: Flaky test ledger gate (TS-25)');
    expect(stepStart, 'CI 里必须有 flaky 门禁步骤，否则报告写了没人看').toBeGreaterThan(-1);
    const nextStep = ciYaml.indexOf('\n      - name:', stepStart + 1);
    const step = ciYaml.slice(stepStart, nextStep === -1 ? undefined : nextStep);
    expect(step, '门禁步骤要真的调脚本').toContain('run: node scripts/flaky.mjs --check');
    expect(step, '门禁必须阻断 merge：加 continue-on-error 就变成装饰').not.toContain('continue-on-error');
    expect(step, '缺 L3 报告时判定不完整，故与 Browser E2E 同在 ubuntu').toContain("runner.os == 'ubuntu-latest'");
  });

  it('脚本自己声明了「报告而非掩盖」的立场与门禁入口', () => {
    // 用注释里的措辞做断言是脆弱的（TS-24 踩过：断言被注释满足的假绿）。这里只断言
    // **行为性**的东西：脚本可执行、有 --check、退出码语义在 main 里。
    expect(scriptSource).toContain('--check');
    expect(scriptSource).toMatch(/process\.exit\(result\.ok \? 0 : 1\)/);
    expect(scriptSource, '作为 reporter 使用时要声明不打 stdout').toContain('printsToStdio');
    expect(scriptSource, '只在最终通过且重试过时才算 flaky（vitest 的语义）').toContain('diagnostic?.flaky');
    expect(scriptSource, '拿不到行号只是少一列，不能让整次运行报错').toMatch(
      /typeof module\?\.children\?\.allTests !== 'function'\) continue/
    );

    // 退出码语义：把 exit 行改成恒 0 就是「门禁永远通过」。断言这行真的在。
    expect(scriptSource, '门禁失败必须翻成非零退出码').toMatch(/process\.exit\(result\.ok \? 0 : 1\)/);
    expect(scriptSource, '不带 --check 时打印用法并退出非零（避免静默当成 reporter 跑）').toMatch(
      /process\.exit\(args\.help \? 0 : 1\)/
    );
  });
});
