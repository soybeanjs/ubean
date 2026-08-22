import type { QueueDriver, QueueHandler, QueueOptions } from './queue';
import type { StorageDriver } from './storage';

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

export interface BunSqliteStatement {
  all: (...params: unknown[]) => unknown[];
  run?: (...params: unknown[]) => unknown;
}

export interface BunSqliteLike {
  query: (sql: string) => BunSqliteStatement;
  exec?: (sql: string) => unknown;
  run?: (sql: string, ...params: unknown[]) => unknown;
  close?: () => void;
}

function toPositionalSql(strings: TemplateStringsArray, values: unknown[]): { sql: string; params: unknown[] } {
  const sql = strings.reduce((acc, part, index) => {
    if (index === values.length) return acc + part;
    return `${acc}${part}?`;
  }, '');
  return { sql, params: values };
}

/**
 * Wrap `bun:sqlite` `Database` as ubean's `{ sql, exec, close }` shape
 * for `registerDb0Create` / `defineDatabase({ connector })`.
 */
export function createBunSqliteDatabase(db: BunSqliteLike): {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  exec: (query: string) => Promise<unknown>;
  close: () => Promise<void>;
} {
  return {
    async sql(strings, ...values) {
      const { sql, params } = toPositionalSql(strings, values);
      return db.query(sql).all(...params);
    },
    async exec(query) {
      if (typeof db.exec === 'function') {
        db.exec(query);
        return;
      }
      if (typeof db.run === 'function') {
        db.run(query);
        return;
      }
      db.query(query).run?.();
    },
    async close() {
      db.close?.();
    }
  };
}

export type DenoKvKeyPart = string | number | bigint | boolean;

export interface DenoKvEntry {
  key: DenoKvKeyPart[];
  value: unknown;
}

export interface DenoKvLike {
  get: (key: DenoKvKeyPart[]) => Promise<{ value: unknown } | { value: undefined }>;
  set: (key: DenoKvKeyPart[], value: unknown) => Promise<unknown>;
  delete: (key: DenoKvKeyPart[]) => Promise<unknown>;
  list: (selector: { prefix: DenoKvKeyPart[] }) => AsyncIterable<DenoKvEntry>;
}

function toDenoKvKey(key: string): DenoKvKeyPart[] {
  return key ? [key] : [];
}

function fromDenoKvKey(parts: DenoKvKeyPart[]): string {
  return parts.map(String).join('');
}

/**
 * Wrap `Deno.openKv()` as a `StorageDriver` for `createStorage({ driver })`.
 * Keys are stored as a single Deno.Kv part so string keys round-trip.
 */
export function createDenoKvStorage(kv: DenoKvLike): StorageDriver {
  const getKeys = async (base?: string): Promise<string[]> => {
    const prefix = toDenoKvKey(base ?? '');
    const keys: string[] = [];
    for await (const entry of kv.list({ prefix })) {
      const stored = fromDenoKvKey(entry.key);
      if (!base || stored.startsWith(base)) keys.push(stored);
    }
    return keys;
  };

  return {
    async getItemRaw(key) {
      const entry = await kv.get(toDenoKvKey(key));
      return entry.value ?? null;
    },
    async setItemRaw(key, value) {
      await kv.set(toDenoKvKey(key), value);
    },
    async removeItem(key) {
      await kv.delete(toDenoKvKey(key));
    },
    getKeys,
    async clear(base) {
      const keys = await getKeys(base);
      await Promise.all(keys.map(key => kv.delete(toDenoKvKey(key))));
    },
    async hasItem(key) {
      const entry = await kv.get(toDenoKvKey(key));
      return entry.value !== undefined && entry.value !== null;
    }
  };
}

export interface NetlifyBlobsListResult {
  blobs?: Array<{ key: string }>;
}

export interface NetlifyBlobsStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
  list?: (options?: { prefix?: string }) => Promise<NetlifyBlobsListResult | string[]>;
}

function encodeBlobValue(value: unknown): string {
  return JSON.stringify(value);
}

function decodeBlobValue(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function blobListKeys(result: NetlifyBlobsListResult | string[] | undefined): string[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return (result.blobs ?? []).map(blob => blob.key);
}

/**
 * Wrap `@netlify/blobs` `getStore()` as a `StorageDriver`.
 * Values are JSON-serialized; Netlify preset has `queues: false` (no queue adapter).
 */
export function createNetlifyBlobsStorage(store: NetlifyBlobsStore): StorageDriver {
  const getKeys = async (base?: string): Promise<string[]> => {
    if (typeof store.list !== 'function') return [];
    const keys = blobListKeys(await store.list(base ? { prefix: base } : undefined));
    return base ? keys.filter(key => key.startsWith(base)) : keys;
  };

  return {
    async getItemRaw(key) {
      return decodeBlobValue(await store.get(key));
    },
    async setItemRaw(key, value) {
      await store.set(key, encodeBlobValue(value));
    },
    async removeItem(key) {
      await store.delete(key);
    },
    getKeys,
    async clear(base) {
      const keys = await getKeys(base);
      await Promise.all(keys.map(key => store.delete(key)));
    },
    async hasItem(key) {
      return (await store.get(key)) != null;
    }
  };
}
