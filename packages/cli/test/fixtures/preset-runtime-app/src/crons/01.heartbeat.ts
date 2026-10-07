import { defineScheduled } from 'ubean/server';

/**
 * TS-12 验收③用：让 `cronModules` 非空，从而把「进程内调度器」真正写进 server entry
 * （`production.ts` 只在 `Object.keys(cronModules).length > 0` 时才 emit `startCronScheduler()`）。
 *
 * `runOnStart: false` + 30s 周期：测试期间不会真的触发，`close()` 负责停掉 interval。
 */
export default defineScheduled(
  {
    name: 'preset-runtime-heartbeat',
    schedule: '*/30 * * * * *',
    runOnStart: false
  },
  async () => {}
);
