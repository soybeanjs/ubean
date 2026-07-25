export interface QueueMessage<T = unknown> {
  id: string;
  body: T;
  timestamp: number;
  attempts: number;
  headers?: Record<string, string>;
}

export interface QueueHandler<T = unknown> {
  (message: QueueMessage<T>): void | Promise<void>;
}

export interface QueueOptions<T = unknown> {
  name: string;
  handler?: QueueHandler<T>;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  deadLetterQueue?: string;
}

export interface QueueDefinition<T = unknown> extends QueueOptions<T> {
  handler: QueueHandler<T>;
}

export interface QueueDriver {
  send<T>(queueName: string, message: T, options?: SendOptions): Promise<string>;
  sendBatch<T>(queueName: string, messages: T[], options?: SendOptions): Promise<string[]>;
  registerHandler?(queueName: string, handler: QueueHandler, options?: QueueOptions): void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  getQueueDepth?(queueName: string): Promise<number>;
  deleteMessage?(queueName: string, messageId: string): Promise<boolean>;
}

export interface SendOptions {
  delay?: number;
  headers?: Record<string, string>;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

const queueDefinitions = new Map<string, QueueDefinition>();
let globalDriver: QueueDriver | null = null;
const inMemoryQueues = new Map<string, InMemoryQueueState>();

interface InMemoryQueueState {
  messages: QueueMessage[];
  processing: Set<string>;
  stats: QueueStats;
  handler?: QueueHandler;
  options: QueueOptions;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function defineQueue<T = unknown>(options: QueueOptions<T>, handler?: QueueHandler<T>): QueueDefinition<T> {
  if (!options.name) {
    throw new Error('[ubean] Queue must have a name');
  }

  const finalHandler = handler || options.handler;
  if (!finalHandler) {
    throw new Error(`[ubean] Queue "${options.name}" must have a handler`);
  }

  const def: QueueDefinition<T> = {
    name: options.name,
    handler: finalHandler,
    concurrency: options.concurrency ?? 5,
    retries: options.retries ?? 3,
    retryDelay: options.retryDelay ?? 1000,
    deadLetterQueue: options.deadLetterQueue
  };

  queueDefinitions.set(options.name, def as QueueDefinition);

  const untypedDef = def as unknown as QueueOptions;

  if (globalDriver?.registerHandler) {
    globalDriver.registerHandler(options.name, finalHandler as QueueHandler, untypedDef);
  }

  ensureInMemoryQueue(options.name, untypedDef);

  return def;
}

function ensureInMemoryQueue(name: string, options?: Partial<QueueOptions>): InMemoryQueueState {
  if (!inMemoryQueues.has(name)) {
    inMemoryQueues.set(name, {
      messages: [],
      processing: new Set(),
      stats: { pending: 0, processing: 0, completed: 0, failed: 0 },
      options: { name, ...options }
    });
  }
  return inMemoryQueues.get(name)!;
}

export function createMemoryQueueDriver(): QueueDriver {
  let running = false;
  let processTimer: ReturnType<typeof setInterval> | null = null;

  async function processQueue(name: string): Promise<void> {
    const queue = inMemoryQueues.get(name);
    if (!queue) return;

    const def = queueDefinitions.get(name);
    const concurrency = def?.concurrency ?? 5;
    const retries = def?.retries ?? 3;
    const retryDelay = def?.retryDelay ?? 1000;

    while (queue.processing.size < concurrency && queue.messages.length > 0) {
      const msg = queue.messages.shift();
      if (!msg) break;

      queue.processing.add(msg.id);
      queue.stats.processing++;
      queue.stats.pending--;

      processMessage(name, msg).catch(() => {});
    }

    async function processMessage(queueName: string, message: QueueMessage): Promise<void> {
      const q = inMemoryQueues.get(queueName);
      if (!q) return;

      const handler = queueDefinitions.get(queueName)?.handler;
      if (!handler) {
        q.processing.delete(message.id);
        q.stats.processing--;
        return;
      }

      try {
        await handler(message);
        q.processing.delete(message.id);
        q.stats.processing--;
        q.stats.completed++;
      } catch (err) {
        q.processing.delete(message.id);
        q.stats.processing--;
        message.attempts++;

        if (message.attempts >= retries) {
          q.stats.failed++;
          const dlq = def?.deadLetterQueue;
          if (dlq) {
            await driver.send(dlq, message.body, {
              headers: { 'x-error': err instanceof Error ? err.message : String(err) }
            });
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, retryDelay * message.attempts));
          q.messages.unshift(message);
          q.stats.pending++;
        }
      }
    }
  }

  const driver: QueueDriver = {
    async send<T>(queueName: string, body: T, options: SendOptions = {}): Promise<string> {
      const queue = ensureInMemoryQueue(queueName);
      const id = generateId();
      const message: QueueMessage<T> = {
        id,
        body,
        timestamp: Date.now(),
        attempts: 0,
        headers: options.headers
      };

      if (options.delay && options.delay > 0) {
        setTimeout(() => {
          queue.messages.push(message as QueueMessage);
          queue.stats.pending++;
          if (running) {
            processQueue(queueName);
          }
        }, options.delay);
      } else {
        queue.messages.push(message as QueueMessage);
        queue.stats.pending++;
        if (running) {
          processQueue(queueName);
        }
      }

      return id;
    },

    async sendBatch<T>(queueName: string, bodies: T[], options: SendOptions = {}): Promise<string[]> {
      const ids: string[] = [];
      for (const body of bodies) {
        const id = await this.send(queueName, body, options);
        ids.push(id);
      }
      return ids;
    },

    registerHandler(queueName: string, handler: QueueHandler, options?: QueueOptions) {
      const queue = ensureInMemoryQueue(queueName, options);
      queue.handler = handler;
    },

    async start() {
      if (running) return;
      running = true;

      for (const [name, def] of queueDefinitions) {
        const queue = ensureInMemoryQueue(name, def);
        queue.handler = def.handler;
      }

      processTimer = setInterval(() => {
        for (const name of inMemoryQueues.keys()) {
          processQueue(name);
        }
      }, 100);

      for (const name of inMemoryQueues.keys()) {
        processQueue(name);
      }
    },

    async stop() {
      running = false;
      if (processTimer) {
        clearInterval(processTimer);
        processTimer = null;
      }
    },

    async getQueueDepth(queueName: string): Promise<number> {
      const queue = inMemoryQueues.get(queueName);
      if (!queue) return 0;
      return queue.messages.length;
    },

    async deleteMessage(queueName: string, messageId: string): Promise<boolean> {
      const queue = inMemoryQueues.get(queueName);
      if (!queue) return false;

      const idx = queue.messages.findIndex(m => m.id === messageId);
      if (idx >= 0) {
        queue.messages.splice(idx, 1);
        queue.stats.pending--;
        return true;
      }

      if (queue.processing.has(messageId)) {
        queue.processing.delete(messageId);
        queue.stats.processing--;
        return true;
      }

      return false;
    }
  };

  return driver;
}

export function useQueueDriver(): QueueDriver {
  if (!globalDriver) {
    globalDriver = createMemoryQueueDriver();
  }
  return globalDriver;
}

export function setQueueDriver(driver: QueueDriver): void {
  globalDriver = driver;

  for (const [name, def] of queueDefinitions) {
    if (driver.registerHandler) {
      driver.registerHandler(name, def.handler, def as unknown as QueueOptions);
    }
  }
}

export async function sendMessage<T = unknown>(queueName: string, body: T, options?: SendOptions): Promise<string> {
  const driver = useQueueDriver();
  return driver.send(queueName, body, options);
}

export async function sendMessages<T = unknown>(
  queueName: string,
  bodies: T[],
  options?: SendOptions
): Promise<string[]> {
  const driver = useQueueDriver();
  return driver.sendBatch(queueName, bodies, options);
}

export function getQueueDefinitions(): QueueDefinition[] {
  return Array.from(queueDefinitions.values());
}

export function clearQueueDefinitions(): void {
  queueDefinitions.clear();
  inMemoryQueues.clear();
}

export async function startQueueWorkers(): Promise<void> {
  const driver = useQueueDriver();
  if (driver.start) {
    await driver.start();
  }
}

export async function stopQueueWorkers(): Promise<void> {
  const driver = useQueueDriver();
  if (driver.stop) {
    await driver.stop();
  }
}

export function getQueueStats(queueName: string): QueueStats | undefined {
  const queue = inMemoryQueues.get(queueName);
  if (!queue) return undefined;
  return { ...queue.stats };
}

export function getAllQueueStats(): Record<string, QueueStats> {
  const result: Record<string, QueueStats> = {};
  for (const [name, queue] of inMemoryQueues) {
    result[name] = { ...queue.stats };
  }
  return result;
}
