import { registerDb0Create, setQueueDriver } from '@ubean/server';
/**
 * Vercel / Neon: Postgres-compatible `{ query }` + KV list as a queue.
 *
 * Env: `POSTGRES_URL`. KV: `@vercel/kv` or Upstash (`lpush` / `rpop`).
 * Not a Vercel Queue product — the vercel preset keeps `queues: false`.
 */
import { createVercelKvQueueDriver, createVercelPostgresDatabase } from '@ubean/server/drivers';
import type { KvListBinding, PostgresLike } from '@ubean/server/drivers';

export function wireVercelDrivers(client: PostgresLike, kv: KvListBinding): void {
  registerDb0Create(() => createVercelPostgresDatabase(client));
  setQueueDriver(createVercelKvQueueDriver(kv));
}
