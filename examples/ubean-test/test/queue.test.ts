import { describe, it, expect, afterEach } from 'vitest';
import {
  defineQueue,
  createMemoryQueueDriver,
  setQueueDriver,
  sendMessage,
  sendMessages,
  getQueueStats,
  getAllQueueStats,
  startQueueWorkers,
  stopQueueWorkers,
  clearQueueDefinitions,
  getQueueDefinitions
} from 'ubean';
import { getJson, postJson } from './helper';

describe('Queue system', () => {
  afterEach(async () => {
    await stopQueueWorkers();
    clearQueueDefinitions();
  });

  describe('createMemoryQueueDriver()', () => {
    it('creates a driver with required methods', () => {
      const driver = createMemoryQueueDriver();
      expect(driver).toBeDefined();
      expect(typeof driver.send).toBe('function');
      expect(typeof driver.sendBatch).toBe('function');
      expect(typeof driver.start).toBe('function');
      expect(typeof driver.stop).toBe('function');
    });

    it('getQueueDepth returns 0 for empty queue', async () => {
      const driver = createMemoryQueueDriver();
      const depth = await driver.getQueueDepth?.('nonexistent');
      expect(depth).toBe(0);
    });

    it('deleteMessage returns false for nonexistent message', async () => {
      const driver = createMemoryQueueDriver();
      const result = await driver.deleteMessage?.('nonexistent', 'fake-id');
      expect(result).toBe(false);
    });
  });

  describe('defineQueue()', () => {
    it('defines a queue with options', () => {
      const q = defineQueue(
        {
          name: 'test-define',
          concurrency: 3,
          retries: 2,
          retryDelay: 100
        },
        async () => {}
      );
      expect(q.name).toBe('test-define');
      expect(q.concurrency).toBe(3);
      expect(q.retries).toBe(2);
      expect(q.retryDelay).toBe(100);
    });

    it('throws when queue has no name', () => {
      expect(() => {
        defineQueue({ name: '' }, async () => {});
      }).toThrow();
    });

    it('throws when queue has no handler', () => {
      expect(() => {
        defineQueue({ name: 'no-handler' });
      }).toThrow();
    });

    it('uses default concurrency/retries/retryDelay', () => {
      const q = defineQueue({ name: 'defaults-test' }, async () => {});
      expect(q.concurrency).toBe(5);
      expect(q.retries).toBe(3);
      expect(q.retryDelay).toBe(1000);
    });
  });

  describe('getQueueDefinitions()', () => {
    it('returns all defined queues', () => {
      defineQueue({ name: 'q1' }, async () => {});
      defineQueue({ name: 'q2' }, async () => {});
      const defs = getQueueDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('sendMessage() / sendMessages()', () => {
    it('sends a single message and returns an id', async () => {
      defineQueue({ name: 'single-test', concurrency: 1, retries: 0 }, async () => {});
      setQueueDriver(createMemoryQueueDriver());
      const id = await sendMessage('single-test', 'hello');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('sends batch messages and returns ids', async () => {
      defineQueue({ name: 'batch-test', concurrency: 3, retries: 0 }, async () => {});
      setQueueDriver(createMemoryQueueDriver());
      const ids = await sendMessages('batch-test', ['a', 'b', 'c']);
      expect(ids).toHaveLength(3);
      expect(ids.every(id => typeof id === 'string')).toBe(true);
    });
  });

  describe('getQueueStats() / getAllQueueStats()', () => {
    it('returns stats for a queue', async () => {
      defineQueue({ name: 'stats-test', concurrency: 1, retries: 0 }, async () => {});
      setQueueDriver(createMemoryQueueDriver());
      const stats = getQueueStats('stats-test');
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
    });

    it('returns undefined for nonexistent queue', () => {
      const stats = getQueueStats('nonexistent-queue');
      expect(stats).toBeUndefined();
    });

    it('getAllQueueStats returns all queues', async () => {
      defineQueue({ name: 'all-stats-1' }, async () => {});
      defineQueue({ name: 'all-stats-2' }, async () => {});
      setQueueDriver(createMemoryQueueDriver());
      const all = getAllQueueStats();
      expect(Object.keys(all).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('startQueueWorkers() / stopQueueWorkers()', () => {
    it('starts and stops workers', async () => {
      defineQueue({ name: 'worker-test', concurrency: 1, retries: 0 }, async () => {});
      setQueueDriver(createMemoryQueueDriver());
      await startQueueWorkers();
      await stopQueueWorkers();
    });

    it('processes messages when workers are running', async () => {
      const processed: string[] = [];
      defineQueue({ name: 'process-test', concurrency: 1, retries: 0 }, async msg => {
        processed.push(msg.body as string);
      });
      setQueueDriver(createMemoryQueueDriver());
      await startQueueWorkers();
      await sendMessage('process-test', 'hello');
      await new Promise(r => setTimeout(r, 200));
      await stopQueueWorkers();
      expect(processed).toContain('hello');
    });
  });

  describe('HTTP integration - /api/queue-test', () => {
    it('GET returns queue stats', async () => {
      const res = await getJson('/api/queue-test?action=stats');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('stats');
      expect(res.data).toHaveProperty('queueName');
    });

    it('POST sends a message', async () => {
      const res = await postJson('/api/queue-test', { message: 'test-from-http' });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
    });

    it('POST batch sends multiple messages', async () => {
      const res = await postJson('/api/queue-test', { message: 'batch-item', batch: true });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('count', 3);
    });

    it('GET processed returns processed messages', async () => {
      // Send a message first
      await postJson('/api/queue-test', { message: 'msg-to-process' });
      await new Promise(r => setTimeout(r, 300));
      const res = await getJson('/api/queue-test?action=processed');
      expect(res.status).toBe(200);
      expect((res.data as { count: number }).count).toBeGreaterThan(0);
    });
  });

  describe('HTTP integration - /api/queue-advanced-test', () => {
    it('memory driver works', async () => {
      const res = await getJson('/api/queue-advanced-test?action=memory-driver');
      expect(res.status).toBe(200);
      expect((res.data as { hasSend: boolean }).hasSend).toBe(true);
      expect((res.data as { hasSendBatch: boolean }).hasSendBatch).toBe(true);
      expect((res.data as { hasStart: boolean }).hasStart).toBe(true);
      expect((res.data as { hasStop: boolean }).hasStop).toBe(true);
    });

    it('retry mechanism processes message after failures', async () => {
      const res = await getJson('/api/queue-advanced-test?action=retry');
      expect(res.status).toBe(200);
      expect((res.data as { retryWorked: boolean }).retryWorked).toBe(true);
      expect((res.data as { processed: number }).processed).toBe(1);
    });

    it('dead letter queue receives failed messages', async () => {
      const res = await getJson('/api/queue-advanced-test?action=dlq');
      expect(res.status).toBe(200);
      expect((res.data as { dlqWorked: boolean }).dlqWorked).toBe(true);
      expect((res.data as { dlqReceived: number }).dlqReceived).toBe(1);
    });

    it('concurrency control limits parallel processing', async () => {
      const res = await getJson('/api/queue-advanced-test?action=concurrency');
      expect(res.status).toBe(200);
      expect((res.data as { concurrencyRespected: boolean }).concurrencyRespected).toBe(true);
      expect((res.data as { allProcessed: boolean }).allProcessed).toBe(true);
      expect((res.data as { maxConcurrent: number }).maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('delayed message is not processed immediately', async () => {
      const res = await getJson('/api/queue-advanced-test?action=delay');
      expect(res.status).toBe(200);
      expect((res.data as { delayWorked: boolean }).delayWorked).toBe(true);
      expect((res.data as { beforeDelay: number }).beforeDelay).toBe(0);
      expect((res.data as { afterDelay: number }).afterDelay).toBe(1);
    });

    it('batch send processes all messages', async () => {
      const res = await getJson('/api/queue-advanced-test?action=batch');
      expect(res.status).toBe(200);
      expect((res.data as { batchWorked: boolean }).batchWorked).toBe(true);
      expect((res.data as { sentCount: number }).sentCount).toBe(5);
      expect((res.data as { processedCount: number }).processedCount).toBe(5);
    });
  });
});
