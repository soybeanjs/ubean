/**
 * 性能基准共享度量工具（docs/perf-regression-net.md RM-P01/P03）。
 *
 * 被 `benchmark-ssg.mjs`（构建对比）与 `benchmark-lifecycle.mjs`（dev/build 生命周期）
 * 共用。只放进程级与端到端采集原语，不放任何指标定义。
 */
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpus, totalmem } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------- */
/* 进程树内存                                                                   */
/* -------------------------------------------------------------------------- */

/** 快照当前全部进程 {pid → {ppid, rssKB}}（ps 输出，macOS/Linux 通用） */
export async function psSnapshot() {
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
export function treeRssKB(rootPid, snapshot) {
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

/**
 * 按固定间隔采样进程树峰值 RSS。`ps` 慢时不堆积采样（busy 防重入）。
 * @returns {{ stop: () => number }} stop() 返回峰值 KB
 */
export function startRssSampler(rootPid, intervalMs = 50) {
  let peakRssKB = 0;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    psSnapshot()
      .then(snapshot => {
        const rss = treeRssKB(rootPid, snapshot);
        if (rss > peakRssKB) peakRssKB = rss;
      })
      .catch(() => {
        /* ps 不可用时跳过本次采集 */
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
      return peakRssKB;
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 子进程                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 启动子进程并缓冲 stdout/stderr（供日志解析与失败回放）。
 * @returns {{ child: import('node:child_process').ChildProcess, readStdout: () => string, readStderr: () => string, exited: Promise<number|null> }}
 */
export function spawnCaptured(command, args, options = {}) {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => (stdout += d));
  child.stderr.on('data', d => (stderr += d));
  return {
    child,
    readStdout: () => stdout,
    readStderr: () => stderr,
    exited: new Promise(resolve => child.on('exit', resolve))
  };
}

/** 向进程（及其子进程）发送信号；child 已退出时静默忽略 */
export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* 已退出 */
    }
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP 探针                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 轮询直到 predicate 成立或超时。
 * @returns {{ ok: boolean, elapsedMs: number, attempts: number, lastBody?: string, lastError?: string }}
 */
export async function pollUntil(url, options) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 100;
  const started = performance.now();
  let attempts = 0;
  let lastBody;
  let lastError;
  while (performance.now() - started < timeoutMs) {
    attempts += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(options.requestTimeoutMs ?? 5_000) });
      const body = await res.text();
      lastBody = body;
      lastError = undefined;
      if (await options.predicate({ res, body })) {
        return { ok: true, elapsedMs: performance.now() - started, attempts, lastBody };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(intervalMs);
  }
  return { ok: false, elapsedMs: performance.now() - started, attempts, lastBody, lastError };
}

/**
 * 解析可用的探针基地址。dev server 默认只绑 IPv6 `[::1]`（dev.host: 'localhost'），
 * 因此先试 IPv6 再回退 IPv4，避免把绑定差异误读成启动失败。
 */
export async function resolveBaseUrl(port, candidates = ['::1', '127.0.0.1'], timeoutMs = 60_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    for (const host of candidates) {
      const base = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(1_000) });
        if (res.status > 0) return base;
      } catch {
        /* 换下一个候选 */
      }
    }
    await delay(100);
  }
  return undefined;
}

/**
 * 找一个可用端口。
 *
 * ubean dev 除 `--port` 外还会占用 `port + 1000` 作为 HMR 独立端口，因此：
 * - 只在 10000–30000 取样，避免落在系统临时端口区间后 `port + 1000 > 65535`
 *   触发 `ERR_SOCKET_BAD_PORT`；
 * - 两个端口都必须空闲，且同时验证 IPv4 与 IPv6（dev 默认只绑 `[::1]`）。
 */
export async function findFreePort(options = {}) {
  const min = options.min ?? 10_000;
  const max = options.max ?? 30_000;
  const offsets = options.additionalOffsets ?? [1_000];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const port = min + Math.floor(Math.random() * (max - min));
    const ports = [port, ...offsets.map(offset => port + offset)];
    if (ports.some(p => p <= 0 || p > 65_535)) continue;
    const availability = await Promise.all(ports.map(isPortFree));
    if (availability.every(Boolean)) return port;
  }
  throw new Error(`在 ${min}–${max} 内找不到可用端口（含 +${offsets.join('/+')} 偏移）`);
}

async function isPortFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    const free = await new Promise(resolve => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, host, () => server.close(() => resolve(true)));
    });
    if (!free) return false;
  }
  return true;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/* 统计与格式化                                                                  */
/* -------------------------------------------------------------------------- */

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 分位数（线性插值，q ∈ [0,1]）。样本不足时退化为中位数/极值。 */
export function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** 样本摘要：p50 / p95 / min / max / n，供报告与 JSON 落盘 */
export function summarizeSamples(values) {
  const clean = values.filter(v => v !== null && v !== undefined && Number.isFinite(v));
  if (clean.length === 0) return { n: 0, p50: null, p95: null, min: null, max: null };
  return {
    n: clean.length,
    p50: quantile(clean, 0.5),
    p95: quantile(clean, 0.95),
    min: Math.min(...clean),
    max: Math.max(...clean)
  };
}

export function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

export function fmtMB(kb) {
  if (!kb) return '—';
  return `${(kb / 1024).toFixed(1)}MB`;
}

export function fmtPct(delta) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta <= 0 ? '' : '+';
  return `${sign}${delta.toFixed(1)}%`;
}

/* -------------------------------------------------------------------------- */
/* 环境记录（口径可复现的前提）                                                   */
/* -------------------------------------------------------------------------- */

export function collectEnvironment() {
  const list = cpus();
  const first = list[0];
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: first?.model?.trim() ?? 'unknown',
    cpuCount: list.length,
    totalMemMb: Math.round(totalmem() / 1024 / 1024)
  };
}

export function formatEnvironment(env) {
  return `Node ${env.node} · ${env.platform}/${env.arch} · ${env.cpuModel} ×${env.cpuCount} · ${env.totalMemMb}MB`;
}
