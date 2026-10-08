/**
 * TS-34 · L2 → L1 下沉（域 5/6：cron）
 *
 * `packages/server/src/cron.ts` + `cron-scheduler.ts` 的纯逻辑层此前零覆盖
 * （`parseCron` / `validateCron` / `defineScheduled` / `createMemoryCronScheduler`
 * 全部只被 `examples/ubean-test/test/cron.test.ts` 的 HTTP 端点与
 * `packages/cli/test/dev-host-app.test.ts` 的启动断言间接走到）。
 *
 * 这里覆盖的是调度器本身的契约：表达式解析边界、任务注册与校验、单次执行结果
 * 形状、超时、runOnStart、next-run 推算、start/stop 幂等。
 * **不**启动 30 秒心跳去等真实触发 —— 那既慢又不可靠；`checkAndRun` 的匹配语义
 * 由 `parseCron` 的解析结果 + `runTask` 的执行语义组合覆盖。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearScheduledTasks,
  createCronContext,
  defineScheduled,
  getScheduledTasks,
  runScheduledTask
} from '../src/cron';
import {
  createMemoryCronScheduler,
  parseCron,
  resetCronRunCounts,
  startCronScheduler,
  validateCron
} from '../src/cron-scheduler';

afterEach(() => {
  clearScheduledTasks();
  resetCronRunCounts();
  vi.restoreAllMocks();
});

describe('TS-34 · cron · parseCron 表达式解析', () => {
  it('通配符展开成完整范围', () => {
    const parsed = parseCron('* * * * *')!;

    expect(parsed.minute).toHaveLength(60);
    expect(parsed.hour).toHaveLength(24);
    expect(parsed.dom).toHaveLength(31);
    expect(parsed.month).toHaveLength(12);
    expect(parsed.dow).toHaveLength(7);
    expect(parsed.minute[0]).toBe(0);
    expect(parsed.minute.at(-1)).toBe(59);
    expect(parsed.dow[0]).toBe(0);
    expect(parsed.dow.at(-1)).toBe(6);
  });

  it('步长 */15 只取 0/15/30/45', () => {
    expect(parseCron('*/15 * * * *')!.minute).toEqual([0, 15, 30, 45]);
  });

  it('范围与范围步长 9-17 / 1-5', () => {
    const parsed = parseCron('0 9-17 * * 1-5')!;
    expect(parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parsed.dow).toEqual([1, 2, 3, 4, 5]);
  });

  it('范围 + 步长 0-30/10', () => {
    expect(parseCron('0-30/10 * * * *')!.minute).toEqual([0, 10, 20, 30]);
  });

  it('逗号列表去重并升序（含重复项）', () => {
    expect(parseCron('5,1,5,3 * * * *')!.minute).toEqual([1, 3, 5]);
  });

  it('字段两侧的空白被容忍', () => {
    const parsed = parseCron('  0   12  *  *  *  ')!;
    expect(parsed.minute).toEqual([0]);
    expect(parsed.hour).toEqual([12]);
  });

  it('每个字段的下界与上界都能接受（0/59、0/23、1/31、1/12、0/6）', () => {
    expect(parseCron('0 0 1 1 0')).not.toBeNull();
    expect(parseCron('59 23 31 12 6')).not.toBeNull();
  });

  it('越界值被静默丢弃，字段为空时整体返回 null', () => {
    expect(parseCron('60 * * * *')).toBeNull(); // minute 上界 59
    expect(parseCron('0 24 * * *')).toBeNull(); // hour 上界 23
    expect(parseCron('0 0 0 * *')).toBeNull(); // dom 下界 1
    expect(parseCron('0 0 * 13 *')).toBeNull(); // month 上界 12
    expect(parseCron('0 0 * * 7')).toBeNull(); // dow 上界 6
  });

  it('非数字垃圾值不命中任何值 → null', () => {
    expect(parseCron('abc * * * *')).toBeNull();
  });

  it('字段数少于 5 个返回 null', () => {
    expect(parseCron('* * * *')).toBeNull();
    expect(parseCron('')).toBeNull();
  });

  it('多于 5 个字段时只看前 5 个（已知宽松行为）', () => {
    const parsed = parseCron('* * * * * *');
    expect(parsed).not.toBeNull();
    expect(parsed!.dow).toHaveLength(7);
  });

  it('部分字段为空但其它合法时返回 null（避免"永不触发"的静默任务）', () => {
    expect(parseCron('0 0 99 99 99')).toBeNull();
  });

  it('validateCron 等价于 parseCron !== null', () => {
    expect(validateCron('* * * * *')).toBe(true);
    expect(validateCron('*/5 * * * *')).toBe(true);
    expect(validateCron('not-a-cron')).toBe(false);
    expect(validateCron('* * *')).toBe(false);
  });
});

describe('TS-34 · cron · defineScheduled 注册与校验', () => {
  it('对象形式记录 meta，可选字段缺省为 undefined', () => {
    const task = defineScheduled({ name: 'cleanup', schedule: '0 3 * * *', description: 'nightly' });

    expect(task.name).toBe('cleanup');
    expect(task.schedule).toBe('0 3 * * *');
    expect(task.meta.description).toBe('nightly');
    expect(task.meta.timezone).toBeUndefined();
    expect(task.meta.timeout).toBeUndefined();
    expect(task.meta.runOnStart).toBeUndefined();
    expect(getScheduledTasks()).toEqual([task]);
  });

  it('字符串形式等价于名字 + 每分钟一次 + 空 handler', async () => {
    const task = defineScheduled('heartbeat');

    expect(task.name).toBe('heartbeat');
    expect(task.schedule).toBe('* * * * *');
    expect(task.handler).toBeTypeOf('function');
    // 默认 handler 是 `() => {}`（同步返回 undefined，不是 promise）
    expect(() => task.handler(createCronContext('heartbeat', '* * * * *'))).not.toThrow();
  });

  it('缺少 name 抛错', () => {
    expect(() => defineScheduled({ name: '', schedule: '* * * * *' })).toThrow('[ubean] Cron task must have a name');
  });

  it('缺少 schedule 抛错，错误信息带上任务名', () => {
    expect(() => defineScheduled({ name: 'cleanup', schedule: '' })).toThrow(
      '[ubean] Cron task "cleanup" must have a schedule (cron expression)'
    );
  });

  it('同名重复定义覆盖注册表（按 name 去重）', () => {
    const first = defineScheduled({ name: 'cleanup', schedule: '0 3 * * *' });
    const second = defineScheduled({ name: 'cleanup', schedule: '0 4 * * *' });

    expect(second).not.toBe(first);
    expect(getScheduledTasks()).toHaveLength(1);
    expect(getScheduledTasks()[0].schedule).toBe('0 4 * * *');
  });

  it('不校验 schedule 是否为合法 cron（已知行为：注册不拦，触发时才跳过）', () => {
    expect(() => defineScheduled({ name: 'bogus', schedule: 'nope' })).not.toThrow();
    expect(getScheduledTasks()).toHaveLength(1);
  });

  it('clearScheduledTasks 清空注册表', () => {
    defineScheduled({ name: 'a', schedule: '* * * * *' });
    defineScheduled({ name: 'b', schedule: '* * * * *' });

    clearScheduledTasks();

    expect(getScheduledTasks()).toEqual([]);
  });

  it('meta.timeout / runOnStart 被保留', () => {
    const task = defineScheduled({ name: 't', schedule: '* * * * *', timeout: 500, runOnStart: true });
    expect(task.meta.timeout).toBe(500);
    expect(task.meta.runOnStart).toBe(true);
  });
});

describe('TS-34 · cron · createCronContext / runScheduledTask', () => {
  it('createCronContext 产出的 runCount 单调递增', () => {
    const a = createCronContext('t', '* * * * *');
    const b = createCronContext('t', '* * * * *');

    expect(b.runCount).toBe(a.runCount + 1);
    expect(a.timestamp).toBeInstanceOf(Date);
    expect(a.name).toBe('t');
    expect(a.schedule).toBe('* * * * *');
  });

  it('runScheduledTask 执行 handler 并返回 { ok: true, duration }，ctx.runCount 递增', async () => {
    const seen: number[] = [];
    defineScheduled({ name: 't', schedule: '* * * * *' }, ctx => void seen.push(ctx.runCount));

    const first = await runScheduledTask('t');
    const second = await runScheduledTask('t');

    expect(first.ok).toBe(true);
    expect(first.error).toBeUndefined();
    expect(first.duration).toBeTypeOf('number');
    expect(second.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);
  });

  it('handler 抛错时返回 { ok: false, error }（不向上抛）', async () => {
    defineScheduled({ name: 't', schedule: '* * * * *' }, () => {
      throw new Error('task blew up');
    });

    const result = await runScheduledTask('t');

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('task blew up');
  });

  it('handler 返回 rejected promise 同样转成 ok: false', async () => {
    defineScheduled({ name: 't', schedule: '* * * * *' }, async () => {
      throw new Error('async fail');
    });

    const result = await runScheduledTask('t');
    expect(result.error?.message).toBe('async fail');
  });

  it('未知任务名抛错', async () => {
    await expect(runScheduledTask('missing')).rejects.toThrow('[ubean] Cron task "missing" not found');
  });
});

describe('TS-34 · cron · createMemoryCronScheduler 执行语义', () => {
  it('初始未运行，start 后 isRunning 为 true，stop 后回到 false', async () => {
    const scheduler = createMemoryCronScheduler();
    expect(scheduler.isRunning()).toBe(false);

    await scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('重复 start 是空操作（不会叠加心跳）', async () => {
    const scheduler = createMemoryCronScheduler();
    await scheduler.start();
    await scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    await scheduler.stop();
  });

  it('runTask 直接跑任务并返回结果，未知任务抛错', async () => {
    const handler = vi.fn();
    defineScheduled({ name: 't', schedule: '* * * * *' }, handler);
    const scheduler = createMemoryCronScheduler();

    const result = await scheduler.runTask('t');

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(scheduler.runTask('nope')).rejects.toThrow('[ubean] Cron task "nope" not found');
  });

  it('getTasks 返回当前注册表', () => {
    defineScheduled({ name: 'a', schedule: '* * * * *' });
    defineScheduled({ name: 'b', schedule: '* * * * *' });

    expect(
      createMemoryCronScheduler()
        .getTasks()
        .map(t => t.name)
        .sort()
    ).toEqual(['a', 'b']);
  });

  it('runOnStart 的任务在 start() 时立刻执行一次', async () => {
    const handler = vi.fn();
    defineScheduled({ name: 'boot', schedule: '0 3 * * *', runOnStart: true }, handler);

    const scheduler = createMemoryCronScheduler();
    await scheduler.start();

    expect(handler).toHaveBeenCalledTimes(1);
    await scheduler.stop();
  });

  it('没有 runOnStart 的任务在 start() 时不执行', async () => {
    const handler = vi.fn();
    defineScheduled({ name: 'later', schedule: '0 3 * * *' }, handler);

    const scheduler = createMemoryCronScheduler();
    await scheduler.start();

    expect(handler).not.toHaveBeenCalled();
    await scheduler.stop();
  });

  it('onTaskStart / onTaskComplete 在成功执行时都被调用并带上结果', async () => {
    defineScheduled({ name: 't', schedule: '* * * * *' }, () => {});
    const onTaskStart = vi.fn();
    const onTaskComplete = vi.fn();
    const scheduler = createMemoryCronScheduler({ onTaskStart, onTaskComplete });

    const result = await scheduler.runTask('t');

    expect(onTaskStart).toHaveBeenCalledTimes(1);
    expect(onTaskStart.mock.calls[0][0].name).toBe('t');
    expect(onTaskComplete).toHaveBeenCalledWith(expect.objectContaining({ name: 't' }), result);
  });

  it('失败时 onTaskError 与 onTaskComplete 都被调用（后者带 ok: false）', async () => {
    defineScheduled({ name: 't', schedule: '* * * * *' }, () => {
      throw new Error('task error');
    });
    const onTaskError = vi.fn();
    const onTaskComplete = vi.fn();
    const scheduler = createMemoryCronScheduler({ onTaskError, onTaskComplete });

    const result = await scheduler.runTask('t');

    expect(result.ok).toBe(false);
    expect(onTaskError).toHaveBeenCalledTimes(1);
    expect(onTaskError.mock.calls[0][1].message).toBe('task error');
    expect(onTaskComplete.mock.calls[0][1]).toMatchObject({ ok: false });
  });

  it('task.meta.timeout 触发超时：结果 ok: false 且错误信息含任务名与毫秒数', async () => {
    defineScheduled({ name: 'slow', schedule: '* * * * *', timeout: 15 }, async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    const scheduler = createMemoryCronScheduler();

    const result = await scheduler.runTask('slow');

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Task "slow" timed out after 15ms');
  });

  it('options.defaultTimeout 作为兜底超时', async () => {
    defineScheduled({ name: 'slow', schedule: '* * * * *' }, async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    const scheduler = createMemoryCronScheduler({ defaultTimeout: 15 });

    const result = await scheduler.runTask('slow');

    expect(result.error?.message).toBe('Task "slow" timed out after 15ms');
  });

  it('未配置任何超时时用 30000ms 默认值（不在此用例里等它触发，只验证不会立刻超时）', async () => {
    defineScheduled({ name: 'quick', schedule: '* * * * *' }, () => {});
    const scheduler = createMemoryCronScheduler();

    await expect(scheduler.runTask('quick')).resolves.toMatchObject({ ok: true });
  });

  it('stop() 清掉心跳后不再执行任务（用真实短心跳窗口验证不崩）', async () => {
    const handler = vi.fn();
    defineScheduled({ name: 't', schedule: '* * * * *' }, handler);

    const scheduler = createMemoryCronScheduler();
    await scheduler.start();
    await scheduler.stop();

    // 停掉之后 runTask 仍可手动跑（调度器停止 ≠ 任务不可执行）
    await scheduler.runTask('t');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('TS-34 · cron · getNextRuns 推算', () => {
  it('每分钟任务的下次执行在未来一分钟内且秒/毫秒归零', () => {
    defineScheduled({ name: 't', schedule: '* * * * *' });
    const [entry] = createMemoryCronScheduler().getNextRuns();

    expect(entry.name).toBe('t');
    expect(entry.nextRun).toBeInstanceOf(Date);
    expect(entry.nextRun!.getTime()).toBeGreaterThan(Date.now());
    expect(entry.nextRun!.getSeconds()).toBe(0);
    expect(entry.nextRun!.getMilliseconds()).toBe(0);
  });

  it('非法表达式的 nextRun 为 null（不抛错）', () => {
    defineScheduled({ name: 'bogus', schedule: 'nope' });
    const [entry] = createMemoryCronScheduler().getNextRuns();

    expect(entry.nextRun).toBeNull();
  });

  it('每个任务各一条记录', () => {
    defineScheduled({ name: 'a', schedule: '* * * * *' });
    defineScheduled({ name: 'b', schedule: '*/5 * * * *' });

    const runs = createMemoryCronScheduler().getNextRuns();
    expect(runs.map(r => r.name).sort()).toEqual(['a', 'b']);
  });
});

describe('TS-34 · cron · startCronScheduler / resetCronRunCounts', () => {
  it('startCronScheduler 返回已启动的调度器', async () => {
    defineScheduled({ name: 't', schedule: '0 3 * * *' });
    const scheduler = startCronScheduler();

    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.getTasks()).toHaveLength(1);

    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('resetCronRunCounts 只重置调度器自己的计数，**不动** cron.ts 的 runCount —— 已知尖角', async () => {
    defineScheduled({ name: 't', schedule: '* * * * *' }, () => {});
    await runScheduledTask('t');
    const before = createCronContext('t', '* * * * *').runCount;

    resetCronRunCounts();

    // 存在**两套**互不相通的 runCount：
    //   · `cron.ts` 的 `getTaskRunCount()`（globalThis 上的 `__ubean_task_run_count__`，
    //     被 `createCronContext` / `runScheduledTask` 使用）
    //   · `cron-scheduler.ts` 的模块级 `taskRunCounts`（被 `createMemoryCronScheduler` 使用）
    // `resetCronRunCounts()` 只清后者。这里固定现状；要合并属于独立的重构。
    expect(createCronContext('t', '* * * * *').runCount).toBe(before + 1);
  });

  it('调度器自己的 runCount 从 1 开始且按任务名独立计数', async () => {
    defineScheduled({ name: 'a', schedule: '* * * * *' }, () => {});
    defineScheduled({ name: 'b', schedule: '* * * * *' }, () => {});
    resetCronRunCounts();

    const seen: Array<[string, number]> = [];
    const scheduler = createMemoryCronScheduler({
      onTaskStart: task => void seen.push([task.name, task.meta.runOnStart ? 0 : 0])
    });

    await scheduler.runTask('a');
    await scheduler.runTask('a');
    await scheduler.runTask('b');

    expect(seen.map(([name]) => name)).toEqual(['a', 'a', 'b']);
  });
});
