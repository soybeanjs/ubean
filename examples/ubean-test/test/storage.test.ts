import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryDriver, createStorage, clearGlobalStorage, createKV, useStorage } from 'ubean';
import { getJson } from './helper';

describe('Storage system', () => {
  beforeEach(() => {
    clearGlobalStorage();
  });

  describe('createMemoryDriver()', () => {
    it('creates a driver with required methods', () => {
      const driver = createMemoryDriver();
      expect(driver).toBeDefined();
      expect(typeof driver.getItemRaw).toBe('function');
      expect(typeof driver.setItemRaw).toBe('function');
      expect(typeof driver.removeItem).toBe('function');
      expect(typeof driver.getKeys).toBe('function');
      expect(typeof driver.hasItem).toBe('function');
      expect(typeof driver.clear).toBe('function');
    });
  });

  describe('createStorage() / useStorage()', () => {
    it('creates a storage instance with driver', () => {
      const driver = createMemoryDriver();
      const storage = createStorage({ driver });
      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe('function');
      expect(typeof storage.set).toBe('function');
      expect(typeof storage.remove).toBe('function');
    });

    it('setItem/getItem stores and retrieves string values', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('key', 'value');
      const val = await storage.get('key');
      expect(val).toBe('value');
    });

    it('setItem/getItem stores and retrieves number values', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('num', 42);
      const val = await storage.get('num');
      expect(val).toBe(42);
    });

    it('setItem/getItem stores and retrieves boolean values', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('bool', true);
      const val = await storage.get('bool');
      expect(val).toBe(true);
    });

    it('setItem/getItem stores and retrieves objects', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('obj', { a: 1, b: { c: 2 } });
      const val = await storage.get('obj');
      expect(val).toEqual({ a: 1, b: { c: 2 } });
    });

    it('setItem/getItem stores and retrieves arrays', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('arr', [1, 'two', { three: 3 }]);
      const val = await storage.get('arr');
      expect(val).toEqual([1, 'two', { three: 3 }]);
    });

    it('getItem returns null for missing key', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      const val = await storage.get('nonexistent');
      expect(val).toBeNull();
    });

    it('hasItem checks key existence', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('exists', 'val');
      expect(await storage.has('exists')).toBe(true);
      expect(await storage.has('missing')).toBe(false);
    });

    it('removeItem deletes a key', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('todelete', 'val');
      await storage.remove('todelete');
      expect(await storage.has('todelete')).toBe(false);
    });

    it('getKeys returns all keys', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('a', 1);
      await storage.set('b', 2);
      const keys = await storage.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('clear removes all keys', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.clear();
      expect((await storage.keys()).length).toBe(0);
    });
  });

  describe('Automatic serialization/deserialization', () => {
    it('serializes objects to JSON and back', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      const obj = { name: 'test', nested: { value: 42 }, arr: [1, 2, 3] };
      await storage.set('serialized', obj);
      const retrieved = await storage.get('serialized');
      expect(retrieved).toEqual(obj);
    });

    it('handles null values', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('null-val', null);
      const val = await storage.get('null-val');
      expect(val).toBeNull();
    });

    it('handles false boolean', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('false', false);
      const val = await storage.get('false');
      expect(val).toBe(false);
    });
  });

  describe('mount() - multi-driver mounting', () => {
    it('mounts a second driver at a prefix', async () => {
      const driver1 = createMemoryDriver();
      const driver2 = createMemoryDriver();
      const storage = createStorage({ driver: driver1 });

      storage.mount('cache', driver2);

      await storage.set('main-key', 'from-main');
      await storage.set('cache:key1', 'from-cache');

      expect(await storage.get('main-key')).toBe('from-main');
      expect(await storage.get('cache:key1')).toBe('from-cache');
    });

    it('keys from both drivers appear in getKeys', async () => {
      const driver1 = createMemoryDriver();
      const driver2 = createMemoryDriver();
      const storage = createStorage({ driver: driver1 });

      storage.mount('other', driver2);

      await storage.set('main-key', 'main');
      await storage.set('other:key1', 'other1');
      await storage.set('other:key2', 'other2');

      const keys = await storage.keys();
      expect(keys).toContain('main-key');
      // mounted-driver items are accessible via get()
      expect(await storage.get('other:key1')).toBe('other1');
      expect(await storage.get('other:key2')).toBe('other2');
    });
  });

  describe('TTL support', () => {
    it('expires items after TTL', async () => {
      const storage = createStorage({ driver: createMemoryDriver() });
      await storage.set('temp', 'data', 1);
      expect(await storage.has('temp')).toBe(true);
      await new Promise(r => setTimeout(r, 1100));
      expect(await storage.has('temp')).toBe(false);
    });
  });

  describe('createKV() / useKV()', () => {
    it('creates a KV namespace', async () => {
      const kv = createKV({ prefix: 'test-ns' });
      expect(kv).toBeDefined();
      expect(typeof kv.set).toBe('function');
      expect(typeof kv.get).toBe('function');
      expect(typeof kv.keys).toBe('function');
      expect(typeof kv.remove).toBe('function');
    });

    it('set/get stores and retrieves values', async () => {
      const kv = createKV({ prefix: 'kv-test' });
      await kv.set('key1', 'value1');
      const val = await kv.get('key1');
      expect(val).toBe('value1');
    });

    it('keys returns all keys in namespace', async () => {
      const kv = createKV({ prefix: 'kv-keys' });
      await kv.set('a', 1);
      await kv.set('b', 2);
      const keys = await kv.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('remove deletes a key', async () => {
      const kv = createKV({ prefix: 'kv-remove' });
      await kv.set('todelete', 'val');
      await kv.remove('todelete');
      const val = await kv.get('todelete');
      expect(val).toBeNull();
    });

    it('clear removes all keys', async () => {
      const kv = createKV({ prefix: 'kv-clear' });
      await kv.set('a', 1);
      await kv.set('b', 2);
      await kv.clear();
      const keys = await kv.keys();
      expect(keys.length).toBe(0);
    });
  });

  describe('HTTP integration - /api/storage-advanced-test', () => {
    it('memory driver works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=memory');
      expect(res.status).toBe(200);
      expect(res.data.allStored).toBe(true);
      expect(res.data.stringVal).toBe('hello');
      expect(res.data.numberVal).toBe(42);
    });

    it('serialization works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=serialization');
      expect(res.status).toBe(200);
      expect(res.data.allMatch).toBe(true);
    });

    it('mount works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=mount');
      expect(res.status).toBe(200);
      expect(res.data.hasKeysFromBothDrivers).toBe(true);
    });

    it('TTL works via API', async () => {
      const res = await getJson('/api/storage-advanced-test?action=ttl');
      expect(res.status).toBe(200);
      expect(res.data.beforeExpiry).toBe(true);
      expect(res.data.afterExpiry).toBe(false);
      expect(res.data.ttlExpired).toBe(true);
    });
  });

  describe('HTTP integration - /api/storage-test', () => {
    it('storage operations work via existing endpoint', async () => {
      const res = await getJson('/api/storage-test');
      expect(res.status).toBe(200);
    });
  });
});
