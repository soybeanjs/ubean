#!/usr/bin/env node
/**
 * flaky 用例**报告**与**待修清单门禁**（TS-25）。
 *
 * ## 为什么需要它
 *
 * `docs/test.md` 的 TS-25 依据是「无重试策略、无 flaky 记录；E2E 与 dev-server 类测试天然
 * 易 flaky」。在引入它之前，本仓任何一次偶发失败都只有两种归宿：重跑一次碰运气，或者被
 * 当成真实回归去查 —— 两种都不留下任何可追踪的记录，于是同一个 flaky 用例可以年复一年地
 * 偶发红，每次都被当成「这次运气不好」。
 *
 * ## 为什么「允许重试」不等于「靠 retry 转绿」
 *
 * 检测 flakiness 与掩盖 flakiness 的区别不在**有没有重试**，而在**重试之后有没有留痕**。
 * 不重试就永远观测不到 flaky（第一次失败即失败）；重试但不报告才是掩盖。所以分工是：
 *
 *   1. CI 下 L2 / L3 允许 1 次重试（本地 0 次 —— 照 SvelteKit `KIT_E2E_RETRIES` 的做法，
 *      本仓对应 `UBEAN_TEST_RETRIES` 环境变量可覆盖）；
 *   2. 每次运行都产出机器可读报告（`coverage/flaky-report.json`）+ 人读报告
 *      （`coverage/flaky-report.md`）+ GitHub `::warning` 注解 + `$GITHUB_STEP_SUMMARY`；
 *   3. **门禁**：观测到 flaky 却没写进 `docs/test-flaky.md` 的待修清单 → 退出非零。
 *
 * 第 3 条是关键。只报告不门禁时，「flaky 用例进入待修清单」只能靠人自觉 —— 清单会永远空着，
 * 而验收项看起来已经满足（这正是本仓在 TS-20 / TS-22 / TS-24 反复踩过的「断言被缺席满足」
 * 那一类假绿）。门禁把「记录」变成一次编辑就能满足的**硬要求**，同时重试仍然保证偶发失败
 * 不会误伤无关 PR：红的是「你观测到了但没记下来」，不是「这条用例偶尔失败」。
 *
 * ## 为什么用自定义 reporter 而不是内置 `github-actions`
 *
 * vitest 5.0.1 起内置 `github-actions` reporter 已经会在 `$GITHUB_STEP_SUMMARY` 里渲染
 * 「### Flaky Tests」段（`GITHUB_ACTIONS=true` 时自动启用，见
 * `vitest/dist/chunks/defaults.D2ip7f-X.js:67`），但它**只写 markdown**。门禁需要机器可读的
 * 输入，而 JSON / junit reporter 都拿不到重试信息 —— `JsonReporter` 手工组装 `assertionResults`
 * 时把 `retryCount` 丢掉了（实测其键只有 `ancestorTitles/fullName/status/title/duration/
 * failureMessages/meta/tags/benchmarks`），junit 的 `<testcase>` 也只有 `classname/name/time`。
 * 唯一可靠的通道是 reporter 的 `onTestCaseResult` + `testCase.diagnostic()`
 * （实测返回 `{ slow, heap, duration, startTime, retryCount, repeatCount, flaky }`），
 * 所以这里自写一个，并把内置 reporter 的两项能力（`::warning` 注解 + step summary）一并补齐。
 *
 * 另一个理由：`flaky` 只有「**最终通过**且重试过」才为 true。始终失败的用例
 * `retryCount = N, flaky = false` —— 它是真回归，不该进待修清单，重试次数本身也不构成
 * flaky 证据。这个语义由 vitest 定义，这里只是如实使用。
 *
 * ## 为什么报告里要记「本次是否启用重试」
 *
 * `retriesEnabled: false` 时观测到 0 条 flaky **不能**证明「没有 flaky」—— 它只说明这一趟
 * 根本没给重试机会。门禁据此区分「干净」与「没测」，`--check` 对未启用重试的报告只打印、
 * 不参与判定（见 `checkFlakyLedger` 的 `gateable`）。
 *
 * 用法：
 *
 *   node scripts/flaky.mjs --check [report.json ...]   # 门禁（默认检查两条轨的报告）
 *   node scripts/flaky.mjs --check --json              # 门禁，结果以 JSON 输出
 *
 * 作为 vitest reporter 使用（在 `test.reporters` 里给选项）：
 *
 *   reporters: [['./scripts/flaky.mjs', { layer: 'L3' }]]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** flaky 报告默认落盘位置（按 config.root 解析；两条轨各自的 `coverage/` 已被 .gitignore 忽略）。 */
export const REPORT_FILE_NAME = 'flaky-report.json';

/** 门禁默认检查的报告（无参数时使用）。 */
export const DEFAULT_REPORT_PATHS = [
  join(REPO_ROOT, 'coverage', REPORT_FILE_NAME),
  join(REPO_ROOT, 'examples', 'ubean-test', 'coverage', REPORT_FILE_NAME)
];

/** 待修清单（committed，人工维护；门禁以它为唯一真值）。 */
export const LEDGER_PATH = join(REPO_ROOT, 'docs', 'test-flaky.md');

/** 层级标签（与 `scripts/coverage.mjs` 的 L1–L5 口径一致）。 */
export const LAYER_LABELS = {
  L2: 'L2 示例集成',
  L3: 'L3 浏览器 E2E'
};

/** 待修清单表格的列（顺序即渲染顺序）。 */
export const LEDGER_COLUMNS = ['用例', '文件', '层', '首次观测', '状态'];

/** 占位行：清单为空时用它，解析器显式跳过（而不是靠「表里没数据」隐式表达）。 */
export const LEDGER_PLACEHOLDER = '（暂无）';

/** 本地（非 CI）默认重试次数。 */
export const DEFAULT_LOCAL_RETRIES = 0;

/** CI 默认重试次数。1 次即可暴露 flaky（2 次会放大本就慢的 L3）。 */
export const DEFAULT_CI_RETRIES = 1;

/**
 * 解析重试次数：显式 `UBEAN_TEST_RETRIES` > CI 默认 > 本地默认。
 *
 * 单独开一个环境变量而不是只认 `CI`，是为了让门禁与 reporter 能在本地被真跑一遍
 * （否则「CI 才有重试」意味着本地永远无法验证这条链路，只能等 CI 上碰运气）。
 */
export function resolveRetries(env = process.env) {
  const raw = env.UBEAN_TEST_RETRIES;
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return env.CI ? DEFAULT_CI_RETRIES : DEFAULT_LOCAL_RETRIES;
}

/** 用例身份：`文件::用例名`。行号不入键 —— 用例在文件里挪动不该让清单条目失效。 */
export function keyOf(entry) {
  return `${entry.file}::${entry.testName}`;
}

/**
 * 把绝对路径折成仓库相对路径。
 *
 * 只处理绝对路径：`relative()` 对已经是相对路径的输入会按 cwd 解析（而 reporter 的 cwd 是
 * 各包的目录，不是仓库根），于是 `test/browser/x.spec.ts` 会变成
 * `packages/cli/test/browser/x.spec.ts` —— 清单里的路径与报告里的路径因此对不上，门禁会永远
 * 报「未记录」。清单是人写的，人写的是仓库相对路径，所以相对路径原样保留。
 */
export function toRepoRelative(absolutePath) {
  if (typeof absolutePath !== 'string' || absolutePath === '') return '';
  if (!isAbsolute(absolutePath)) return absolutePath;
  const rel = relative(REPO_ROOT, absolutePath);
  if (rel === '' || rel.startsWith('..')) return absolutePath;
  return rel.split(sep).join('/');
}

/** 单条 flaky 记录。`retriesAllowed` 取该用例自身的 `retry` 选项，回退到运行级配置。 */
export function normalizeEntry(raw, fallbackAllowed = 0) {
  const retryCount = Number(raw?.retryCount) || 0;
  const allowedRaw = raw?.retriesAllowed;
  const retriesAllowed =
    Number.isFinite(Number(allowedRaw)) && Number(allowedRaw) > 0 ? Number(allowedRaw) : fallbackAllowed || retryCount;
  return {
    file: toRepoRelative(raw?.file),
    testName: String(raw?.testName ?? ''),
    line: Number.isFinite(Number(raw?.line)) && Number(raw.line) > 0 ? Number(raw.line) : null,
    layer: raw?.layer ?? null,
    retryCount,
    retriesAllowed,
    ratio: retriesAllowed > 0 ? retryCount / retriesAllowed : 1
  };
}

/**
 * 聚合一次运行的 flaky 报告。
 *
 * `retriesEnabled` 与 `retriesAllowed` 必须显式带上：报告的核心作用之一是**证明这一趟确实
 * 给过重试机会**，否则「0 条 flaky」与「没测」在数据上无法区分。
 */
export function buildFlakyReport({
  entries = [],
  layer = null,
  root = null,
  retriesEnabled = false,
  retriesAllowed = 0,
  generatedAt = new Date().toISOString()
} = {}) {
  const normalized = entries.map(entry => normalizeEntry(entry, retriesAllowed));
  normalized.sort((a, b) => b.ratio - a.ratio || a.file.localeCompare(b.file) || a.testName.localeCompare(b.testName));
  return {
    generatedAt,
    layer,
    layerLabel: LAYER_LABELS[layer] ?? layer,
    root,
    retriesEnabled,
    retriesAllowed,
    total: normalized.length,
    files: new Set(normalized.map(entry => entry.file)).size,
    entries: normalized
  };
}

function fmtRatio(entry) {
  return `${entry.retryCount}/${entry.retriesAllowed}`;
}

function fmtLocation(entry) {
  return entry.line ? `${entry.file}:${entry.line}` : entry.file;
}

/** 人读报告（落盘 + step summary 共用同一份内容）。 */
export function renderFlakyMarkdown(report) {
  const lines = [];
  lines.push('# flaky 报告（TS-25）');
  lines.push('');
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 层：${report.layerLabel ?? '—'}`);
  lines.push(`- 重试策略：${report.retriesEnabled ? `启用（最多 ${report.retriesAllowed} 次）` : '未启用'}`);
  lines.push(`- 观测到 flaky：**${report.total}** 条${report.files > 0 ? `（分布在 ${report.files} 个文件）` : ''}`);
  lines.push('');
  if (!report.retriesEnabled) {
    lines.push('> 本次运行**未启用重试**，因此「0 条 flaky」只说明这一趟没有给过重试机会，');
    lines.push('> 不构成「没有 flaky」的证据。CI 下 L2 / L3 由 `process.env.CI` 自动启用重试。');
    lines.push('');
  }
  lines.push('## flaky 用例');
  lines.push('');
  if (report.total === 0) {
    lines.push('（本次运行没有观测到 flaky 用例）');
  } else {
    lines.push('| 用例 | 位置 | 重试 | 重试比 |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of report.entries) {
      lines.push(
        `| ${entry.testName} | \`${fmtLocation(entry)}\` | ${fmtRatio(entry)} | ${(entry.ratio * 100).toFixed(0)}% |`
      );
    }
    lines.push('');
    lines.push('> 重试比 ≥ 80% 的条目说明重试预算几乎被用尽（照 vitest 内置 reporter 的加粗阈值），');
    lines.push('> 离「重试也救不回来」只差一次 —— 这类条目优先修。');
  }
  lines.push('');
  lines.push(
    `清单入口：\`docs/test-flaky.md\`。观测到 flaky 但未记录时，\`node scripts/flaky.mjs --check\` 会退出非零。`
  );
  lines.push('');
  return lines.join('\n');
}

function escapeData(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value) {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

/**
 * GitHub workflow command 注解（照 SvelteKit `github-flaky-warning-reporter.js` 的做法）。
 *
 * 注解让 flaky 在 PR 页面上**看得见** —— 这是「不靠 retry 转绿」的可见性一半；另一半是
 * `--check` 门禁。缺了注解，重试过的用例就真的静默转绿了。
 */
export function renderGitHubWarnings(report) {
  return report.entries.map(entry => {
    const properties = [
      ['file', entry.file],
      ['title', `flaky test: ${entry.testName}`]
    ];
    if (entry.line) properties.push(['line', String(entry.line)]);
    const head = properties.map(([k, v]) => `${k}=${escapeProperty(v)}`).join(',');
    const message = escapeData(`retries: ${entry.retryCount} of ${entry.retriesAllowed}`);
    return `::warning ${head}::${message}`;
  });
}

/**
 * 解析 `docs/test-flaky.md` 的待修清单表格。
 *
 * 刻意对畸形行**抛错**而不是跳过：静默忽略一行会直接让门禁失效（该条目从此不可见），
 * 与「断言被缺席满足」是同一类错误。
 */
export function parseFlakyLedger(markdown, { path = LEDGER_PATH } = {}) {
  const lines = String(markdown ?? '').split('\n');
  const start = lines.findIndex(line => /^##\s+待修清单\s*$/.test(line.trim()));
  if (start === -1) throw new Error(`${path}: 找不到「## 待修清单」标题，无法解析待修清单`);
  const entries = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (/^##\s/.test(raw.trim())) break;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim().replace(/^`|`$/g, ''));
    if (cells.length === 0) continue;
    if (cells[0] === LEDGER_COLUMNS[0]) continue;
    if (cells.every(cell => /^:?-{2,}:?$/.test(cell) || cell === '')) continue;
    if (cells[0] === LEDGER_PLACEHOLDER || cells[0] === '') continue;
    if (cells.length !== LEDGER_COLUMNS.length) {
      throw new Error(
        `${path}:${i + 1}: 待修清单每行必须有 ${LEDGER_COLUMNS.length} 列（${LEDGER_COLUMNS.join(' / ')}），实际 ${cells.length} 列：${trimmed}`
      );
    }
    const [testName, fileCell, layer, firstSeen, status] = cells;
    if (!fileCell) throw new Error(`${path}:${i + 1}: 待修清单条目的「文件」列不能为空：${trimmed}`);
    // 「文件」列允许写 `path:line`（人读时方便跳转），但身份键只用 path —— 行号变化不该让
    // 条目失效，而报告里的 file 永远是不带行号的仓库相对路径。
    const lineMatch = /^(.*):(\d+)$/.exec(fileCell);
    const file = lineMatch ? lineMatch[1] : fileCell;
    const line = lineMatch ? Number(lineMatch[2]) : null;
    entries.push({ testName, file, line, layer, firstSeen, status });
  }
  return entries;
}

/**
 * 报告 vs 清单。
 *
 * `stale`（清单里有、本次没观测到）**只提示不判定** —— flaky 本来就是间歇的，一次没复现
 * 不能作为「已修」的证据；把它做成错误会逼人删条目，反而丢失历史。
 */
export function diffFlaky(reports, ledger) {
  const observed = new Map();
  for (const report of reports) {
    for (const entry of report.entries) {
      const key = keyOf(entry);
      if (!observed.has(key)) observed.set(key, entry);
    }
  }
  const ledgerKeys = new Set(ledger.map(keyOf));
  const observedEntries = [...observed.values()];
  return {
    observed: observedEntries,
    recorded: observedEntries.filter(entry => ledgerKeys.has(keyOf(entry))),
    unrecorded: observedEntries.filter(entry => !ledgerKeys.has(keyOf(entry))),
    stale: ledger.filter(entry => !observed.has(keyOf(entry)))
  };
}

/** 读一份报告；文件不存在或内容损坏都返回 null（调用方决定这是「没跑」还是「坏了」）。 */
export function readFlakyReport(path) {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 追加到 `$GITHUB_STEP_SUMMARY`；本地（无该环境变量）静默跳过并返回 false。 */
export function appendStepSummary(markdown, file = process.env.GITHUB_STEP_SUMMARY) {
  if (!file) return false;
  appendFileSync(file, `${markdown}\n`);
  return true;
}

/**
 * 门禁核心：读取报告、对照清单、给出结论。
 *
 * `gateable` 只收 `retriesEnabled: true` 的报告 —— 没给过重试机会的运行不能用来判定
 * 「清单是否完整」。全部报告都不可判定时 `ok` 为 true，但 `note` 会写明原因（不是静默放行）。
 */
export function checkFlakyLedger({ reportPaths = DEFAULT_REPORT_PATHS, ledgerPath = LEDGER_PATH, ledger } = {}) {
  const reports = [];
  const missing = [];
  for (const path of reportPaths) {
    const report = readFlakyReport(path);
    if (report) reports.push({ path, ...report });
    else missing.push(path);
  }
  const ledgerEntries = ledger ?? parseFlakyLedger(readFileSync(ledgerPath, 'utf8'), { path: ledgerPath });
  const gateable = reports.filter(report => report.retriesEnabled === true);
  const skipped = reports.filter(report => report.retriesEnabled !== true);
  const diff = diffFlaky(gateable, ledgerEntries);
  const ok = diff.unrecorded.length === 0;
  const notes = [];
  if (missing.length > 0)
    notes.push(`报告不存在（该轨本次未运行）：${missing.map(path => toRepoRelative(path)).join('、')}`);
  if (skipped.length > 0)
    notes.push(
      `报告未启用重试、不参与判定：${skipped.map(report => `${toRepoRelative(report.path)}（${report.layer ?? '—'}）`).join('、')}`
    );
  if (gateable.length === 0) notes.push('没有任何启用重试的报告，本次无法判定待修清单是否完整');
  return { ok, reports, gateable, skipped, missing, ledger: ledgerEntries, diff, notes };
}

/** 门禁结论的人读渲染（CI 日志里直接可读）。 */
export function renderCheckResult(result) {
  const lines = [];
  lines.push('## flaky 待修清单门禁（TS-25）');
  lines.push('');
  for (const note of result.notes) lines.push(`- ${note}`);
  lines.push(
    `- 参与判定的报告：${result.gateable.length} 份（共 ${result.reports.length} 份）；清单条目：${result.ledger.length} 条`
  );
  lines.push(
    `- 观测到 flaky：${result.diff.observed.length} 条（已记录 ${result.diff.recorded.length}，未记录 ${result.diff.unrecorded.length}）`
  );
  if (result.diff.unrecorded.length > 0) {
    lines.push('');
    lines.push('### 未记录进待修清单的 flaky 用例');
    lines.push('');
    for (const entry of result.diff.unrecorded) {
      lines.push(`- \`${fmtLocation(entry)}\` — ${entry.testName}（重试 ${fmtRatio(entry)}）`);
    }
    lines.push('');
    lines.push(`请把上面每条补进 \`docs/test-flaky.md\` 的「## 待修清单」表格（列：${LEDGER_COLUMNS.join(' / ')}）。`);
    lines.push('重试让它们这次没有失败，但**记录**才是它们进入待修状态的凭据 —— 否则下一个人只会看到一片绿。');
  }
  if (result.diff.stale.length > 0) {
    lines.push('');
    lines.push('### 清单里本次未复现的条目（仅提示）');
    lines.push('');
    for (const entry of result.diff.stale)
      lines.push(`- \`${entry.file}\` — ${entry.testName}（状态：${entry.status}）`);
    lines.push('');
    lines.push('flaky 是间歇的，一次未复现不构成「已修」证据；确认稳定后再手工改状态或删条目。');
  }
  lines.push('');
  lines.push(result.ok ? '✅ 门禁通过。' : '❌ 门禁失败：存在未记录的 flaky 用例。');
  lines.push('');
  return lines.join('\n');
}

/** 写报告：JSON（机器读）+ Markdown（人读）到同一目录。 */
export function writeFlakyReport(report, { jsonPath, markdownPath = jsonPath.replace(/\.json$/, '.md') } = {}) {
  if (!jsonPath) throw new Error('writeFlakyReport 需要 jsonPath');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = renderFlakyMarkdown(report);
  writeFileSync(markdownPath, markdown);
  return { jsonPath, markdownPath, markdown };
}

function readTestRetry(retry, fallback) {
  if (typeof retry === 'number') return retry;
  if (retry && typeof retry === 'object' && Number.isFinite(Number(retry.count))) return Number(retry.count);
  return fallback;
}

/**
 * vitest reporter：收集 flaky、落盘报告、发 `::warning`、写 step summary。
 *
 * 收集走两条路：`onTestCaseResult` + `diagnostic()`（文档化 API，拿到 `retryCount` / `flaky`），
 * 以及 `onTestRunEnd` 时遍历 `testModules` 补行号（与 vitest 内置 reporter 的
 * `collectSummaryData` 同法，见 `index.DzobfTyw.js:17692-17720`）。后者依赖内部结构，
 * 因此用 `typeof allTests === 'function'` 兜住 —— 拿不到行号只是少一列，不影响判定。
 */
export default class FlakyReporter {
  constructor(options = {}) {
    this.options = options ?? {};
    this.entries = [];
    this.reported = new Set();
  }

  onInit(ctx) {
    this.ctx = ctx;
    this.root = ctx?.config?.root ?? REPO_ROOT;
    this.retriesAllowed = readTestRetry(ctx?.config?.retry, 0);
    this.retriesEnabled = this.retriesAllowed > 0;
    this.layer = this.options.layer ?? null;
  }

  onTestCaseResult(testCase) {
    let diagnostic = null;
    try {
      diagnostic = testCase?.diagnostic?.();
    } catch {
      diagnostic = null;
    }
    if (!diagnostic?.flaky) return;
    const moduleId = testCase?.module?.moduleId ?? '';
    const testName = testCase?.fullName ?? '';
    const key = `${moduleId}::${testName}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.entries.push({
      file: moduleId,
      testName,
      layer: this.layer,
      retryCount: diagnostic.retryCount,
      retriesAllowed: readTestRetry(testCase?.options?.retry, this.retriesAllowed)
    });
  }

  /** 补行号：`test.task.location?.line` 是 vitest 内置 reporter 用的同一个来源。 */
  enrichFromModules(testModules) {
    const byKey = new Map(this.entries.map(entry => [`${entry.file}::${entry.testName}`, entry]));
    if (byKey.size === 0) return;
    for (const module of testModules ?? []) {
      if (typeof module?.children?.allTests !== 'function') continue;
      for (const test of module.children.allTests()) {
        const testName = test?.task?.fullTestName ?? '';
        const entry = byKey.get(`${module.moduleId ?? ''}::${testName}`);
        if (!entry) continue;
        const line = test?.task?.location?.line;
        if (Number.isFinite(Number(line)) && Number(line) > 0) entry.line = Number(line);
      }
    }
  }

  onTestRunEnd(testModules) {
    this.enrichFromModules(testModules);
    const report = buildFlakyReport({
      entries: this.entries,
      layer: this.layer,
      root: this.root,
      retriesEnabled: this.retriesEnabled,
      retriesAllowed: this.retriesAllowed
    });
    const jsonPath =
      this.options.reportPath ??
      process.env.UBEAN_FLAKY_REPORT ??
      join(this.root ?? REPO_ROOT, 'coverage', REPORT_FILE_NAME);
    let markdown = renderFlakyMarkdown(report);
    try {
      ({ markdown } = writeFlakyReport(report, { jsonPath }));
    } catch (error) {
      this.ctx?.logger?.warn?.(`[flaky] 报告写入失败（${jsonPath}）：${error?.message ?? error}`);
    }
    for (const warning of renderGitHubWarnings(report)) {
      this.ctx?.logger?.log?.(`\n${warning}`);
    }
    appendStepSummary(markdown);
  }

  printsToStdio() {
    return false;
  }
}

function parseArgs(argv) {
  const args = { check: false, json: false, paths: [], help: false };
  for (const arg of argv) {
    if (arg === '--check') args.check = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`);
    else args.paths.push(resolve(arg));
  }
  return args;
}

const USAGE = `flaky 用例报告与待修清单门禁（TS-25）

用法：
  node scripts/flaky.mjs --check [report.json ...]   对照 docs/test-flaky.md 判定
  node scripts/flaky.mjs --check --json              结果以 JSON 输出

不带报告路径时检查默认两条轨：
${DEFAULT_REPORT_PATHS.map(path => `  - ${toRepoRelative(path)}`).join('\n')}
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.check) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const result = checkFlakyLedger({ reportPaths: args.paths.length > 0 ? args.paths : DEFAULT_REPORT_PATHS });
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(renderCheckResult(result));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
