#!/usr/bin/env node
/**
 * 覆盖率**诊断**报告：逐包跑测试收集覆盖率，聚合成一份「零覆盖文件」清单。
 *
 * ## 为什么需要它
 *
 * 全仓此前没有任何覆盖率工具，于是「哪些能力域一行没测」只能靠人工 `grep` 符号名去猜
 * ——就是这么发现的：observability / websocket / sse / queue /
 * cron / storage 六个域在 L2 有 HTTP 层覆盖，**纯逻辑层零覆盖**（「走通一条路」有测，
 * 「边界与错误路径」没测）。这种结论应该由工具周期性地给出，而不是靠一次性审计。
 *
 * ## 刻意不设阈值
 *
 * 12 个主流框架里 0 个设覆盖率阈值（唯一近似的 Nitro `.github/codecov.yml`
 * `threshold: 50%` 在 CI 中从未生效）。设了阈值，团队就会为了数字写空断言；本脚本的
 * 用途是**发现零覆盖文件**，不是卡数字。因此：
 *
 *   - 本脚本**永远不因覆盖率数字而退出非零**（数字低只写进报告）；
 *   - 唯一会退出非零的情况是**工具本身坏了**（一个报告都没产出）；
 *   - 测试失败也不在这里阻断 —— 那已经由 `pnpm test` 负责，这里只记录。
 *
 * ## 为什么是 json-summary 而不是默认的 HTML + json
 *
 * `coverage-final.json` + 每文件 HTML 很重（单 `packages/server` 就 728K + 147.7K），
 * 24 个包累加后上传 artifact 得不偿失。`--coverage.reporter=json-summary` 每包只有
 * 8–16K（全仓约 136K），却恰好包含聚合所需的全部字段。
 *
 * ## 为什么逐包 spawn 而不是 `pnpm -r`
 *
 * `pnpm -r test` 会撞上 workspace 任务环
 * （`ERR_PNPM_TASK_CYCLE: packages/builder#test → packages/preset#test`），且 pnpm 会把
 * 额外 flag 透传给每个包的 `vp test`，
 * 出错时难以定位是哪个包。逐包 spawn 慢一点（本机约 3 分钟），但每个包的日志独立、
 * 单包失败不牵连其它包。
 *
 * ## 为什么必须带 --coverage.reportOnFailure
 *
 * `packages/cli` 的浏览器用例需要本机 chromium；缺失时该包测试失败（exit 1）。不带
 * `--coverage.reportOnFailure` 时 vitest 会连报告一起丢掉，于是 cli 在报告里整包消失
 * ——看起来像「cli 零覆盖」，实际是「报告没写出来」。带上后失败也照样落盘。
 *
 * ## 为什么显式排除 dist / test / node_modules
 *
 * v8 provider 默认只统计**被执行过的文件**，但 `packages/ubean/test/exports.test.ts` 是
 * 故意 import `dist/` 的（它锁的是**构建产物的导出面**，TS-01）。于是报告里会混进
 * `dist/*.js` 与测试替身 —— 那是产物覆盖率，不是源码覆盖率，混在一起会让「零覆盖文件」
 * 清单失真。显式排除后报告只谈 `src/`。
 *
 * ## 为什么顺带采集耗时
 *
 * 分片策略是「先测量各包耗时；仅当总时长超过阈值时才引入 `--shard`」。
 * 测量本身**不能**再起一遍全量测试：CI 已经跑了 `pnpm test`，再跑一次 coverage 已经
 * 是第二遍，第三遍纯为计时而跑会让流水线时长翻半。所以耗时**搭在这趟已有的逐包 spawn
 * 上** —— 每个包本来就要等它跑完，顺手记墙钟几乎零成本。
 *
 * 代价是这里的数字含覆盖率插桩开销（实测 `packages/builder` 19.5s → 25.7s）。对「是否
 * 需要分片」这个判断而言这是**保守**方向：插桩后都没超阈值，不插桩更不会超。报告里显式
 * 标注了这一点，并同时记录 vitest 自己打印的 `Duration` 行（那个也含插桩）。
 *
 * 用法：
 *   node scripts/coverage.mjs                # 全量收集 + 打印摘要 + 写报告
 *   node scripts/coverage.mjs --json         # 机器可读输出（stdout）
 *   node scripts/coverage.mjs --summary      # 只打印计数，不写报告
 *   node scripts/coverage.mjs --low 20       # 低覆盖阈值改为 20%（默认 10%）
 *   node scripts/coverage.mjs --packages server,vue   # 只跑指定包（调试用，同时跳过示例计时）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PACKAGES_DIR = join(REPO_ROOT, 'packages');
export const REPORT_DIR = join(REPO_ROOT, 'coverage');

/**
 * TS-24 的分片触发阈值：L1 关键路径（最慢的那个包）超过 10 分钟才引入 `--shard`。
 *
 * 取「关键路径」而不是「所有包耗时之和」是因为 `pnpm -r` 是并发调度：总墙钟由最慢的包
 * 决定，加包不线性加时。10 分钟这个数字来自 `docs/perf-regression-net.md` §69 的既有
 * 立场 —— GitHub 共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性；所以阈值只用来
 * 判断「要不要分片」这个工程决策，**不作为门禁**，超了也只是提示该分片。
 */
export const SHARD_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * L1 之外的**计时专用**项目（不参与覆盖率聚合）：
 *
 * - `L2` = `examples/ubean-test`：真实 `ubean dev` 端到端请求语义（37 文件 / 788 用例）
 * - `L5` = `examples/client-only-spa`：纯 SPA 示例（4 文件 / 30 用例）
 *
 * L3（浏览器 E2E，`pnpm test:e2e`）与 L4（构建产物契约）由各自 CI step 覆盖，本脚本不重复跑。
 */
export const TIMED_EXAMPLES = [
  { name: 'ubean-test', dir: join(REPO_ROOT, 'examples', 'ubean-test'), layer: 'L2' },
  { name: 'client-only-spa', dir: join(REPO_ROOT, 'examples', 'client-only-spa'), layer: 'L5' }
];

/** 五层测试的分层说明（报告里用来解释「哪些层没在本脚本里计时」）。 */
export const LAYER_NOTES = {
  L1: '包内单测（packages/*/test/）',
  L2: '示例集成（examples/ubean-test/test/，真实 ubean dev）',
  L3: '浏览器 E2E（pnpm test:e2e，独立 CI step，本脚本不计时）',
  L4: '构建产物契约（packages/cli/test/build-contracts.ts，含在 L1 的 cli 包里）',
  L5: '纯 SPA 示例（examples/client-only-spa/test/）'
};

/** 从 vitest 人类可读输出里取 `Duration  1.23s (tests 97%)` 的数字（毫秒）。 */
export function parseReportedDuration(log) {
  const m = /^\s*Duration\s+([\d.]+)(ms|s)\b/m.exec(log);
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  return m[2] === 's' ? value * 1000 : value;
}

/**
 * 传给每个包的 `vp test run` 参数。导出为常量是为了让测试能断言**真正的参数**
 * 而不是源码文本 —— 文件头注释里也提到了 `--coverage.reportOnFailure`，用
 * `source.includes(...)` 断言会被注释满足，实测确实漏过了一次破坏。
 */
export const VP_TEST_ARGS = [
  'test',
  'run',
  '--coverage',
  '--coverage.reporter=json-summary',
  '--coverage.reportsDirectory=coverage',
  // 见文件头：cli 的浏览器用例缺 chromium 时会失败，但报告仍必须落盘。
  '--coverage.reportOnFailure',
  // 见文件头：`packages/ubean` 的导出面测试故意 import dist/，不排除会让报告
  // 混进产物覆盖率。这三条同时挤掉测试文件自身与依赖。
  '--coverage.exclude=**/dist/**',
  '--coverage.exclude=**/test/**',
  '--coverage.exclude=**/node_modules/**'
];

/**
 * 把 markdown 报告追加到 GitHub job summary。
 *
 * 抽成函数是为了**能被真调用**地测：早期版本只断言源码里含 `GITHUB_STEP_SUMMARY` 字符串，
 * 而文件头注释里也写了这个词，于是「把 appendFileSync 删掉」这种破坏被注释满足、测试仍绿
 * （实测确认漏过）。`VP_TEST_ARGS` 的注释里记过同一个坑，这里犯了第二次。
 *
 * 本地跑（无 `GITHUB_STEP_SUMMARY`）时返回 false 且不报错 —— 诊断步骤不该因为环境变量
 * 缺失而失败。
 */
export function appendStepSummary(markdown, file = process.env.GITHUB_STEP_SUMMARY) {
  if (!file) return false;
  appendFileSync(file, `${markdown}\n`);
  return true;
}

/**
 * 逐包 spawn `vp test run`，返回 `{ name, layer, coverage, ok, log, durationMs, reportedDurationMs }`。
 *
 * `durationMs` 是墙钟（`Date.now()` 差），`reportedDurationMs` 是 vitest 自己打印的
 * `Duration` 行 —— 两者都记录是因为墙钟含进程启动/退出开销，而 `Duration` 只算 vitest
 * 内部时间；分片决策看墙钟（那才是 CI 真实成本）。
 */
export function runPackage(name, options = {}) {
  const cwd = options.dir ?? join(PACKAGES_DIR, name);
  const args = options.args ?? VP_TEST_ARGS;
  const layer = options.layer ?? 'L1';
  const coverage = options.coverage ?? true;
  const bin = join(REPO_ROOT, 'node_modules', '.bin', 'vp');
  return new Promise(finish => {
    const startedAt = Date.now();
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' }
    });
    let log = '';
    child.stdout.on('data', d => (log += d));
    child.stderr.on('data', d => (log += d));
    child.on('close', code =>
      finish({
        name,
        layer,
        coverage,
        ok: code === 0,
        log,
        durationMs: Date.now() - startedAt,
        reportedDurationMs: parseReportedDuration(log)
      })
    );
    child.on('error', error =>
      finish({
        name,
        layer,
        coverage,
        ok: false,
        log: `${log}\n${error.message}`,
        durationMs: Date.now() - startedAt,
        reportedDurationMs: null
      })
    );
  });
}

/** 读一个包的 `coverage-summary.json`，把每个文件条目归一化为带包名的行。 */
export function readPackageSummary(name) {
  const file = join(PACKAGES_DIR, name, 'coverage', 'coverage-summary.json');
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const files = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'total') continue;
    files.push({
      package: name,
      file: relative(join(PACKAGES_DIR, name), key),
      lines: value.lines?.pct ?? 0,
      statements: value.statements?.pct ?? 0,
      functions: value.functions?.pct ?? 0,
      branches: value.branches?.pct ?? 0,
      coveredStatements: value.statements?.covered ?? 0,
      totalStatements: value.statements?.total ?? 0
    });
  }
  return { total: raw.total, files };
}

function fmtPct(n) {
  return `${n.toFixed(2)}%`;
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function pad(s, n) {
  return String(s).padEnd(n);
}

function padStart(s, n) {
  return String(s).padStart(n);
}

/**
 * TS-24：把逐包墙钟汇总成「各包耗时 + 分层耗时 + 分片决策」。
 *
 * 关键路径取 `max(durationMs)` 而不是求和：`pnpm -r` 并发调度，总墙钟由最慢的包决定。
 * 当前最慢的包是 `cli`（浏览器走查），占全仓 ~72%，所以将来真要分片就从它切。
 */
export function buildTimings(results) {
  const projects = [...results]
    .map(r => ({
      name: r.name,
      layer: r.layer ?? 'L1',
      // 非数字（老调用点只给 `{name, ok, log}`）一律当 0，否则 `Math.max` 会拿到 NaN
      // 并让 `criticalPathMs` 静默变成 null、`reason` 里出现「NaNs」。
      durationMs: Number.isFinite(r.durationMs) ? r.durationMs : 0,
      reportedDurationMs: Number.isFinite(r.reportedDurationMs) ? r.reportedDurationMs : null,
      ok: r.ok
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  // 先按已知层建表，再填实测：L3（浏览器 E2E）本脚本不计时，但它必须**出现在表里**
  // 且项目数为 0 —— 否则读者会以为「L3 不存在」，而不是「L3 在别的 CI step 里」。
  const byLayer = {};
  for (const layer of Object.keys(LAYER_NOTES)) {
    byLayer[layer] = { layer, note: LAYER_NOTES[layer], projects: 0, durationMs: 0, measured: false };
  }
  for (const p of projects) {
    byLayer[p.layer] ??= { layer: p.layer, note: '', projects: 0, durationMs: 0, measured: false };
    byLayer[p.layer].projects += 1;
    byLayer[p.layer].durationMs += p.durationMs;
    byLayer[p.layer].measured = true;
  }

  const criticalPathMs = projects.reduce((max, p) => Math.max(max, p.durationMs), 0);
  const totalMs = projects.reduce((sum, p) => sum + p.durationMs, 0);
  // 没有任何项目时不要编一个「0s 未超阈值」的假结论。
  const criticalPathProject = projects.length > 0 ? projects[0].name : null;

  return {
    // 数字含覆盖率插桩开销（见文件头）—— 对「要不要分片」是保守方向。
    instrumentation: 'coverage-instrumented',
    thresholdMs: SHARD_THRESHOLD_MS,
    criticalPathMs,
    criticalPathProject,
    totalMs,
    // TS-24 验收②：未超阈值时显式记「延后」，而不是留一个沉默的缺席。
    shard: {
      deferred: criticalPathMs < SHARD_THRESHOLD_MS,
      thresholdMs: SHARD_THRESHOLD_MS,
      measuredMs: criticalPathMs,
      reason:
        criticalPathProject === null
          ? '没有采集到任何项目的耗时，无法判断是否需要分片'
          : criticalPathMs < SHARD_THRESHOLD_MS
            ? `关键路径 ${Math.round(criticalPathMs / 1000)}s 未超 ${SHARD_THRESHOLD_MS / 60000} 分钟阈值，延后分片`
            : `关键路径 ${Math.round(criticalPathMs / 1000)}s 已超 ${SHARD_THRESHOLD_MS / 60000} 分钟阈值，应优先切 ${criticalPathProject}`
    },
    layers: Object.values(byLayer).sort((a, b) => a.layer.localeCompare(b.layer)),
    projects
  };
}

/** 覆盖率是诊断信息，不是门禁：这里只汇总，任何数字都不影响退出码。 */
export function buildReport(results, summaries, lowThreshold = 10) {
  const allFiles = summaries.flatMap(s => s.files);
  const totals = summaries.reduce(
    (acc, s) => {
      for (const k of ['lines', 'statements', 'functions', 'branches']) {
        acc[k].total += s.total[k]?.total ?? 0;
        acc[k].covered += s.total[k]?.covered ?? 0;
      }
      return acc;
    },
    {
      lines: { total: 0, covered: 0 },
      statements: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 }
    }
  );
  const pct = t => (t.total === 0 ? 0 : (t.covered / t.total) * 100);

  return {
    generatedAt: new Date().toISOString(),
    // 显式记录「无阈值」这一决策，避免以后有人「顺手」加上。
    thresholds: null,
    lowCoverageThreshold: lowThreshold,
    packages: {
      total: results.filter(r => r.coverage !== false).length,
      reported: summaries.length,
      failedTests: results.filter(r => !r.ok).map(r => r.name)
    },
    timings: buildTimings(results),
    totals: {
      lines: pct(totals.lines),
      statements: pct(totals.statements),
      functions: pct(totals.functions),
      branches: pct(totals.branches),
      coveredStatements: totals.statements.covered,
      totalStatements: totals.statements.total
    },
    zeroCoverage: allFiles.filter(f => f.totalStatements > 0 && f.statements === 0),
    lowCoverage: allFiles.filter(f => f.statements > 0 && f.statements < lowThreshold),
    files: allFiles
  };
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# 覆盖率诊断报告');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push('');
  lines.push('> **本报告不设阈值**：覆盖率数字不参与任何门禁。');
  lines.push('> 用途是定位**零覆盖文件**，不是卡数字。');
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push(`- 参与包：${report.packages.reported}/${report.packages.total}`);
  if (report.packages.failedTests.length > 0) {
    lines.push(
      `- 测试失败的包（覆盖率仍已收集）：${report.packages.failedTests.join(', ')}` +
        ' —— 测试失败由 `pnpm test` 负责阻断，与本报告无关'
    );
  }
  lines.push(
    `- 语句 ${fmtPct(report.totals.statements)} ` +
      `(${report.totals.coveredStatements}/${report.totals.totalStatements}) / ` +
      `分支 ${fmtPct(report.totals.branches)} / ` +
      `函数 ${fmtPct(report.totals.functions)} / ` +
      `行 ${fmtPct(report.totals.lines)}`
  );
  lines.push('');

  const t = report.timings;
  lines.push('## 各包 / 各层耗时（TS-24）');
  lines.push('');
  lines.push(
    `> 数字在**覆盖率插桩**下测得（\`${t.instrumentation}\`），比不带覆盖率跑偏慢；` +
      '对「是否需要分片」是保守方向。' +
      `关键路径 ${fmtMs(t.criticalPathMs)}（\`${t.criticalPathProject}\`），` +
      `全部项目累计 ${fmtMs(t.totalMs)}。`
  );
  lines.push('');
  lines.push('| 层 | 说明 | 项目数 | 累计耗时 |');
  lines.push('| --- | --- | --- | --- |');
  for (const l of t.layers) {
    const cost = l.projects === 0 ? '—（不在本脚本计时）' : fmtMs(l.durationMs);
    lines.push(`| ${l.layer} | ${l.note} | ${l.projects} | ${cost} |`);
  }
  lines.push('');
  lines.push('| 项目 | 层 | 墙钟 | vitest Duration | 结果 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const p of t.projects) {
    lines.push(
      `| ${p.name} | ${p.layer} | ${fmtMs(p.durationMs)} | ` +
        `${p.reportedDurationMs === null ? '—' : fmtMs(p.reportedDurationMs)} | ` +
        `${p.ok ? '通过' : '失败'} |`
    );
  }
  lines.push('');
  lines.push('## 分片决策（TS-24）');
  lines.push('');
  lines.push(
    `阈值 ${fmtMs(t.shard.thresholdMs)}（关键路径口径）；实测 ${fmtMs(t.shard.measuredMs)}；` +
      `**${t.shard.deferred ? '未超阈值，延后分片' : '已超阈值，应分片'}**。`
  );
  lines.push('');
  lines.push(`> ${t.shard.reason}`);
  lines.push('');

  lines.push(`## 零覆盖文件（语句 0%，共 ${report.zeroCoverage.length} 个）`);
  lines.push('');
  if (report.zeroCoverage.length === 0) {
    lines.push('无。');
  } else {
    lines.push('| 包 | 文件 | 语句 |');
    lines.push('| --- | --- | --- |');
    for (const f of report.zeroCoverage) {
      lines.push(`| ${f.package} | ${f.file} | 0/${f.totalStatements} |`);
    }
  }
  lines.push('');

  lines.push(`## 低覆盖文件（语句 < ${report.lowCoverageThreshold}%，共 ${report.lowCoverage.length} 个）`);
  lines.push('');
  if (report.lowCoverage.length === 0) {
    lines.push('无。');
  } else {
    lines.push('| 包 | 文件 | 语句 | 函数 | 行 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const f of report.lowCoverage) {
      lines.push(
        `| ${f.package} | ${f.file} | ${fmtPct(f.statements)} | ${fmtPct(f.functions)} | ${fmtPct(f.lines)} |`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function printSummary(report) {
  console.log('覆盖率诊断报告（不设阈值）');
  console.log(`  包：${report.packages.reported}/${report.packages.total}`);
  console.log(
    `  语句 ${fmtPct(report.totals.statements)} / 分支 ${fmtPct(report.totals.branches)} / ` +
      `函数 ${fmtPct(report.totals.functions)} / 行 ${fmtPct(report.totals.lines)}`
  );
  console.log(`  零覆盖文件：${report.zeroCoverage.length}`);
  console.log(`  低覆盖文件（<${report.lowCoverageThreshold}%）：${report.lowCoverage.length}`);
  console.log('');
  console.log('  各项目耗时（TS-24，覆盖率插桩下测得）');
  for (const p of report.timings.projects) {
    console.log(`  ${pad(p.name, 20)} ${pad(p.layer, 4)} ${padStart(fmtMs(p.durationMs), 9)}${p.ok ? '' : ' (失败)'}`);
  }
  console.log(
    `  关键路径 ${fmtMs(report.timings.criticalPathMs)} / 阈值 ${fmtMs(report.timings.thresholdMs)}` +
      ` → ${report.timings.shard.deferred ? '未超阈值，延后分片' : '已超阈值，应分片'}`
  );
  if (report.zeroCoverage.length > 0) {
    console.log('');
    console.log(`  ${pad('包', 14)} ${pad('文件', 34)} 语句`);
    for (const f of report.zeroCoverage) {
      console.log(`  ${pad(f.package, 14)} ${pad(f.file, 34)} 0/${f.totalStatements}`);
    }
  }
  if (report.lowCoverage.length > 0) {
    console.log('');
    console.log(`  ${pad('包', 14)} ${pad('文件', 34)} ${padStart('语句', 7)} ${padStart('函数', 7)}`);
    for (const f of report.lowCoverage) {
      console.log(
        `  ${pad(f.package, 14)} ${pad(f.file, 34)} ${padStart(fmtPct(f.statements), 7)} ` +
          `${padStart(fmtPct(f.functions), 7)}`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const summaryOnly = args.includes('--summary');
  const lowThreshold = (() => {
    const at = args.indexOf('--low');
    return at === -1 ? 10 : Number.parseFloat(args[at + 1]) || 10;
  })();
  const onlyPackages = (() => {
    const at = args.indexOf('--packages');
    if (at === -1) return null;
    return new Set(
      (args[at + 1] ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  })();

  const names = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(PACKAGES_DIR, d.name, 'vite.config.ts')))
    .map(d => d.name)
    .filter(n => !onlyPackages || onlyPackages.has(n))
    .sort();

  if (names.length === 0) {
    console.error('没有找到任何待测包（检查 --packages 过滤条件）。');
    process.exit(1);
  }

  // 先清掉旧报告，避免把上一次运行的残留当成本次结果。
  for (const name of names) {
    rmSync(join(PACKAGES_DIR, name, 'coverage'), { recursive: true, force: true });
  }

  const results = [];
  for (const name of names) {
    process.stderr.write(`collecting coverage: ${name}\n`);
    results.push(await runPackage(name));
  }

  // TS-24：L2 / L5 只计时、不聚合覆盖率（它们的 coverage-summary 不进本报告的源码清单）。
  // `--packages` 是调试开关，此时跳过示例以免为了看一个包等 20 秒。
  if (!onlyPackages) {
    for (const example of TIMED_EXAMPLES) {
      process.stderr.write(`timing only: ${example.name} (${example.layer})\n`);
      results.push(
        await runPackage(example.name, {
          dir: example.dir,
          layer: example.layer,
          coverage: false,
          args: ['test', 'run']
        })
      );
    }
  }

  const summaries = [];
  for (const r of results) {
    const s = readPackageSummary(r.name);
    if (s) summaries.push(s);
    else process.stderr.write(`no coverage report produced: ${r.name}\n`);
  }

  if (summaries.length === 0) {
    console.error('一个覆盖率报告都没有产出 —— 覆盖率工具本身没跑起来，这是真实故障。');
    for (const r of results) {
      if (!r.ok) console.error(`\n--- ${r.name} (exit != 0) ---\n${r.log.slice(-2000)}`);
    }
    process.exit(1);
  }

  const report = buildReport(results, summaries, lowThreshold);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }

  if (!summaryOnly && !asJson) {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(join(REPORT_DIR, 'coverage-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const markdown = renderMarkdown(report);
    writeFileSync(join(REPORT_DIR, 'coverage-report.md'), markdown);
    // TS-24：CI 里把同一份报告贴到 job 摘要上，这样「各包/各层耗时」不用点开
    // artifact 就能看到。本地跑时 GITHUB_STEP_SUMMARY 不存在，静默跳过。
    appendStepSummary(markdown);
    console.log('');
    console.log(`报告已写入 coverage/coverage-report.md 与 coverage/coverage-report.json`);
  }

  // 刻意不按覆盖率数字退出：见文件头「刻意不设阈值」。
  process.exit(0);
}

// 只有被直接执行时才跑收集流程；被测试 import 时只拿到纯函数。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
