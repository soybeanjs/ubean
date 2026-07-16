import { defineHandler, getScheduledTasks, runScheduledTask, defineScheduled } from 'ubean';

export const GET = defineHandler(c => {
  const tasks = getScheduledTasks();
  return c.json({
    action: 'cron-status',
    tasks: tasks.map(t => ({
      name: t.name,
      schedule: t.schedule,
      timezone: t.meta.timezone,
      runOnStart: t.meta.runOnStart,
      timeout: t.meta.timeout
    })),
    taskCount: tasks.length
  });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  const taskName = body.name || 'test-cron';

  // Ensure the task exists
  const existing = getScheduledTasks().find(t => t.name === taskName);
  if (!existing) {
    defineScheduled({ name: taskName, schedule: '* * * * *', runOnStart: false, timeout: 5000 }, async () => {});
  }

  try {
    await runScheduledTask(taskName);
    return c.json({ action: 'run', taskName, success: true, message: `Task "${taskName}" executed` });
  } catch (err) {
    return c.json(
      {
        action: 'run',
        taskName,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      },
      500
    );
  }
});
