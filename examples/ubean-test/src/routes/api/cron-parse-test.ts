import {
  defineHandler,
  parseCron,
  validateCron,
  createMemoryCronScheduler,
  resetCronRunCounts,
  defineScheduled,
  clearScheduledTasks
} from 'ubean';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'parse';

  if (action === 'parse') {
    const tests = [
      '* * * * *',
      '0 9 * * 1-5',
      '*/15 * * * *',
      '0 0 1 * *',
      '0 0 * * 0'
    ];
    const results = tests.map(expr => {
      try {
        const parsed = parseCron(expr);
        return { expression: expr, valid: parsed !== null, parsed };
      } catch (e) {
        return { expression: expr, valid: false, error: e instanceof Error ? e.message : String(e) };
      }
    });
    return c.json({ action: 'parse', results });
  }

  if (action === 'validate') {
    const tests = [
      { expr: '* * * * *', expected: true },
      { expr: '0 9 * * 1-5', expected: true },
      { expr: '*/15 * * * *', expected: true },
      { expr: 'invalid', expected: false },
      { expr: '0 0 0 0 0', expected: false },
      { expr: '', expected: false }
    ];
    const results = tests.map(t => ({
      expression: t.expr,
      expected: t.expected,
      actual: validateCron(t.expr),
      passed: validateCron(t.expr) === t.expected
    }));
    return c.json({ action: 'validate', results, allPassed: results.every(r => r.passed) });
  }

  if (action === 'scheduler') {
    resetCronRunCounts();
    clearScheduledTasks();

    defineScheduled(
      {
        name: 'scheduler-test-1',
        schedule: '* * * * *',
        timezone: 'UTC',
        runOnStart: false,
        timeout: 5000
      },
      async () => {}
    );
    defineScheduled(
      {
        name: 'scheduler-test-2',
        schedule: '*/15 * * * *',
        timezone: 'UTC',
        runOnStart: true,
        timeout: 3000
      },
      async () => {}
    );

    const scheduler = createMemoryCronScheduler();
    await scheduler.start();
    const tasks = scheduler.getTasks();
    const nextRuns = scheduler.getNextRuns();
    scheduler.stop();

    return c.json({
      action: 'scheduler',
      started: true,
      taskCount: tasks.length,
      tasks: tasks.map(t => t.name),
      nextRuns: nextRuns.map(n => ({ name: n.name, nextRun: n.nextRun ? n.nextRun.toISOString() : null }))
    });
  }

  if (action === 'runOnStart') {
    resetCronRunCounts();
    clearScheduledTasks();

    const executedTasks: string[] = [];

    defineScheduled(
      {
        name: 'immediate-task',
        schedule: '0 0 1 1 *',
        timezone: 'UTC',
        runOnStart: true,
        timeout: 5000
      },
      async ctx => {
        executedTasks.push(ctx.name);
      }
    );
    defineScheduled(
      {
        name: 'delayed-task',
        schedule: '0 0 1 1 *',
        timezone: 'UTC',
        runOnStart: false,
        timeout: 5000
      },
      async ctx => {
        executedTasks.push(ctx.name);
      }
    );

    const scheduler = createMemoryCronScheduler();
    await scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    scheduler.stop();

    return c.json({
      action: 'runOnStart',
      executedTasks,
      ranImmediate: executedTasks.includes('immediate-task'),
      skippedDelayed: !executedTasks.includes('delayed-task')
    });
  }

  return c.json({ actions: ['parse', 'validate', 'scheduler', 'runOnStart'] });
});
