import {
  defineHandler,
  defineQueue,
  createMemoryQueueDriver,
  sendMessage,
  sendMessages,
  getQueueStats,
  getAllQueueStats,
  startQueueWorkers
} from 'ubean';

const processedMessages: Array<{ id: string; body: unknown; processedAt: string }> = [];

defineQueue(
  {
    name: 'test-queue',
    concurrency: 2,
    retries: 2,
    retryDelay: 100
  },
  async msg => {
    processedMessages.push({
      id: msg.id,
      body: msg.body,
      processedAt: new Date().toISOString()
    });
  }
);

createMemoryQueueDriver();

let workersStarted = false;

async function ensureWorkers() {
  if (!workersStarted) {
    await startQueueWorkers();
    workersStarted = true;
  }
}

export const GET = defineHandler(async c => {
  await ensureWorkers();
  const action = c.req.query('action') || 'stats';

  if (action === 'processed') {
    return c.json({ action: 'processed', messages: processedMessages, count: processedMessages.length });
  }

  if (action === 'all-stats') {
    return c.json({ action: 'all-stats', stats: getAllQueueStats() });
  }

  const stats = getQueueStats('test-queue');
  return c.json({ action: 'stats', queueName: 'test-queue', stats, processedCount: processedMessages.length });
});

export const POST = defineHandler(async c => {
  await ensureWorkers();
  const body = await c.req.json().catch(() => ({}));
  const { message = `msg-${Date.now()}`, batch = false } = body;

  if (batch) {
    const messages = Array.from({ length: 3 }, (_, i) => `${message}-${i}`);
    const ids = await sendMessages('test-queue', messages);
    return c.json({ action: 'sendBatch', ids, count: ids.length }, 201);
  }

  const id = await sendMessage('test-queue', message);
  return c.json({ action: 'send', id, message }, 201);
});
