import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  defineQueue,
  createMemoryQueueDriver,
  setQueueDriver,
  sendMessage,
  sendMessages,
  getQueueDefinitions,
  clearQueueDefinitions,
  startQueueWorkers,
  stopQueueWorkers,
  getQueueStats,
  getAllQueueStats
} from '../src/runtime/queue';

describe('Queue system', () => {
  beforeEach(() => {
    clearQueueDefinitions();
    vi.useRealTimers();
  });

  afterEach(async () => {
    await stopQueueWorkers();
  });

  it('defines a queue with handler', () => {
    const handler = vi.fn();
    const queue = defineQueue({ name: 'test' }, handler);

    expect(queue.name).toBe('test');
    expect(queue.handler).toBe(handler);
    expect(queue.concurrency).toBe(5);
    expect(queue.retries).toBe(3);
  });

  it('throws error when queue has no name', () => {
    expect(() => defineQueue({ name: '' }, vi.fn())).toThrow('[ubean] Queue must have a name');
  });

  it('throws error when queue has no handler', () => {
    expect(() => defineQueue({ name: 'test' })).toThrow('[ubean] Queue "test" must have a handler');
  });

  it('returns all queue definitions', () => {
    defineQueue({ name: 'email' }, vi.fn());
    defineQueue({ name: 'notification' }, vi.fn());

    const defs = getQueueDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs.map(d => d.name)).toContain('email');
    expect(defs.map(d => d.name)).toContain('notification');
  });

  it('sends message to queue using driver', async () => {
    const handler = vi.fn();
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'test' }, handler);

    const id = await sendMessage('test', { foo: 'bar' });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('sends batch messages', async () => {
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'batch' }, vi.fn());

    const ids = await sendMessages('batch', [1, 2, 3]);
    expect(ids).toHaveLength(3);
    expect(ids.every(id => typeof id === 'string')).toBe(true);
  });

  it('processes messages when workers started', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'process' }, handler);
    await driver.start();

    await sendMessage('process', { task: 'work' });

    await new Promise(resolve => setTimeout(resolve, 300));

    expect(handler).toHaveBeenCalled();
    const msg = handler.mock.calls[0][0];
    expect(msg.body).toEqual({ task: 'work' });
    expect(msg.attempts).toBe(0);
    expect(msg.id).toBeDefined();
  });

  it('retries failed messages', async () => {
    let attempts = 0;
    const handler = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 2) throw new Error('fail');
    });

    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'retry', retries: 3, retryDelay: 50 }, handler);
    await driver.start();

    await sendMessage('retry', { data: 1 });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
  });

  it('sends to dead letter queue after max retries', async () => {
    const dlqHandler = vi.fn().mockResolvedValue(undefined);
    const failingHandler = vi.fn().mockRejectedValue(new Error('always fail'));

    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'dlq', retries: 2, retryDelay: 30, deadLetterQueue: 'failed' }, failingHandler);
    defineQueue({ name: 'failed' }, dlqHandler);
    await driver.start();

    await sendMessage('dlq', { bad: 'data' });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(failingHandler).toHaveBeenCalledTimes(2);
    expect(dlqHandler).toHaveBeenCalled();
    const dlqMsg = dlqHandler.mock.calls[0][0];
    expect(dlqMsg.body).toEqual({ bad: 'data' });
  });

  it('supports delayed messages', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'delayed' }, handler);
    await driver.start();

    await sendMessage('delayed', { late: true }, { delay: 200 });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(handler).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 200));
    expect(handler).toHaveBeenCalled();
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const handler = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 100));
      concurrent--;
    });

    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'concurrent', concurrency: 2 }, handler);
    await driver.start();

    await Promise.all([
      sendMessage('concurrent', 1),
      sendMessage('concurrent', 2),
      sendMessage('concurrent', 3),
      sendMessage('concurrent', 4)
    ]);

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(handler).toHaveBeenCalledTimes(4);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('returns queue depth', async () => {
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'depth' }, vi.fn());

    expect(await driver.getQueueDepth!('depth')).toBe(0);

    await sendMessage('depth', 1);
    await sendMessage('depth', 2);
    await sendMessage('depth', 3);

    expect(await driver.getQueueDepth!('depth')).toBe(3);
  });

  it('deletes messages by id', async () => {
    const handler = vi.fn();
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'delete' }, handler);

    const id = await sendMessage('delete', { remove: true });

    expect(await driver.getQueueDepth!('delete')).toBe(1);

    const deleted = await driver.deleteMessage!('delete', id);
    expect(deleted).toBe(true);
    expect(await driver.getQueueDepth!('delete')).toBe(0);
  });

  it('tracks queue stats', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'stats' }, handler);
    await driver.start();

    await sendMessage('stats', { ok: true });

    await new Promise(resolve => setTimeout(resolve, 300));

    const stats = getQueueStats('stats');
    expect(stats).toBeDefined();
    expect(stats!.completed).toBe(1);
  });

  it('returns all queue stats', async () => {
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'a' }, vi.fn().mockResolvedValue(undefined));
    defineQueue({ name: 'b' }, vi.fn().mockResolvedValue(undefined));
    await driver.start();

    await sendMessage('a', 1);
    await sendMessage('b', 2);

    await new Promise(resolve => setTimeout(resolve, 300));

    const all = getAllQueueStats();
    expect(all.a).toBeDefined();
    expect(all.b).toBeDefined();
    expect(all.a.completed).toBe(1);
    expect(all.b.completed).toBe(1);
  });

  it('stops processing when workers stopped', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'stop' }, handler);
    await driver.start();
    await driver.stop();

    await sendMessage('stop', { after: 'stop' });

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(handler).not.toHaveBeenCalled();
  });

  it('registers handlers when driver is set after definition', () => {
    const registerSpy = vi.fn();
    const mockDriver = {
      send: vi.fn().mockResolvedValue('id'),
      sendBatch: vi.fn().mockResolvedValue([]),
      registerHandler: registerSpy
    };

    const handler = vi.fn();
    defineQueue({ name: 'late' }, handler);

    expect(registerSpy).not.toHaveBeenCalled();

    setQueueDriver(mockDriver);

    expect(registerSpy).toHaveBeenCalledWith('late', handler, expect.objectContaining({ name: 'late' }));
  });

  it('passes message headers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);

    defineQueue({ name: 'headers' }, handler);
    await driver.start();

    await sendMessage(
      'headers',
      { data: 1 },
      { headers: { 'x-trace-id': 'abc123', 'content-type': 'application/json' } }
    );

    await new Promise(resolve => setTimeout(resolve, 300));

    expect(handler).toHaveBeenCalled();
    const msg = handler.mock.calls[0][0];
    expect(msg.headers).toEqual({ 'x-trace-id': 'abc123', 'content-type': 'application/json' });
  });

  it('generates unique message ids', async () => {
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'ids' }, vi.fn());

    const id1 = await sendMessage('ids', 1);
    const id2 = await sendMessage('ids', 2);

    expect(id1).not.toBe(id2);
  });

  it('supports startQueueWorkers and stopQueueWorkers helpers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'helpers' }, handler);

    await startQueueWorkers();
    await sendMessage('helpers', { via: 'helper' });

    await new Promise(resolve => setTimeout(resolve, 300));

    expect(handler).toHaveBeenCalled();

    await stopQueueWorkers();
  });

  it('clears queue definitions', async () => {
    defineQueue({ name: 'clear1' }, vi.fn());
    defineQueue({ name: 'clear2' }, vi.fn());

    expect(getQueueDefinitions()).toHaveLength(2);

    clearQueueDefinitions();

    expect(getQueueDefinitions()).toHaveLength(0);
  });

  it('handles messages without starting workers (manual processing possible)', async () => {
    const driver = createMemoryQueueDriver();
    setQueueDriver(driver);
    defineQueue({ name: 'manual' }, vi.fn());

    const id = await sendMessage('manual', { manual: true });

    expect(id).toBeDefined();
    expect(await driver.getQueueDepth!('manual')).toBe(1);
  });
});
