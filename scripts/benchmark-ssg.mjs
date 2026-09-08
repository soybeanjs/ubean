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
 * - peakRss     构建进程树峰值内存（50ms 轮询 ps 求和）
 *
 * 用法：
 *   pnpm benchmark:ssg                          # 默认 fixture + 1 轮
 *   pnpm benchmark:ssg -- --runs 3              # 3 轮取中位数
 *   pnpm benchmark:ssg -- --fixture examples/x  # 指定 fixture
 *   pnpm benchmark:ssg -- --json report.json    # 追加写 JSON（机器可读）
 */
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

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
/* 进程树峰值内存                                                                */
/* -------------------------------------------------------------------------- */

/** 快照当前全部进程 {pid → {ppid, rssKB}}（ps 输出，macOS/Linux 通用） */
async function psSnapshot() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=']);
  const map = new Map();
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [pid, ppid, rss] = parts.map(Number);
    if (Number.isFinite(pid) && Number.isFinite(rss)) {
      map.set(pid, { ppid, rssKB: rss });
    }
  }
  return map;
}

/** 自 rootPid 向下收集整棵进程树的 RSS 之和（KB） */
function treeRssKB(rootPid, snapshot) {
  const childrenOf = new Map();
  for (const [pid, { ppid }] of snapshot) {
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(pid);
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const info = snapshot.get(pid);
    if (info) total += info.rssKB;
    for (const c of childrenOf.get(pid) || []) stack.push(c);
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* 单次构建                                                                     */
/* -------------------------------------------------------------------------- */

const PRERENDER_LOG = /Prerendered (\d+) routes(?: \(\d+ errors?\))? in (\d+)ms/g;

/**
 * @param {string} mode
 * @returns {Promise<{mode: string, wallMs: number, prerenderMs: number|null, routes: number|null, peakRssKB: number, exitCode: number|null, stdout: string, stderr: string}>}
 */
async function runBuild(mode) {
  await rm(resolve(fixture, 'dist'), { recursive: true, force: true });

  const t0 = performance.now();
  const child = spawn('pnpm', ['exec', 'ubean', 'build', '--mode', mode], {
    cwd: fixture,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => (stdout += d));
  child.stderr.on('data', d => (stderr += d));

  // 50ms 轮询进程树 RSS（busy 防重入：ps 慢时不堆积采样）
  let peakRssKB = 0;
  let busy = false;
  const sampler = setInterval(() => {
    if (busy) return;
    busy = true;
    psSnapshot()
      .then(snap => {
        const rss = treeRssKB(child.pid, snap);
        if (rss > peakRssKB) peakRssKB = rss;
      })
      .catch(() => {
        /* ps 不可用时跳过内存采集 */
      })
      .finally(() => (busy = false));
  }, 50);

  const exitCode = await new Promise(resolve_ => child.on('exit', resolve_));
  clearInterval(sampler);
  const wallMs = performance.now() - t0;

  const matches = [...stdout.matchAll(PRERENDER_LOG)];
  const last = matches[matches.length - 1];

  return {
    mode,
    wallMs,
    prerenderMs: last ? Number(last[2]) : null,
    routes: last ? Number(last[1]) : null,
    peakRssKB,
    exitCode,
    stdout,
    stderr
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

  /** @type {Record<string, Array<{mode: string, wallMs: number, prerenderMs: number|null, routes: number|null, peakRssKB: number, exitCode: number|null, stdout: string, stderr: string}>>} */
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
        `wall ${fmtMs(r.wallMs)}, prerender ${fmtMs(r.prerenderMs)} (${r.routes} routes), peak ${fmtMB(r.peakRssKB)}`
      );
    }
  }

  const stat = mode => ({
    wall: median(results[mode].map(r => r.wallMs)),
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
    `| prerender 阶段 | ${fmtMs(ssg.prerender)} | ${fmtMs(fullstack.prerender)} | ${fmtPct(delta(ssg.prerender, fullstack.prerender))} |`,
    `| 渲染路由数 | ${ssg.routes ?? '—'} | ${fullstack.routes ?? '—'} | — |`,
    `| 单路由渲染 | ${fmtMs(perRoute(ssg))} | ${fmtMs(perRoute(fullstack))} | ${fmtPct(delta(perRoute(ssg), perRoute(fullstack)))} |`,
    `| 峰值内存 (RSS) | ${fmtMB(ssg.peakRss)} | ${fmtMB(fullstack.peakRss)} | ${fmtPct(delta(ssg.peakRss, fullstack.peakRss))} |`,
    ``,
    `> Δ 为负表示 ssg 更优。单路由渲染 = prerender 耗时 / 渲染路由数。`,
    ``
  ].join('\n');

  console.log('');
  console.log(report);

  if (jsonOut) {
    const payload = {
      fixture: relative(repoRoot, fixture),
      runs,
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      generatedAt: new Date().toISOString(),
      median: { ssg, fullstack },
      raw: results
    };
    const out = resolve(repoRoot, jsonOut);
    await writeFile(out, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`JSON report written to ${out}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
