import { createStorage, useStorage } from '@ubean/server';
/**
 * Deno: wrap `Deno.openKv()` as a `StorageDriver`.
 *
 * Deno.Queue is not a stable cut — storage/KV only. Default ubean storage is memory.
 */
import { createDenoKvStorage } from '@ubean/server/drivers';
import type { DenoKvLike } from '@ubean/server/drivers';

export function wireDenoKv(kv: DenoKvLike): void {
  useStorage(createStorage({ driver: createDenoKvStorage(kv) }));
}
