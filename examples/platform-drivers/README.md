# Platform Queue / DB / Storage drivers (RM-U05)

> **代码片段集，非示例。** 本目录**不是**可运行的 ubean 项目：没有 `package.json`、没有
> `ubean.config.ts`、没有 `src/`，因此不参与构建、不参与 `pnpm test`，也没有冒烟测试。
> 它是「把平台绑定接到 `src/server.ts`」的适配器片段清单。需要一个真示例时，请新建
> 带 `package.json` 的目录（并同步 `packages/cli/test/example-smoke.test.ts` 的负向断言）。

Copy these adapters into `src/server.ts`. They talk to **platform bindings**, not the in-process memory driver.

- Cloudflare: D1 + Queues (`createCloudflareD1Database` / `createCloudflareQueueDriver`)
- Vercel: Postgres-compatible client + KV list (`createVercelPostgresDatabase` / `createVercelKvQueueDriver`)
- Bun: `bun:sqlite` (`createBunSqliteDatabase`)
- Deno: `Deno.openKv()` (`createDenoKvStorage`) — KV/storage only; Deno.Queue is not a stable cut
- Netlify: `@netlify/blobs` (`createNetlifyBlobsStorage`) — the netlify preset has `queues: false`

The Vercel KV adapter is an honest list on Upstash / `@vercel/kv`. The Vercel preset has `queues: false` — this is not a product named "Vercel Queue".

Default ubean DB / queue / storage is still in-memory until you wire a driver.

Unit coverage lives in `packages/server/test/drivers.test.ts` (mocked bindings).
