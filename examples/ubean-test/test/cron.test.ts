/**
 * Cron HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`parseCron`/`validateCron` 表达式解析、`defineScheduled` 校验、
 * `createMemoryCronScheduler` 执行语义、`getNextRuns`、`runOnSchedule`）已于 TS-34
 * 下沉到 `packages/server/test/cron-l1.test.ts`（44 例），此处不再重复。
 * 保留的只有**只有 HTTP 层能证明**的东西：端点可路由、状态码、响应形状。
 */
import { describe, it, expect } from 'vitest';
import { getJson, postJson } from './helper';

describe('Cron system', () => {
  describe('HTTP integration - /api/cron-parse-test', () => {
    it('parse action returns parsed results', async () => {
      const res = await getJson('/api/cron-parse-test?action=parse');
      expect(res.status).toBe(200);
      const data = res.data as { results: Array<{ valid: boolean }> };
      expect(data.results).toHaveLength(5);
      expect(data.results.every(r => r.valid)).toBe(true);
    });

    it('validate action returns validation results', async () => {
      const res = await getJson('/api/cron-parse-test?action=validate');
      expect(res.status).toBe(200);
      expect((res.data as { allPassed: boolean }).allPassed).toBe(true);
    });

    it('scheduler action returns scheduler info', async () => {
      const res = await getJson('/api/cron-parse-test?action=scheduler');
      expect(res.status).toBe(200);
      const data = res.data as { started: boolean; taskCount: number };
      expect(data.started).toBe(true);
      expect(data.taskCount).toBe(2);
    });

    it('runOnStart action executes immediate tasks', async () => {
      const res = await getJson('/api/cron-parse-test?action=runOnStart');
      expect(res.status).toBe(200);
      const data = res.data as { ranImmediate: boolean; skippedDelayed: boolean };
      expect(data.ranImmediate).toBe(true);
      expect(data.skippedDelayed).toBe(true);
    });
  });

  describe('HTTP integration - /api/cron-status', () => {
    it('returns cron task status', async () => {
      const res = await getJson('/api/cron-status');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('tasks');
      expect(res.data).toHaveProperty('taskCount');
    });

    it('manual execution via POST', async () => {
      const res = await postJson('/api/cron-status', { name: 'test-cron' });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('success');
    });
  });
});
