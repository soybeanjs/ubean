/**
 * TS-19：cron 触发窗口的**假时钟**用例。
 *
 * 调度核心 `checkAndRun()` 把「该不该跑」交给 `matches(now, parsed)`，而 `matches` 读的是
 * `date.getHours()` 等**本地时间**字段（`cron-scheduler.ts:53-58`），调度节流用 `setInterval`。
 * 两者都必须 fake：`vi.useFakeTimers()`（让 `setInterval` 受控）+ `vi.setSystemTime()`
 * （让 `Date` 受控），并且**模拟时间必须用本地时区构造**（`new Date(y, m, d, h, min)`）——
 * 本文件首跑写成 `new Date('...T10:00:00Z')`（UTC 10:00 = 本地 18:00），结果调度器一整小时
 * 都不触发；cron 的 `10:30` 说的是本地时间，这是真实用户会踩到的语义。
 *
 * 覆盖判据：
 * 1. `parseCron` 的字段解析与非法输入拒绝（纯函数面；注意它定义在 `cron-scheduler.ts`）
 * 2. 推进到匹配分钟 → 执行一次；同一分钟内不重复执行
 * 3. 跨过匹配分钟后不再执行（cron 不是 interval）
 * 4. `runOnStart` 启动即执行、`stop()` 后不再触发
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearScheduledTasks, defineScheduled } from '../src/cron';
import { createMemoryCronScheduler, parseCron, validateCron } from '../src/cron-scheduler';
import type { CronScheduler } from '../src/cron-scheduler';

/** 2026-01-05 是周一；用**本地时区**构造 10:00，与 cron 的本地时间语义一致。 */
const AT_1000 = new Date(2026, 0, 5, 10, 0, 0);
const MIN = 60_000;

let scheduler: CronScheduler | undefined;
let runs: string[];

async function advance(minutes: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(minutes * MIN);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(AT_1000);
  clearScheduledTasks();
  runs = [];
});

afterEach(async () => {
  await scheduler?.stop();
  scheduler = undefined;
  clearScheduledTasks();
  vi.useRealTimers();
});

describe('TS-19 · parseCron 字段解析', () => {
  it('步进 / 列表 / 区间解析为有序去重的字段', () => {
    expect(parseCron('*/15 * * * *')?.minute).toEqual([0, 15, 30, 45]);
    expect(parseCron('0 9 * * 1-5')?.hour).toEqual([9]);
    expect(parseCron('0 9 * * 1-5')?.dow).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('30 2 1,15 * *')?.dom).toEqual([1, 15]);
    // 通配字段展开成全量有序集合
    expect(parseCron('* * * * *')?.minute).toHaveLength(60);
  });

  it('字段越界 / 段数不足 → null（而不是抛错或宽松接受）', () => {
    expect(parseCron('60 * * * *')).toBeNull();
    expect(parseCron('* 25 * * *')).toBeNull();
    expect(parseCron('* * * *')).toBeNull();
    expect(parseCron('')).toBeNull();
  });

  it('validateCron 与 parseCron 对同一输入给出一致结论', () => {
    for (const schedule of ['* * * * *', '*/5 * * * *', '0 9 * * 1-5']) {
      expect(validateCron(schedule), schedule).toBe(true);
      expect(parseCron(schedule), schedule).not.toBeNull();
    }
    for (const schedule of ['60 * * * *', '* 25 * * *', '* * * *']) {
      expect(validateCron(schedule), schedule).toBe(false);
      expect(parseCron(schedule), schedule).toBeNull();
    }
  });
});

describe('TS-19 · cron 触发窗口（假时钟）', () => {
  it('推进到匹配分钟触发一次，且同一分钟内不重复触发', async () => {
    defineScheduled({ name: 'tick', schedule: '30 10 * * *', runOnStart: false }, async () => {
      runs.push('t');
    });
    scheduler = createMemoryCronScheduler();
    await scheduler.start();

    // checkAndRun 每 30s 一个 tick；未到 10:30 → 不跑
    await advance(25);
    expect(runs, '未到匹配分钟不应触发').toEqual([]);

    // 跨过 10:30 → 跑一次
    await advance(10);
    expect(runs).toEqual(['t']);

    // 同一分钟内再多几个 tick → 不得重复（timerKey 含「到分钟为止」的时间戳）
    await advance(1);
    expect(runs).toEqual(['t']);
  });

  it('跨过匹配分钟后不再执行（cron 不是 interval）', async () => {
    defineScheduled({ name: 'once', schedule: '5 10 * * *', runOnStart: false }, async () => {
      runs.push('ran');
    });
    scheduler = createMemoryCronScheduler();
    await scheduler.start();

    await advance(6); // 10:05
    expect(runs).toEqual(['ran']);

    await advance(60); // 10:06 → 11:06
    expect(runs, '同一匹配时刻只属于一个命中点').toEqual(['ran']);
  });

  it('runOnStart: true → start() 执行一次；随后**再不按 cron 触发**（疑似缺陷，按实测钉住）', async () => {
    let started = 0;
    defineScheduled({ name: 'boot', schedule: '30 10 * * *', runOnStart: true }, async () => {
      started += 1;
      runs.push('boot');
    });
    scheduler = createMemoryCronScheduler();
    await scheduler.start();
    expect(started, 'runOnStart 应在 start() 时执行').toBe(1);

    // 实测契约（ tracing 确认）：带 `runOnStart` 的任务在 `start()` 执行一次后，**后续任何
    // 匹配分钟都不会再执行** —— 即使 `nextMatch` 明确指向下一个命中点。
    // 机制（`checkAndRun`）：第一次命中分钟走到 `runOnStartExecuted.has(name)` 分支，删标记 +
    // `continue`，但**同一次调用里已经为该分钟登记了去重键**；下个命中分钟理应走执行分支，
    // 实测却从未走到。对照用例（无 `runOnStart`）在同一驱动下能正常触发，故差异确系此分支。
    //
    // ⚠️ 这几乎肯定是个缺陷：用户同时写了 `schedule` 与 `runOnStart: true`，语义应是
    // 「启动时先跑一次，之后照 schedule 跑」；现状是 schedule 从此失效。
    // 本用例**按现状钉住**（防回归时无声漂移），修复后应把期望改为「11:30 再触发一次」。
    await advance(30); // 10:30（启动后的第一个命中分钟）
    expect(started).toBe(1);

    await advance(60); // 11:30（下一个命中分钟）
    expect(started, '实测：runOnStart 任务此后不再按 cron 触发（疑似缺陷，见上）').toBe(1);
  });

  it('stop() 之后推进时钟不再触发', async () => {
    defineScheduled({ name: 'halt', schedule: '30 10 * * *', runOnStart: false }, async () => {
      runs.push('ran');
    });
    scheduler = createMemoryCronScheduler();
    await scheduler.start();
    await scheduler.stop();

    await advance(60);
    expect(runs).toEqual([]);
  });
});
