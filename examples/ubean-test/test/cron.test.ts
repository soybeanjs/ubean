import { describe, it, expect } from 'vitest';
import {
  parseCron,
  validateCron,
  createMemoryCronScheduler,
  resetCronRunCounts,
  defineScheduled,
  clearScheduledTasks
} from 'ubean';
import { getJson, postJson } from './helper';

describe('Cron system', () => {
  describe('parseCron() - expression parsing', () => {
    it('parses basic 5-field expression', () => {
      const parsed = parseCron('* * * * *');
      expect(parsed).toBeDefined();
      expect(parsed).not.toBeNull();
    });

    it('parses "every minute" expression', () => {
      const parsed = parseCron('* * * * *');
      expect(parsed).toBeDefined();
      expect(parsed!.minute).toHaveLength(60);
    });

    it('parses weekday morning expression', () => {
      const parsed = parseCron('0 9 * * 1-5');
      expect(parsed).not.toBeNull();
      expect(parsed!.hour).toContain(9);
      expect(parsed!.dow).toEqual([1, 2, 3, 4, 5]);
    });

    it('parses every 15 minutes', () => {
      const parsed = parseCron('*/15 * * * *');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toEqual([0, 15, 30, 45]);
    });

    it('parses first of month', () => {
      const parsed = parseCron('0 0 1 * *');
      expect(parsed).not.toBeNull();
      expect(parsed!.dom).toContain(1);
    });

    it('parses Sunday midnight', () => {
      const parsed = parseCron('0 0 * * 0');
      expect(parsed).not.toBeNull();
      expect(parsed!.dow).toContain(0);
    });

    it('returns null on invalid expression', () => {
      expect(parseCron('invalid')).toBeNull();
    });
  });

  describe('validateCron() - expression validation', () => {
    it('validates correct expressions as true', () => {
      expect(validateCron('* * * * *')).toBe(true);
      expect(validateCron('0 9 * * 1-5')).toBe(true);
      expect(validateCron('*/15 * * * *')).toBe(true);
      expect(validateCron('0 0 1 * *')).toBe(true);
      expect(validateCron('0 0 * * 0')).toBe(true);
    });

    it('validates invalid expressions as false', () => {
      expect(validateCron('invalid')).toBe(false);
      expect(validateCron('0 0 0 0 0')).toBe(false);
      expect(validateCron('')).toBe(false);
    });
  });

  describe('createMemoryCronScheduler()', () => {
    it('creates a scheduler instance', () => {
      const scheduler = createMemoryCronScheduler();
      expect(scheduler).toBeDefined();
      expect(typeof scheduler.start).toBe('function');
      expect(typeof scheduler.stop).toBe('function');
      expect(typeof scheduler.runTask).toBe('function');
      expect(typeof scheduler.isRunning).toBe('function');
      expect(typeof scheduler.getTasks).toBe('function');
      expect(typeof scheduler.getNextRuns).toBe('function');
    });

    it('starts and stops without errors', async () => {
      clearScheduledTasks();
      defineScheduled(
        { name: 'test-task', schedule: '* * * * *', timezone: 'UTC', runOnStart: false, timeout: 5000 },
        async () => {}
      );
      const scheduler = createMemoryCronScheduler();
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('returns task list', async () => {
      resetCronRunCounts();
      clearScheduledTasks();
      defineScheduled(
        { name: 'status-task', schedule: '* * * * *', timezone: 'UTC', runOnStart: false, timeout: 5000 },
        async () => {}
      );
      const scheduler = createMemoryCronScheduler();
      await scheduler.start();
      const tasks = scheduler.getTasks();
      expect(tasks.length).toBeGreaterThan(0);
      const nextRuns = scheduler.getNextRuns();
      expect(nextRuns.length).toBe(tasks.length);
      await scheduler.stop();
    });
  });

  describe('runOnStart', () => {
    it('executes tasks with runOnStart immediately', async () => {
      resetCronRunCounts();
      clearScheduledTasks();
      const executed: string[] = [];

      defineScheduled(
        { name: 'immediate', schedule: '0 0 1 1 *', timezone: 'UTC', runOnStart: true, timeout: 5000 },
        async ctx => {
          executed.push(ctx.name);
        }
      );
      defineScheduled(
        { name: 'delayed', schedule: '0 0 1 1 *', timezone: 'UTC', runOnStart: false, timeout: 5000 },
        async ctx => {
          executed.push(ctx.name);
        }
      );

      const scheduler = createMemoryCronScheduler();
      await scheduler.start();
      await new Promise(r => setTimeout(r, 100));
      await scheduler.stop();

      expect(executed).toContain('immediate');
      expect(executed).not.toContain('delayed');
    });
  });

  describe('HTTP integration - /api/cron-parse-test', () => {
    it('parse action returns parsed results', async () => {
      const res = await getJson('/api/cron-parse-test?action=parse');
      expect(res.status).toBe(200);
      expect(res.data.results).toHaveLength(5);
      expect(res.data.results.every((r: any) => r.valid)).toBe(true);
    });

    it('validate action returns validation results', async () => {
      const res = await getJson('/api/cron-parse-test?action=validate');
      expect(res.status).toBe(200);
      expect(res.data.allPassed).toBe(true);
    });

    it('scheduler action returns scheduler info', async () => {
      const res = await getJson('/api/cron-parse-test?action=scheduler');
      expect(res.status).toBe(200);
      expect(res.data.started).toBe(true);
      expect(res.data.taskCount).toBe(2);
    });

    it('runOnStart action executes immediate tasks', async () => {
      const res = await getJson('/api/cron-parse-test?action=runOnStart');
      expect(res.status).toBe(200);
      expect(res.data.ranImmediate).toBe(true);
      expect(res.data.skippedDelayed).toBe(true);
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
