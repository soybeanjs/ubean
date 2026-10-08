/**
 * Storage HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`createMemoryDriver`、`createStorage` 读写/keys/clear、TTL 与元信息、
 * base 与 mount 最长前缀匹配、`useStorage` 单例、`createKV`/`useKV` 前缀与命名空间）
 * 已于 TS-34 下沉到 `packages/server/test/storage-l1.test.ts`（43 例），此处不再重复。
 * 保留的只有**只有 HTTP 层能证明**的东西：端点可路由、状态码、响应形状。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearGlobalStorage } from 'ubean/server';
import { getJson } from './helper';

describe('Storage system', () => {
  beforeEach(() => {
    clearGlobalStorage();
  });

  describe('HTTP integration - /api/storage-advanced-test', () => {
    it('memory driver works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=memory');
      expect(res.status).toBe(200);
      const data = res.data as { allStored: boolean; stringVal: string; numberVal: number };
      expect(data.allStored).toBe(true);
      expect(data.stringVal).toBe('hello');
      expect(data.numberVal).toBe(42);
    });

    it('serialization works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=serialization');
      expect(res.status).toBe(200);
      expect((res.data as { allMatch: boolean }).allMatch).toBe(true);
    });

    it('mount works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=mount');
      expect(res.status).toBe(200);
      expect((res.data as { hasKeysFromBothDrivers: boolean }).hasKeysFromBothDrivers).toBe(true);
    });

    it('TTL works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=ttl');
      expect(res.status).toBe(200);
      const data = res.data as { beforeExpiry: boolean; afterExpiry: boolean; ttlExpired: boolean };
      expect(data.beforeExpiry).toBe(true);
      expect(data.afterExpiry).toBe(false);
      expect(data.ttlExpired).toBe(true);
    });
  });

  describe('HTTP integration - /api/storage-test', () => {
    it('storage operations work via existing endpoint', async () => {
      const res = await getJson('/api/storage-test');
      expect(res.status).toBe(200);
    });
  });
});
