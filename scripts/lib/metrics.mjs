/**
 * 性能基准共享度量工具（docs/perf-regression-net.md RM-P01/P03）。
 *
 * 被 `benchmark-ssg.mjs`（构建对比）与 `benchmark-lifecycle.mjs`（dev/build 生命周期）
 * 共用。只放进程级与端到端采集原语，不放任何指标定义。
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { cpus, totalmem } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------- */
/* 进程树内存                                                                   */
/* -------------------------------------------------------------------------- */

/** 快照当前全部进程 {pid → {ppid, rssKB}}（ps 输出，macOS/Linux 通用） */
export async function psSnapshot() {
  // `time=` 是累计 CPU 时间（`MM:SS` / `HH:MM:SS` 形式）—— 与墙钟不同，它在宿主满载时依然可比，
  // 因此构建类指标可以拿它做对照（本机 load average 长期 10+，墙钟对照早已不可信）。
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=,time=']);
  const map = new Map();
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [pid, ppid, rss] = parts.map(Number);
    const cpuMs = parseCpuTime(parts[3]);
    if (Number.isFinite(pid) && Number.isFinite(rss)) {
      map.set(pid, { ppid, rssKB: rss, cpuMs });
    }
  }
  return map;
}

/** `MM:SS` / `HH:MM:SS` / `MM:SS.ss` → 毫秒 */
export function parseCpuTime(text) {
  const parts = String(text).split(':');
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number.parseFloat(part || '0');
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
}

/** 自 rootPid 向下收集整棵进程树的 pid。 */
export function treePids(rootPid, snapshot) {
  const childrenOf = new Map();
  for (const [pid, { ppid }] of snapshot) {
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(pid);
  }
  const pids = [];
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    pids.push(pid);
    for (const c of childrenOf.get(pid) || []) stack.push(c);
  }
  return pids;
}

/** 自 rootPid 向下收集整棵进程树的 RSS 之和（KB）。 */
export function treeRssKB(rootPid, snapshot) {
  let total = 0;
  for (const pid of treePids(rootPid, snapshot)) total += snapshot.get(pid)?.rssKB ?? 0;
  return total;
}

/**
 * 按固定间隔采样进程树峰值 RSS。`ps` 慢时不堆积采样（busy 防重入）。
 * @returns {{ stop: () => number }} stop() 返回峰值 KB
 */
export function startRssSampler(rootPid, intervalMs = 50) {
  let peakRssKB = 0;
  /** pid → 该进程见过的最大累计 CPU 时间（进程退出后仍保留，避免丢失长命子进程的消耗）。 */
  const cpuByPid = new Map();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    psSnapshot()
      .then(snapshot => {
        const rss = treeRssKB(rootPid, snapshot);
        if (rss > peakRssKB) peakRssKB = rss;
        // 逐 pid 记**见过的最大累计 CPU**：进程退出后 ps 就看不到它，取最大值才不会丢掉长命子进程
        // 已经消耗掉的时间。
        for (const pid of treePids(rootPid, snapshot)) {
          const cpuMs = snapshot.get(pid)?.cpuMs ?? 0;
          if (cpuMs > (cpuByPid.get(pid) ?? 0)) cpuByPid.set(pid, cpuMs);
        }
      })
      .catch(() => {
        /* ps 不可用时跳过本次采集 */
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);

  return {
    /** 峰值 RSS（KB）。 */
    stop() {
      clearInterval(timer);
      return peakRssKB;
    },
    /** 整棵树的累计 CPU 时间（ms，user+sys）。 */
    stopCpuMs() {
      clearInterval(timer);
      let total = 0;
      for (const ms of cpuByPid.values()) total += ms;
      return total;
    }
  };
}

/**
 * `ps` 可用性探测（结果缓存）。
 *
 * macOS 的 `/bin/ps` 带 setuid 位（`-rwsr-xr-x`），受限沙箱会以
 * `Operation not permitted` 拒绝执行它 —— 此前基准在这类环境里只能输出
 * `buildCpu=0` / `buildPeakRss=0`（假数据，会掩盖真实回归）。这里的探测让
 * 采集器能明确知道要走 `/usr/bin/time -l` 回退，而不是静默产出零值。
 */
let psAvailability;
export async function isPsAvailable() {
  if (psAvailability !== undefined) return psAvailability;
  try {
    await execFileAsync('ps', ['-axo', 'pid=']);
    psAvailability = true;
  } catch {
    psAvailability = false;
  }
  return psAvailability;
}

/** 解析 BSD `/usr/bin/time -l` 的报告（real/user/sys 秒 + 峰值 RSS 字节）。 */
export function parseTimeLReport(stderr) {
  const times = /^\s*([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys\s*$/m.exec(stderr);
  const rss = /^\s*(\d+)\s+maximum resident set size\s*$/m.exec(stderr);
  if (!times && !rss) return null;
  return {
    realMs: times ? Math.round(Number(times[1]) * 1000) : null,
    cpuMs: times ? Math.round((Number(times[2]) + Number(times[3])) * 1000) : null,
    peakRssKB: rss ? Math.round(Number(rss[1]) / 1024) : null
  };
}

/**
 * 用 BSD `/usr/bin/time -l` 采集一次运行的 CPU 时间与峰值 RSS。
 *
 * 仅在 `ps` 不可用时兜底：`time` 报告的 rusage 覆盖被 wait 的子进程树，量级与
 * `ps` 轮询一致（轮询仍更细，能区分进程树的分布），因此回退结果可继续用于
 * buildCpu / buildPeakRss。非 darwin 或缺少 `/usr/bin/time` 时返回 `null`。
 */
export async function measureWithTime(command, args, options = {}) {
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/time')) return null;
  const started = performance.now();
  const { readStdout, readStderr, exited } = spawnCaptured('/usr/bin/time', ['-l', command, ...args], options);
  const exitCode = await exited;
  const wallMs = performance.now() - started;
  const stderr = readStderr();
  const parsed = parseTimeLReport(stderr) ?? {};
  return {
    wallMs,
    cpuMs: parsed.cpuMs ?? 0,
    peakRssKB: parsed.peakRssKB ?? 0,
    exitCode,
    stdout: readStdout(),
    stderr,
    via: 'time-l'
  };
}

/**
 * 运行子进程并采集墙钟 / 累计 CPU / 峰值 RSS。
 *
 * 优先 `ps` 轮询（跨平台，逐 pid 取最大值）；`ps` 不可用时回退到
 * `/usr/bin/time -l`（macOS）。两者都不可用则**抛错**，绝不返回零值 ——
 * 零值会被读成「构建不耗 CPU / 不占内存」的假基线。
 */
export async function runWithResourceMetrics(command, args, options = {}) {
  if (await isPsAvailable()) {
    const started = performance.now();
    const { child, readStdout, readStderr, exited } = spawnCaptured(command, args, options);
    const sampler = startRssSampler(child.pid, options.intervalMs ?? 50);
    const exitCode = await exited;
    const peakRssKB = sampler.stop();
    const cpuMs = sampler.stopCpuMs();
    return {
      wallMs: performance.now() - started,
      cpuMs,
      peakRssKB,
      exitCode,
      stdout: readStdout(),
      stderr: readStderr(),
      via: 'ps'
    };
  }
  const timed = await measureWithTime(command, args, options);
  if (!timed) {
    throw new Error(
      `无法采集 CPU/内存指标：当前环境禁止执行 ps（setuid），且 ${process.platform} 上没有 /usr/bin/time 兜底`
    );
  }
  return timed;
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
