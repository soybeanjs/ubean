/**
 * 基准脚本的度量原语（`scripts/lib/metrics.mjs`）。
 *
 * 这几个函数被 CPU/内存口径的改动动过，而它们是「数字是否可信」的地基：
 * - `parseCpuTime` 解析 `ps -o time=` 的 `MM:SS` / `HH:MM:SS` / `MM:SS.ss` 三种形态 —— 解析错了
 *   会把 CPU 时间读成十几分之一或几十倍，而那是最难察觉的一类错误（数字看着合理）；
 * - `treePids` / `treeRssKB` 决定「进程树」的边界：构建会 spawn 子进程（pnpm → node → vite），
 *   漏掉子树的 CPU / 内存就是系统性低估；
 * - `parseTimeLReport` 是 `ps` 不可用时的回退口径（BSD `/usr/bin/time -l`）—— 解析错了会
 *   把峰值 RSS（字节）当成 KB 用，或把 user/sys 秒读成毫秒；
 * - `spawnCaptured` 关掉的两个句柄：后台孙进程继承管道写端后，不清理读端会让 Node
 *   **永不退出** —— 这个形态在 nightly-perf 上连红了 4 晚却没人知道原因（CI 只报
 *   「6h 超时」，日志停在 `wrote …` 后面一片空白）。见本文件最后一个 describe。
 */
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  isPsAvailable,
  killTree,
  parseCpuTime,
  parseTimeLReport,
  psSnapshot,
  spawnCaptured,
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

/**
 * 子进程句柄泄漏（nightly-perf 6h 超时的根因）。
 *
 * 形态：直接子进程（`pnpm` / `sh` 中转）退出，但它后台派生的孙进程（`ubean dev`、Chromium）
 * 还握着我们 stdout/stderr 管道的**写端**。只要写端没关完，读端就等不到 EOF，该 pipe 的
 * handle 继续是「活动的」→ 事件循环非空 → Node 进程一直不 returned。
 *
 * 为什么这个抽屉里的测试值得存在：它守的是一类**完全静默**的回归 —— 指标数字全对、脚本
 * 「跑完」了、只是进程不退。CI 上表现为 job 跑满 6h 上限被取消（日志停在 `wrote …`
 * 之后空白），本地因为交互式会话不会退出而不易察觉。修前实测挂 >21s，修后 ~215ms。
 *
 * 用真实子进程 + 看门狗而不是 mocked 句柄：要验证的正是「Node 到底退不退出」，
 * 那是事件循环的真实行为，mock 掉就只能测到自己写的假象。
 */
describe('spawnCaptured 不泄漏子进程句柄', () => {
  const HANG_TIMEOUT_MS = 8_000;

  /** 跑一个脚本，返回它是否在超时前自然退出（不 kill）。 */
  function spawnedChildExits(script) {
    return new Promise(resolve => {
      const probe = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'ignore'] });
      const timer = setTimeout(() => {
        probe.kill('SIGKILL');
        resolve(false);
      }, HANG_TIMEOUT_MS);
      probe.on('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  // 两段脚本走**同一个** `spawnCaptured`，唯一差别是子进程是否留下后台孙进程。
  // 对照脚本排除「spawn 本身就不会退出」这类与本次修改无关的干扰。
  const benignChild = `
    import { spawnCaptured } from ${JSON.stringify(new URL('../../../scripts/lib/metrics.mjs', import.meta.url).href)};
    const { child, exited } = spawnCaptured(process.execPath, ['-e', 'process.exit(0)'], {});
    await exited;
    console.log('child exit code', child.exitCode);
  `;
  const childWithBackgroundGrandchild = `
    import { spawnCaptured } from ${JSON.stringify(new URL('../../../scripts/lib/metrics.mjs', import.meta.url).href)};
    const { exited } = spawnCaptured('sh', ['-c', 'sleep 30 & exit 0'], {});
    await exited;
    console.log('direct child gone, grandchild still holds the pipe');
  `;

  it.skipIf(process.platform === 'win32')(
    '给了后台孙进程时仍在超时前退出（修前挂死）',
    async () => {
      expect(await spawnedChildExits(childWithBackgroundGrandchild)).toBe(true);
    },
    HANG_TIMEOUT_MS * 3
  );

  it.skipIf(process.platform === 'win32')(
    '没有后台孙进程时照常退出（对照，不是回归）',
    async () => {
      expect(await spawnedChildExits(benignChild)).toBe(true);
    },
    HANG_TIMEOUT_MS * 3
  );

  it.skipIf(process.platform === 'win32')(
    '子进程自成一个进程组，killTree 才杀得到整棵树',
    async () => {
      const { child, exited } = spawnCaptured('sh', ['-c', 'sleep 30 & exit 0'], {});
      await exited;
      // 负 pid 的组杀要求子进程是组长；不是组长时 process.kill 会抛 ESRCH。
      expect(() => process.kill(-child.pid, 'SIGTERM')).not.toThrow();
      killTree(child);
    },
    HANG_TIMEOUT_MS
  );
});
