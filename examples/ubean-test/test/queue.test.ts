/**
 * Queue HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`defineQueue` 校验与默认值、内存驱动投递/重试/死信、深度/删除/统计、
 * driver 管理）已于 TS-34 下沉到 `packages/server/test/queue-l1.test.ts`（29 例），
 * 此处不再重复。保留的只有**只有 HTTP 层能证明**的东西：端点可路由、状态码、
 * 响应形状、请求驱动的队列处理时序。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { stopQueueWorkers, clearQueueDefinitions } from 'ubean/server';
import { getJson, postJson } from './helper';

describe('Queue system', () => {
  afterEach(async () => {
    await stopQueueWorkers();
    clearQueueDefinitions();
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
