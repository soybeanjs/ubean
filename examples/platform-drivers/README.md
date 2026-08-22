# Platform Queue / DB drivers (RM-U05)

Copy these adapters into `src/server.ts`. They talk to **platform bindings**, not the in-process memory driver.

- Cloudflare: D1 + Queues (`createCloudflareD1Database` / `createCloudflareQueueDriver`)
- Vercel: Postgres-compatible client + KV list (`createVercelPostgresDatabase` / `createVercelKvQueueDriver`)

The Vercel KV adapter is an honest list on Upstash / `@vercel/kv`. The Vercel preset has `queues: false` — this is not a product named "Vercel Queue".

Unit coverage lives in `packages/server/test/drivers.test.ts` (mocked bindings).
