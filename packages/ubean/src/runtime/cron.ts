export type CronSchedule = string;

export interface CronTaskMeta {
  name: string;
  schedule: CronSchedule;
  description?: string;
  timezone?: string;
  timeout?: number;
  runOnStart?: boolean;
}

export interface CronTaskDefinition extends CronTaskMeta {
  handler: (ctx: CronContext) => void | Promise<void>;
}

export interface CronContext {
  name: string;
  schedule: CronSchedule;
  timestamp: Date;
  runCount: number;
}

export interface ScheduledTask {
  name: string;
  schedule: CronSchedule;
  handler: (ctx: CronContext) => void | Promise<void>;
  meta: Omit<CronTaskMeta, 'name' | 'schedule'>;
}

const SCHEDULED_TASKS_KEY = '__ubean_scheduled_tasks__';
const TASK_RUN_COUNT_KEY = '__ubean_task_run_count__';

function getTaskMap(): Map<string, ScheduledTask> {
  if (!(globalThis as Record<string, unknown>)[SCHEDULED_TASKS_KEY]) {
    (globalThis as Record<string, unknown>)[SCHEDULED_TASKS_KEY] = new Map<string, ScheduledTask>();
  }
  return (globalThis as Record<string, unknown>)[SCHEDULED_TASKS_KEY] as Map<string, ScheduledTask>;
}

function getTaskRunCount(): { value: number } {
  if (!(globalThis as Record<string, unknown>)[TASK_RUN_COUNT_KEY]) {
    (globalThis as Record<string, unknown>)[TASK_RUN_COUNT_KEY] = { value: 0 };
  }
  return (globalThis as Record<string, unknown>)[TASK_RUN_COUNT_KEY] as { value: number };
}

export function defineScheduled(
  metaOrName: CronTaskMeta | string,
  handler?: (ctx: CronContext) => void | Promise<void>
): ScheduledTask {
  let meta: CronTaskMeta;
  let fn: (ctx: CronContext) => void | Promise<void>;

  if (typeof metaOrName === 'string') {
    meta = { name: metaOrName, schedule: '* * * * *' };
    fn = handler || (() => {});
  } else {
    meta = metaOrName;
    fn = handler || (() => {});
  }

  if (!meta.name) {
    throw new Error('[ubean] Cron task must have a name');
  }

  if (!meta.schedule) {
    throw new Error(`[ubean] Cron task "${meta.name}" must have a schedule (cron expression)`);
  }

  const task: ScheduledTask = {
    name: meta.name,
    schedule: meta.schedule,
    handler: fn,
    meta: {
      description: meta.description,
      timezone: meta.timezone,
      timeout: meta.timeout,
      runOnStart: meta.runOnStart
    }
  };

  getTaskMap().set(meta.name, task);
  return task;
}

export function getScheduledTasks(): ScheduledTask[] {
  return Array.from(getTaskMap().values());
}

export function clearScheduledTasks(): void {
  getTaskMap().clear();
}

export async function runScheduledTask(name: string): Promise<{ ok: boolean; duration: number; error?: Error }> {
  const task = getTaskMap().get(name);
  if (!task) {
    throw new Error(`[ubean] Cron task "${name}" not found`);
  }

  const runCount = ++getTaskRunCount().value;
  const start = Date.now();
  try {
    const ctx: CronContext = {
      name: task.name,
      schedule: task.schedule,
      timestamp: new Date(),
      runCount
    };
    await task.handler(ctx);
    return { ok: true, duration: Date.now() - start };
  } catch (err) {
    return { ok: false, duration: Date.now() - start, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function createCronContext(name: string, schedule: string): CronContext {
  const runCount = ++getTaskRunCount().value;
  return {
    name,
    schedule,
    timestamp: new Date(),
    runCount
  };
}
