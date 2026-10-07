#!/usr/bin/env node
/**
 * SSG vs Fullstack prerender 构建性能对比基准（docs/adr/0011-lightweight-ssg-direct-render.md）。
 *
 * 同一 fixture 分别以两种模式构建：
 * - `--mode ssg`        静态直接渲染路径（renderStaticPage，无 Hono 请求管道）
 * - `--mode fullstack`  完整 SSR fetcher 路径（createSsrFetcher → Hono app.fetch）
 *
 * 采集指标（每模式多轮取中位数）：
 * - wall        总构建墙钟时间
 * - prerender   prerender 阶段耗时（解析 CLI 日志 `Prerendered N routes in Xms`）
 * - routes      渲染路由数（ssg 含 i18n 展开 + 404 哨兵，故另算单路由耗时）
 * - perRoute    prerender 耗时 / 路由数
 * - cpu         构建进程树累计 CPU 时间（user+sys）
 * - peakRss     构建进程树峰值内存（`ps` 轮询；受限环境回退 `/usr/bin/time -l`）
 *
 * 用法：
 *   pnpm benchmark:ssg                          # 默认 fixture + 1 轮
 *   pnpm benchmark:ssg -- --runs 3              # 3 轮取中位数
 *   pnpm benchmark:ssg -- --fixture examples/x  # 指定 fixture
 *   pnpm benchmark:ssg -- --json report.json    # 追加写 JSON（机器可读）
 */
import { rm, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { runWithResourceMetrics } from './lib/metrics.mjs';

/* -------------------------------------------------------------------------- */
/* 参数解析                                                                     */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

const repoRoot = resolve(import.meta.dirname, '..');
const fixture = resolve(repoRoot, argValue('--fixture', 'examples/ssg-catchall'));
const runs = Math.max(1, parseInt(argValue('--runs', '1'), 10) || 1);
const jsonOut = argValue('--json', null);

const MODES = /** @type {const} */ (['ssg', 'fullstack']);

/* -------------------------------------------------------------------------- */
/* 单次构建                                                                     */
/* -------------------------------------------------------------------------- */

const PRERENDER_LOG = /Prerendered (\d+) routes(?: \(\d+ errors?\))? in (\d+)ms/g;

/**
 * @param {string} mode
 * @returns {Promise<{mode: string, wallMs: number, cpuMs: number, prerenderMs: number|null, routes: number|null, peakRssKB: number, via: string, exitCode: number|null, stdout: string, stderr: string}>}
 */
async function runBuild(mode) {
  await rm(resolve(fixture, 'dist'), { recursive: true, force: true });

  // 资源采集器内部处理 `ps` ↔ `/usr/bin/time -l` 的选择（见 scripts/lib/metrics.mjs）：
  // 受限沙箱禁止执行 setuid 的 /bin/ps，此前会静默产出 peakRss=0。
  const result = await runWithResourceMetrics('pnpm', ['exec', 'ubean', 'build', '--mode', mode], { cwd: fixture });

  const matches = [...result.stdout.matchAll(PRERENDER_LOG)];
  const last = matches[matches.length - 1];

  return {
    mode,
    wallMs: result.wallMs,
    cpuMs: result.cpuMs,
    prerenderMs: last ? Number(last[2]) : null,
    routes: last ? Number(last[1]) : null,
    peakRssKB: result.peakRssKB,
    via: result.via,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

/* -------------------------------------------------------------------------- */
/* 统计与格式化                                                                  */
/* -------------------------------------------------------------------------- */

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtMs(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function fmtMB(kb) {
  if (!kb) return '—';
  return `${(kb / 1024).toFixed(1)}MB`;
}

function fmtPct(delta) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta <= 0 ? '' : '+';
  return `${sign}${delta.toFixed(1)}%`;
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`Benchmark: SSG (direct render) vs Fullstack (Hono pipeline) prerender`);
  console.log(`Fixture:   ${relative(repoRoot, fixture) || fixture}`);
  console.log(`Runs:      ${runs} (取中位数)`);
  console.log(`Node:      ${process.version}  ${process.platform}/${process.arch}`);
  console.log('');

  /** @type {Record<string, Array<{mode: string, wallMs: number, cpuMs: number, prerenderMs: number|null, routes: number|null, peakRssKB: number, via: string, exitCode: number|null, stdout: string, stderr: string}>>} */
  const results = { ssg: [], fullstack: [] };

  for (let i = 1; i <= runs; i++) {
    for (const mode of MODES) {
      process.stdout.write(`  run ${i}/${runs} [${mode}] ... `);
      const r = await runBuild(mode);
      results[mode].push(r);
      if (r.exitCode !== 0) {
        console.log(`FAILED (exit ${r.exitCode})`);
        console.error(r.stderr || r.stdout);
        process.exit(1);
      }
      console.log(
        `wall ${fmtMs(r.wallMs)}, cpu ${fmtMs(r.cpuMs)}, prerender ${fmtMs(r.prerenderMs)} (${r.routes} routes), peak ${fmtMB(r.peakRssKB)} [${r.via}]`
      );
    }
  }

  const stat = mode => ({
    wall: median(results[mode].map(r => r.wallMs)),
    cpu: median(results[mode].map(r => r.cpuMs)),
    prerender: median(results[mode].map(r => r.prerenderMs).filter(v => v != null)),
    routes: results[mode][results[mode].length - 1].routes,
    peakRss: median(results[mode].map(r => r.peakRssKB))
  });

  const ssg = stat('ssg');
  const fullstack = stat('fullstack');
  const perRoute = s => (s.prerender != null && s.routes ? s.prerender / s.routes : null);

  const delta = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

  const report = [
    `# SSG vs Fullstack Prerender 构建性能对比`,
    ``,
    `- Fixture: \`${relative(repoRoot, fixture) || fixture}\``,
    `- Runs: ${runs}（中位数）· Node ${process.version} · ${process.platform}/${process.arch}`,
    `- 路由数差异：ssg 含 i18n 展开 + 404 哨兵，fullstack 仅 include 列表 → 单路由耗时归一化对比`,
    ``,
    `| 指标 | ssg（直接渲染） | fullstack（Hono 管道） | Δ |`,
    `| --- | --- | --- | --- |`,
    `| 总构建时间 | ${fmtMs(ssg.wall)} | ${fmtMs(fullstack.wall)} | ${fmtPct(delta(ssg.wall, fullstack.wall))} |`,
    `| build CPU 时间 | ${fmtMs(ssg.cpu)} | ${fmtMs(fullstack.cpu)} | ${fmtPct(delta(ssg.cpu, fullstack.cpu))} |`,
    `| prerender 阶段 | ${fmtMs(ssg.prerender)} | ${fmtMs(fullstack.prerender)} | ${fmtPct(delta(ssg.prerender, fullstack.prerender))} |`,
    `| 渲染路由数 | ${ssg.routes ?? '—'} | ${fullstack.routes ?? '—'} | — |`,
    `| 单路由渲染 | ${fmtMs(perRoute(ssg))} | ${fmtMs(perRoute(fullstack))} | ${fmtPct(delta(perRoute(ssg), perRoute(fullstack)))} |`,
    `| 峰值内存 (RSS) | ${fmtMB(ssg.peakRss)} | ${fmtMB(fullstack.peakRss)} | ${fmtPct(delta(ssg.peakRss, fullstack.peakRss))} |`,
    ``,
    `> Δ 为负表示 ssg 更优。单路由渲染 = prerender 耗时 / 渲染路由数。`,
    `> 资源指标采集方式：${[...new Set(results.ssg.concat(results.fullstack).map(r => r.via))].join(' / ')}（ps 轮询优先，受限环境回退 \`/usr/bin/time -l\` rusage）。`,
    ``
  ].join('\n');

  console.log('');
  console.log(report);

  if (jsonOut) {
    // 落盘时剥掉 stdout/stderr：完整构建日志会让产物膨胀两个数量级（实测 113KB → 数 KB），
    // 且 prerender 的解析结果已单独成字段；失败排查仍可从终端回放。
    const raw = Object.fromEntries(
      Object.entries(results).map(([mode, entries]) => [
        mode,
        entries.map(({ stdout: _stdout, stderr: _stderr, ...rest }) => rest)
      ])
    );
    const payload = {
      fixture: relative(repoRoot, fixture),
      runs,
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      generatedAt: new Date().toISOString(),
      median: { ssg, fullstack },
      raw
    };
    const out = resolve(repoRoot, jsonOut);
    await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    console.log(`JSON report written to ${out}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
