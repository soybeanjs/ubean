import { defineHandler, getScheduledTasks, runScheduledTask } from 'ubean';

export const GET = defineHandler(c => {
  const tasks = getScheduledTasks();
  return c.json({
    action: 'cron-status',
    tasks: tasks.map(t => ({
      name: t.name,
      schedule: t.schedule,
      timezone: t.timezone,
      runOnStart: t.runOnStart,
      timeout: t.timeout
    })),
    taskCount: tasks.length
  });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  const taskName = body.name || 'test-cron';

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
