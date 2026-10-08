/**
 * TS-34 · L2 → L1 下沉（域 4/6：queue）
 *
 * `packages/server/src/queue.ts` 的纯逻辑层此前零覆盖：定义校验、内存驱动的
 * 投递/并发/重试/死信、延迟投递、深度与统计、deleteMessage、driver 替换。
 * L2 的 `examples/ubean-test/test/queue.test.ts` 走的是 HTTP 端点，证明不了
 * 这些分支。
 *
 * 队列是时间敏感的，这里的策略是：能确定同步收敛的（`processQueue` 在 `send`
 * 里被同步调用）就只让出微任务；涉及重试退避的用真实短延迟而不是假时钟 ——
 * `retryDelay` 直接进 `setTimeout`，假时钟会和 `await handler()` 的微任务队列
 * 搅在一起，真实短延迟下断言更稳且仍然是确定性的。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueueDefinitions,
  createMemoryQueueDriver,
  defineQueue,
  getAllQueueStats,
  getQueueDefinitions,
  getQueueStats,
  sendMessage,
  sendMessages,
  setQueueDriver,
  startQueueWorkers,
  stopQueueWorkers,
  useQueueDriver
} from '../src/queue';
import type { QueueDriver, QueueMessage } from '../src/queue';

/** 每个用例前重置：driver 与定义表都是模块级状态。 */
function resetQueueModule() {
  // 换回全新内存驱动，避免上个用例残留的 handler/统计
  setQueueDriver(createMemoryQueueDriver());
  clearQueueDefinitions();
  setQueueDriver(createMemoryQueueDriver());
}

afterEach(async () => {
  await stopQueueWorkers();
  setQueueDriver(createMemoryQueueDriver());
  clearQueueDefinitions();
  vi.restoreAllMocks();
});

/** 让出微任务 + 一点真实时间，让内存驱动的处理循环收敛。 */
async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

describe('TS-34 · queue · defineQueue 校验与默认值', () => {
  it('缺少 name 抛错', () => {
    expect(() => defineQueue({ name: '', handler: () => {} })).toThrow('[ubean] Queue must have a name');
  });

  it('缺少 handler（既没有第二参数也没有 options.handler）抛错', () => {
    expect(() => defineQueue({ name: 'jobs' })).toThrow('[ubean] Queue "jobs" must have a handler');
  });

  it('默认 concurrency=5 / retries=3 / retryDelay=1000', () => {
    const def = defineQueue({ name: 'jobs', handler: () => {} });

    expect(def.concurrency).toBe(5);
    expect(def.retries).toBe(3);
    expect(def.retryDelay).toBe(1000);
    expect(def.deadLetterQueue).toBeUndefined();
  });

  it('显式选项覆盖默认值', () => {
    const def = defineQueue({
      name: 'jobs',
      handler: () => {},
      concurrency: 1,
      retries: 0,
      retryDelay: 10,
      deadLetterQueue: 'jobs-dlq'
    });

    expect(def.concurrency).toBe(1);
    expect(def.retries).toBe(0);
    expect(def.retryDelay).toBe(10);
    expect(def.deadLetterQueue).toBe('jobs-dlq');
  });

  it('第二参数 handler 优先于 options.handler', async () => {
    const fromOptions = vi.fn();
    const fromArg = vi.fn();
    defineQueue({ name: 'jobs', handler: fromOptions }, fromArg);

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle();

    expect(fromArg).toHaveBeenCalledTimes(1);
    expect(fromOptions).not.toHaveBeenCalled();
  });

  it('同名重复定义覆盖注册表里的定义（返回新对象）', () => {
    const first = defineQueue({ name: 'jobs', handler: () => {} });
    const second = defineQueue({ name: 'jobs', handler: () => {}, concurrency: 9 });

    expect(second).not.toBe(first);
    expect(getQueueDefinitions()).toHaveLength(1);
    expect(getQueueDefinitions()[0].concurrency).toBe(9);
  });

  it('getQueueDefinitions 返回所有已定义队列', () => {
    defineQueue({ name: 'a', handler: () => {} });
    defineQueue({ name: 'b', handler: () => {} });

    expect(
      getQueueDefinitions()
        .map(d => d.name)
        .sort()
    ).toEqual(['a', 'b']);
  });
});

describe('TS-34 · queue · 内存驱动投递与处理', () => {
  it('send 返回唯一 id、消息带 timestamp=0 次尝试、handler 收到完整消息', async () => {
    resetQueueModule();
    const seen: QueueMessage[] = [];
    defineQueue({ name: 'jobs', handler: msg => void seen.push(msg) }, undefined);

    await startQueueWorkers();
    const id = await sendMessage('jobs', { n: 1 }, { headers: { 'x-t': 'v' } });
    await settle();

    expect(id).toBeTruthy();
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe(id);
    expect(seen[0].body).toEqual({ n: 1 });
    expect(seen[0].attempts).toBe(0);
    expect(seen[0].headers).toEqual({ 'x-t': 'v' });
    expect(seen[0].timestamp).toBeTypeOf('number');
  });

  it('worker 未启动时消息只排队不处理', async () => {
    resetQueueModule();
    const handler = vi.fn();
    defineQueue({ name: 'jobs', handler });

    await sendMessage('jobs', { n: 1 });
    await settle(2);

    expect(handler).not.toHaveBeenCalled();
    expect(await useQueueDriver().getQueueDepth?.('jobs')).toBe(1);
  });

  it('startQueueWorkers 后立刻排空已有积压', async () => {
    resetQueueModule();
    const handler = vi.fn();
    defineQueue({ name: 'jobs', handler });

    await sendMessage('jobs', { n: 1 });
    await startQueueWorkers();
    await settle();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await useQueueDriver().getQueueDepth?.('jobs')).toBe(0);
  });

  it('sendMessages 顺序投递并返回等价数量的 id', async () => {
    resetQueueModule();
    const handler = vi.fn();
    defineQueue({ name: 'jobs', handler });

    await startQueueWorkers();
    const ids = await sendMessages('jobs', [1, 2, 3]);
    await settle();

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('未定义的队列也能投递（隐式建队列），但无 handler 时消息被静默丢弃 —— 已知尖角', async () => {
    resetQueueModule();
    await startQueueWorkers();

    await expect(sendMessage('unknown-queue', { n: 1 })).resolves.toBeTruthy();
    await settle(2);

    // 记录真实行为（不是"期望的正确"行为）：`processQueue` 会先把消息从队列 shift 走，
    // 而 `processMessage` 发现没有 handler 时只是清掉 processing，**并没有把消息放回**。
    // 所以既没有 depth 也不是 pending，统计全 0 —— 消息无声消失。
    // 有 `defineQueue` 的正常路径不会遇到；这里固定住现状，避免它被当成"顺手能改"的东西。
    expect(await useQueueDriver().getQueueDepth?.('unknown-queue')).toBe(0);
    expect(getQueueStats('unknown-queue')).toMatchObject({ pending: 0, processing: 0, completed: 0, failed: 0 });
  });

  it('handler 异步完成后统计 completed 递增、processing 归零', async () => {
    resetQueueModule();
    defineQueue({ name: 'jobs', handler: async () => void (await Promise.resolve()) });

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle();

    expect(getQueueStats('jobs')).toMatchObject({ pending: 0, processing: 0, completed: 1, failed: 0 });
  });

  it('options.delay 延迟投递：延迟前不处理，之后处理', async () => {
    resetQueueModule();
    const handler = vi.fn();
    defineQueue({ name: 'jobs', handler });

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 }, { delay: 30 });

    await settle(1);
    expect(handler).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 60));
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('concurrency 限制同时在处理的消息数', async () => {
    resetQueueModule();
    let inFlight = 0;
    let peak = 0;
    defineQueue(
      {
        name: 'jobs',
        concurrency: 2,
        handler: async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise(resolve => setTimeout(resolve, 20));
          inFlight--;
        }
      },
      undefined
    );

    await startQueueWorkers();
    await sendMessages('jobs', [1, 2, 3, 4, 5, 6]);
    // 内存驱动只会在 send 时和 100ms 间隔定时器上触发 processQueue，
    // 所以 6 条 / 并发 2 / 每条 20ms 需要跨过多个间隔（~200ms 以上）。
    await settle(60);

    expect(peak).toBeLessThanOrEqual(2);
    expect(getQueueStats('jobs')?.completed).toBe(6);
  });
});

describe('TS-34 · queue · 重试与死信', () => {
  it('失败的 handler 按 retries 重试后进死信队列，并带 x-error 头', async () => {
    resetQueueModule();
    const dlq: QueueMessage[] = [];
    defineQueue({ name: 'jobs-dlq', handler: msg => void dlq.push(msg) });

    let attempts = 0;
    defineQueue({
      name: 'jobs',
      retries: 2,
      retryDelay: 1,
      deadLetterQueue: 'jobs-dlq',
      handler: () => {
        attempts++;
        throw new Error('always fails');
      }
    });

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle(30);

    // retries=2 → 首次 + 1 次重试 = 2 次尝试后进死信
    expect(attempts).toBe(2);
    expect(getQueueStats('jobs')?.failed).toBe(1);
    expect(dlq).toHaveLength(1);
    expect(dlq[0].body).toEqual({ n: 1 });
    expect(dlq[0].headers?.['x-error']).toBe('always fails');
  });

  it('没有 deadLetterQueue 时失败只计数，不抛错', async () => {
    resetQueueModule();
    defineQueue({
      name: 'jobs',
      retries: 1,
      retryDelay: 1,
      handler: () => {
        throw new Error('nope');
      }
    });

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle(20);

    expect(getQueueStats('jobs')?.failed).toBe(1);
  });

  it('重试成功后不算 failed，message.attempts 被累加', async () => {
    resetQueueModule();
    const attemptsSeen: number[] = [];
    defineQueue({
      name: 'jobs',
      retries: 3,
      retryDelay: 1,
      handler: msg => {
        attemptsSeen.push(msg.attempts);
        if (msg.attempts === 0) throw new Error('first time fails');
      }
    });

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle(30);

    expect(attemptsSeen).toEqual([0, 1]);
    expect(getQueueStats('jobs')).toMatchObject({ completed: 1, failed: 0 });
  });

  it('非 Error 抛出物也能进死信的 x-error（字符串化）', async () => {
    resetQueueModule();
    const dlq: QueueMessage[] = [];
    defineQueue({ name: 'jobs-dlq', handler: msg => void dlq.push(msg) });
    defineQueue(
      {
        name: 'jobs',
        retries: 1,
        retryDelay: 1,
        deadLetterQueue: 'jobs-dlq',
        handler: () => {
          // eslint-disable-next-line no-throw-literal
          throw 'string failure';
        }
      },
      undefined
    );

    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle(20);

    expect(dlq[0].headers?.['x-error']).toBe('string failure');
  });
});

describe('TS-34 · queue · 深度 / 删除 / 统计', () => {
  it('getQueueDepth 对未知队列返回 0', async () => {
    resetQueueModule();
    expect(await useQueueDriver().getQueueDepth?.('nope')).toBe(0);
  });

  it('deleteMessage 能删掉排队中的消息并让 pending 减一', async () => {
    resetQueueModule();
    defineQueue({ name: 'jobs', handler: () => {} });

    const id = await sendMessage('jobs', { n: 1 });
    expect(await useQueueDriver().deleteMessage?.('jobs', id)).toBe(true);
    expect(await useQueueDriver().getQueueDepth?.('jobs')).toBe(0);
    expect(getQueueStats('jobs')?.pending).toBe(0);

    // 再删一次返回 false
    expect(await useQueueDriver().deleteMessage?.('jobs', id)).toBe(false);
  });

  it('deleteMessage 对未知队列返回 false', async () => {
    resetQueueModule();
    expect(await useQueueDriver().deleteMessage?.('nope', 'id')).toBe(false);
  });

  it('getQueueStats 对未知队列返回 undefined，getAllQueueStats 汇总全部', async () => {
    resetQueueModule();
    defineQueue({ name: 'a', handler: () => {} });
    defineQueue({ name: 'b', handler: () => {} });

    expect(getQueueStats('nope')).toBeUndefined();

    const all = getAllQueueStats();
    expect(Object.keys(all).sort()).toEqual(['a', 'b']);
  });

  it('getQueueStats 返回副本（改写不会污染内部统计）', () => {
    resetQueueModule();
    defineQueue({ name: 'jobs', handler: () => {} });
    useQueueDriver();

    const stats = getQueueStats('jobs')!;
    stats.pending = 999;

    expect(getQueueStats('jobs')?.pending).toBe(0);
  });
});

describe('TS-34 · queue · driver 管理', () => {
  it('useQueueDriver 懒创建并复用同一内存驱动', () => {
    resetQueueModule();
    const a = useQueueDriver();
    expect(useQueueDriver()).toBe(a);
  });

  it('setQueueDriver 把已定义队列的 handler 注册给新 driver', async () => {
    resetQueueModule();
    const registered = vi.fn();
    defineQueue({ name: 'jobs', handler: () => {} });

    setQueueDriver({
      send: async () => 'x',
      sendBatch: async () => ['x'],
      registerHandler: registered
    });

    expect(registered).toHaveBeenCalledTimes(1);
    expect(registered.mock.calls[0][0]).toBe('jobs');
  });

  it('sendMessage 走当前 driver（可换成自定义实现）', async () => {
    resetQueueModule();
    const sent: Array<{ queue: string; body: unknown }> = [];
    setQueueDriver({
      async send(queueName, body) {
        sent.push({ queue: queueName, body });
        return 'custom-id';
      },
      async sendBatch(queueName, bodies) {
        return bodies.map(() => {
          sent.push({ queue: queueName, body: 'batch' });
          return 'custom-id';
        });
      }
    });

    expect(await sendMessage('jobs', { n: 1 })).toBe('custom-id');
    expect(sent).toEqual([{ queue: 'jobs', body: { n: 1 } }]);
  });

  it('driver 没有 start/stop/getQueueDepth 时相关调用安全降级', async () => {
    resetQueueModule();
    const bare: QueueDriver = {
      send: async () => 'id',
      sendBatch: async () => []
    };
    setQueueDriver(bare);

    await expect(startQueueWorkers()).resolves.toBeUndefined();
    await expect(stopQueueWorkers()).resolves.toBeUndefined();
    expect(await bare.getQueueDepth?.('x')).toBeUndefined();
  });

  it('startQueueWorkers 幂等（重复调用不重复计时器）', async () => {
    resetQueueModule();
    const handler = vi.fn();
    defineQueue({ name: 'jobs', handler });

    await startQueueWorkers();
    await startQueueWorkers();
    await sendMessage('jobs', { n: 1 });
    await settle();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
