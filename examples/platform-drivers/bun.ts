import { registerDb0Create } from '@ubean/server';
/**
 * Bun: wrap `bun:sqlite` as `{ sql, exec, close }` for `registerDb0Create`.
 *
 * Default ubean DB is still in-memory. Call this from `src/server.ts` on Bun.
 */
import { createBunSqliteDatabase } from '@ubean/server/drivers';
import type { BunSqliteLike } from '@ubean/server/drivers';

export function wireBunSqlite(db: BunSqliteLike): void {
  registerDb0Create(() => createBunSqliteDatabase(db));
}
