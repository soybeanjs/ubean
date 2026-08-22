import { registerDb0Create, setQueueDriver } from '@ubean/server';
/**
 * Cloudflare Workers: wire D1 + Queues from the Worker `env` binding.
 *
 * wrangler.toml: `d1_databases` + `queues` (see `generateWranglerConfig`).
 * Consumer: call `dispatchCloudflareQueueBatch` from the Worker `queue()` export.
 */
import {
  createCloudflareD1Database,
  createCloudflareQueueDriver,
  dispatchCloudflareQueueBatch
} from '@ubean/server/drivers';
import type { CloudflareQueueBinding, D1DatabaseBinding } from '@ubean/server/drivers';

export function wireCloudflareDrivers(env: {
  DB: D1DatabaseBinding;
  JOBS: CloudflareQueueBinding;
}): ReturnType<typeof createCloudflareQueueDriver> {
  const handlers = new Map();
  const driver = createCloudflareQueueDriver({ jobs: env.JOBS }, handlers);
  registerDb0Create(() => createCloudflareD1Database(env.DB));
  setQueueDriver(driver);
  return driver;
}

export { dispatchCloudflareQueueBatch };
