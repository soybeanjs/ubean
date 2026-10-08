/**
 * TS-26：生命周期基准的**趋势**采集（nightly）。
 *
 * 为什么需要它：
 *
 * `scripts/benchmark-lifecycle.mjs` 已经能产出一次完整的九项指标（p50 / p95 + 原始样本），
 * 但它是**一次性**的 —— `--json` / `--out` 都是整文件覆盖，跑完这一次，上一次的数字就没了。
 * 于是「性能有没有慢慢变差」这个问题在本仓无法回答：没有历史点，就没有趋势，只能靠人记得
 * 上个月大概是多少。
 *
 * 为什么趋势**不进 PR 门禁**（`docs/perf-regression-net.md` §4.4 的既有立场）：
 *
 * GitHub 共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性，最终结局是被绕过或放宽。
 * 所以这里只做两件事：①把每次 nightly 的点追加进一份 JSONL 历史；②渲染成表格贴到 job
 * summary，并把「与上一次」「与 committed 基线」的差值标出来。**不设阈值、不返回失败**。
 *
 * 为什么「与基线的绝对值比较」要带可比性判定：
 *
 * committed 基线（`perf-current.json`）是在 Apple M1 Max / darwin-arm64 上采的，nightly 跑在
 * ubuntu-latest 的 AMD EPYC 上 —— 两者的绝对值本来就不可比（本文件 §4.4「CI runner 之间的
 * 横向比较（机器不同无意义）」）。因此 `compareMetrics` 会先比对 `platform` / `arch` /
 * `cpuModel`，不同则把整段差值标记为 `comparable: false` 并写明原因，只让人看**趋势方向**，
 * 而不是让人误读成「性能倒退了 3 倍」。
 *
 * 为什么畸形历史行要抛错：
 *
 * 趋势文件是追加写的，一行坏掉不会让已有行失效，很容易被当成「少了一个点」而静默放过；
 * 但坏行的真实含义是「这份历史不可信」——那正是趋势要回答的问题。宁可在 nightly 里红，
 * 也不要产出一条编造的趋势。（与 `scripts/flaky.mjs` 的清单解析同一条纪律。）
 *
 * 用法：
 *
 *   node scripts/benchmark-trend.mjs --report .temp/perf-report.json
 *   node scripts/benchmark-trend.mjs --report .temp/perf-report.json --trend .temp/perf-trend.jsonl
 *   node scripts/benchmark-trend.mjs --report .temp/perf-report.json --baseline none
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtMB, fmtMs } from './lib/metrics.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 趋势历史落盘位置。`.temp/` 在 `.gitignore` 里（AGENTS.md §8.16：临时文件放 `.temp`）。 */
export const DEFAULT_TREND_PATH = join(REPO_ROOT, '.temp', 'perf-trend.jsonl');

/** committed 基线（RM-P05 的 `current` 记录），用作绝对值的参照点。 */
export const DEFAULT_BASELINE_PATH = join(REPO_ROOT, 'examples', 'ubean-test', 'benchmarks', 'perf-current.json');

export const TREND_KIND = 'ubean-perf-trend-point';
export const TREND_VERSION = 1;

/**
 * 采集哪些指标、怎么格式化、方向是哪边。
 * 顺序即表格行序，与 `benchmark-lifecycle.mjs` 的报告行保持一致（读两份输出时不至于来回找）。
 */
export const TREND_METRICS = [
  { key: 'devColdStart', label: 'dev 冷启动', unit: 'ms' },
  { key: 'browserHydration', label: '首个岛屿水合', unit: 'ms' },
  { key: 'browserNavigation', label: '站内导航', unit: 'ms' },
  { key: 'devChangeServer', label: '变更生效 · 服务端', unit: 'ms' },
  { key: 'devChangeClient', label: '变更生效 · 客户端', unit: 'ms' },
  { key: 'buildWall', label: 'build 墙钟', unit: 'ms' },
  { key: 'buildCpu', label: 'build CPU', unit: 'ms' },
  { key: 'buildPeakRss', label: 'build 峰值内存', unit: 'KB' }
];

/** 参与可比性判定的环境字段 —— 换了其中任何一个，绝对值就不再可比。 */
export const COMPARABILITY_FIELDS = ['platform', 'arch', 'cpuModel'];

export function formatMetricValue(value, unit) {
  if (value == null || !Number.isFinite(value)) return '—';
  return unit === 'KB' ? fmtMB(value) : fmtMs(value);
}

function pickEnvironment(environment) {
  const source = environment ?? {};
  const picked = {};
  for (const field of ['node', 'platform', 'arch', 'cpuModel', 'cpuCount', 'totalMemMb']) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked;
}

function readP50(summary, key) {
  const value = summary?.[key]?.p50;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 一次基准报告 → 每个臂一个趋势点。
 *
 * 接受 `benchmark-lifecycle.mjs --json` 的产物（`{ environment, arms }`）。刻意也接受
 * `--out` 形态（顶层多几个键、`arms` 里没有 `samples`）—— 两种产物都带 `environment` +
 * `arms.<name>.summary`，趋势只依赖这两个契约。
 */
export function trendPointsFromReport(report, { at = new Date().toISOString(), label = 'nightly' } = {}) {
  if (!report || typeof report !== 'object' || !report.arms || typeof report.arms !== 'object') {
    throw new Error('报告缺少 arms（期望 benchmark-lifecycle.mjs 的 --json 产物）');
  }
  const arms = Object.keys(report.arms);
  if (arms.length === 0) throw new Error('报告的 arms 为空，没有可采集的臂');

  const environment = pickEnvironment(report.environment);
  return arms.map(arm => {
    const summary = report.arms[arm]?.summary ?? {};
    const metrics = {};
    for (const { key } of TREND_METRICS) metrics[key] = readP50(summary, key);
    const scope = summary.reloadScope ?? {};
    return {
      kind: TREND_KIND,
      version: TREND_VERSION,
      at,
      label,
      arm,
      environment,
      metrics,
      // reload 正确性不是耗时，单列保留：它是 RM-P04 的判据，趋势里也必须看得到。
      reloadScope: { n: scope.n ?? null, preserved: scope.preserved ?? null, reevaluated: scope.reevaluated ?? null }
    };
  });
}

/**
 * 解析 JSONL 历史。空行跳过；任何一行解析失败或结构不对即抛错。
 *
 * 不「跳过坏行继续」：静默跳过会让趋势看起来正常而实际缺了数据点，这与 `--require-timings`
 * 那类「缺数据即硬失败」的立场相反，也违背 §1.3 纪律①「跳过必须可见」。
 */
export function parseTrendHistory(text) {
  const points = [];
  const lines = String(text ?? '').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `趋势文件第 ${index + 1} 行不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
        {
          cause: error
        }
      );
    }
    if (parsed?.kind !== TREND_KIND) {
      throw new Error(`趋势文件第 ${index + 1} 行的 kind 不是 ${TREND_KIND}（实际：${String(parsed?.kind)}）`);
    }
    if (!parsed.metrics || typeof parsed.metrics !== 'object') {
      throw new Error(`趋势文件第 ${index + 1} 行缺少 metrics`);
    }
    if (typeof parsed.arm !== 'string' || !parsed.arm) {
      throw new Error(`趋势文件第 ${index + 1} 行缺少 arm`);
    }
    points.push(parsed);
  }
  return points;
}

export function readTrendHistory(file = DEFAULT_TREND_PATH) {
  if (!existsSync(file)) return [];
  return parseTrendHistory(readFileSync(file, 'utf8'));
}

/** 追加写趋势点（一次追加该次运行的全部臂），返回追加后的完整历史。 */
export function appendTrendPoints(file, points) {
  const list = Array.isArray(points) ? points : [points];
  if (list.length === 0) throw new Error('没有可追加的趋势点');
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${list.map(point => JSON.stringify(point)).join('\n')}\n`, 'utf8');
  return readTrendHistory(file);
}

/** 取某个臂的历史点（保持文件顺序 = 时间顺序）。 */
export function pickArmPoints(points, arm) {
  return points.filter(point => point.arm === arm);
}

function sameEnvironment(a, b) {
  const left = a ?? {};
  const right = b ?? {};
  const differing = COMPARABILITY_FIELDS.filter(field => left[field] !== right[field]);
  if (differing.length === 0) return { comparable: true, differing };
  return { comparable: false, differing };
}

/**
 * 逐指标比较两个点。
 *
 * `comparable: false` 时不隐藏数字 —— 数字仍然给出（它们是采集到的事实），但整体标记为
 * 「机器不同、绝对值不可比」，让读者不会把 3× 的差值当成性能回归。
 */
export function compareMetrics(current, base) {
  const environment = sameEnvironment(current?.environment, base?.environment);
  const rows = TREND_METRICS.map(({ key, label, unit }) => {
    const currentValue = current?.metrics?.[key] ?? null;
    const baseValue = base?.metrics?.[key] ?? null;
    const ratio = currentValue != null && baseValue != null && baseValue !== 0 ? currentValue / baseValue : null;
    return {
      key,
      label,
      unit,
      current: currentValue,
      base: baseValue,
      ratio,
      deltaPct: ratio == null ? null : (ratio - 1) * 100
    };
  });
  const reason = environment.comparable
    ? null
    : `机器不同（${environment.differing.map(field => `${field}: ${base?.environment?.[field] ?? 'n/a'} → ${current?.environment?.[field] ?? 'n/a'}`).join('；')}），绝对值不可比，只看方向`;
  return { comparable: environment.comparable, reason, rows };
}

/**
 * 组装趋势：每个臂给出「最新点 / 上一个点 / committed 基线」三条参照。
 *
 * `baseline` 传 `benchmark-lifecycle.mjs --out` 形态的对象（含 `arms.<name>.summary`）或 null。
 */
export function buildTrend(history, { baseline = null } = {}) {
  const arms = [...new Set(history.map(point => point.arm))];
  return {
    arms: arms.map(arm => {
      const points = pickArmPoints(history, arm);
      const latest = points.at(-1) ?? null;
      const previous = points.length > 1 ? points.at(-2) : null;
      const baselineSummary = baseline?.arms?.[arm]?.summary ?? null;
      const baselinePoint = baselineSummary
        ? {
            arm,
            environment: pickEnvironment(baseline?.environment),
            metrics: Object.fromEntries(TREND_METRICS.map(({ key }) => [key, readP50(baselineSummary, key)]))
          }
        : null;
      return {
        arm,
        pointCount: points.length,
        latest,
        previous,
        vsPrevious: previous ? compareMetrics(latest, previous) : null,
        vsBaseline: baselinePoint ? compareMetrics(latest, baselinePoint) : null,
        baselineLabel: baseline ? (baseline.recordedOn ?? baseline.generatedAt ?? 'baseline') : null
      };
    }),
    totalPoints: history.length
  };
}

function renderCompareTable(title, comparison, referenceName) {
  if (!comparison) return [];
  const lines = [];
  lines.push(`**${title}**（参照：${referenceName}）`);
  lines.push('');
  if (comparison.reason) lines.push(`> ⚠️ ${comparison.reason}`);
  lines.push(`| 指标 | 本次 | ${referenceName} | 差值 |`);
  lines.push('| --- | --- | --- | --- |');
  for (const row of comparison.rows) {
    const delta = row.deltaPct == null ? '—' : `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%`;
    lines.push(
      `| ${row.label} | ${formatMetricValue(row.current, row.unit)} | ${formatMetricValue(row.base, row.unit)} | ${delta} |`
    );
  }
  lines.push('');
  return lines;
}

export function renderTrendMarkdown(trend, { trendPath = DEFAULT_TREND_PATH } = {}) {
  const lines = [];
  lines.push('## 生命周期基准趋势（TS-26）');
  lines.push('');
  lines.push(
    '> **不进 PR 门禁**（`docs/perf-regression-net.md` §4.4）：共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性。'
  );
  lines.push('> 这里只产出趋势，不设阈值、不因数值变化失败。绝对值只在**同一台机器**上可比。');
  lines.push('');
  lines.push(`- 历史点：${trend.totalPoints} 条（\`${trendPath}\`，按运行追加）`);
  lines.push('');
  for (const arm of trend.arms) {
    const latest = arm.latest;
    const environment = latest?.environment ?? {};
    lines.push(`### 臂 \`${arm.arm}\``);
    lines.push('');
    lines.push(
      `- 最新点：${latest?.at ?? 'n/a'}（label \`${latest?.label ?? 'n/a'}\`，该臂累计 ${arm.pointCount} 条）` +
        ` · 环境：Node ${environment.node ?? 'n/a'} · ${environment.platform ?? 'n/a'}/${environment.arch ?? 'n/a'}` +
        ` · ${environment.cpuModel ?? 'n/a'} ×${environment.cpuCount ?? 'n/a'}`
    );
    const scope = latest?.reloadScope;
    if (scope) {
      lines.push(`- reload 正确性（RM-P04）：单例保留 ${scope.preserved ?? 'n/a'}/${scope.n ?? 'n/a'}`);
    }
    lines.push('');
    if (arm.vsPrevious) {
      lines.push(...renderCompareTable('与上一次运行对比', arm.vsPrevious, '上一次'));
    } else {
      lines.push('_该臂只有一个数据点，暂无可比的上一次。_');
      lines.push('');
    }
    if (arm.vsBaseline) {
      lines.push(...renderCompareTable('与 committed 基线对比', arm.vsBaseline, arm.baselineLabel ?? 'baseline'));
    }
    if (arm.latest) {
      lines.push('| 指标 | 本次（p50） |');
      lines.push('| --- | --- |');
      for (const { key, label, unit } of TREND_METRICS) {
        lines.push(`| ${label} | ${formatMetricValue(latest?.metrics?.[key] ?? null, unit)} |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** 追加到 GitHub job summary；无该环境变量时静默跳过（本地跑不报错）。 */
export function appendStepSummary(markdown, file = process.env.GITHUB_STEP_SUMMARY) {
  if (!file) return false;
  appendFileSync(file, `${markdown}\n`);
  return true;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                          */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const args = [...argv];
  const value = name => {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
  };
  return {
    report: value('--report'),
    trend: value('--trend') ?? DEFAULT_TREND_PATH,
    baseline: value('--baseline') ?? DEFAULT_BASELINE_PATH,
    label: value('--label') ?? 'nightly',
    json: args.includes('--json'),
    help: args.includes('--help') || args.includes('-h')
  };
}

const USAGE = [
  '用法：node scripts/benchmark-trend.mjs --report <benchmark-lifecycle --json 产物> [选项]',
  '',
  '选项：',
  '  --report <path>     基准报告 JSON（必填，来自 `pnpm benchmark:lifecycle -- --json <path>`）',
  `  --trend <path>      趋势历史 JSONL（默认 ${DEFAULT_TREND_PATH}，追加写）`,
  `  --baseline <path>   committed 基线（默认 perf-current.json；传 none 跳过基线对比）`,
  '  --label <name>      本次运行的标签（默认 nightly）',
  '  --json              额外把趋势对象打到 stdout',
  '  --help              显示本帮助',
  '',
  '退出码：0 成功（**不因性能数值变化失败** —— 见 docs/perf-regression-net.md §4.4）。'
].join('\n');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.report) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }

  const reportPath = resolve(REPO_ROOT, options.report);
  if (!existsSync(reportPath)) {
    throw new Error(`找不到基准报告：${reportPath}（先跑 pnpm benchmark:lifecycle -- --json <path>）`);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const points = trendPointsFromReport(report, { label: options.label });
  const trendPath = resolve(REPO_ROOT, options.trend);
  const history = appendTrendPoints(trendPath, points);

  const useBaseline = options.baseline !== 'none';
  const baselinePath = useBaseline ? resolve(REPO_ROOT, options.baseline) : null;
  const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

  const trend = buildTrend(history, { baseline });
  const markdown = renderTrendMarkdown(trend, { trendPath });
  console.log(markdown);
  const wroteSummary = appendStepSummary(markdown);
  console.log('');
  console.log(`追加 ${points.length} 个趋势点到 ${trendPath}`);
  if (!baseline && useBaseline) console.log(`未找到基线 ${baselinePath}，跳过基线对比`);
  console.log(wroteSummary ? '已写入 $GITHUB_STEP_SUMMARY' : '（本地运行，无 $GITHUB_STEP_SUMMARY）');
  if (options.json) console.log(JSON.stringify(trend, null, 2));

  // 刻意 `process.exit(0)`：本脚本是趋势采集，不是门禁。
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
