import {
  defineHandler,
  defineQueue,
  createMemoryQueueDriver,
  sendMessage,
  sendMessages,
  startQueueWorkers,
  stopQueueWorkers,
  getQueueStats,
  clearQueueDefinitions,
  setQueueDriver
} from 'ubean';

// Track processed/failed messages for testing
const processed: Array<{ id: string; body: unknown; attempts: number }> = [];
const failed: Array<{ id: string; body: unknown; error: string }> = [];

function setupRetryQueue() {
  clearQueueDefinitions();
  processed.length = 0;
  failed.length = 0;

  let callAttempts = 0;
  defineQueue(
    {
      name: 'retry-test-queue',
      concurrency: 1,
      retries: 3,
      retryDelay: 50
    },
    async msg => {
      callAttempts++;
      if (callAttempts < 3) {
        throw new Error(`Fail attempt ${callAttempts}`);
      }
      processed.push({ id: msg.id, body: msg.body, attempts: msg.attempts });
    }
  );

  setQueueDriver(createMemoryQueueDriver());
}

function setupDLQ() {
  clearQueueDefinitions();
  processed.length = 0;
  failed.length = 0;

  // Main queue that always fails, sends to DLQ
  defineQueue(
    {
      name: 'main-fail-queue',
      concurrency: 1,
      retries: 1,
      retryDelay: 10,
      deadLetterQueue: 'dlq-sink'
    },
    async () => {
      throw new Error('Always fails');
    }
  );

  // DLQ that captures failed messages
  defineQueue(
    {
      name: 'dlq-sink',
      concurrency: 1,
      retries: 0
    },
    async msg => {
      failed.push({ id: msg.id, body: msg.body, error: msg.headers?.['x-error'] || 'unknown' });
    }
  );

  setQueueDriver(createMemoryQueueDriver());
}

function setupConcurrencyQueue() {
  clearQueueDefinitions();
  processed.length = 0;

  let activeCount = 0;
  let maxConcurrent = 0;

  defineQueue(
    {
      name: 'concurrency-test',
      concurrency: 2,
      retries: 0
    },
    async msg => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise(r => setTimeout(r, 50));
      activeCount--;
      processed.push({ id: msg.id, body: msg.body, attempts: msg.attempts });
    }
  );

  setQueueDriver(createMemoryQueueDriver());
  return () => maxConcurrent;
}

function setupDelayQueue() {
  clearQueueDefinitions();
  processed.length = 0;

  defineQueue(
    {
      name: 'delay-test',
      concurrency: 1,
      retries: 0
    },
    async msg => {
      processed.push({ id: msg.id, body: msg.body, attempts: msg.attempts, timestamp: Date.now() } as any);
    }
  );

  setQueueDriver(createMemoryQueueDriver());
}

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';

  if (action === 'retry') {
    setupRetryQueue();
    await startQueueWorkers();
    const _sendTime = Date.now();
    const id = await sendMessage('retry-test-queue', 'retry-msg');
    // Wait for retries to complete
    await new Promise(r => setTimeout(r, 500));
    await stopQueueWorkers();

    const stats = getQueueStats('retry-test-queue');
    return c.json({
      action: 'retry',
      messageId: id,
      processed: processed.length,
      processedAttempts: processed[0]?.attempts,
      stats,
      retryWorked: processed.length === 1,
      succeededAfterRetries: processed.length === 1
    });
  }

  if (action === 'dlq') {
    setupDLQ();
    await startQueueWorkers();
    const id = await sendMessage('main-fail-queue', 'doomed-msg');
    await new Promise(r => setTimeout(r, 300));
    await stopQueueWorkers();

    const mainStats = getQueueStats('main-fail-queue');
    const dlqStats = getQueueStats('dlq-sink');
    return c.json({
      action: 'dlq',
      messageId: id,
      mainStats,
      dlqStats,
      dlqReceived: failed.length,
      dlqWorked: failed.length === 1,
      dlqMessageError: failed[0]?.error
    });
  }

  if (action === 'concurrency') {
    const getMaxConcurrent = setupConcurrencyQueue();
    await startQueueWorkers();
    // Send 5 messages, should process at most 2 at a time
    for (let i = 0; i < 5; i++) {
      await sendMessage('concurrency-test', `msg-${i}`);
    }
    await new Promise(r => setTimeout(r, 300));
    await stopQueueWorkers();

    const stats = getQueueStats('concurrency-test');
    return c.json({
      action: 'concurrency',
      maxConcurrent: getMaxConcurrent(),
      processedCount: processed.length,
      stats,
      concurrencyRespected: getMaxConcurrent() <= 2,
      allProcessed: processed.length === 5
    });
  }

  if (action === 'delay') {
    setupDelayQueue();
    await startQueueWorkers();
    const _sendTime = Date.now();
    await sendMessage('delay-test', 'delayed-msg', { delay: 200 });
    // Check it's not processed immediately
    await new Promise(r => setTimeout(r, 100));
    const beforeDelay = processed.length;
    // Wait for delay to pass
    await new Promise(r => setTimeout(r, 300));
    const afterDelay = processed.length;
    await stopQueueWorkers();

    return c.json({
      action: 'delay',
      beforeDelay,
      afterDelay,
      delayWorked: beforeDelay === 0 && afterDelay === 1
    });
  }

  if (action === 'batch') {
    clearQueueDefinitions();
    processed.length = 0;
    defineQueue({ name: 'batch-test', concurrency: 3, retries: 0 }, async msg => {
      processed.push({ id: msg.id, body: msg.body, attempts: msg.attempts });
    });
    setQueueDriver(createMemoryQueueDriver());
    await startQueueWorkers();

    const messages = ['b1', 'b2', 'b3', 'b4', 'b5'];
    const ids = await sendMessages('batch-test', messages);
    await new Promise(r => setTimeout(r, 200));
    await stopQueueWorkers();

    const stats = getQueueStats('batch-test');
    return c.json({
      action: 'batch',
      sentCount: ids.length,
      processedCount: processed.length,
      stats,
      batchWorked: ids.length === 5 && processed.length === 5
    });
  }

  if (action === 'memory-driver') {
    clearQueueDefinitions();
    const driver = createMemoryQueueDriver();
    const queueDepth = (await driver.getQueueDepth?.('test')) ?? 0;
    const deleted = (await driver.deleteMessage?.('test', 'nonexistent')) ?? false;

    return c.json({
      action: 'memory-driver',
      queueDepth,
      deleteMessageResult: deleted,
      hasSend: typeof driver.send === 'function',
      hasSendBatch: typeof driver.sendBatch === 'function',
      hasStart: typeof driver.start === 'function',
      hasStop: typeof driver.stop === 'function'
    });
  }

  return c.json({
    actions: ['retry', 'dlq', 'concurrency', 'delay', 'batch', 'memory-driver']
  });
});
