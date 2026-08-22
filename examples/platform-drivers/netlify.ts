import { createStorage, useStorage } from '@ubean/server';
/**
 * Netlify: wrap `@netlify/blobs` `getStore()` as a `StorageDriver`.
 *
 * The netlify preset has `queues: false` — no queue adapter.
 */
import { createNetlifyBlobsStorage } from '@ubean/server/drivers';
import type { NetlifyBlobsStore } from '@ubean/server/drivers';

export function wireNetlifyBlobs(store: NetlifyBlobsStore): void {
  useStorage(createStorage({ driver: createNetlifyBlobsStorage(store) }));
}
