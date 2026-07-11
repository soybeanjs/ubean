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

const scheduledTasks = new Map<string, ScheduledTask>();
let taskRunCount = 0;

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

  scheduledTasks.set(meta.name, task);
  return task;
}

export function getScheduledTasks(): ScheduledTask[] {
  return Array.from(scheduledTasks.values());
}

export function clearScheduledTasks(): void {
  scheduledTasks.clear();
}

export async function runScheduledTask(name: string): Promise<{ ok: boolean; duration: number; error?: Error }> {
  const task = scheduledTasks.get(name);
  if (!task) {
    throw new Error(`[ubean] Cron task "${name}" not found`);
  }

  taskRunCount++;
  const start = Date.now();
  try {
    const ctx: CronContext = {
      name: task.name,
      schedule: task.schedule,
      timestamp: new Date(),
      runCount: taskRunCount
    };
    await task.handler(ctx);
    return { ok: true, duration: Date.now() - start };
  } catch (err) {
    return { ok: false, duration: Date.now() - start, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function createCronContext(name: string, schedule: string): CronContext {
  taskRunCount++;
  return {
    name,
    schedule,
    timestamp: new Date(),
    runCount: taskRunCount
  };
}
