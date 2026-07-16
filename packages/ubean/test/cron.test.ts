import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineScheduled, getScheduledTasks, clearScheduledTasks, runScheduledTask } from '../src/runtime/cron';
import type { CronTaskMeta } from '../src/runtime/cron';
import { createMemoryCronScheduler, parseCron, validateCron, resetCronRunCounts } from '../src/runtime/cron-scheduler';

describe('Cron scheduler', () => {
  beforeEach(() => {
    clearScheduledTasks();
    resetCronRunCounts();
  });

  describe('parseCron', () => {
    it('parses wildcard cron expression', () => {
      const parsed = parseCron('* * * * *');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toContain(0);
      expect(parsed!.minute).toContain(59);
      expect(parsed!.hour).toContain(0);
      expect(parsed!.hour).toContain(23);
    });

    it('parses specific values', () => {
      const parsed = parseCron('0 12 * * *');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toEqual([0]);
      expect(parsed!.hour).toEqual([12]);
    });

    it('parses ranges', () => {
      const parsed = parseCron('0-5 9-17 * * 1-5');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toEqual([0, 1, 2, 3, 4, 5]);
      expect(parsed!.dow).toEqual([1, 2, 3, 4, 5]);
    });

    it('parses steps', () => {
      const parsed = parseCron('*/15 * * * *');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toEqual([0, 15, 30, 45]);
    });

    it('parses comma-separated values', () => {
      const parsed = parseCron('0,30 * * * 0,6');
      expect(parsed).not.toBeNull();
      expect(parsed!.minute).toEqual([0, 30]);
      expect(parsed!.dow).toEqual([0, 6]);
    });

    it('returns null for invalid expressions', () => {
      expect(parseCron('* *')).toBeNull();
      expect(parseCron('invalid')).toBeNull();
    });
  });

  describe('validateCron', () => {
    it('validates correct cron expressions', () => {
      expect(validateCron('* * * * *')).toBe(true);
      expect(validateCron('0 0 1 1 *')).toBe(true);
    });

    it('rejects invalid expressions', () => {
      expect(validateCron('* *')).toBe(false);
      expect(validateCron('60 * * * *')).toBe(false);
    });
  });

  describe('defineScheduled', () => {
    it('defines a scheduled task', () => {
      const handler = vi.fn();
      defineScheduled({ name: 'test-task', schedule: '* * * * *' }, handler);

      const tasks = getScheduledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('test-task');
      expect(tasks[0].schedule).toBe('* * * * *');
    });

    it('defines task with shorthand syntax', () => {
      const handler = vi.fn();
      defineScheduled('simple-task', handler);

      const tasks = getScheduledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('simple-task');
    });

    it('throws when task has no name', () => {
      expect(() => {
        defineScheduled({ schedule: '* * * * *' } as unknown as CronTaskMeta, () => {});
      }).toThrow('must have a name');
    });

    it('throws when task has no schedule', () => {
      expect(() => {
        defineScheduled({ name: 'test' } as unknown as CronTaskMeta, () => {});
      }).toThrow('must have a schedule');
    });
  });

  describe('runScheduledTask', () => {
    it('runs a registered task', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      defineScheduled({ name: 'run-test', schedule: '* * * * *' }, handler);

      const result = await runScheduledTask('run-test');
      expect(result.ok).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].name).toBe('run-test');
    });

    it('returns error for non-existent task', async () => {
      await expect(runScheduledTask('nonexistent')).rejects.toThrow('not found');
    });

    it('captures handler errors', async () => {
      const error = new Error('task failed');
      defineScheduled({ name: 'failing-task', schedule: '* * * * *' }, () => {
        throw error;
      });

      const result = await runScheduledTask('failing-task');
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('MemoryCronScheduler', () => {
    it('starts and stops', async () => {
      const scheduler = createMemoryCronScheduler();
      expect(scheduler.isRunning()).toBe(false);

      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('runs tasks with runOnStart meta when started', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      defineScheduled({ name: 'startup-task', schedule: '* * * * *', runOnStart: true }, handler);

      const scheduler = createMemoryCronScheduler();
      await scheduler.start();

      expect(handler).toHaveBeenCalledTimes(1);
      await scheduler.stop();
    });

    it('runs task manually via runTask', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      defineScheduled({ name: 'manual-task', schedule: '* * * * *' }, handler);

      const scheduler = createMemoryCronScheduler();
      const result = await scheduler.runTask('manual-task');

      expect(result.ok).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('respects task timeout', async () => {
      defineScheduled(
        { name: 'timeout-task', schedule: '* * * * *', timeout: 50 },
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      const scheduler = createMemoryCronScheduler();
      const result = await scheduler.runTask('timeout-task');

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('timed out');
    });

    it('calls lifecycle hooks', async () => {
      const onStart = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      const handler = vi.fn().mockResolvedValue(undefined);
      defineScheduled({ name: 'hooks-task', schedule: '* * * * *' }, handler);

      const scheduler = createMemoryCronScheduler({
        onTaskStart: onStart,
        onTaskComplete: onComplete,
        onTaskError: onError
      });

      await scheduler.runTask('hooks-task');

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('getNextRuns returns next execution times', () => {
      defineScheduled({ name: 'next-run-test', schedule: '0 0 * * *' }, () => {});

      const scheduler = createMemoryCronScheduler();
      const nextRuns = scheduler.getNextRuns();

      expect(nextRuns).toHaveLength(1);
      expect(nextRuns[0].name).toBe('next-run-test');
      expect(nextRuns[0].nextRun).toBeInstanceOf(Date);
    });

    it('getTasks returns all registered tasks', () => {
      defineScheduled({ name: 'task-1', schedule: '* * * * *' }, () => {});
      defineScheduled({ name: 'task-2', schedule: '0 * * * *' }, () => {});

      const scheduler = createMemoryCronScheduler();
      const tasks = scheduler.getTasks();

      expect(tasks).toHaveLength(2);
    });
  });
});
