import { getScheduledTasks } from './cron';
import type { ScheduledTask, CronContext } from './cron';

export interface CronScheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
  runTask(name: string): Promise<{ ok: boolean; duration: number; error?: Error }>;
  isRunning(): boolean;
  getTasks(): ScheduledTask[];
  getNextRuns(): Array<{ name: string; nextRun: Date | null }>;
}

export interface SchedulerOptions {
  timezone?: string;
  defaultTimeout?: number;
  onTaskStart?: (task: ScheduledTask) => void;
  onTaskComplete?: (task: ScheduledTask, result: { ok: boolean; duration: number; error?: Error }) => void;
  onTaskError?: (task: ScheduledTask, error: Error) => void;
}

type CronField = number[];

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

function parseField(field: string, min: number, max: number): CronField {
  const result = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '*') {
      for (let i = min; i <= max; i++) result.add(i);
      continue;
    }

    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    let base = trimmed;
    let step = 1;
    if (stepMatch) {
      base = stepMatch[1];
      step = parseInt(stepMatch[2], 10);
    }

    if (base === '*') {
      for (let i = min; i <= max; i += step) result.add(i);
      continue;
    }

    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = Math.max(min, start); i <= Math.min(max, end); i += step) result.add(i);
      continue;
    }

    const value = parseInt(base, 10);
    if (!isNaN(value) && value >= min && value <= max) {
      result.add(value);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

export function parseCron(schedule: string): ParsedCron | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const parsed = {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6)
  };

  if (
    parsed.minute.length === 0 ||
    parsed.hour.length === 0 ||
    parsed.dom.length === 0 ||
    parsed.month.length === 0 ||
    parsed.dow.length === 0
  ) {
    return null;
  }

  return parsed;
}

function matches(date: Date, parsed: ParsedCron): boolean {
  return (
    parsed.minute.includes(date.getMinutes()) &&
    parsed.hour.includes(date.getHours()) &&
    parsed.dom.includes(date.getDate()) &&
    parsed.month.includes(date.getMonth() + 1) &&
    parsed.dow.includes(date.getDay())
  );
}

function nextMatch(from: Date, parsed: ParsedCron): Date | null {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matches(d, parsed)) return new Date(d);
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

const taskRunCounts = new Map<string, number>();

function getRunCount(name: string): number {
  const c = taskRunCounts.get(name) || 0;
  taskRunCounts.set(name, c + 1);
  return c + 1;
}

export function createMemoryCronScheduler(options: SchedulerOptions = {}): CronScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  const taskTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const runOnStartExecuted = new Set<string>();

  async function executeTask(task: ScheduledTask) {
    const ctx: CronContext = {
      name: task.name,
      schedule: task.schedule,
      timestamp: new Date(),
      runCount: getRunCount(task.name)
    };

    const start = Date.now();
    options.onTaskStart?.(task);

    try {
      const timeoutMs = task.meta.timeout || options.defaultTimeout || 30000;
      await Promise.race([
        task.handler(ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Task "${task.name}" timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
      const result = { ok: true, duration: Date.now() - start };
      options.onTaskComplete?.(task, result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const result = { ok: false, duration: Date.now() - start, error };
      options.onTaskError?.(task, error);
      options.onTaskComplete?.(task, result);
      return result;
    }
  }

  function checkAndRun() {
    const tasks = getScheduledTasks();
    const now = new Date();

    for (const task of tasks) {
      const parsed = parseCron(task.schedule);
      if (!parsed) continue;
      if (matches(now, parsed)) {
        const timerKey = `${task.name}_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
        if (taskTimers.has(timerKey)) continue;
        if (runOnStartExecuted.has(task.name)) {
          runOnStartExecuted.delete(task.name);
          taskTimers.set(
            timerKey,
            setTimeout(() => {
              taskTimers.delete(timerKey);
            }, 60000)
          );
          continue;
        }
        taskTimers.set(
          timerKey,
          setTimeout(() => {
            taskTimers.delete(timerKey);
          }, 60000)
        );
        executeTask(task);
      }
    }
  }

  return {
    async start() {
      if (running) return;
      running = true;

      const tasks = getScheduledTasks();
      for (const task of tasks) {
        if (task.meta.runOnStart) {
          runOnStartExecuted.add(task.name);
          await executeTask(task);
        }
      }

      timer = setInterval(checkAndRun, 30000);
    },

    async stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      for (const t of taskTimers.values()) clearTimeout(t);
      taskTimers.clear();
    },

    async runTask(name: string) {
      const tasks = getScheduledTasks();
      const task = tasks.find(t => t.name === name);
      if (!task) {
        throw new Error(`[ubean] Cron task "${name}" not found`);
      }
      return executeTask(task);
    },

    isRunning(): boolean {
      return running;
    },

    getTasks(): ScheduledTask[] {
      return getScheduledTasks();
    },

    getNextRuns() {
      return getScheduledTasks().map(task => {
        const parsed = parseCron(task.schedule);
        return {
          name: task.name,
          nextRun: parsed ? nextMatch(new Date(), parsed) : null
        };
      });
    }
  };
}

export function startCronScheduler(options: SchedulerOptions = {}): CronScheduler {
  const scheduler = createMemoryCronScheduler(options);
  scheduler.start();
  return scheduler;
}

export function resetCronRunCounts(): void {
  taskRunCounts.clear();
}

export function validateCron(schedule: string): boolean {
  return parseCron(schedule) !== null;
}
