/**
 * 基准脚本的度量原语（`scripts/lib/metrics.mjs`）。
 *
 * 这几个函数被 CPU/内存口径的改动动过，而它们是「数字是否可信」的地基：
 * - `parseCpuTime` 解析 `ps -o time=` 的 `MM:SS` / `HH:MM:SS` / `MM:SS.ss` 三种形态 —— 解析错了
 *   会把 CPU 时间读成十几分之一或几十倍，而那是最难察觉的一类错误（数字看着合理）；
 * - `treePids` / `treeRssKB` 决定「进程树」的边界：构建会 spawn 子进程（pnpm → node → vite），
 *   漏掉子树的 CPU / 内存就是系统性低估；
 * - `parseTimeLReport` 是 `ps` 不可用时的回退口径（BSD `/usr/bin/time -l`）—— 解析错了会
 *   把峰值 RSS（字节）当成 KB 用，或把 user/sys 秒读成毫秒。
 */
import { describe, expect, it } from 'vitest';
import {
  isPsAvailable,
  parseCpuTime,
  parseTimeLReport,
  psSnapshot,
  treePids,
  treeRssKB
} from '../../../scripts/lib/metrics.mjs';

describe('parseCpuTime', () => {
  it('解析 ps 的三种时间形态', () => {
    expect(parseCpuTime('0:01')).toBe(1_000);
    expect(parseCpuTime('1:30')).toBe(90_000);
    expect(parseCpuTime('02:03:04')).toBe(7_384_000);
    expect(parseCpuTime('0:00.50')).toBe(500);
  });

  it('空值 / 垃圾输入返回 0 而不是 NaN（NaN 会污染整份汇总）', () => {
    expect(parseCpuTime('')).toBe(0);
    expect(parseCpuTime('n/a')).toBe(0);
  });
});

describe('进程树遍历', () => {
  const snapshot = new Map([
    [1, { ppid: 0, rssKB: 10, cpuMs: 5 }],
    [2, { ppid: 1, rssKB: 20, cpuMs: 7 }],
    [3, { ppid: 2, rssKB: 30, cpuMs: 9 }],
    [9, { ppid: 0, rssKB: 100, cpuMs: 1 }]
  ]);

  it('自根向下收集子孙，不越界到别的树', () => {
    expect(treePids(1, snapshot).sort()).toEqual([1, 2, 3]);
    expect(treePids(9, snapshot)).toEqual([9]);
  });

  it('RSS 按树求和（漏子树就是系统性低估）', () => {
    expect(treeRssKB(1, snapshot)).toBe(60);
  });

  it('根 pid 已退出时返回空树而不是抛错（采样与进程退出天然竞争）', () => {
    expect(treePids(404, snapshot)).toEqual([404]);
    expect(treeRssKB(404, snapshot)).toBe(0);
  });
});

describe('parseTimeLReport', () => {
  // 取自 macOS `/usr/bin/time -l` 的真实输出形态（rusage 段）。
  const sample = [
    '        1.23 real         0.45 user         0.10 sys',
    '             123456789  maximum resident set size',
    '                   0  average shared memory size'
  ].join('\n');

  it('解析 real/user/sys 秒与峰值 RSS 字节 → ms / KB', () => {
    const parsed = parseTimeLReport(sample);
    expect(parsed).toEqual({ realMs: 1230, cpuMs: 550, peakRssKB: 120563 });
  });

  it('只识别行首数字 + 固定后缀，避免把其它行误读成 rusage', () => {
    const noisy = `some output\n  2.00 real  1.00 user  1.00 sys\n  9999 maximum resident set size\n`;
    expect(parseTimeLReport(noisy)).toEqual({ realMs: 2000, cpuMs: 2000, peakRssKB: 10 });
  });

  it('没有 rusage 段时返回 null（调用方据此判定回退不可用）', () => {
    expect(parseTimeLReport('plain log line\n')).toBeNull();
  });
});

describe('psSnapshot', () => {
  it('每个进程都带 cpuMs 字段（CPU 口径依赖它）', async () => {
    // 受限沙箱会拒绝执行 setuid 的 /bin/ps；此时该采集路径整体不可用，
    // 由 runWithResourceMetrics 回退到 /usr/bin/time -l（见其测试），这里跳过断言。
    if (!(await isPsAvailable())) {
      expect(await isPsAvailable()).toBe(false);
      return;
    }
    const live = await psSnapshot();
    expect(live.size).toBeGreaterThan(0);
    for (const info of live.values()) {
      expect(typeof info.cpuMs).toBe('number');
      expect(Number.isFinite(info.cpuMs)).toBe(true);
    }
  });
});

describe('isPsAvailable', () => {
  it('返回布尔值并缓存结果（同一环境内不应翻转）', async () => {
    const first = await isPsAvailable();
    expect(typeof first).toBe('boolean');
    expect(await isPsAvailable()).toBe(first);
  });
});
