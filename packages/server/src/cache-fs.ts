import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeCacheKey, fromPersisted, toPersisted } from './cache';
import type { CacheEntry, CacheStore, PersistedCacheEntry } from './cache';

/**
 * Node 文件系统 CacheStore（从 `cache.ts` 拆出，2026-09）。
 *
 * 拆出的唯一原因是**产物卫生**：本文件静态 import `node:fs/promises`，而 `cache.ts` 在服务端图的
 * 主链路上 —— 混在一起会把 fs 依赖带进 worker 产物。现在只有 Node 部署走 `loadFsCacheStore()`
 * 时才会加载到这里。
 *
 * 语义与拆分前逐行一致：跨进程重启存活；不支持模式失效（用精确键）。
 */
export function createFsCacheStore(dir: string): CacheStore {
  const fileFor = (key: string) => join(dir, `${encodeCacheKey(key)}.json`);

  async function readEntry(key: string): Promise<CacheEntry | undefined> {
    try {
      const raw = await readFile(fileFor(key), 'utf8');
      return fromPersisted(JSON.parse(raw) as PersistedCacheEntry);
    } catch {
      return undefined;
    }
  }

  return {
    async get(key) {
      const entry = await readEntry(key);
      if (!entry || Date.now() >= entry.expiresAt) return undefined;
      return entry;
    },
    async peek(key) {
      return readEntry(key);
    },
    async set(key, entry, ttl) {
      await mkdir(dir, { recursive: true });
      const now = Date.now();
      const full: CacheEntry = {
        ...entry,
        createdAt: now,
        expiresAt: now + ttl * 1000
      };
      await writeFile(fileFor(key), JSON.stringify(toPersisted(full)), 'utf8');
    },
    async delete(key) {
      try {
        await unlink(fileFor(key));
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      try {
        const files = await readdir(dir);
        await Promise.all(files.filter(f => f.endsWith('.json')).map(f => unlink(join(dir, f))));
      } catch {
        /* dir may not exist */
      }
    }
  };
}
