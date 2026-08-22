import type { QueueDriver, QueueHandler, QueueOptions } from './queue';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatement;
  exec?(query: string): Promise<unknown>;
}

export interface CloudflareQueueBinding {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch?(messages: Array<{ body: unknown }>): Promise<void>;
}

export interface PostgresLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface KvListBinding {
  lpush?(key: string, value: string): Promise<unknown>;
  rpop?(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del?(key: string): Promise<unknown>;
}

function interpolateSql(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce((sql, part, index) => {
    if (index === values.length) return sql + part;
    const value = values[index];
    const literal =
      value === null || value === undefined
        ? 'NULL'
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : `'${String(value).replace(/'/g, "''")}'`;
    return sql + part + literal;
  }, '');
}

/**
 * Wrap a Cloudflare D1 binding as ubean's `{ sql, exec, close }` shape
 * for `registerDb0Create` / `defineDatabase({ connector })`.
 */
export function createCloudflareD1Database(db: D1DatabaseBinding): {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  exec: (query: string) => Promise<unknown>;
  close: () => Promise<void>;
} {
  return {
    async sql(strings, ...values) {
      const query = interpolateSql(strings, values);
      const stmt = db.prepare(query);
      const result = await stmt.all();
      return result.results;
    },
    async exec(query) {
      if (typeof db.exec === 'function') return db.exec(query);
      await db.prepare(query).run();
    },
    async close() {
      /* D1 bindings are request-scoped */
    }
  };
}

/**
 * Cloudflare Queues producer. Consumer wiring stays in the Worker `queue()`
 * export — call the registered `defineQueue` handler there.
 */
export function createCloudflareQueueDriver(
  queues: Record<string, CloudflareQueueBinding>,
  handlers: Map<string, QueueHandler> = new Map()
): QueueDriver {
  return {
    async send(queueName, message, options) {
      const binding = queues[queueName];
      if (!binding) throw new Error(`[ubean] Cloudflare queue binding "${queueName}" is missing`);
      await binding.send(message, options?.delay ? { delaySeconds: options.delay } : undefined);
      return `cf_${Date.now().toString(36)}`;
    },
    async sendBatch(queueName, messages) {
      const binding = queues[queueName];
      if (!binding) throw new Error(`[ubean] Cloudflare queue binding "${queueName}" is missing`);
      if (binding.sendBatch) {
        await binding.sendBatch(messages.map(body => ({ body })));
      } else {
        for (const body of messages) await binding.send(body);
      }
      return messages.map((_, i) => `cf_batch_${i}`);
    },
    registerHandler(queueName, handler, _options?: QueueOptions) {
      handlers.set(queueName, handler);
    },
    async getQueueDepth() {
      return 0;
    }
  };
}

export function dispatchCloudflareQueueBatch(
  handlers: Map<string, QueueHandler>,
  queueName: string,
  bodies: unknown[]
): Promise<void[]> {
  const handler = handlers.get(queueName);
  if (!handler) return Promise.resolve([]);
  return Promise.all(
    bodies.map((body, index) =>
      handler({
        id: `cf_${index}`,
        body,
        timestamp: Date.now(),
        attempts: 1
      })
    )
  );
}

/**
 * Vercel Postgres / Neon-style client (`@vercel/postgres` or any `{ query }`).
 */
export function createVercelPostgresDatabase(client: PostgresLike): {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  exec: (query: string) => Promise<unknown>;
  close: () => Promise<void>;
} {
  return {
    async sql(strings, ...values) {
      const text = strings.reduce((sql, part, index) => {
        if (index === values.length) return sql + part;
        return `${sql}${part}$${index + 1}`;
      }, '');
      const result = await client.query(text, values);
      return result.rows;
    },
    async exec(query) {
      await client.query(query);
    },
    async close() {
      /* serverless clients are per-request */
    }
  };
}

/**
 * Non-memory Vercel queue adapter on a KV list (Upstash / `@vercel/kv`).
 * Not a product named "Vercel Queue" — the preset has `queues: false`.
 */
export function createVercelKvQueueDriver(kv: KvListBinding, prefix = 'ubean:queue:'): QueueDriver {
  const handlers = new Map<string, QueueHandler>();

  const listKey = (name: string) => `${prefix}${name}`;

  return {
    async send(queueName, message) {
      const id = `kv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = JSON.stringify({ id, body: message, timestamp: Date.now(), attempts: 0 });
      if (typeof kv.lpush === 'function') {
        await kv.lpush(listKey(queueName), payload);
      } else {
        await kv.set(`${listKey(queueName)}:${id}`, payload);
      }
      return id;
    },
    async sendBatch(queueName, messages, options) {
      const ids: string[] = [];
      for (const message of messages) {
        ids.push(await this.send(queueName, message, options));
      }
      return ids;
    },
    registerHandler(queueName, handler) {
      handlers.set(queueName, handler);
    },
    async start() {
      /* pull-based; workers call rpop */
    }
  };
}
