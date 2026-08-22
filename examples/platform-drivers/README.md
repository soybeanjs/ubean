# Platform Queue / DB / Storage drivers (RM-U05)

Copy these adapters into `src/server.ts`. They talk to **platform bindings**, not the in-process memory driver.

- Cloudflare: D1 + Queues (`createCloudflareD1Database` / `createCloudflareQueueDriver`)
- Vercel: Postgres-compatible client + KV list (`createVercelPostgresDatabase` / `createVercelKvQueueDriver`)
- Bun: `bun:sqlite` (`createBunSqliteDatabase`)
- Deno: `Deno.openKv()` (`createDenoKvStorage`) — KV/storage only; Deno.Queue is not a stable cut
- Netlify: `@netlify/blobs` (`createNetlifyBlobsStorage`) — the netlify preset has `queues: false`

The Vercel KV adapter is an honest list on Upstash / `@vercel/kv`. The Vercel preset has `queues: false` — this is not a product named "Vercel Queue".

Default ubean DB / queue / storage is still in-memory until you wire a driver.

Unit coverage lives in `packages/server/test/drivers.test.ts` (mocked bindings).
