import { defineScheduled } from 'ubean';

let runCount = 0;
const runHistory: Array<{ count: number; timestamp: string }> = [];

export default defineScheduled(
  {
    name: 'test-cron',
    schedule: '*/5 * * * * *',
    timezone: 'UTC',
    runOnStart: false,
    timeout: 5000
  },
  async () => {
    runCount++;
    runHistory.push({ count: runCount, timestamp: new Date().toISOString() });
    if (runHistory.length > 20) runHistory.shift();
  }
);

export { runCount, runHistory };
